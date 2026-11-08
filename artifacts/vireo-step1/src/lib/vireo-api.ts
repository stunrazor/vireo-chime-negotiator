import type { AnalyticsAlert, AnalyticsAlertReview } from '@/lib/report-alert-types';

export type RequestRecord = {
  id: string;
  status: string;
  confidence: number;
  batch_id?: string | null;
  batch_number?: string | null;
  requester_email?: string;
  raw_text?: string;
  item?: string | null;
  item_code?: string | null;
  qty?: number | null;
  site?: string | null;
  spec?: string | null;
  needed_by?: string | null;
  source?: string | null;
  created_at?: string;
};

export type SpreadsheetPreview = {
  sheet_name: string;
  columns: string[];
  rows: { row_number: number; values: string[]; source_text?: string }[];
  truncated: boolean;
};

export type SpreadsheetRequestPayload = {
  requester_email: string;
  item: string;
  item_code: string;
  qty: number;
  site: string;
  spec: string;
  needed_by: string;
  raw_text: string;
};

export type QuoteDocumentPreview = {
  quote_text: string;
  supplier_name: string | null;
  price_total: number | null;
  delivery_days: number | null;
  confidence: number;
  status: string;
  message: string;
};

export type RfqRecord = {
  id: string;
  request_id: string;
  rfq_code: string;
  batch_id?: string | null;
  batch_number?: string | null;
  title: string;
  spec?: string | null;
  qty?: number | null;
  site?: string | null;
  needed_by?: string | null;
  status: string;
  suppliers?: string[] | null;
  created_at?: string;
};

export type CreateRfqBatchResponse = {
  ok: boolean;
  batch_id: string | null;
  batch_number: string | null;
  created: RfqRecord[];
  existing: RfqRecord[];
  failures: Array<{
    request_id: string;
    message: string;
    reason?: string;
    batch_number?: string | null;
  }>;
};

export type QuoteRecord = {
  id: string;
  rfq_id: string;
  supplier_name: string;
  price?: number | null;
  delivery_days?: number | null;
  confidence: number;
  status: string;
  quote_text?: string;
  quality_fit_status?: 'unreviewed' | 'meets' | 'partial' | 'does_not_meet';
  compliance_status?: 'unreviewed' | 'verified' | 'needs_review' | 'non_compliant';
  review_evidence?: string | null;
  created_at?: string;
};

export type RankingRecord = QuoteRecord & {
  rank: number;
};

export type AwardRecord = {
  id: string;
  quote_id?: string | null;
  award_code: string;
  rfq_id: string;
  rfq_code: string;
  supplier_name: string;
  price: number;
  qty: number;
  delivery_days?: number;
  status: string;
  created_at?: string;
};

export type PurchaseOrderRecord = {
  id: string;
  po_code: string;
  award_id: string;
  supplier_name: string;
  qty: number;
  price_total: number;
  payment_terms: string;
  delivery_commit: string;
  warranty: string;
  validity_days: number;
  status: string;
  created_at?: string;
};

export type PoApprovalMember = {
  user_id: string;
  email: string | null;
  role: "member" | "workspace_admin" | string;
  is_approver: boolean;
  employee_number?: string | null;
};

export type PoQuantityApprovalCase = {
  case_id: string;
  po_id: string;
  po_code: string;
  item: string;
  order_qty: number;
  basis: "onboarding" | "history" | "missing";
  reference_qty: number | null;
  history_order_count: number;
  signal: "larger" | "smaller" | "baseline_missing";
  requested_by: string | null;
  requester_unverified: boolean;
  can_approve: boolean;
  created_at: string;
  request_id?: string | null;
  batch_id?: string | null;
  batch_number?: string | null;
  requester_email?: string | null;
  reviewed_by?: string | null;
  reviewed_by_email?: string | null;
  reviewed_at?: string | null;
  clarification_status?: "not_needed" | "needed" | "draft_prepared" | "response_recorded" | null;
  clarification_draft_prepared_by_email?: string | null;
  clarification_draft_prepared_at?: string | null;
  clarification_response?: string | null;
  clarification_responded_at?: string | null;
  maker_returned_at?: string | null;
  maker_return_reason?: string | null;
  maker_explanation?: string | null;
  maker_explained_at?: string | null;
  maker_corrected_qty?: number | null;
  maker_correction_request_id?: string | null;
};

