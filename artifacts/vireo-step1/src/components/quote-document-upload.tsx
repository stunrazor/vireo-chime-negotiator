import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Upload } from 'lucide-react';
import {
  previewQuoteDocument,
  type QuoteDocumentPreview,
} from '@/lib/vireo-api';
import { notifyChimeBlocker, notifyChimeReview } from './ChimeBlockerDialog';

export function QuoteDocumentUpload({
  rfqId,
  onPreview,
}: {
  rfqId: string;
  onPreview: (result: QuoteDocumentPreview) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'review'; text: string }>();

  const readDocument = async (file?: File) => {
    if (!file) return;
    setPending(true);
    setMessage(undefined);
    try {
      const result = await previewQuoteDocument(file, rfqId);
      onPreview(result);
      const reviewIssues = [
        !result.supplier_name && 'Supplier name not identified',
        result.price_total === null && 'total price not confidently identified',
        result.delivery_days === null && 'delivery time not confidently identified',
      ].filter((issue): issue is string => Boolean(issue));
      if (result.status !== 'Parsed' && reviewIssues.length === 0) {
        reviewIssues.push('confirm all extracted values against the source document');
      }
      const reviewMessage = reviewIssues.length
        ? `Review needed: ${reviewIssues.join('; ')}.`
        : `Supplier name suggested: ${result.supplier_name}.`;
      setMessage({
        tone: result.status === 'Parsed' && reviewIssues.length === 0 ? 'success' : 'review',
        text: `${result.status}: ${result.message} ${reviewMessage} Parser confidence: ${Math.round(result.confidence * 100)}%.`,
      });
      if (result.status !== 'Parsed' || reviewIssues.length > 0) {
        notifyChimeReview(`${result.status}: ${result.message} ${reviewMessage} Check the extracted values against the original document before saving.`);
      }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'The supplier document could not be read.';
      setMessage({
        tone: 'error',
        text: errorText,
      });
      notifyChimeBlocker(errorText);
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="document-upload">
      <label className="field-label" htmlFor="supplier-quote-file">
        Or upload a supplier quote
        <span>PDF · DOCX · XLSX · CSV</span>
      </label>
      <input
        ref={inputRef}
        id="supplier-quote-file"
        data-testid="input-supplier-quote-file"
        className="field spreadsheet-file"
        type="file"
        accept=".pdf,.docx,.xlsx,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={pending}
        onChange={(event) => void readDocument(event.currentTarget.files?.[0])}
      />
      <p className="input-hint">Readable text is extracted for review; the original file is not saved. Scanned PDFs need manual entry.</p>
      {message && <p className={`document-message document-message-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
        {message.tone === 'error' ? <AlertCircle size={14} /> : message.tone === 'success' ? <CheckCircle2 size={14} /> : <FileText size={14} />}
        <span>{pending ? 'Reading supplier document…' : message.text}</span>
      </p>}
      {pending && <p className="document-upload-pending"><Upload size={13} /> Extracting text for buyer review…</p>}
    </div>
  );
}
