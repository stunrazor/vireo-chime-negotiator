import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { previewWorkspaceItems, type SpreadsheetPreview } from "@/lib/vireo-api";

export type EnrollmentField = {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
};

export default function WorkspaceFileEnrollment({
  title,
  description,
  fields,
  busy,
  onImport,
  validateField,
  onParsedRows,
}: {
  title: string;
  description: string;
  fields: EnrollmentField[];
  busy: boolean;
  onImport: (rows: Array<Record<string, string>>) => Promise<unknown>;
  validateField?: (row: Record<string, string>, field: EnrollmentField) => string | undefined;
  onParsedRows?: (rows: Array<{ rowNumber: number; values: Record<string, string> }>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<SpreadsheetPreview>();
  const [draftRows, setDraftRows] = useState<Array<Record<string, string>>>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const readFile = async (file?: File) => {
    if (!file) return;
    setReading(true);
    setMessage("");
    try {
      const result = await previewWorkspaceItems(file);
      const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const guessed = Object.fromEntries(fields.map((field) => {
        const index = result.columns.findIndex((heading) =>
          field.aliases.map(normalized).includes(normalized(heading)));
        return [field.key, index];
      }));
      const parsedRows = result.rows.map((row) => Object.fromEntries(fields.map((field) => {
        const columnIndex = guessed[field.key];
        return [field.key, columnIndex < 0 ? "" : (row.values[columnIndex] || "").trim()];
      })));
      setPreview(result);
      setDraftRows(parsedRows);
      onParsedRows?.(result.rows.map((row, index) => ({ rowNumber: row.row_number, values: parsedRows[index] })));
      setError(false);
      setMessage(`${result.rows.length} row${result.rows.length === 1 ? "" : "s"} parsed. Review the filled fields below.`);
    } catch (cause) {
      setPreview(undefined);
      setDraftRows([]);
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "The file could not be read.");
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  };

  const rows = draftRows;
  const fieldErrors = rows.map((row) => Object.fromEntries(fields.map((field) => [
    field.key,
    field.required && !row[field.key]?.trim()
      ? `${field.label} is required.`
      : validateField?.(row, field),
  ])));
  const hasFieldErrors = fieldErrors.some((row) => Object.values(row).some(Boolean));

  const enroll = async () => {
    if (!preview || !rows.length || preview.truncated || hasFieldErrors) return;
    setSaving(true);
    try {
      await onImport(rows);
      setPreview(undefined);
      setDraftRows([]);
      setError(false);
      setMessage(`${rows.length} row${rows.length === 1 ? "" : "s"} enrolled.`);
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Enrollment failed. No rows were saved.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="amw-item-import" aria-label={title}>
    <div className="amw-panel-heading">
      <div className="amw-heading-icon"><FileSpreadsheet size={16} aria-hidden="true" /></div>
      <div><span className="amw-card-label">BULK ENROLLMENT</span><h3>{title}</h3></div>
    </div>
    <p className="amw-baseline-copy">{description} Upload a selectable-text PDF table, DOCX, XLSX, or CSV. Vireo fills the fields it recognizes; review or edit them before saving. Scanned PDFs need OCR first. Up to 100 rows per file.</p>
    <input ref={input} className="field" type="file" accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv" disabled={reading || saving || busy} onChange={(event) => void readFile(event.currentTarget.files?.[0])} aria-label={`Choose ${title} file`} />
    {message && <p className={error ? "form-error" : "amw-import-message"} role={error ? "alert" : "status"}>{error ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}{message}</p>}
    {preview && <div className="amw-import-preview">
      <div className="amw-import-edit-rows" aria-label={`${title} parsed fields`}>
        {rows.map((row, rowIndex) => <fieldset className="amw-import-edit-row" key={preview.rows[rowIndex]?.row_number ?? rowIndex}>
          <legend>Row {preview.rows[rowIndex]?.row_number ?? rowIndex + 1}</legend>
          <div className="amw-import-grid">
            {fields.map((field) => <label key={field.key}>
              <span>{field.label}{field.required ? " (required)" : " (optional)"}</span>
              <input className="field" value={row[field.key] || ""} required={field.required} aria-invalid={Boolean(fieldErrors[rowIndex][field.key])} aria-label={`Row ${preview.rows[rowIndex]?.row_number ?? rowIndex + 1} ${field.label}`} onChange={(event) => setDraftRows((current) => current.map((draft, index) => index === rowIndex ? { ...draft, [field.key]: event.target.value } : draft))} />
              {fieldErrors[rowIndex][field.key] && <small className="form-error" role="alert">{fieldErrors[rowIndex][field.key]}</small>}
            </label>)}
          </div>
        </fieldset>)}
      </div>
      {preview.truncated && <p className="form-error" role="alert">Split this file into groups of 100 rows or fewer.</p>}
      <button type="button" className="button button-primary full-width" disabled={reading || saving || busy || hasFieldErrors || preview.truncated || !rows.length} onClick={() => void enroll()}>
        {saving || busy ? "Saving…" : `Enroll ${rows.length} reviewed row${rows.length === 1 ? "" : "s"}`}
      </button>
    </div>}
  </section>;
}