export type PoApprovedQuantityCase = Omit<
  PoQuantityApprovalCase,
  "can_approve" | "requester_unverified" | "created_at"
> & {
  decided_by: string;
  decided_at: string;
};

export type PoApprovalSnapshot = {
  schema_ready: true;
  batch_review_ready?: boolean;
  returned_item_batch_number?: string;
  actor_id: string;
  can_manage_approvers: boolean;
  is_approver: boolean;
  approver_count: number;
  baselines: Array<{
    item_key: string;
    item_name: string;
    usual_qty: number;
    updated_at: string;
  }>;
  members: PoApprovalMember[];
  approvers: Array<{
    user_id: string;
    email: string | null;
    assigned_at: string;
  }>;
  pending_cases: PoQuantityApprovalCase[];
  approved_cases: PoApprovedQuantityCase[];
};

export type AdminSetupSnapshot = {
  workspace_name: string | null;
  member_role_assignment_ready?: boolean;
  members: PoApprovalMember[];
  approvers: Array<{
    user_id: string;
    email: string | null;
    assigned_at: string;
  }>;
  baselines: Array<{
    item_key: string;
    item_name: string;
    usual_qty: number;
    updated_at: string;
  }>;
  archived_baselines: Array<{
    item_key: string;
    item_name: string;
    usual_qty: number;
    archived_at: string;
  }>;
};

export type WorkspaceCatalogItem = {
  item_code: string;
  item_name: string;
  usual_qty?: number | null;
};

export type WorkspaceCatalogItemDraft = {
  item_code?: string;
  item_name: string;
  usual_qty: number;
};
export type WorkspaceCatalogItemEnrollmentDraft = {
  item_code?: string;
  item_name: string;
};
export type WorkspaceSupplier = {
  supplier_code: string;
  supplier_name: string;
  category: string;
};
export type WorkspaceSupplierItem = {
  supplier_code: string;
  supplier_name: string;
  supplier_item_code: string;
  supplier_item_name: string;
  item_code: string | null;
  item_name: string | null;
};
export type WorkspaceAdminAuditEvent = {
  id: number;
  event_type: string;
  entity_key: string | null;
  summary: string;
  actor_email: string | null;
  target_email: string | null;
  created_at: string;
};
export type DemoCatalogSeedResult = {
  schema_ready: true;
  suppliers_added: number;
  suppliers: WorkspaceSupplier[];
  items: WorkspaceCatalogItem[];
};

export type ReportsSourceData = {
  requests: RequestRecord[];
  rfqs: RfqRecord[];
  quotes: QuoteRecord[];
  awards: AwardRecord[];
  purchase_orders: PurchaseOrderRecord[];
  capped?: Partial<Record<
    "requests" | "rfqs" | "quotes" | "awards" | "purchase_orders",
    boolean
  >>;
};

export type CreateRequestResponse = {
  status: string;
  confidence: number;
  message: string;
  request: RequestRecord;
};

export type StatusPayload = {
  state?: string;
  connected?: boolean;
  configured?: boolean;
  schemaReady?: boolean;
  batchNumberingReady?: boolean;
  journeyAuditReady?: boolean;
  workflowReadinessCheckAvailable?: boolean;
  quoteQualityReviewReady?: boolean;
  missingBatchMetadata?: boolean;
  missingTables?: string[];
  inaccessibleTables?: string[];
  message?: string;
  latencyMs?: number;
};

export type AuthUser = {
  id: string;
  email: string;
};

export type WorkspaceMembership = {
  id: string;
  display_name: string;
  language: string;
  role: "member" | "workspace_admin" | string;
};

export type AuthSession = {
  user: AuthUser;
  aal: "aal1" | "aal2";
  factors: AuthFactor[];
  workspaces: WorkspaceMembership[];
};

export type AuthFactor = {
  id: string;
  factor_type: "totp";
  status: "verified" | "unverified";
  friendly_name?: string;
};

export type ChimeAuditEvent = {
  event_id: string;
  workspace_area: "onboarding" | "procurement";
  actor_role: "workspace_admin" | "member";
  event_kind: "blocker" | "review";
  decision: "pending" | "acknowledged" | "dismissed";
  created_at: string;
  decided_at: string | null;
  details?: ChimeProfileExtractionAuditField[];
};

