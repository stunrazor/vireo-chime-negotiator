import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CircleAlert, Download, Mail, PackageCheck, Pencil, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2, UsersRound, X } from "lucide-react";
import { createClientOnboardingRecord, decideClientOnboardingFile, decideChimeAuditEvent, downloadClientOnboardingFile, getClientOnboardingFiles, getClientOnboardingRecords, previewClientOnboardingFiles, screenClientOnboardingFile, uploadClientOnboardingFile, createChimeAuditEvent, createChimeProfileExtractionAuditEvent, type ClientOnboardingFile, type ClientOnboardingFilePreview, type ClientOnboardingRecord, type OnboardingFieldName, type OnboardingFieldSuggestion, type AdminSetupSnapshot, type PoApprovalMember, type PoApprovalSnapshot } from "../lib/vireo-api";
import type { WorkspaceCatalogItem, WorkspaceCatalogItemEnrollmentDraft, WorkspaceSupplier } from "../lib/vireo-api";
import type { WorkspaceSupplierItem, WorkspaceAdminAuditEvent } from "../lib/vireo-api";
import WorkspaceFileEnrollment from "./WorkspaceFileEnrollment";
import { ChimeDemoProfile } from "./ChimeDemoProfile";
import { ChimeAuditTrail, ChimeBlockerDialog, createChimeEventId, notifyChimeBlocker, type ChimeEventNotice } from "./ChimeBlockerDialog";
import "./AdminMemberWorkspace.css";

type WorkspaceApprover = PoApprovalSnapshot["approvers"][number];
type QuantityBaseline = PoApprovalSnapshot["baselines"][number];
type AdminUpdate = {
  summary: string;
  details: string[];
  recipientEmail: string;
};

const onboardingDocuments = [
  ["business_registration", "Business registration evidence"],
  ["representative_authority", "Representative authority evidence"],
  ["tax_registration", "BIR or equivalent tax registration"],
  ["business_permit", "Business permit (e.g. Mayor’s Permit)"],
  ["primary_id", "Valid primary ID — status only"],
  ["company_id", "Company ID / employee number"],
] as const;

function getProfileExtractionIssues(suggestions: Record<OnboardingFieldName, OnboardingFieldSuggestion>) {
  const fields = {
    unknown: [] as string[],
    invalid: [] as string[],
    conflict: [] as string[],
  };
  for (const [field, suggestion] of Object.entries(suggestions)) {
    if (suggestion.status in fields) {
      fields[suggestion.status as keyof typeof fields].push(field.replaceAll("_", " "));
    }
  }
  return [
    fields.unknown.length ? `Not found: ${fields.unknown.join(", ")}.` : "",
    fields.invalid.length ? `Invalid format: ${fields.invalid.join(", ")}.` : "",
    fields.conflict.length ? `Conflicting values: ${fields.conflict.join(", ")}.` : "",
  ].filter(Boolean);
}

