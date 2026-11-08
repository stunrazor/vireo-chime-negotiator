import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import {
  previewRequestSpreadsheet,
  type RequestRecord,
  type SpreadsheetPreview,
  type SpreadsheetRequestPayload,
} from '@/lib/vireo-api';

type FieldKey = 'item' | 'item_code' | 'qty' | 'site' | 'spec' | 'needed_by';
type RequestDraft = Record<FieldKey, string>;
type ColumnMap = Record<FieldKey, string>;

const fields: { key: FieldKey; label: string; aliases: string[] }[] = [
  { key: 'item', label: 'Item', aliases: ['item', 'item name', 'product', 'product name', 'material', 'description'] },
  { key: 'item_code', label: 'Item code', aliases: ['item code', 'product code', 'sku', 'catalog code'] },
  { key: 'qty', label: 'Quantity', aliases: ['quantity', 'qty', 'request quantity', 'required quantity', 'units'] },
  { key: 'site', label: 'Delivery site', aliases: ['delivery site', 'site', 'location', 'branch'] },
  { key: 'spec', label: 'Specification', aliases: ['specification', 'specifications', 'spec', 'technical requirements', 'details'] },
  { key: 'needed_by', label: 'Needed by', aliases: ['needed by', 'need by', 'required date', 'date needed', 'due date', 'deadline', 'delivery date'] },
];

const emptyDraft: RequestDraft = { item: '', item_code: '', qty: '', site: '', spec: '', needed_by: '' };
const cleanHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function guessColumnMap(columns: string[]): ColumnMap {
  return Object.fromEntries(fields.map(({ key, aliases }) => {
    const index = columns.findIndex((column) => {
      const header = cleanHeader(column);
      return aliases.some((alias) => header === alias || header.includes(alias));
    });
    return [key, index >= 0 ? String(index) : ''];
  })) as ColumnMap;
}

function draftFromRow(row: SpreadsheetPreview['rows'][number] | undefined, map: ColumnMap): RequestDraft {
  if (!row) return { ...emptyDraft };
  return Object.fromEntries(fields.map(({ key }) => {
    const index = map[key] === '' ? -1 : Number(map[key]);
    return [key, index >= 0 ? row.values[index] || '' : ''];
  })) as RequestDraft;
}