export type ChimeProfileExtractionAuditField = {
  field_name: OnboardingFieldName;
  status: OnboardingFieldSuggestion["status"];
  value: string | null;
};

export type ChimeAuditDecision = "acknowledged" | "dismissed";

export type ChimeKnowledgeAnswer = {
  answer: string;
  source_sections: string[];
};

export type MfaEnrollment = AuthFactor & {
  totp: { secret: string; qr_code: string; uri?: string };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

let selectedWorkspaceId: string | null = null;
let refreshInFlight: Promise<Response> | null = null;

export const setSelectedWorkspaceId = (workspaceId?: string | null) => {
  selectedWorkspaceId = workspaceId || null;
};

const apiUrl = (path: string) => {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
};

const refreshSession = () => {
  if (!refreshInFlight) {
    refreshInFlight = fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

const notifyAuthExpired = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("vireo:auth-expired"));
  }
};

async function responseError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const errorBody = body as { error?: string; message?: string; code?: string } | undefined;
  return new ApiError(
    errorBody?.error ||
      errorBody?.message ||
      `The server returned HTTP ${response.status}.`,
    response.status,
    errorBody?.code,
  );
}

async function send(path: string, init: RequestInit | undefined, retryUnauthorized: boolean) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (init?.body && !headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  const requestInit: RequestInit = {
    ...init,
    headers,
    credentials: "same-origin",
  };
  let response = await fetch(apiUrl(path), requestInit);
  if (response.status === 401 && retryUnauthorized) {
    const refreshed = await refreshSession();
    if (refreshed.ok) {
      // Procurement endpoints authenticate before performing their action, so
      // retrying once after a successful cookie refresh cannot duplicate it.
      response = await fetch(apiUrl(path), requestInit);
    } else if (refreshed.status !== 401) {
      throw await responseError(refreshed);
    }
  }
  if (response.status === 401 && retryUnauthorized) notifyAuthExpired();
  return response;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (selectedWorkspaceId) headers.set("X-Workspace-Id", selectedWorkspaceId);
  const response = await send(path, { ...init, headers }, true);
  if (!response.ok) throw await responseError(response);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return body as T;
}

export const getSelectedWorkspaceId = () => selectedWorkspaceId;

export const getChimeAuditEvents = () =>
  api<ChimeAuditEvent[]>("/chime/audit-events");

