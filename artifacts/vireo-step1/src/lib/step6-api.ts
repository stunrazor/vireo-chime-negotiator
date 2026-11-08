import { apiRaw, apiRequest, getSelectedWorkspaceId } from '@/lib/vireo-api';

export const CATEGORIES = ['office', 'it', 'hospital_general', 'commissary', 'bakery', 'convenience', 'restaurant'] as const;
export const KINDS = ['general', 'ambient_food', 'cold_chain', 'clinical'] as const;
export const CHECK_KEYS = ['item_scope', 'criteria_approved', 'reviewer_coverage', 'measurement_capability', 'handling_storage', 'system_controls'] as const;

export type Settings = { max_file_bytes: number; workspace_limit_bytes: number; retention_days: number | null; storage_region_note: string; storage_provider: string };
export type Site = { id: string; name: string; handling_procedure: string; holding_location: string };
export type Profile = {
  id: string; site_id: string; name: string; category: string; kind: string; uom: string;
  criteria: Record<string, unknown>; checklist: string[]; evidence_requirements: string; status: string; version: number;
};
export type Appointment = { id: string; site_id: string; user_id: string; capability: string; category: string; qualification_reference: string; is_backup: boolean };
export type Readiness = { id: string; profile_id: string; check_key: string; confirmed: boolean; evidence_reference: string; confirmed_by?: string; confirmed_at?: string };
export type Evidence = { id: string; file_name: string; content_type: string; size_bytes: number; status: string };
export type Snapshot = {
  schema_ready: boolean; receipt_acceptance_enabled: boolean; can_manage: boolean; actor_id: string;
  members: { user_id: string }[]; settings: Settings; sites: Site[]; profiles: Profile[];
  appointments: Appointment[]; readiness: Readiness[]; evidence: Evidence[];
};
export type Action = 'save_settings' | 'save_site' | 'save_profile' | 'appoint_reviewer' | 'remove_appointment' | 'record_readiness' | 'mark_ready' | 'suspend_profile';

export const workspaceKey = () => getSelectedWorkspaceId() || 'none';
export const getSetup = () => apiRequest<Snapshot>('/step6/setup');
export const postSetup = (action: Action, payload: Record<string, unknown>) =>
  apiRequest<Snapshot>('/step6/setup', { method: 'POST', body: JSON.stringify({ action, payload }) });

type EvidenceTicket = { id: string; upload_url: string; method: string; headers: Record<string, string>; expires_in: number };

export async function uploadEvidence(file: File, onProgress: (pct: number) => void): Promise<string> {
  const ticket = await apiRequest<EvidenceTicket>('/step6/evidence/request', {
    method: 'POST',
    body: JSON.stringify({ file_name: file.name, content_type: file.type, size_bytes: file.size }),
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
    const raw = ticket.upload_url;
    const url = /^https?:\/\//i.test(raw) ? raw : base && (raw === base || raw.startsWith(`${base}/`)) ? raw : `${base}/${raw.replace(/^\/+/, '')}`;
    xhr.open(ticket.method || 'PUT', url);
    xhr.withCredentials = true;
    const ws = getSelectedWorkspaceId();
    if (ws) xhr.setRequestHeader('X-Workspace-Id', ws);
    Object.entries(ticket.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload was rejected (HTTP ${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Upload failed before completing.'));
    xhr.onabort = () => reject(new Error('Upload was cancelled.'));
    xhr.send(file);
  });
  return ticket.id;
}

export async function downloadEvidence(item: Evidence): Promise<void> {
  const response = await apiRaw(`/step6/evidence/${encodeURIComponent(item.id)}`, { headers: { Accept: '*/*' } });
  const type = response.headers.get('Content-Type') || '';
  if (type.includes('application/json')) {
    const body = (await response.json()) as { url?: string; download_url?: string };
    const url = body.url || body.download_url;
    if (!url) throw new Error('The server did not return a downloadable file.');
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1] || match[2]) : item.file_name;
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