export function SpreadsheetRequestImport({
  requesterEmail,
  onImport,
  onBlocker,
}: {
  requesterEmail: string;
  onImport: (payload: SpreadsheetRequestPayload) => Promise<RequestRecord>;
  onBlocker: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<SpreadsheetPreview>();
  const [mapping, setMapping] = useState<ColumnMap>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [draft, setDraft] = useState<RequestDraft>({ ...emptyDraft });
  const [importedRows, setImportedRows] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string }>();
  const [invalidFields, setInvalidFields] = useState<Set<FieldKey>>(new Set());

  const reportError = (text: string) => {
    setMessage({ tone: 'error', text });
    onBlocker(text);
  };

  const selectedRow = preview?.rows[selectedIndex];
  const loadSpreadsheet = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setMessage(undefined);
    setPreview(undefined);
    try {
      const nextPreview = await previewRequestSpreadsheet(file);
      const nextMapping = guessColumnMap(nextPreview.columns);
      setPreview(nextPreview);
      setMapping(nextMapping);
      setSelectedIndex(0);
      setDraft(draftFromRow(nextPreview.rows[0], nextMapping));
      setImportedRows(new Set());
      setMessage({
        tone: 'info',
        text: `${nextPreview.rows.length} rows ready to review from “${nextPreview.sheet_name}”.`,
      });
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'The spreadsheet could not be read.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const chooseRow = (index: number) => {
    setSelectedIndex(index);
    setDraft(draftFromRow(preview?.rows[index], mapping || {} as ColumnMap));
    setInvalidFields(new Set());
  };

  const changeColumn = (key: FieldKey, value: string) => {
    const next = { ...(mapping || {} as ColumnMap), [key]: value };
    setMapping(next);
    setDraft(draftFromRow(selectedRow, next));
    setInvalidFields(new Set());
  };

  const submitSelectedRow = async () => {
    if (!preview || !selectedRow) return;
    const qty = Number(draft.qty);
    const invalid = new Set<FieldKey>();
    const issues: string[] = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail.trim())) {
      issues.push('Requester email: enter a valid email');
    }
    if (!draft.item.trim()) {
      invalid.add('item');
      issues.push('Item: required');
    }
    if (!draft.item_code.trim()) {
      invalid.add('item_code');
      issues.push('Item code: enter the enrolled item code');
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      invalid.add('qty');
      issues.push('Quantity: enter a positive whole number');
    }
    if (!draft.site.trim()) {
      invalid.add('site');
      issues.push('Delivery site: required');
    }
    if (!draft.spec.trim()) {
      invalid.add('spec');
      issues.push('Specification: required');
    }
    if (!draft.needed_by.trim()) {
      invalid.add('needed_by');
      issues.push('Needed by: required');
    }
    setInvalidFields(invalid);
    if (issues.length) {
      reportError(`Row ${selectedRow.row_number} needs attention before import: ${issues.join('; ')}.`);
      return;
    }
    const rawText = selectedRow.source_text || preview.columns
      .map((header, index) => `${header || `Column ${index + 1}`}: ${selectedRow.values[index] || ''}`)
      .join('\n');
    const payload: SpreadsheetRequestPayload = {
      requester_email: requesterEmail.trim(),
      item: draft.item.trim(),
      item_code: draft.item_code.trim(),
      qty,
      site: draft.site.trim(),
      spec: draft.spec.trim(),
      needed_by: draft.needed_by.trim(),
      raw_text: `Item Code: ${draft.item_code.trim()}\n${rawText}`,
    };
    setBusy(true);
    setMessage(undefined);
    try {
      await onImport(payload);
      setImportedRows((previous) => new Set(previous).add(selectedRow.row_number));
      setMessage({ tone: 'success', text: `Row ${selectedRow.row_number} added as a draft request. The source file was not saved.` });
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'This spreadsheet row could not be imported.');
    } finally {
      setBusy(false);
    }
  };

  const hasCompleteColumnMapping = mapping
    ? fields.filter(({ key }) => key !== 'item_code').every(({ key }) => mapping[key] !== '')
    : false;

  return (
    <section className="spreadsheet-import" aria-labelledby="spreadsheet-import-title">
      <div className="spreadsheet-import-heading">
        <span className="outline-icon"><FileSpreadsheet size={16} /></span>
        <div>
          <h4 id="spreadsheet-import-title">Import a request spreadsheet</h4>
        <p>PDF, DOCX, XLSX or CSV · headings or one request per row · review before adding.</p>
        </div>
      </div>
      <label className="field-label" htmlFor="request-spreadsheet">Choose a request file</label>
      <input
        ref={inputRef}
        id="request-spreadsheet"
        className="field spreadsheet-file"
        type="file"
        accept=".pdf,.docx,.xlsx,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={busy}
        onChange={(event) => void loadSpreadsheet(event.currentTarget.files?.[0])}
      />
      <p className="input-hint">The file is read for preview only. Vireo saves a row after you review and add it.</p>
      {message && <p className={`document-message document-message-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
        {message.tone === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
        <span>{message.text}</span>
      </p>}
      {preview && mapping && (
        <div className="spreadsheet-preview">
          <div className="spreadsheet-preview-meta">
            <strong>{preview.sheet_name}</strong>
            <span>{preview.rows.length} rows{preview.truncated ? ' · first 100 shown' : ''}</span>
          </div>
          {preview.truncated && <p className="input-hint">This demo previews up to 100 rows per upload.</p>}
          {hasCompleteColumnMapping
            ? <p className="input-hint">Vireo detected the request fields. Review the filled values below before adding.</p>
            : <div className="spreadsheet-mapping">
              {fields.map(({ key, label }) => (
                <label className="spreadsheet-map-field" key={key}>
                  <span>{label}</span>
                  <select className="field" value={mapping[key]} onChange={(event) => changeColumn(key, event.target.value)}>
                    <option value="">Choose a column</option>
                    {preview.columns.map((column, index) => <option value={String(index)} key={`${index}-${column}`}>{column || `Column ${index + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>}
          <div className="spreadsheet-row-picker" aria-label="Spreadsheet rows">
            {preview.rows.map((row, index) => {
              const added = importedRows.has(row.row_number);
              return <button
                type="button"
                key={row.row_number}
                className={`spreadsheet-row${selectedIndex === index ? ' spreadsheet-row-selected' : ''}`}
                aria-pressed={selectedIndex === index}
                onClick={() => chooseRow(index)}
              >
                <strong>Row {row.row_number}</strong>
                <span>{row.values.filter(Boolean).slice(0, 3).join(' · ') || 'Blank row'}</span>
                <small>{added ? 'Added' : selectedIndex === index ? 'Selected' : 'Review'}</small>
              </button>;
            })}
          </div>
          {selectedRow && (
            <div className="spreadsheet-row-review">
              <div className="micro-label">REVIEW ROW {selectedRow.row_number} BEFORE SAVING</div>
              <div className="spreadsheet-draft-fields">
                {fields.map(({ key, label }) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      className="field"
                      type="text"
                      inputMode={key === 'qty' ? 'numeric' : undefined}
                      placeholder={key === 'needed_by' ? 'YYYY-MM-DD or ASAP' : ''}
                      value={draft[key]}
                      aria-invalid={invalidFields.has(key)}
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, [key]: event.target.value }));
                        setInvalidFields((current) => {
                          const next = new Set(current);
                          next.delete(key);
                          return next;
                        });
                      }}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="button button-primary full-width"
                disabled={busy || importedRows.has(selectedRow.row_number)}
                onClick={() => void submitSelectedRow()}
              >
                {busy ? 'Adding reviewed row…' : importedRows.has(selectedRow.row_number) ? 'Request created from this row' : 'Create draft request from this row'}
                <Upload size={15} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