export const askChime = (question: string) =>
  api<ChimeKnowledgeAnswer>("/chime/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  });

export const createChimeAuditEvent = (eventId: string, eventKind: "blocker" | "review") =>
  api<ChimeAuditEvent>("/chime/audit-events", {
    method: "POST",
    body: JSON.stringify({ event_id: eventId, event_kind: eventKind }),
  });

export const createChimeProfileExtractionAuditEvent = (
  eventId: string,
  fields: ChimeProfileExtractionAuditField[],
) =>
  api<ChimeAuditEvent>("/chime/profile-extraction-audit-events", {
    method: "POST",
    body: JSON.stringify({ event_id: eventId, fields }),
  });

export const decideChimeAuditEvent = (
  eventId: string,
  decision: ChimeAuditDecision,
) =>
  api<ChimeAuditEvent>(`/chime/audit-events/${encodeURIComponent(eventId)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });

export async function apiRaw(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (selectedWorkspaceId) headers.set("X-Workspace-Id", selectedWorkspaceId);
  const response = await send(path, { ...init, headers }, true);
  if (!response.ok) throw await responseError(response);
  return response;
}

export { api as apiRequest };

export const login = async (email: string, password: string) => {
  const response = await send("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }, false);
  if (!response.ok) throw await responseError(response);
};

export const enrollMfa = async (): Promise<MfaEnrollment> => {
  const response = await send("/auth/mfa/enroll", { method: "POST" }, false);
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as MfaEnrollment;
};

export const startMfaChallenge = async (factorId: string) => {
  const response = await send("/auth/mfa/challenge", {
    method: "POST",
    body: JSON.stringify({ factor_id: factorId }),
  }, false);
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as { factor_id: string; challenge_id: string };
};

export const verifyMfa = async (payload: {
  factor_id: string;
  challenge_id: string;
  code: string;
}) => {
  const response = await send("/auth/mfa/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  }, false);
  if (!response.ok) throw await responseError(response);
};

export const requestPasswordRecovery = async (email: string, redirectTo: string) => {
  const response = await send("/auth/recover", {
    method: "POST",
    body: JSON.stringify({ email, redirect_to: redirectTo }),
  }, false);
  if (!response.ok) throw await responseError(response);
};

export const updatePasswordFromRecovery = async (accessToken: string, password: string) => {
  const response = await send("/auth/update-password", {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken, password }),
  }, false);
  if (!response.ok) throw await responseError(response);
};

export const logout = async () => {
  const response = await send("/auth/logout", { method: "POST" }, false);
  if (response.status === 401) notifyAuthExpired();
  if (!response.ok) throw await responseError(response);
};

export const getAuthSession = async (): Promise<AuthSession | null> => {
  const response = await send("/auth/session", undefined, true);
  if (response.status === 401) return null;
  if (!response.ok) throw await responseError(response);
  const payload = (await response.json()) as AuthSession;
  if (
    !payload ||
    !payload.user ||
    typeof payload.user.id !== "string" ||
    typeof payload.user.email !== "string" ||
    !["aal1", "aal2"].includes(payload.aal) ||
    !Array.isArray(payload.factors) ||
    payload.factors.some(
      (factor) =>
        !factor ||
        typeof factor.id !== "string" ||
        factor.factor_type !== "totp" ||
        !["verified", "unverified"].includes(factor.status),
    ) ||
    !Array.isArray(payload.workspaces) ||
    payload.workspaces.some(
      (workspace) =>
        !workspace ||
        typeof workspace.id !== "string" ||
        typeof workspace.display_name !== "string" ||
        typeof workspace.language !== "string" ||
        typeof workspace.role !== "string",
    )
  ) {
    throw new Error("The server returned an invalid session response.");
  }
  return payload;
};

export const getStatus = () => api<StatusPayload>("/status");
export const getRequests = () => api<RequestRecord[]>("/requests");
export const getReportsSourceData = () => api<ReportsSourceData>("/reports/data");
export const getReportAlertReviews = () => api<AnalyticsAlertReview[]>("/reports/alert-reviews");
export const reviewReportAlert = (alert: AnalyticsAlert) =>
  api<AnalyticsAlertReview>("/reports/alert-reviews", {
    method: "POST",
    body: JSON.stringify({ alert }),
  });
export const createRequest = (payload: {
  raw_text: string;
  requester_email: string;
  item_code: string;
}) =>
  api<CreateRequestResponse>("/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const previewRequestSpreadsheet = (file: File) => {
  const body = new FormData();
  body.append("file", file);
  return api<SpreadsheetPreview>("/requests/spreadsheet-preview", {
    method: "POST",
    body,
  });
};
export const createSpreadsheetRequest = (payload: SpreadsheetRequestPayload) =>
  api<CreateRequestResponse>("/requests/import-spreadsheet-row", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const returnRequest = (id: string, reason: string) =>
  api<{ ok: true; request: RequestRecord }>(
    `/requests/${encodeURIComponent(id)}/return`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );

export const getRfqs = () => api<RfqRecord[]>("/rfqs");
export const createRfq = (request_id: string) =>
  api<RfqRecord>("/rfqs", {
    method: "POST",
    body: JSON.stringify({ request_id }),
  });
export const createRfqBatch = (request_ids: string[]) =>
  api<CreateRfqBatchResponse>("/rfqs/batch", {
    method: "POST",
    body: JSON.stringify({ request_ids }),
  });
export const sendRfq = (id: string) =>
  api<RfqRecord>(`/rfqs/${encodeURIComponent(id)}/send`, { method: "POST" });

export const getQuotes = (rfqId?: string) =>
  api<QuoteRecord[]>(
    `/quotes${rfqId ? `?rfq_id=${encodeURIComponent(rfqId)}` : ""}`,
  );
export const createQuote = (payload: {
  rfq_id: string;
  supplier_name: string;
  quote_text: string;
  price_total: number;
  delivery_days?: number;
  quality_fit_status?: QuoteRecord['quality_fit_status'];
  compliance_status?: QuoteRecord['compliance_status'];
  review_evidence?: string;
}) =>
  api<{ quote: QuoteRecord; status: string; message: string }>("/quotes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const updateQuoteAssessment = (payload: {
  quote_id: string;
  quality_fit_status: Exclude<QuoteRecord['quality_fit_status'], 'unreviewed' | undefined>;
  compliance_status: Exclude<QuoteRecord['compliance_status'], 'unreviewed' | undefined>;
  review_evidence: string;
}) =>
  api<QuoteRecord>(`/quotes/${encodeURIComponent(payload.quote_id)}/assessment`, {
    method: "PATCH",
    body: JSON.stringify({
      quality_fit_status: payload.quality_fit_status,
      compliance_status: payload.compliance_status,
      review_evidence: payload.review_evidence,
    }),
  });
export const previewQuoteDocument = (file: File, rfqId: string) => {
  const body = new FormData();
  body.append("file", file);
  body.append("rfq_id", rfqId);
  return api<QuoteDocumentPreview>("/quotes/preview-document", {
    method: "POST",
    body,
  });
};
export const previewQuoteText = (rfqId: string, quoteText: string) =>
  api<QuoteDocumentPreview>("/quotes/preview-text", {
    method: "POST",
    body: JSON.stringify({ rfq_id: rfqId, quote_text: quoteText }),
  });
export const getRanking = (rfqId: string) =>
  api<RankingRecord[]>(`/ranking/${encodeURIComponent(rfqId)}`);

export const getAwards = () => api<AwardRecord[]>("/awards");
export const createAward = (payload: {
  rfq_id: string;
  quote_id: string;
}) =>
  api<AwardRecord>("/awards", {
    method: "POST",
    body: JSON.stringify({ ...payload, human_confirmed: true }),
  });

export const getPurchaseOrders = () =>
  api<PurchaseOrderRecord[]>("/purchase-orders");
export const createPurchaseOrder = (payload: {
  award_id: string;
  terms_accepted: boolean;
}) =>
  api<PurchaseOrderRecord>("/purchase-orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const confirmPurchaseOrder = (id: string) =>
  api<PurchaseOrderRecord>(
    `/purchase-orders/${encodeURIComponent(id)}/confirm`,
    { method: "POST" },
  );
export const getPoApprovalSnapshot = () =>
  api<PoApprovalSnapshot>("/purchase-orders/approval-controls");
export const getAdminSetupSnapshot = () =>
  api<AdminSetupSnapshot>("/workspace-admin/setup");
export const assignWorkspaceMemberRole = (payload: {
  user_id: string;
  role: "maker" | "reviewer_approver";
  employee_number: string;
}) =>
  api<AdminSetupSnapshot>("/workspace-admin/member-role", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const getAdminWorkspaceItems = () =>
  api<{ items: WorkspaceCatalogItem[] }>("/workspace-admin/items");
export const importWorkspaceCatalogItems = (items: WorkspaceCatalogItemEnrollmentDraft[]) =>
  api<{ schema_ready: true; imported_count: number; items: WorkspaceCatalogItem[] }>(
    "/workspace-admin/catalog-items/import",
    { method: "POST", body: JSON.stringify({ items }) },
  );
export const getAdminWorkspaceSuppliers = () =>
  api<{ suppliers: WorkspaceSupplier[] }>("/workspace-admin/suppliers");
export const getAdminWorkspaceSupplierItems = () =>
  api<{ supplier_items: WorkspaceSupplierItem[] }>("/workspace-admin/supplier-items");
export const getAdminWorkspaceAudit = () =>
  api<{ events: WorkspaceAdminAuditEvent[] }>("/workspace-admin/audit");
export const importWorkspaceSuppliers = (suppliers: Array<{
  supplier_code?: string;
  supplier_name: string;
  category: string;
}>) =>
  api<{ schema_ready: true; imported_count: number; suppliers: WorkspaceSupplier[] }>(
    "/workspace-admin/suppliers/import",
    { method: "POST", body: JSON.stringify({ suppliers }) },
  );
export const importWorkspaceSupplierItems = (items: Array<{
  supplier_code: string;
  supplier_item_code: string;
  supplier_item_name: string;
  item_code?: string;
}>) =>
  api<{ schema_ready: true; imported_count: number; supplier_items: WorkspaceSupplierItem[] }>(
    "/workspace-admin/supplier-items/import",
    { method: "POST", body: JSON.stringify({ items }) },
  );
export const linkWorkspaceSupplierItem = (payload: {
  supplier_code: string;
  supplier_item_code: string;
  item_code: string | null;
}) =>
  api<{ supplier_items: WorkspaceSupplierItem[] }>("/workspace-admin/supplier-items/link", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const seedDemoCatalog = () =>
  api<DemoCatalogSeedResult>("/workspace-admin/demo-catalog/seed", { method: "POST" });
export type ClientDocumentStatus = "pending" | "received" | "verified" | "rejected" | "not_applicable";
export type ClientOnboardingRecord = {
  id: string;
  client_number: string;
  client_type: "individual" | "entity";
  legal_name: string;
  jurisdiction: string;
  industry: string | null;
  contact_name: string | null;
  contact_email: string | null;
  company_registered_representative?: string | null;
  company_email?: string | null;
  contact_mobile?: string | null;
  contact_landline?: string | null;
  company_website?: string | null;
  employee_number: string | null;
  employee_number_source: "client_provided" | "vireo_assigned" | "pending_agreement";
  employee_number_agreed: boolean;
  document_statuses: Record<string, ClientDocumentStatus>;
  created_at: string;
  archived_at: string | null;
};
export type ClientOnboardingFile = {
  id: string;
  document_key: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  verification_status: "received" | "chime_screening" | "needs_human_review" | "verified" | "rejected";
  screening_result: ClientOnboardingScreening | null;
  verified_by: string | null;
  verified_at: string | null;
};
export type OnboardingEvidence = { file_name: string; page: number | null; text: string; value?: string };
export type OnboardingFieldSuggestion = {
  value: string | null;
  confidence: number;
  status: "suggested" | "unknown" | "conflict" | "invalid";
  evidence: OnboardingEvidence[];
};
export type ClientOnboardingScreening = {
  screening_method: "local_text_rules";
  text_readable: boolean;
  category_evidence_found: boolean;
  evidence: string[];
  recommendation: string;
  authenticity_verified: false;
};
export type ClientOnboardingFilePreview = {
  file_name: string;
  document_key: string | null;
  document_category: OnboardingFieldSuggestion;
  text_readable: boolean;
  extraction_check: {
    status: "passed" | "needs_review";
    supported_fields: OnboardingFieldName[];
    unknown_fields: OnboardingFieldName[];
    invalid_fields: OnboardingFieldName[];
    conflicting_fields: OnboardingFieldName[];
    authenticity_verified: false;
  };
  suggestions: Record<OnboardingFieldName, OnboardingFieldSuggestion>;
  review_message: string;
};
export type OnboardingFieldName =
  | "legal_name" | "jurisdiction" | "industry" | "contact_name" | "contact_email"
  | "company_registered_representative" | "company_email" | "contact_mobile" | "contact_landline" | "company_website";
export const previewClientOnboardingFiles = (files: File[]) => {
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  return api<{
    files: ClientOnboardingFilePreview[];
    suggestions: Record<OnboardingFieldName, OnboardingFieldSuggestion>;
    conflicts: Array<{ field: OnboardingFieldName; values: OnboardingEvidence[] }>;
    external_ai_used: false;
  }>("/workspace-admin/onboarding/parse-files", { method: "POST", body });
};
export const getClientOnboardingFiles = (id: string) =>
  api<{ files: ClientOnboardingFile[] }>(`/workspace-admin/onboarding/${encodeURIComponent(id)}/files`);
export const uploadClientOnboardingFile = (id: string, key: string, file: File) => {
  const body = new FormData();
  body.append("file", file);
  return api<{ file: ClientOnboardingFile; virus_scanned: false }>(
    `/workspace-admin/onboarding/${encodeURIComponent(id)}/files/${encodeURIComponent(key)}`,
    { method: "POST", body },
  );
};
export const downloadClientOnboardingFile = async (id: string) => {
  const response = await apiRaw(`/workspace-admin/onboarding/files/${encodeURIComponent(id)}`);
  return response.blob();
};
export const screenClientOnboardingFile = (id: string) =>
  api<{ file: ClientOnboardingFile; screening: ClientOnboardingScreening }>(
    `/workspace-admin/onboarding/files/${encodeURIComponent(id)}/screen`,
    { method: "POST" },
  );
export const decideClientOnboardingFile = (id: string, decision: "verified" | "rejected") =>
  api<{ file: ClientOnboardingFile }>(
    `/workspace-admin/onboarding/files/${encodeURIComponent(id)}/decision`,
    { method: "POST", body: JSON.stringify({ decision }) },
  );
export const getClientOnboardingRecords = () =>
  api<{ records: ClientOnboardingRecord[]; archive_ready?: boolean }>("/workspace-admin/onboarding");
export const setClientOnboardingArchived = (id: string, archived: boolean) =>
  api<ClientOnboardingRecord>(`/workspace-admin/onboarding/${encodeURIComponent(id)}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
export const createClientOnboardingRecord = (payload: {
  client_type: "individual" | "entity";
  legal_name: string;
  jurisdiction: string;
  industry: string;
  contact_name: string;
  contact_email: string;
  company_registered_representative: string;
  company_email: string;
  contact_mobile: string;
  contact_landline: string;
  company_website: string;
  manual_entry_acknowledged: boolean;
}) =>
  api<ClientOnboardingRecord>("/workspace-admin/onboarding", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const updateClientOnboardingDocuments = (id: string, document_statuses: Record<string, ClientDocumentStatus>) =>
  api<ClientOnboardingRecord>(`/workspace-admin/onboarding/${encodeURIComponent(id)}/documents`, {
    method: "PATCH",
    body: JSON.stringify({ document_statuses }),
  });
export const previewWorkspaceItems = (file: File) => {
  const body = new FormData();
  body.append("file", file);
  return api<SpreadsheetPreview>("/workspace-admin/items/preview", {
    method: "POST",
    body,
  });
};
export const importWorkspaceItems = (items: WorkspaceCatalogItemDraft[]) =>
  api<{ schema_ready: true; imported_count: number; items: WorkspaceCatalogItem[] }>(
    "/workspace-admin/items/import",
    { method: "POST", body: JSON.stringify({ items }) },
  );
export const managePoApprover = (payload: {
  user_id: string;
  assign: boolean;
}) =>
  api<PoApprovalSnapshot>("/purchase-orders/approvers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const setPoQuantityBaseline = (payload: {
  item_name: string;
  item_code?: string;
  usual_qty: number;
}) =>
  api<PoApprovalSnapshot>("/purchase-orders/quantity-baseline", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const archivePoQuantityBaseline = (payload: { item_name: string }) =>
  api<AdminSetupSnapshot>("/workspace-admin/baselines/archive", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const restorePoQuantityBaseline = (payload: { item_name: string }) =>
  api<AdminSetupSnapshot>("/workspace-admin/baselines/restore", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const approvePoQuantityCase = (poId: string, caseId: string) =>
  api<PurchaseOrderRecord>(`/purchase-orders/${encodeURIComponent(poId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ case_id: caseId }),
  });
export const markPoQuantityCasesReviewed = (payload: { case_ids: string[] }) =>
  api<PoApprovalSnapshot>("/purchase-orders/reviewed", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const preparePoQuantityClarificationDraft = (payload: { case_ids: string[] }) =>
  api<PoApprovalSnapshot>("/purchase-orders/clarification-draft-prepared", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const recordPoQuantityClarificationResponse = (payload: { case_id: string; response: string }) =>
  api<PoApprovalSnapshot>("/purchase-orders/clarification-response", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const returnPoQuantityCaseToMaker = (payload: { case_id: string; reason: string }) =>
  api<PoApprovalSnapshot>("/purchase-orders/return-to-maker", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const submitMakerQuantityExplanation = (payload: { case_id: string; explanation: string }) =>
  api<PoApprovalSnapshot>("/purchase-orders/maker-explanation", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const createPoQuantityCorrectionRequest = (payload: { case_id: string; corrected_qty: number; reason: string }) =>
  api<{ schema_ready: true; request_id: string; corrected_qty: number; batch_number: string; rfq_id: string; rfq_created: true; status: string }>("/purchase-orders/quantity-correction", {
    method: "POST",
    body: JSON.stringify(payload),
  });