function ClientOnboardingPanel() {
  const [records, setRecords] = useState<ClientOnboardingRecord[]>([]);
  const [files, setFiles] = useState<ClientOnboardingFile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [clientType, setClientType] = useState<"individual" | "entity">("entity");
  const [legalName, setLegalName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [industry, setIndustry] = useState("");
  const [registeredRepresentative, setRegisteredRepresentative] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [contactMobile, setContactMobile] = useState("");
  const [contactLandline, setContactLandline] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [manualProfileEntryUnlocked, setManualProfileEntryUnlocked] = useState(false);
  const [profileSourceName, setProfileSourceName] = useState("");
  const [profileSourcePreview, setProfileSourcePreview] = useState<ClientOnboardingFilePreview | null>(null);
  const [draftLegalFiles, setDraftLegalFiles] = useState<File[]>([]);
  const [legalFilePreviews, setLegalFilePreviews] = useState<ClientOnboardingFilePreview[]>([]);
  const [legalFileAssignments, setLegalFileAssignments] = useState<string[]>([]);
  const [legalConflicts, setLegalConflicts] = useState<Array<{ field: OnboardingFieldName; values: Array<{ file_name: string; page: number | null; text: string; value?: string }> }>>([]);
  const [analyzingProfile, setAnalyzingProfile] = useState(false);
  const [analyzingLegalFiles, setAnalyzingLegalFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const invalidProfileAlerted = useRef(false);
  const pendingProfileAckId = useRef("");

  const refresh = async () => {
    const result = await getClientOnboardingRecords();
    setRecords(result.records);
    if (!selectedId) {
      const first = result.records.find((record) => !record.archived_at);
      if (first) setSelectedId(first.id);
    }
  };
  useEffect(() => {
    void refresh().catch((err: Error) => { setError(err.message); notifyChimeBlocker(err.message); });
  }, []);
  useEffect(() => {
    if (!selectedId) { setFiles([]); return; }
    void getClientOnboardingFiles(selectedId).then((result) => setFiles(result.files))
      .catch((err: Error) => { setError(err.message); });
  }, [selectedId]);
  const selected = records.find((record) => record.id === selectedId);
  useEffect(() => {
    const onChimeDecision = (event: Event) => {
      const detail = (event as CustomEvent<{ event_id?: string; decision?: string }>).detail;
      if (!detail || detail.event_id !== pendingProfileAckId.current) return;
      pendingProfileAckId.current = "";
      if (detail.decision === "acknowledged") {
        setManualProfileEntryUnlocked(true);
        setMessage("Chime’s missing-field notice was acknowledged. You can now enter the missing company details manually.");
      }
    };
    window.addEventListener("vireo:chime-decision", onChimeDecision);
    return () => window.removeEventListener("vireo:chime-decision", onChimeDecision);
  }, []);
  const logChimeReview = async (decision: "acknowledged" | "dismissed") => {
    const eventId = createChimeEventId();
    try {
      await createChimeAuditEvent(eventId, "review");
      await decideChimeAuditEvent(eventId, decision);
    } catch {
      notifyChimeBlocker("Chime could not save the review decision to this workspace's audit trail.");
    }
  };
  const recordChimeExtraction = async (suggestions: Record<OnboardingFieldName, OnboardingFieldSuggestion>) => {
    try {
      await createChimeProfileExtractionAuditEvent(createChimeEventId(), Object.entries(suggestions).map(([field_name, suggestion]) => ({
        field_name: field_name as OnboardingFieldName,
        status: suggestion.status,
        value: suggestion.value,
      })));
    }
    catch { notifyChimeBlocker("Chime could not record the extraction event in this workspace's audit trail."); }
  };
  const recordChimeReview = async () => {
    try { await createChimeAuditEvent(createChimeEventId(), "review"); }
    catch { notifyChimeBlocker("Chime could not record the review event in this workspace's audit trail."); }
  };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const created = await createClientOnboardingRecord({
        client_type: clientType, legal_name: legalName.trim(), jurisdiction: jurisdiction.trim(),
        industry: industry.trim(), contact_name: registeredRepresentative.trim(), contact_email: companyEmail.trim(),
        company_registered_representative: registeredRepresentative.trim(),
        company_email: companyEmail.trim(), contact_mobile: contactMobile.trim(),
        contact_landline: contactLandline.trim(), company_website: companyWebsite.trim(),
        manual_entry_acknowledged: manualProfileEntryUnlocked,
      });
      setRecords((current) => [created, ...current]); setSelectedId(created.id);
      setLegalName(""); setJurisdiction(""); setIndustry("");
      setRegisteredRepresentative(""); setCompanyEmail(""); setContactMobile(""); setContactLandline(""); setCompanyWebsite("");
      setManualProfileEntryUnlocked(false);
      setProfileSourceName(""); setProfileSourcePreview(null);
      setMessage(`Client profile created. Client ID: ${created.client_number}. Upload its legal documents below.`);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not create the profile.";
      setError(text); notifyChimeBlocker(text);
    }
    finally { setBusy(false); }
  };
  const analyzeProfileFile = async (file?: File) => {
    setProfileSourceName(file?.name || ""); setProfileSourcePreview(null);
    if (!file) return;
    setAnalyzingProfile(true); setError(""); setMessage("");
    try {
      const result = await previewClientOnboardingFiles([file]);
      setProfileSourcePreview(result.files[0] || null);
      if (result.suggestions.legal_name.status === "suggested" && result.suggestions.legal_name.value) setLegalName(result.suggestions.legal_name.value);
      if (result.suggestions.jurisdiction.status === "suggested" && result.suggestions.jurisdiction.value) setJurisdiction(result.suggestions.jurisdiction.value);
      if (result.suggestions.industry.status === "suggested" && result.suggestions.industry.value) setIndustry(result.suggestions.industry.value);
      const companyProfileFields = [
        ["company_registered_representative", setRegisteredRepresentative],
        ["company_email", setCompanyEmail],
        ["contact_mobile", setContactMobile],
        ["contact_landline", setContactLandline],
        ["company_website", setCompanyWebsite],
      ] as const;
      for (const [field, setter] of companyProfileFields) {
        const suggestion = result.suggestions[field];
        if (suggestion.status === "suggested" && suggestion.value) setter(suggestion.value);
      }
      const missingFields = companyProfileFields
        .filter(([field]) => result.suggestions[field].status !== "suggested" || !result.suggestions[field].value)
        .map(([field]) => ({
          company_registered_representative: "Company Registered Representative",
          company_email: "company email",
          contact_mobile: "contact mobile",
          contact_landline: "contact landline",
          company_website: "company website",
        })[field]);
      if (missingFields.length && !manualProfileEntryUnlocked) {
        pendingProfileAckId.current = notifyChimeBlocker(
          `Chime could not find these required company-profile fields in the source: ${missingFields.join(", ")}. Acknowledge this notice before entering them manually.`,
        );
      } else {
        setManualProfileEntryUnlocked(true);
      }
      void recordChimeExtraction(result.suggestions);
    } catch (err) {
      const text = err instanceof Error ? err.message : "The company profile file could not be analyzed.";
      setError(text); notifyChimeBlocker(text);
    } finally { setAnalyzingProfile(false); }
  };
  const requestManualProfileEntry = () => {
    pendingProfileAckId.current = notifyChimeBlocker(
      "Chime found required company-profile details that need manual entry. Acknowledge this notice to unlock the Company Registered Representative, company email, contact mobile and landline, and company website fields.",
    );
  };
  const analyzeLegalFiles = async (files: File[]) => {
    setDraftLegalFiles(files); setLegalFilePreviews([]); setLegalFileAssignments([]);
    if (!files.length) return;
    setAnalyzingLegalFiles(true); setError(""); setMessage("");
    try {
      const result = await previewClientOnboardingFiles(files);
      setLegalFilePreviews(result.files);
      setLegalFileAssignments(result.files.map((file) => file.document_key || ""));
      setLegalConflicts(result.conflicts);
      setMessage("Chime suggested categories and checked for conflicting profile values. Confirm the categories before uploading.");
      const issueMessages = getProfileExtractionIssues(result.suggestions);
      if (issueMessages.length) {
        notifyChimeBlocker(`Chime found profile-field issues while checking the uploaded legal documents. ${issueMessages.join(" ")} Review the evidence and complete or correct the fields.`);
      } else if (result.files.some((file) => file.document_category.status === "unknown")) {
        notifyChimeBlocker("Chime could not identify one or more legal document categories. Choose the correct categories before uploading.");
      }
      void recordChimeReview();
    } catch (err) {
      const text = err instanceof Error ? err.message : "The legal documents could not be analyzed.";
      setError(text); notifyChimeBlocker(text);
    } finally { setAnalyzingLegalFiles(false); }
  };
  const uploadLegalFiles = async () => {
    if (!selected || !draftLegalFiles.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const outcomes = await Promise.allSettled(draftLegalFiles.map((file, index) =>
        uploadClientOnboardingFile(selected.id, legalFileAssignments[index], file)));
      const succeeded = outcomes.flatMap((result, index) => result.status === "fulfilled" ? [index] : []);
      const failed = outcomes.flatMap((result, index) => result.status === "rejected" ? [index] : []);
      const result = await getClientOnboardingFiles(selected.id);
      setFiles(result.files);
      if (failed.length) {
        setDraftLegalFiles(failed.map((index) => draftLegalFiles[index]));
        setLegalFilePreviews(failed.map((index) => legalFilePreviews[index]));
        setLegalFileAssignments(failed.map((index) => legalFileAssignments[index]));
        setError(`${succeeded.length} file(s) uploaded; ${failed.length} need a retry. Successful uploads are stored privately and marked Received, not Verified.`);
      } else {
        setDraftLegalFiles([]); setLegalFilePreviews([]); setLegalFileAssignments([]);
        setMessage(`${succeeded.length} legal document(s) uploaded successfully and marked Received. They are not yet verified.`);
      }
    } catch (err) { const text = err instanceof Error ? err.message : "Could not upload the legal documents."; setError(text); }
    finally { setBusy(false); }
  };
  const screenFile = async (file: ClientOnboardingFile) => {
    setBusy(true); setError(""); setMessage("");
    setFiles((current) => current.map((item) => item.id === file.id ? { ...item, verification_status: "chime_screening" } : item));
    try {
      const result = await screenClientOnboardingFile(file.id);
      setFiles((current) => current.map((item) => item.id === file.id ? result.file : item));
      setMessage(`Chime screening completed for ${file.file_name}. Human verification is still required.`);
      void recordChimeReview();
    } catch (err) {
      setFiles((current) => current.map((item) => item.id === file.id ? { ...item, verification_status: "received" } : item));
      const text = err instanceof Error ? err.message : "Chime screening could not be completed.";
      setError(text); notifyChimeBlocker(text);
    } finally { setBusy(false); }
  };
  const decideFile = async (file: ClientOnboardingFile, decision: "verified" | "rejected") => {
    const label = decision === "verified" ? "Verified" : "Rejected";
    if (!window.confirm(`${label} this document? Chime cannot make this decision. Confirm you reviewed the source and screening evidence.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await decideClientOnboardingFile(file.id, decision);
      setFiles((current) => current.map((item) => item.id === file.id ? result.file : item));
      setMessage(`${file.file_name} marked ${label.toLowerCase()} by the Admin-Member.`);
      void logChimeReview(decision === "verified" ? "acknowledged" : "dismissed");
    } catch (err) { const text = err instanceof Error ? err.message : "The human verification decision could not be saved."; setError(text); notifyChimeBlocker(text); }
    finally { setBusy(false); }
  };
  const downloadFile = async (file: ClientOnboardingFile) => {
    try {
      const blob = await downloadClientOnboardingFile(file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = file.file_name; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not download the file."); }
  };
  return (
    <section className="amw-onboarding" aria-labelledby="amw-onboarding-title">
      <div className="amw-setup-heading">
        <div><p className="amw-eyebrow">ADMIN-MEMBER · WORKSPACE SETUP</p><h2 id="amw-onboarding-title">Client onboarding</h2>
          <p>Create a client profile and track required document statuses.</p></div>
        <span className="amw-setup-pill">{records.filter((record) => !record.archived_at).length} active · {records.filter((record) => Boolean(record.archived_at)).length} archived</span>
      </div>
      <form
        className="amw-onboard-form"
        onInvalidCapture={() => {
          if (invalidProfileAlerted.current) return;
          invalidProfileAlerted.current = true;
          notifyChimeBlocker("Complete the required client onboarding fields before continuing.");
        }}
        onChangeCapture={() => { invalidProfileAlerted.current = false; }}
        onSubmit={create}
      >
        <div className="amw-onboard-batch">
          <label htmlFor="amw-company-profile-file">Company profile file <span>Upload one profile file · PDF, DOCX, XLSX, JPEG, PNG, or WebP · 10 MB max</span></label>
          <input id="amw-company-profile-file" type="file" accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp" disabled={busy || analyzingProfile} onChange={(event) => { const chosen = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void analyzeProfileFile(chosen); }} />
          <p>Chime extracts readable PDF/DOCX text inside Vireo and suggests profile values. The source file is used for profile entry only; upload legal evidence separately below. Scanned files need manual review.</p>
          {analyzingProfile && <p role="status">Chime is reading the company profile file…</p>}
          {profileSourceName && profileSourcePreview && <div className={`amw-profile-readiness ${profileSourcePreview.extraction_check.status === "passed" ? "is-complete" : "is-incomplete"}`} role="status" aria-live="polite" data-testid="profile-extraction-check">
            <strong>{profileSourcePreview.extraction_check.status === "passed" ? "Chime extraction checks passed" : "Chime extraction needs review"}</strong>
            <span>{profileSourcePreview.extraction_check.supported_fields.length} field(s) matched readable source evidence and were filled into the form. {profileSourcePreview.extraction_check.unknown_fields.length > 0 && `Not found: ${profileSourcePreview.extraction_check.unknown_fields.join(", ")}. `}{profileSourcePreview.extraction_check.invalid_fields.length > 0 && `Invalid format: ${profileSourcePreview.extraction_check.invalid_fields.join(", ")}. `}{profileSourcePreview.extraction_check.conflicting_fields.length > 0 && `Conflicts: ${profileSourcePreview.extraction_check.conflicting_fields.join(", ")}. `}This checks extraction only; document authenticity is not verified. Edit profile fields directly if needed.</span>
            <span>{profileSourcePreview.file_name} · {profileSourcePreview.review_message}</span>
          </div>}
        </div>
        <label>Client type<select value={clientType} onChange={(e) => setClientType(e.target.value as "individual" | "entity")}><option value="entity">Entity</option><option value="individual">Individual</option></select></label>
        <label>Legal name<input required maxLength={200} value={legalName} onChange={(e) => setLegalName(e.target.value)} /></label>
        <label>Country / jurisdiction<input required maxLength={120} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="e.g. Philippines" /></label>
        <label>Industry (optional)<input maxLength={120} value={industry} onChange={(e) => setIndustry(e.target.value)} /></label>
        <div className="amw-onboard-batch" data-testid="company-profile-required-fields">
          {!manualProfileEntryUnlocked && <button type="button" onClick={requestManualProfileEntry} disabled={busy || analyzingProfile} data-testid="button-acknowledge-manual-profile">
            Enter
          </button>}
          <label>Company Registered Representative<input required maxLength={160} value={registeredRepresentative} disabled={!manualProfileEntryUnlocked} onChange={(e) => setRegisteredRepresentative(e.target.value)} /></label>
          <label>Company email<input required type="email" maxLength={254} value={companyEmail} disabled={!manualProfileEntryUnlocked} onChange={(e) => setCompanyEmail(e.target.value)} /></label>
          <label>Contact mobile<input required type="tel" maxLength={40} value={contactMobile} disabled={!manualProfileEntryUnlocked} onChange={(e) => setContactMobile(e.target.value)} /></label>
          <label>Contact landline<input required type="text" inputMode="text" maxLength={40} value={contactLandline} disabled={!manualProfileEntryUnlocked} placeholder="Enter a number or NA" onChange={(e) => setContactLandline(e.target.value)} /><span>Enter NA if the client has no landline.</span></label>
          <label>Company website<input required maxLength={254} value={companyWebsite} disabled={!manualProfileEntryUnlocked} placeholder="e.g. company.com or NA" onChange={(e) => setCompanyWebsite(e.target.value)} /><span>Enter NA if the client has no company website.</span></label>
        </div>
          <button className="amw-follow-up-primary" disabled={busy || analyzingProfile || !manualProfileEntryUnlocked} type="submit">{busy ? "Creating profile…" : "Create client profile"}</button>
      </form>
      <p className="amw-onboard-privacy">Files are private to this workspace and available only to Admin-Members. Uploads are not virus-scanned or automatically verified. A unique client ID is generated automatically.</p>
      {error && <p role="alert" className="amw-onboard-error">{error}</p>}
      {message && <p role="status" className="amw-baseline-message">{message}</p>}
      <div className="amw-onboard-records">
        {selected && <div className="amw-onboard-checklist">
           <h3>{selected.legal_name} <small>{selected.client_number}</small></h3>
           <h4>Company profile contact details</h4>
           {([
             ["Company Registered Representative", selected.company_registered_representative],
             ["Company email", selected.company_email],
             ["Contact mobile", selected.contact_mobile],
             ["Contact landline", selected.contact_landline],
             ["Company website", selected.company_website],
           ] as const).map(([label, value]) => (
             <div className="amw-onboard-requirement" key={label}><span>{label}</span><strong>{value || "Not recorded"}</strong></div>
           ))}
          <h4>Document requirements</h4>
          {onboardingDocuments.map(([key, label]) => {
            const categoryFiles = files.filter((file) => file.document_key === key);
            const verified = categoryFiles.filter((file) => file.verification_status === "verified").length;
            const summary = !categoryFiles.length ? "Missing" : verified === categoryFiles.length ? "Verified" : `${verified} of ${categoryFiles.length} verified · review remaining`;
            return <div className="amw-onboard-requirement" key={key}><span>{label}</span><strong>{summary}</strong></div>;
          })}
        </div>}
        <div className="amw-onboard-files">
          <h4>Company legal documents</h4>
          <p>Choose multiple legal documents together. Chime suggests a category; confirm it before uploading.</p>
          {!selected && <p role="status">
            {records.length
              ? "Choose a client profile above to enable its private legal-document uploads."
              : "Create a client profile above first. Legal documents will be attached to that profile."}
          </p>}
          <label className="amw-legal-file-picker" htmlFor="amw-legal-files">Select legal documents <span>PDF, DOCX, JPEG, PNG, or WebP · 10 MB per file · 12 files / 40 MB total</span></label>
          <input id="amw-legal-files" className="amw-legal-file-input" type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png,.webp" disabled={!selected || Boolean(selected?.archived_at) || busy || analyzingLegalFiles} onChange={(event) => { const chosen = Array.from(event.currentTarget.files || []); event.currentTarget.value = ""; void analyzeLegalFiles(chosen); }} />
          {analyzingLegalFiles && <p role="status">Chime is checking the legal documents…</p>}
          {legalFilePreviews.map((file, index) => <div className="amw-onboard-batch-file" key={`${file.file_name}-${index}`}>
            <span><strong>{file.file_name}</strong><small>{file.extraction_check.status === "passed" ? `Chime extraction checks passed for ${file.extraction_check.supported_fields.length} supported field(s). ` : "Extraction needs human review. "}{file.document_category.status === "suggested" ? `Suggested category confidence ${Math.round(file.document_category.confidence * 100)}%. ` : "Category unknown. "}{file.review_message} Document authenticity is not verified.</small>{file.document_category.evidence.map((evidence, evidenceIndex) => <small key={evidenceIndex}>Evidence: {evidence.text}</small>)}</span>
            <label>Document category<select required value={legalFileAssignments[index] || ""} disabled={busy} onChange={(event) => setLegalFileAssignments((current) => current.map((key, itemIndex) => itemIndex === index ? event.target.value : key))}>
              <option value="">Choose category</option>{onboardingDocuments.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
            </select></label>
          </div>)}
          {legalConflicts.length > 0 && <div className="amw-onboard-conflicts" role="alert"><strong>Chime found conflicting profile values</strong>{legalConflicts.map((conflict) => <div key={conflict.field}><span>{conflict.field.replaceAll("_", " ")}</span>{conflict.values.map((value, index) => <small key={`${value.file_name}-${index}`}>{value.file_name}: {value.value} · {value.text}</small>)}</div>)}Resolve these values manually; Chime will not choose between conflicting documents.</div>}
          {draftLegalFiles.length > 0 && <button className="amw-follow-up-primary" type="button" disabled={!selected || busy || analyzingLegalFiles || legalFileAssignments.length !== draftLegalFiles.length || legalFileAssignments.some((key) => !key)} onClick={() => void uploadLegalFiles()}>{busy ? "Uploading documents…" : `Upload ${draftLegalFiles.length} legal document${draftLegalFiles.length === 1 ? "" : "s"}`}</button>}
          <div className="amw-onboard-uploaded">
            <h5>Uploaded files and verification status</h5>
            {files.length ? onboardingDocuments.map(([key, label]) => {
              const categoryFiles = files.filter((file) => file.document_key === key);
              if (!categoryFiles.length) return null;
              return <section key={key} className="amw-onboard-uploaded-group">
                <h6>{label}</h6>
                <ul>{categoryFiles.map((file) => <li key={file.id}>
                  <span><strong>{file.file_name}</strong><small><Check size={12} /> Uploaded successfully · {(file.size_bytes / 1024).toFixed(0)} KB</small></span>
                  <span className={`amw-document-status amw-document-status-${file.verification_status}`}>{file.verification_status.replaceAll("_", " ")}</span>
                  <button type="button" onClick={() => void downloadFile(file)} aria-label={`Download ${file.file_name}`}><Download size={13} /> Download</button>
                   {file.verification_status === "received" && <button type="button" disabled={busy || Boolean(selected?.archived_at)} onClick={() => void screenFile(file)}>Start Chime screening</button>}
                  {file.verification_status === "chime_screening" && <small role="status">Chime screening…</small>}
                  {file.verification_status === "needs_human_review" && <>
                    {file.screening_result && <div className="amw-screening-evidence"><strong>Chime recommendation</strong><p>{file.screening_result.recommendation}</p>{file.screening_result.evidence.map((evidence, index) => <small key={index}>Evidence: {evidence}</small>)}<small>Authenticity has not been verified.</small></div>}
                     <button type="button" disabled={busy || Boolean(selected?.archived_at)} onClick={() => void decideFile(file, "verified")}>Mark Verified</button>
                     <button type="button" disabled={busy || Boolean(selected?.archived_at)} onClick={() => void decideFile(file, "rejected")}>Reject</button>
                  </>}
                </li>)}</ul>
              </section>;
            }) : <p>No legal documents uploaded for this client profile yet.</p>}
          </div>
          <p>Chime screens locally and prepares evidence only. An authorized Admin-Member must review the source and make every final verification decision.</p>
        </div>
      </div>
    </section>
  );
}

function AdminUpdateEmailFollowUp({
  kind,
  update,
  onDismiss,
}: {
  kind: "approver" | "baseline";
  update: AdminUpdate;
  onDismiss: () => void;
}) {
  const [recipient, setRecipient] = useState(update.recipientEmail);
  const [outcome, setOutcome] = useState<"completed" | "clarification">("completed");
  const [clarification, setClarification] = useState("");
  const recipientValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());
  const topic = kind === "approver" ? "approver assignment" : "usual-quantity baseline";

  const openDraft = () => {
    if (!recipientValid || (outcome === "clarification" && !clarification.trim())) return;
    const subject = outcome === "completed"
      ? `Vireo ${topic} update confirmed`
      : `Clarification or verification: Vireo ${topic} update`;
    const body = [
      "Hello,",
      "",
      outcome === "completed"
        ? `This email confirms that the ${topic} update has been completed:`
        : `The ${topic} update below needs additional clarification or verification:`,
      update.summary,
      ...update.details.map((detail) => `- ${detail}`),
      ...(outcome === "clarification" ? ["", `Please clarify or verify: ${clarification.trim()}`] : []),
      "",
      outcome === "completed"
        ? "Please review this workspace update and reply if anything needs correction."
        : "Please reply with the requested clarification or verification.",
      "",
      "Regards,",
      "Vireo Workspace Administrator",
      "",
      "This message was prepared in Vireo and has not been sent.",
    ].join("\n");
    window.location.href = `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <section className="amw-follow-up" aria-labelledby={`amw-${kind}-follow-up-title`} data-testid={`admin-${kind}-follow-up`}>
      <div className="amw-follow-up-heading">
        <div className="amw-heading-icon"><Mail size={16} aria-hidden="true" /></div>
        <div>
          <span className="amw-card-label">{kind === "approver" ? "APPROVER ASSIGNMENT" : "USUAL-QUANTITY BASELINE"}</span>
          <h3 id={`amw-${kind}-follow-up-title`}>{kind === "approver" ? "Approver update follow-up" : "Baseline update follow-up"}</h3>
          <p>{update.summary}. Prepare a confirmation or request clarification/verification for this update.</p>
        </div>
        <button type="button" className="amw-follow-up-dismiss" onClick={onDismiss} aria-label={`Dismiss ${topic} email follow-up`}><X size={15} /></button>
      </div>
      {update.details.length > 0 && (
        <ul className="amw-follow-up-details">{update.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
      )}
      <div className="amw-follow-up-fields">
        <label>
          <span>Recipient email</span>
          <input type="email" required maxLength={254} value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="member@company.com" />
        </label>
        <label>
          <span>Email purpose</span>
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as "completed" | "clarification")}>
            <option value="completed">Confirm this update is complete</option>
            <option value="clarification">Request clarification or verification</option>
          </select>
        </label>
      </div>
      {outcome === "clarification" && (
        <label className="amw-follow-up-clarification">
          <span>What clarification or verification is needed? <strong>Required</strong></span>
          <textarea required maxLength={1500} rows={3} value={clarification} onChange={(event) => setClarification(event.target.value)} placeholder={`Explain what should be clarified about this ${topic}.`} />
        </label>
      )}
      <div className="amw-follow-up-actions">
        <button type="button" className="amw-follow-up-primary" disabled={!recipientValid || (outcome === "clarification" && !clarification.trim())} onClick={openDraft}>
          <Mail size={14} aria-hidden="true" /> Open {kind === "approver" ? "approver" : "baseline"} email draft
        </button>
        <span>Opens in your mail app; Vireo does not send it.</span>
      </div>
    </section>
  );
}

export interface AdminMemberWorkspaceProps {
  workspaceName: string;
  members: PoApprovalMember[];
  approvers: WorkspaceApprover[];
  baselines: QuantityBaseline[];
  catalogItems: WorkspaceCatalogItem[];
  suppliers: WorkspaceSupplier[];
  supplierItems: WorkspaceSupplierItem[];
  auditEvents: WorkspaceAdminAuditEvent[];
  supplierDirectoryReady: boolean;
  supplierItemDirectoryReady: boolean;
  auditReady: boolean;
  archivedBaselines: AdminSetupSnapshot["archived_baselines"];
  memberRoleAssignmentReady: boolean;
  baselineArchiveReady: boolean;
  loading: boolean;
  error: boolean | string;
  retry: () => void;
  onManageApprover: (userId: string, assign: boolean) => Promise<unknown>;
  onManageWorkspaceRole: (payload: {
    user_id: string;
    role: "maker" | "reviewer_approver";
    employee_number: string;
  }) => Promise<unknown>;
  onSetBaseline: (itemName: string, usualQty: number, itemCode?: string) => Promise<unknown>;
  onImportCatalogItems: (items: WorkspaceCatalogItemEnrollmentDraft[]) => Promise<unknown>;
  onImportSuppliers: (rows: Array<{ supplier_code?: string; supplier_name: string; category: string }>) => Promise<unknown>;
  onImportSupplierItems: (rows: Array<{ supplier_code: string; supplier_item_code: string; supplier_item_name: string; item_code?: string }>) => Promise<unknown>;
  onLinkSupplierItem: (payload: { supplier_code: string; supplier_item_code: string; item_code: string | null }) => Promise<unknown>;
  onSeedDemoCatalog: () => Promise<unknown>;
  onArchiveBaseline: (itemName: string) => Promise<unknown>;
  onRestoreBaseline: (itemName: string) => Promise<unknown>;
  chimeNotice?: ChimeEventNotice;
  onCloseChime: () => void;
  managingApprovers: boolean;
  managingWorkspaceRole: boolean;
  settingBaseline: boolean;
  importingCatalogItems: boolean;
  importingSuppliers: boolean;
  importingSupplierItems: boolean;
  linkingSupplierItem: boolean;
  seedingDemoCatalog: boolean;
  archivingBaseline: boolean;
  restoringBaseline: boolean;
}

function displayMember(member: PoApprovalMember) {
  return member.email || `Member ${member.user_id.slice(0, 8)}`;
}

function roleLabel(role: string, isApprover: boolean, isDemoWorkspace: boolean) {
  const prefix = isDemoWorkspace ? "Demo " : "";
  if (role === "workspace_admin") return `${prefix}Admin-Member`;
  if (role === "member" && isApprover) return `${prefix}Reviewer/Approver`;
  if (role === "member") return `${prefix}Maker-member`;
  return `${prefix}${role.replaceAll("_", " ")}`;
}

export default function AdminMemberWorkspace({
  workspaceName,
  members,
  approvers,
  baselines,
  catalogItems,
  suppliers,
  supplierItems,
  auditEvents,
  supplierDirectoryReady,
  supplierItemDirectoryReady,
  auditReady,
  archivedBaselines,
  memberRoleAssignmentReady,
  baselineArchiveReady,
  loading,
  error,
  retry,
  onManageApprover,
  onManageWorkspaceRole,
  onSetBaseline,
  onImportCatalogItems,
  onImportSuppliers,
  onImportSupplierItems,
  onLinkSupplierItem,
  onSeedDemoCatalog,
  onArchiveBaseline,
  onRestoreBaseline,
  chimeNotice,
  onCloseChime,
  managingApprovers,
  managingWorkspaceRole,
  settingBaseline,
  importingCatalogItems,
  importingSuppliers,
  importingSupplierItems,
  linkingSupplierItem,
  seedingDemoCatalog,
  archivingBaseline,
  restoringBaseline,
}: AdminMemberWorkspaceProps) {
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState<"maker" | "reviewer_approver">("maker");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [supplierCode, setSupplierCode] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierCategory, setSupplierCategory] = useState("");
  const [supplierItemSupplier, setSupplierItemSupplier] = useState("");
  const [supplierItemCode, setSupplierItemCode] = useState("");
  const [supplierItemName, setSupplierItemName] = useState("");
  const [clientItemCode, setClientItemCode] = useState("");
  const [supplierMessage, setSupplierMessage] = useState("");
  const [supplierItemMessage, setSupplierItemMessage] = useState("");
  const [catalogItemName, setCatalogItemName] = useState("");
  const [catalogItemCode, setCatalogItemCode] = useState("");
  const [catalogItemMessage, setCatalogItemMessage] = useState("");
  const [rows, setRows] = useState([{ itemCode: "", qty: "" }]);
  const [baselineMessage, setBaselineMessage] = useState("");
  const [editingBaselineKey, setEditingBaselineKey] = useState<string | null>(null);
  const [editingBaselineQuantity, setEditingBaselineQuantity] = useState("");
  const [approverUpdate, setApproverUpdate] = useState<AdminUpdate | null>(null);
  const [baselineUpdate, setBaselineUpdate] = useState<AdminUpdate | null>(null);
  const isDemoWorkspace = /demo/i.test(workspaceName);
  const currentRoleName = `${isDemoWorkspace ? "Demo " : ""}Admin-Member`;
  const errorMessage = typeof error === "string"
    ? error
    : "Workspace access safeguards could not be loaded.";
  useEffect(() => {
    if (error) notifyChimeBlocker(errorMessage);
  }, [error, errorMessage]);
  const eligibleMembers = members.filter((member) => member.role === "member");
  const saveWorkspaceRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!memberId || !employeeNumber.trim()) return;
    try {
      await onManageWorkspaceRole({
        user_id: memberId,
        role: memberRole,
        employee_number: employeeNumber.trim(),
      });
      setMemberId("");
      setEmployeeNumber("");
    } catch (error) {
      const text = error instanceof Error ? error.message : "The workspace role could not be saved.";
      notifyChimeBlocker(text);
    }
  };
  const saveSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSupplierMessage("");
    try {
      await onImportSuppliers([{
        supplier_code: supplierCode.trim() || undefined,
        supplier_name: supplierName.trim(),
        category: supplierCategory.trim(),
      }]);
      setSupplierCode("");
      setSupplierName("");
      setSupplierCategory("");
      setSupplierMessage("Supplier enrolled.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Supplier enrollment failed.";
      setSupplierMessage(text);
      notifyChimeBlocker(text);
    }
  };
  const saveSupplierItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSupplierItemMessage("");
    try {
      await onImportSupplierItems([{
        supplier_code: supplierItemSupplier,
        supplier_item_code: supplierItemCode.trim(),
        supplier_item_name: supplierItemName.trim(),
        ...(clientItemCode ? { item_code: clientItemCode } : {}),
      }]);
      setSupplierItemCode("");
      setSupplierItemName("");
      setClientItemCode("");
      setSupplierItemMessage("Supplier item enrolled.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Supplier item enrollment failed.";
      setSupplierItemMessage(text);
      notifyChimeBlocker(text);
    }
  };
  const saveBaselines = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBaselineUpdate(null);
    const values = rows.map((row) => {
      const item = catalogItems.find((entry) => entry.item_code === row.itemCode);
      return { item: item?.item_name || "", code: row.itemCode, qty: Number(row.qty) };
    }).filter((row) => row.item && Number.isSafeInteger(row.qty) && row.qty > 0);
    const results = await Promise.allSettled(values.map((row) => onSetBaseline(row.item, row.qty, row.code)));
    const savedRows = results.flatMap((result, index) => result.status === "fulfilled" ? [values[index]] : []);
    const saved = savedRows.length;
    setBaselineMessage(`${saved} of ${values.length} baseline${values.length === 1 ? "" : "s"} saved.`);
    if (saved > 0) {
      setBaselineUpdate({
        summary: `${saved} usual-quantity baseline${saved === 1 ? "" : "s"} saved`,
        details: savedRows.map((row) => `${row.item}: ${row.qty} usual units`),
        recipientEmail: "",
      });
    }
    if (saved === values.length) setRows([{ itemCode: "", qty: "" }]);
  };
  const saveCatalogItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCatalogItemMessage("");
    try {
      await onImportCatalogItems([{
        item_name: catalogItemName.trim(),
        ...(catalogItemCode.trim() ? { item_code: catalogItemCode.trim().toUpperCase() } : {}),
      }]);
      setCatalogItemName("");
      setCatalogItemCode("");
      setCatalogItemMessage("Client catalog item enrolled.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Client catalog enrollment failed.";
      setCatalogItemMessage(text);
      notifyChimeBlocker(text);
    }
  };
  const changeApprover = async (userId: string, assign: boolean) => {
    setApproverUpdate(null);
    const member = members.find((entry) => entry.user_id === userId);
    try {
      await onManageApprover(userId, assign);
      if (member?.email) {
        const summary = assign ? "Designated Reviewer/Approver assignment completed" : "Designated Reviewer/Approver assignment removed";
        setApproverUpdate({ summary, details: [], recipientEmail: member.email });
      }
    } catch {
      // The parent mutation presents the save error; do not offer a success email.
    }
  };
  const saveBaselineEdit = async (baseline: QuantityBaseline) => {
    const qty = Number(editingBaselineQuantity);
    if (!Number.isSafeInteger(qty) || qty <= 0) return;
    try {
      await onSetBaseline(baseline.item_name, qty);
      setBaselineUpdate({
        summary: `Usual quantity updated for ${baseline.item_name}`,
        details: [`${baseline.usual_qty} → ${qty} usual units`],
        recipientEmail: "",
      });
      setBaselineMessage(`Usual quantity updated for ${baseline.item_name}.`);
      setEditingBaselineKey(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : "The usual quantity could not be updated.";
      setBaselineMessage(text); notifyChimeBlocker(text);
    }
  };
  const archiveBaseline = async (baseline: QuantityBaseline) => {
    const confirmed = window.confirm(
      `Archive the usual quantity for ${baseline.item_name} (${baseline.usual_qty} units)? It will stop applying to new PO checks but can be restored. If there are fewer than 3 earlier Sent POs, future POs for this item may be held until a baseline is active.`
    );
    if (!confirmed) return;
    try {
      await onArchiveBaseline(baseline.item_name);
      setBaselineUpdate({
        summary: `Usual-quantity baseline archived for ${baseline.item_name}`,
        details: [`Archived value: ${baseline.usual_qty} usual units`],
        recipientEmail: "",
      });
      setBaselineMessage(`Usual quantity archived for ${baseline.item_name}.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "The usual quantity could not be archived.";
      setBaselineMessage(text); notifyChimeBlocker(text);
    }
  };
  const restoreBaseline = async (baseline: AdminSetupSnapshot["archived_baselines"][number]) => {
    try {
      await onRestoreBaseline(baseline.item_name);
      setBaselineUpdate({
        summary: `Usual-quantity baseline restored for ${baseline.item_name}`,
        details: [`Restored value: ${baseline.usual_qty} usual units`],
        recipientEmail: "",
      });
      setBaselineMessage(`Usual quantity restored for ${baseline.item_name}.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "The usual quantity could not be restored.";
      setBaselineMessage(text); notifyChimeBlocker(text);
    }
  };

  return (
    <main className="amw-shell">
      <header className="amw-topbar">
        <a className="amw-brand" href="/" aria-label={`VireoIntelligence ${currentRoleName} home`}>
          <span className="amw-brand-mark" aria-hidden="true">
            <img src="/logo.svg" alt="" />
          </span>
          <span className="amw-brand-copy">
            <strong>Vireo<span>Intelligence</span></strong>
            <small>INVITATION-ONLY WORKSPACE</small>
          </span>
        </a>
        <div className="amw-mode">
          <span className="amw-mode-dot" />
          <span>{currentRoleName.toUpperCase()}</span>
        </div>
      </header>
      <div className="amw-agent-top">
        <ChimeDemoProfile />
      </div>
      <nav className="amw-flow-nav" aria-label="Admin-Member workspace sections">
        <a href="#amw-suppliers">01 Suppliers</a>
        <a href="#amw-supplier-items">02 Supplier items</a>
        <a href="#amw-people">03 People &amp; access</a>
        <a href="#amw-catalog">04 Items &amp; catalog</a>
        <a href="#amw-safeguards">05 Safeguards</a>
        <a href="#amw-audit">06 Workspace audit</a>
      </nav>

      <div className="amw-content">
        <section className="amw-panel amw-supplier-directory" id="amw-suppliers" aria-labelledby="amw-supplier-title">
          <div className="amw-panel-heading">
            <div className="amw-heading-icon"><PackageCheck size={16} aria-hidden="true" /></div>
            <div><span className="amw-card-label">SUPPLIER ENROLLMENT</span><h2 id="amw-supplier-title">Suppliers</h2></div>
            <span className="amw-count" data-testid="text-supplier-count">{suppliers.length}</span>
          </div>
          {!supplierItemDirectoryReady && <p className="amw-archive-migration-note" role="status">Supplier enrollment is waiting for the workspace enrollment migration.</p>}
          {suppliers.length ? <ul className="amw-manage-list" data-testid="list-enrolled-suppliers">
            {suppliers.map((supplier) => <li key={supplier.supplier_code}><span><strong>{supplier.supplier_name}</strong><small>{supplier.supplier_code} · {supplier.category}</small></span></li>)}
          </ul> : <p className="amw-baseline-empty">No suppliers are enrolled in this workspace.</p>}
          {!supplierDirectoryReady && <p className="amw-archive-migration-note" role="status">The supplier directory is not available yet. Apply its approved migration before enrolling suppliers.</p>}
          <form className="amw-role-form amw-enrollment-form" onSubmit={(event) => void saveSupplier(event)}>
            <label><span>Supplier name</span><input required maxLength={240} value={supplierName} disabled={!supplierItemDirectoryReady || importingSuppliers} onChange={(event) => setSupplierName(event.target.value)} /></label>
            <label><span>Category</span><input required maxLength={120} value={supplierCategory} disabled={!supplierItemDirectoryReady || importingSuppliers} onChange={(event) => setSupplierCategory(event.target.value)} /></label>
            <label><span>Supplier code <small>Optional; Vireo generates one if blank</small></span><input maxLength={64} value={supplierCode} disabled={!supplierItemDirectoryReady || importingSuppliers} onChange={(event) => setSupplierCode(event.target.value.toUpperCase())} /></label>
            <div className="amw-admin-assign"><button type="submit" disabled={!supplierItemDirectoryReady || importingSuppliers || !supplierName.trim() || !supplierCategory.trim()}>{importingSuppliers ? "Saving…" : "Enroll supplier"}</button></div>
          </form>
          <WorkspaceFileEnrollment
            title="Bulk supplier enrollment"
            description="Required columns: supplier name and category. Supplier code is optional and generated when blank."
            fields={[
              { key: "supplier_name", label: "Supplier name", required: true, aliases: ["supplier name", "vendor name", "name"] },
              { key: "category", label: "Category", required: true, aliases: ["category", "supplier category", "type"] },
              { key: "supplier_code", label: "Supplier code", aliases: ["supplier code", "vendor code", "supplier id"] },
            ]}
            busy={importingSuppliers || !supplierItemDirectoryReady}
            onImport={(rows) => onImportSuppliers(rows.map((row) => ({ supplier_name: row.supplier_name, category: row.category, supplier_code: row.supplier_code || undefined })))}
          />
          {supplierMessage && <p className="amw-import-message" role="status">{supplierMessage}</p>}
        </section>

        <section className="amw-panel amw-supplier-directory" id="amw-supplier-items" aria-labelledby="amw-supplier-items-title">
          <div className="amw-panel-heading">
            <div className="amw-heading-icon"><PackageCheck size={16} aria-hidden="true" /></div>
            <div><span className="amw-card-label">SUPPLIER ITEM ENROLLMENT</span><h2 id="amw-supplier-items-title">Supplier items</h2></div>
            <span className="amw-count">{supplierItems.length}</span>
          </div>
          {supplierItems.length ? <ul className="amw-manage-list">
            {supplierItems.map((item) => <li key={`${item.supplier_code}-${item.supplier_item_code}`}>
              <span><strong>{item.supplier_item_name}</strong><small>{item.supplier_name} · SKU {item.supplier_item_code}</small></span>
              <label className="amw-item-link-control"><span className="sr-only">Client item link for {item.supplier_item_name}</span>
                <select aria-label={`Client item link for ${item.supplier_item_name}`} value={item.item_code || ""} disabled={linkingSupplierItem} onChange={(event) => void onLinkSupplierItem({ supplier_code: item.supplier_code, supplier_item_code: item.supplier_item_code, item_code: event.target.value || null })}>
                  <option value="">No client item link</option>
                  {catalogItems.map((catalogItem) => <option key={catalogItem.item_code} value={catalogItem.item_code}>{catalogItem.item_code} · {catalogItem.item_name}</option>)}
                </select>
              </label>
            </li>)}
          </ul> : <p className="amw-baseline-empty">No supplier items are enrolled yet.</p>}
          {!supplierItemDirectoryReady && <p className="amw-archive-migration-note" role="status">Supplier-item enrollment is waiting for the workspace enrollment migration.</p>}
          <form className="amw-role-form amw-enrollment-form" onSubmit={(event) => void saveSupplierItem(event)}>
            <label><span>Supplier</span><select required value={supplierItemSupplier} disabled={!supplierItemDirectoryReady || importingSupplierItems || !suppliers.length} onChange={(event) => setSupplierItemSupplier(event.target.value)}>
              <option value="">Choose an enrolled supplier</option>{suppliers.map((supplier) => <option key={supplier.supplier_code} value={supplier.supplier_code}>{supplier.supplier_name} · {supplier.supplier_code}</option>)}
            </select></label>
            <label><span>Supplier SKU</span><input required maxLength={64} value={supplierItemCode} disabled={!supplierItemDirectoryReady || importingSupplierItems} onChange={(event) => setSupplierItemCode(event.target.value.toUpperCase())} /></label>
            <label><span>Supplier item name</span><input required maxLength={240} value={supplierItemName} disabled={!supplierItemDirectoryReady || importingSupplierItems} onChange={(event) => setSupplierItemName(event.target.value)} /></label>
            <label><span>Link to client item code <small>Optional</small></span><select value={clientItemCode} disabled={!supplierItemDirectoryReady || importingSupplierItems} onChange={(event) => setClientItemCode(event.target.value)}>
              <option value="">No client catalog link</option>{catalogItems.map((item) => <option key={item.item_code} value={item.item_code}>{item.item_code} · {item.item_name}</option>)}
            </select></label>
            <div className="amw-admin-assign"><button type="submit" disabled={!supplierItemDirectoryReady || importingSupplierItems || !supplierItemSupplier || !supplierItemCode.trim() || !supplierItemName.trim()}>{importingSupplierItems ? "Saving…" : "Enroll supplier item"}</button></div>
          </form>
          <WorkspaceFileEnrollment
            title="Bulk supplier-item enrollment"
            description="Required columns: supplier code, supplier SKU, and supplier item name. Link to a client item code is optional."
            fields={[
              { key: "supplier_code", label: "Supplier code", required: true, aliases: ["supplier code", "vendor code", "supplier id"] },
              { key: "supplier_item_code", label: "Supplier SKU", required: true, aliases: ["supplier sku", "supplier item code", "vendor sku", "sku"] },
              { key: "supplier_item_name", label: "Supplier item name", required: true, aliases: ["supplier item name", "item name", "product name", "description"] },
              { key: "item_code", label: "Client item code", aliases: ["client item code", "workspace item code", "item code", "vireo code"] },
            ]}
            busy={importingSupplierItems || !supplierItemDirectoryReady}
            onParsedRows={(rows) => {
              const missingSkuRows = rows.filter((row) => !row.values.supplier_item_code?.trim()).map((row) => row.rowNumber);
              const invalidClientCodeRows = rows.filter((row) => {
                const code = row.values.item_code?.trim();
                return Boolean(code && !catalogItems.some((item) => item.item_code.toUpperCase() === code.toUpperCase()));
              }).map((row) => row.rowNumber);
              const notices: string[] = [];
              if (missingSkuRows.length) notices.push(`Supplier SKU is missing on row${missingSkuRows.length === 1 ? "" : "s"} ${missingSkuRows.join(", ")}. Manually enter the supplier item code in the highlighted field${missingSkuRows.length === 1 ? "" : "s"}.`);
              if (invalidClientCodeRows.length) notices.push(`The client item code on row${invalidClientCodeRows.length === 1 ? "" : "s"} ${invalidClientCodeRows.join(", ")} is not enrolled in this workspace. Enter a valid enrolled item code, or clear the optional link if none is intended.`);
              if (notices.length) notifyChimeBlocker(notices.join(" "));
            }}
            validateField={(row, field) => {
              if (field.key !== "item_code") return undefined;
              const clientCode = row.item_code?.trim();
              if (!clientCode) return undefined;
              const enrolled = catalogItems.some((item) => item.item_code.toUpperCase() === clientCode.toUpperCase());
              return enrolled ? undefined : `Client item code "${clientCode}" is not enrolled in this workspace. Enter a valid enrolled code or clear this optional link.`;
            }}
            onImport={(rows) => onImportSupplierItems(rows.map((row) => {
              const linkedItem = catalogItems.find((item) => item.item_code.toUpperCase() === row.item_code?.trim().toUpperCase());
              return ({
              supplier_code: row.supplier_code,
              supplier_item_code: row.supplier_item_code,
              supplier_item_name: row.supplier_item_name,
              ...(linkedItem ? { item_code: linkedItem.item_code } : {}),
            }); }))}
          />
          {supplierItemMessage && <p className="amw-import-message" role="status">{supplierItemMessage}</p>}
        </section>

        <div className="amw-section-head" id="amw-people">
          <div><p className="amw-eyebrow">WORKSPACE ACCESS</p><h2>People &amp; access</h2></div>
        </div>
        {loading ? (
          <section className="amw-loading" aria-label="Loading workspace information" aria-busy="true">
            <div className="amw-skeleton amw-skeleton-title" />
            <div className="amw-skeleton amw-skeleton-row" />
            <div className="amw-skeleton amw-skeleton-row" />
            <div className="amw-skeleton amw-skeleton-row short" />
          </section>
        ) : error ? (
          <section className="amw-error" role="alert">
            <div className="amw-alert-icon"><CircleAlert size={18} aria-hidden="true" /></div>
            <div className="amw-error-copy">
              <strong>Workspace setup is unavailable</strong>
              <p>{errorMessage}</p>
            </div>
            <button className="amw-retry" type="button" onClick={retry} data-testid="button-retry">
              <RefreshCw size={14} aria-hidden="true" /> Retry
            </button>
          </section>
        ) : (
          <>
            <div className="amw-people-grid">
              <section className="amw-panel amw-roster" aria-labelledby="amw-roster-title">
                <div className="amw-panel-heading">
                  <div className="amw-heading-icon"><UsersRound size={16} aria-hidden="true" /></div>
                  <div>
                    <span className="amw-card-label">ACCESS DIRECTORY</span>
                    <h3 id="amw-roster-title">Workspace members</h3>
                  </div>
                  <span className="amw-count" data-testid="text-member-count">{members.length}</span>
                </div>
                {members.length ? (
                  <ul className="amw-member-list">
                    {members.map((member) => (
                      <li key={member.user_id} data-testid={`row-member-${member.user_id}`}>
                        <span className="amw-initials" aria-hidden="true">
                          {(member.email || member.user_id).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="amw-member-identity">
                          <strong data-testid={`text-member-${member.user_id}`}>{displayMember(member)}</strong>
                        <small>{roleLabel(member.role, member.is_approver, isDemoWorkspace)}</small>
                        </span>
                         {member.is_approver && (
                           <span className="amw-approver-label"><Check size={12} aria-hidden="true" /> Approver</span>
                         )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="amw-empty">
                    <UsersRound size={19} aria-hidden="true" />
                    <strong>No members to display</strong>
                    <p>The workspace roster has no available member records.</p>
                  </div>
                )}
                <p className="amw-readonly-note">Read-only member directory. Assign or change a role in the access control below.</p>
              </section>
            </div>

            <section className="amw-people-roles" aria-labelledby="amw-people-roles-title">
              <div className="amw-section-head">
                <div><p className="amw-eyebrow">PEOPLE &amp; ACCESS</p><h2 id="amw-people-roles-title">Assign workspace roles</h2></div>
              </div>
              <div className="amw-admin-control">
                <div className="amw-panel-heading">
                  <div className="amw-heading-icon"><ShieldCheck size={16} aria-hidden="true" /></div>
                  <div><span className="amw-card-label">ADMIN-MEMBER CONTROL</span><h3>Maker or Reviewer/Approver</h3></div>
                </div>
                <p className="amw-baseline-copy">Assign a role to an existing workspace member. New-member invitations remain managed by Vireo.</p>
                {!memberRoleAssignmentReady && <p className="amw-archive-migration-note" role="status">Employee-number role assignment is waiting for the workspace database migration. Existing access settings remain unchanged.</p>}
                <form className="amw-role-form" onSubmit={(event) => void saveWorkspaceRole(event)}>
                  <label><span>Workspace member</span>
                    <select data-testid="select-workspace-role-member" required value={memberId} disabled={!memberRoleAssignmentReady || managingWorkspaceRole || !eligibleMembers.length} onChange={(event) => setMemberId(event.target.value)}>
                      <option value="">Choose a current member</option>
                      {eligibleMembers.map((member) => <option key={member.user_id} value={member.user_id}>{displayMember(member)}</option>)}
                    </select>
                  </label>
                  <label><span>Workspace role</span>
                    <select data-testid="select-workspace-role" value={memberRole} disabled={!memberRoleAssignmentReady || managingWorkspaceRole} onChange={(event) => setMemberRole(event.target.value as "maker" | "reviewer_approver")}>
                      <option value="maker">Maker</option><option value="reviewer_approver">Reviewer/Approver</option>
                    </select>
                  </label>
                  <label className="amw-role-employee"><span>Employee number <strong>Required</strong></span>
                    <input data-testid="input-workspace-employee-number" required maxLength={80} value={employeeNumber} disabled={!memberRoleAssignmentReady || managingWorkspaceRole} onChange={(event) => setEmployeeNumber(event.target.value)} placeholder="Enter the assigned member’s employee number" />
                    <small>Vireo handles the Admin-Member’s own employee number in Frontend User.</small>
                  </label>
                  <div className="amw-admin-assign"><button type="submit" data-testid="button-assign-workspace-role" disabled={!memberRoleAssignmentReady || !memberId || !employeeNumber.trim() || managingWorkspaceRole}>{managingWorkspaceRole ? "Saving…" : "Save workspace role"}</button></div>
                </form>
              </div>
            </section>

            <section className="amw-baseline-list" id="amw-catalog" aria-labelledby="amw-catalog-title">
              <div className="amw-panel-heading">
                <div className="amw-heading-icon"><PackageCheck size={16} aria-hidden="true" /></div>
                <div><span className="amw-card-label">ITEMS AND CATALOG</span><h3 id="amw-catalog-title">Workspace item codes</h3></div>
                <span className="amw-count">{catalogItems.length}</span>
              </div>
              {!supplierItemDirectoryReady && <p className="amw-archive-migration-note" role="status">Catalog enrollment and supplier links are waiting for the workspace enrollment migration.</p>}
              {catalogItems.length ? (
                <ul className="amw-baseline-items">
                  {catalogItems.map((item) => <li key={item.item_code}>
                    <div className="amw-baseline-row-main">
                      <span>{item.item_name}<small className="amw-item-code">{item.item_code}</small><small className="amw-item-links">{supplierItems.filter((link) => link.item_code === item.item_code).map((link) => `${link.supplier_name} · ${link.supplier_item_code}`).join(" · ") || "No supplier item linked"}</small></span>
                    </div>
                  </li>)}
                </ul>
              ) : <p className="amw-baseline-empty">No catalog items are enrolled yet.</p>}
              <form className="amw-role-form amw-enrollment-form" onSubmit={(event) => void saveCatalogItem(event)}>
                <label><span>Client item name</span><input required maxLength={240} value={catalogItemName} disabled={!supplierItemDirectoryReady || importingCatalogItems} onChange={(event) => setCatalogItemName(event.target.value)} /></label>
                <label><span>Client item code <small>Optional; Vireo generates one if blank</small></span><input maxLength={64} value={catalogItemCode} disabled={!supplierItemDirectoryReady || importingCatalogItems} onChange={(event) => setCatalogItemCode(event.target.value.toUpperCase())} /></label>
                <div className="amw-admin-assign"><button type="submit" disabled={!supplierItemDirectoryReady || importingCatalogItems || !catalogItemName.trim()}>{importingCatalogItems ? "Saving…" : "Enroll client item"}</button></div>
              </form>
              {catalogItemMessage && <p className="amw-import-message" role="status">{catalogItemMessage}</p>}
              <WorkspaceFileEnrollment
                title="Bulk client catalog enrollment"
                description="Required column: client item name. Client item code is optional and generated when blank."
                fields={[
                  { key: "item_name", label: "Client item name", required: true, aliases: ["item name", "client item name", "product name", "description"] },
                  { key: "item_code", label: "Client item code", aliases: ["item code", "client item code", "workspace item code", "vireo code"] },
                ]}
                busy={importingCatalogItems || !supplierItemDirectoryReady}
                onImport={(rows) => onImportCatalogItems(rows.map((row) => ({
                  item_name: row.item_name,
                  ...(row.item_code ? { item_code: row.item_code } : {}),
                })))}
              />
            </section>

            <section className="amw-setup-section" id="amw-safeguards" aria-labelledby="amw-setup-title">
              <div className="amw-setup-heading">
                <div>
                  <p className="amw-eyebrow">ADMIN-MEMBER CONFIGURATION</p>
                  <h2 id="amw-setup-title">Procurement safeguards</h2>
                  <p>Maintain the workspace’s usual-quantity baselines and the safeguards that keep unusual requests visible.</p>
                </div>
                <div className="amw-setup-index"><span>01</span><span>02</span></div>
              </div>
              <div className="amw-admin-control">
                <div className="amw-panel-heading">
                  <div className="amw-heading-icon"><ShieldCheck size={16} aria-hidden="true" /></div>
                  <div><span className="amw-card-label">APPROVAL SAFEGUARD</span><h3>Designated approvers</h3></div>
                </div>
                <p className="amw-baseline-copy">Reviewer/Approver membership and employee numbers are assigned under People &amp; access.</p>
                {approvers.length ? <ul className="amw-manage-list">
                  {approvers.map((approver) => <li key={approver.user_id}>
                    <span>{approver.email || `Member ${approver.user_id.slice(0, 8)}`}</span>
                    <button type="button" data-testid={`button-remove-approver-${approver.user_id}`} disabled={managingApprovers || !memberRoleAssignmentReady} onClick={() => void changeApprover(approver.user_id, false)}>Remove approver</button>
                  </li>)}
                </ul> : <p className="amw-baseline-empty">No Reviewer/Approver is designated yet.</p>}
              </div>
              <div className="amw-controls" data-testid="region-management-controls">
                <div className="amw-admin-control">
                  <div className="amw-panel-heading">
                    <div className="amw-heading-icon"><Check size={16} aria-hidden="true" /></div>
                    <div><span className="amw-card-label">ONBOARDING BASELINE</span><h3>Usual quantity by item</h3></div>
                  </div>
                  <p className="amw-baseline-copy">Item names and usual quantities are shown only in this baseline setup area. No request or transaction details are included.</p>
                  <form onSubmit={(event) => void saveBaselines(event)} className="amw-baseline-form-list">
                    {rows.map((row, index) => <div className="amw-admin-baseline-row" key={index}>
                      <label><span>Client catalog item</span><select data-testid={`input-baseline-item-${index}`} required value={row.itemCode} disabled={settingBaseline || !catalogItems.length} onChange={(event) => setRows((current) => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, itemCode: event.target.value } : entry))}>
                        <option value="">Choose an enrolled item</option>{catalogItems.map((item) => <option key={item.item_code} value={item.item_code}>{item.item_code} · {item.item_name}</option>)}
                      </select></label>
                      <label><span>Usual quantity</span><input data-testid={`input-baseline-quantity-${index}`} type="number" min="1" step="1" inputMode="numeric" value={row.qty} required disabled={settingBaseline} placeholder="e.g. 48" onChange={(event) => setRows((current) => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, qty: event.target.value } : entry))} /></label>
                      {rows.length > 1 && <button type="button" className="amw-remove-row" aria-label={`Remove baseline row ${index + 1}`} onClick={() => setRows((current) => current.filter((_entry, rowIndex) => rowIndex !== index))}><X size={14} /></button>}
                    </div>)}
                    <div className="amw-admin-assign">
                      <button type="button" data-testid="button-add-baseline-row" disabled={settingBaseline} onClick={() => setRows((current) => [...current, { itemCode: "", qty: "" }])}><Plus size={14} /> Add item</button>
                      <button type="submit" data-testid="button-save-baselines" disabled={settingBaseline || rows.some((row) => !row.itemCode || !row.qty)}>{settingBaseline ? "Saving…" : "Save baseline"}</button>
                    </div>
                    {baselineMessage && <p role="status" data-testid="status-baseline-save">{baselineMessage}</p>}
                  </form>
                </div>
              </div>
            </section>

            {approverUpdate && <AdminUpdateEmailFollowUp kind="approver" update={approverUpdate} onDismiss={() => setApproverUpdate(null)} />}
            {baselineUpdate && <AdminUpdateEmailFollowUp kind="baseline" update={baselineUpdate} onDismiss={() => setBaselineUpdate(null)} />}

            <section className="amw-baseline-list" aria-labelledby="amw-baseline-title">
              <div className="amw-panel-heading">
                <div className="amw-heading-icon"><Check size={16} aria-hidden="true" /></div>
                <div>
                  <span className="amw-card-label">PROCUREMENT SAFEGUARDS</span>
                  <h3 id="amw-baseline-title">Usual-quantity baselines</h3>
                </div>
                <span className="amw-count" data-testid="text-baseline-count">{baselines.length}</span>
              </div>
              {baselines.length ? (
                <ul className="amw-baseline-items">
                  {baselines.map((baseline) => (
                    <li key={baseline.item_key} data-testid={`row-baseline-${baseline.item_key}`}>
                      <div className="amw-baseline-row-main">
                        <span>{baseline.item_name}<small className="amw-item-code">{catalogItems.find((item) => item.item_name === baseline.item_name)?.item_code || "Code not available"}</small></span>
                        {editingBaselineKey === baseline.item_key ? (
                          <label className="amw-edit-quantity">
                            <span className="sr-only">Usual quantity for {baseline.item_name}</span>
                            <input type="number" min="1" step="1" inputMode="numeric" value={editingBaselineQuantity} onChange={(event) => setEditingBaselineQuantity(event.target.value)} disabled={settingBaseline} />
                            <small>usual units</small>
                          </label>
                        ) : (
                          <strong>{baseline.usual_qty.toLocaleString()} <small>usual units</small></strong>
                        )}
                      </div>
                      <div className="amw-baseline-row-actions">
                        {editingBaselineKey === baseline.item_key ? (
                          <>
                            <button type="button" disabled={settingBaseline || !Number.isSafeInteger(Number(editingBaselineQuantity)) || Number(editingBaselineQuantity) <= 0} onClick={() => void saveBaselineEdit(baseline)}>{settingBaseline ? "Saving…" : "Save"}</button>
                            <button type="button" disabled={settingBaseline} onClick={() => setEditingBaselineKey(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" disabled={settingBaseline || archivingBaseline} onClick={() => {
                              setEditingBaselineKey(baseline.item_key);
                              setEditingBaselineQuantity(String(baseline.usual_qty));
                            }} aria-label={`Edit usual quantity for ${baseline.item_name}`}><Pencil size={13} /> Edit</button>
                            {baselineArchiveReady && <button type="button" disabled={settingBaseline || archivingBaseline} onClick={() => void archiveBaseline(baseline)} aria-label={`Archive baseline for ${baseline.item_name}`}><Trash2 size={13} /> Archive</button>}
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="amw-baseline-empty">No usual quantities are recorded yet. Add the workspace’s onboarding references using the controls above.</p>
              )}
              {!baselineArchiveReady && <p className="amw-archive-migration-note">Reversible archive and restore become available after the baseline archive migration is applied in Supabase.</p>}
              {archivedBaselines.length > 0 && (
                <div className="amw-archived-baselines" data-testid="archived-baselines">
                  <h4>Archived usual quantities</h4>
                  <p>Archived values are inactive and do not affect new purchase-order checks.</p>
                  <ul>
                    {archivedBaselines.map((baseline) => (
                      <li key={baseline.item_key}>
                        <span>{baseline.item_name}<small>{new Date(baseline.archived_at).toLocaleDateString()}</small></span>
                        <strong>{baseline.usual_qty.toLocaleString()} usual units</strong>
                        <button type="button" disabled={restoringBaseline} onClick={() => void restoreBaseline(baseline)}><RotateCcw size={13} /> Restore</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <section className="amw-audit-section" id="amw-audit" aria-labelledby="amw-audit-title">
        <div>
          <p className="amw-eyebrow">06 · ACCOUNTABILITY</p>
          <h2 id="amw-audit-title">Workspace audit</h2>
          <p>Review role, approver, supplier, catalog, and usual-quantity changes. Employee-number values and procurement records are never included.</p>
        </div>
        {auditReady ? auditEvents.length ? <ol className="amw-audit-events">
          {auditEvents.map((event) => <li key={event.id}>
            <span className="amw-audit-date">{new Date(event.created_at).toLocaleString()}</span>
            <strong>{event.summary}</strong>
            <small>{event.actor_email || "Workspace administrator"}{event.target_email ? ` · ${event.target_email}` : ""}</small>
          </li>)}
        </ol> : <p className="amw-baseline-empty">No workspace changes have been recorded yet.</p> : <p className="amw-archive-migration-note" role="status">Workspace audit is waiting for its database migration.</p>}
        <details className="amw-chime-audit">
          <summary>Chime activity</summary>
          <ChimeAuditTrail />
        </details>
      </section>
      <footer className="amw-footer">
        <span>VireoIntelligence</span>
        <span>{currentRoleName} workspace</span>
      </footer>
      <ChimeBlockerDialog
        kind={chimeNotice?.kind}
        phase={chimeNotice?.phase}
        message={chimeNotice?.message || ""}
        eventId={chimeNotice?.event_id || ""}
        role="admin-member"
        onClose={onCloseChime}
      />
    </main>
  );
}
