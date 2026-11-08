import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifyChimeBlocker } from '../ChimeBlockerDialog';
import { AlertCircle, CheckCircle2, Download, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import { ApiError } from '@/lib/vireo-api';
import {
  CATEGORIES, CHECK_KEYS, KINDS, downloadEvidence, getSetup, postSetup, uploadEvidence, workspaceKey,
  type Action, type Evidence, type Profile, type Snapshot,
} from '@/lib/step6-api';

const label = (v: string) => v.replace(/_/g, ' ');
const short = (id: string) => id.slice(0, 8);
const CRIT = ['temperature_min', 'temperature_max', 'temperature_unit', 'measurement_procedure', 'instrument_reference', 'approved_source', 'technical_approval_reference'];
const css = `
.s6-grid{display:grid;gap:16px;grid-template-columns:1fr}
@media(min-width:900px){.s6-grid.two{grid-template-columns:1fr 1fr}}
.s6-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid rgba(241,239,250,.1)}
.s6-form{display:grid;gap:8px;margin-top:12px}
.s6-two{display:grid;gap:8px;grid-template-columns:1fr 1fr}
.s6-bar{height:6px;background:rgba(241,239,250,.12);border-radius:3px;overflow:hidden}
.s6-bar>span{display:block;height:100%;background:#d9a441;transition:width .2s}
.s6-note{font-size:13px;opacity:.75;margin:6px 0}
.s6-stack{display:grid;gap:16px}
.s6-form .button,.s6-row .button{min-height:44px}
`;

function Card({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return <section className="panel"><span className="micro-label">{kicker}</span><h3>{title}</h3>{children}</section>;
}
const Err = ({ text }: { text?: string }) => text ? <p className="form-error" role="alert"><AlertCircle size={14} />{text}</p> : null;

export function Step6Workspace() {
  const wk = workspaceKey();
  const qc = useQueryClient();
  const key = ['vireo', 'step6', wk];
  const q = useQuery({ queryKey: key, queryFn: getSetup, retry: false });
  const [resetN, setResetN] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErrState] = useState('');
  const setErr = (message: string) => {
    setErrState(message);
    if (message) notifyChimeBlocker(message);
  };
  useEffect(() => {
    if (q.isError) notifyChimeBlocker(q.error instanceof Error ? q.error.message : 'Receiving setup could not be loaded.');
  }, [q.isError, q.error]);
  const [busy, setBusy] = useState('');
  const m = useMutation({
    mutationFn: ({ action, payload }: { action: Action; payload: Record<string, unknown>; done: string }) => postSetup(action, payload),
    onMutate: () => { setErr(''); setMsg(''); },
    onSuccess: (snap, v) => { qc.setQueryData(key, snap); setMsg(v.done); setResetN((n) => n + 1); },
    onError: (e) => setErr(e.message),
  });
  const run = (action: Action, payload: Record<string, unknown>, done: string) => m.mutate({ action, payload, done });
  const wrap = (children: ReactNode) => <section className="step-content animate-rise-in"><style>{css}</style>
    <div className="section-heading"><div><p className="section-kicker">06 / RECEIVING SETUP</p><h2>Receiving setup</h2>
      <p>Define sites, receiving profiles and reviewer appointments. This records client setup only.</p></div></div>
    <div className="notice-bar notice-warning" role="note" data-testid="text-acceptance-boundary"><span>{q.data?.receipt_acceptance_enabled
      ? 'A receiving profile is active. Use the Receiving phase to record deliveries; readiness alone does not activate profiles. Vireo does not inspect sites. Medicines and clinical products are excluded.'
      : 'No receiving profile is active. Readiness is not activation. Medicines and clinical products are excluded.'}</span></div>
    {children}</section>;

  if (q.isPending) return wrap(<div className="state-skeleton" aria-label="Loading receiving setup"><div /><div /><div /></div>);
  if (q.isError) {
    const unavailable = q.error instanceof ApiError && q.error.status === 503;
    return wrap(<div className="state-box state-error"><AlertCircle size={20} />
      <strong>{unavailable ? 'Receiving setup is unavailable until the database migration is applied.' : 'Receiving setup could not be loaded.'}</strong>
      <span>{q.error.message}</span>
      <button type="button" className="button button-secondary" data-testid="button-retry-step6" onClick={() => void q.refetch()}><RefreshCw size={14} /> Retry</button></div>);
  }
  const s: Snapshot = q.data;
  if (!s.schema_ready) return wrap(<div className="state-box state-error"><AlertCircle size={20} /><strong>The receiving schema is not ready. Apply the migration first.</strong></div>);
  const can = s.can_manage && !m.isPending;
  const siteName = (id: string) => s.sites.find((x) => x.id === id)?.name || short(id);
  const member = (id: string) => `Member ${short(id)}${id === s.actor_id ? ' (you)' : ''}`;

  return wrap(<div className="s6-stack" key={`${wk}-${resetN}`}>
    {!s.can_manage && <div className="notice-bar notice-warning" role="status" data-testid="text-no-admin"><span>You can view this setup but you are not a receiving setup administrator, so changes are disabled. Workspace membership alone does not grant this.</span></div>}
    {msg && <div className="notice-bar notice-success" role="status"><span className="notice-icon"><CheckCircle2 size={16} /></span><span>{msg}</span></div>}
    <Err text={err} />
    <div className="s6-grid two">
      <SettingsCard s={s} can={can} run={run} />
      <EvidenceCard s={s} can={can} onDone={() => { void qc.invalidateQueries({ queryKey: key }); }} setErr={setErr} busy={busy} setBusy={setBusy} />
    </div>
    <div className="s6-grid two">
      <SitesCard s={s} can={can} run={run} />
      <AppointmentsCard s={s} can={can} run={run} member={member} siteName={siteName} />
    </div>
    <ProfilesCard s={s} can={can} run={run} siteName={siteName} member={member} />
  </div>);
}

type RunFn = (a: Action, p: Record<string, unknown>, done: string) => void;

function SettingsCard({ s, can, run }: { s: Snapshot; can: boolean; run: RunFn }) {
  const st = s.settings;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const days = String(f.get('days') || '').trim();
    run('save_settings', {
      max_file_bytes: Number(f.get('max')), workspace_limit_bytes: Number(f.get('limit')),
      retention_days: days === '' ? null : Number(days), storage_region_note: String(f.get('region') || '').trim(),
    }, 'Storage settings saved.');
  };
  return <Card kicker="STORAGE" title="Storage limits and records">
    <p className="s6-note">Storage provider: {label(st.storage_provider)}. The retention and region fields record your requirements only. They are recorded requirements only. Vireo does not enforce automatic deletion or data residency from them.</p>
    <form className="s6-form" onSubmit={submit}>
      <div className="s6-two">
        <div><label className="field-label" htmlFor="s6-max">Max file bytes</label><FormattedNumberInput id="s6-max" name="max" data-testid="input-max-file-bytes" className="field" min={1} required defaultValue={st.max_file_bytes} disabled={!can} /></div>
        <div><label className="field-label" htmlFor="s6-limit">Workspace limit bytes</label><FormattedNumberInput id="s6-limit" name="limit" data-testid="input-workspace-limit" className="field" min={1} required defaultValue={st.workspace_limit_bytes} disabled={!can} /></div>
      </div>
      <label className="field-label" htmlFor="s6-days">Recorded retention requirement (days, blank if none)</label>
      <FormattedNumberInput id="s6-days" name="days" data-testid="input-retention-days" className="field" min={1} defaultValue={st.retention_days ?? ''} disabled={!can} />
      <label className="field-label" htmlFor="s6-region">Recorded storage region requirement</label>
      <input id="s6-region" name="region" data-testid="input-region-note" className="field" defaultValue={st.storage_region_note} disabled={!can} />
      <button type="submit" className="button button-primary" data-testid="button-save-settings" disabled={!can}>Save storage settings</button>
    </form>
  </Card>;
}

function EvidenceCard({ s, can, onDone, setErr, busy, setBusy }: { s: Snapshot; can: boolean; onDone: () => void; setErr: (v: string) => void; busy: string; setBusy: (v: string) => void }) {
  const [pct, setPct] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const go = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setErr('Choose a PDF, JPEG, PNG or WebP file first.');
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setErr('Only PDF, JPEG, PNG and WebP files are accepted.');
    if (file.size > s.settings.max_file_bytes) return setErr(`That file exceeds the ${s.settings.max_file_bytes} byte limit.`);
    setErr(''); setPct(0); setUploading(true);
    try { await uploadEvidence(file, setPct); if (fileRef.current) fileRef.current.value = ''; } catch (e) { setErr((e as Error).message); }
    setUploading(false); onDone();
  };
  const dl = async (item: Evidence) => {
    setBusy(item.id); setErr('');
    try { await downloadEvidence(item); } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };
  return <Card kicker="EVIDENCE" title="Private evidence files">
    <p className="s6-note">Files are private to this workspace. Uploaded files are not virus-scanned and are not verified as clean. A registered record is not proof that the upload completed.</p>
    <div className="s6-form">
      <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="field" data-testid="input-evidence-file" disabled={!can || uploading} />
      {uploading && <div className="s6-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>}
      <button type="button" className="button button-primary" data-testid="button-upload-evidence" disabled={!can || uploading} onClick={() => void go()}><Upload size={15} />{uploading ? `Uploading ${pct}%` : 'Upload evidence'}</button>
    </div>
    {s.evidence.length === 0 ? <p className="s6-note">No evidence files registered yet.</p> : s.evidence.map((ev) =>
      <div className="s6-row" key={ev.id} data-testid={`row-evidence-${ev.id}`}>
        <span><strong>{ev.file_name}</strong><br /><span className="s6-note">ID {ev.id} / {ev.content_type} / {ev.size_bytes} bytes / {ev.status}</span></span>
        <button type="button" className="button button-secondary" data-testid={`button-download-${ev.id}`} disabled={busy === ev.id} onClick={() => void dl(ev)}><Download size={14} /> Download</button>
      </div>)}
  </Card>;
}

function SitesCard({ s, can, run }: { s: Snapshot; can: boolean; run: RunFn }) {
  const [editId, setEditId] = useState('');
  const cur = s.sites.find((x) => x.id === editId);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run('save_site', { ...(cur ? { id: cur.id } : {}), name: String(f.get('name')).trim(), handling_procedure: String(f.get('proc')).trim(), holding_location: String(f.get('loc')).trim() }, cur ? 'Site updated.' : 'Site created.');
  };
  return <Card kicker="SITES" title="Receiving sites">
    {s.sites.length === 0 && <p className="s6-note">No sites yet. Create the first one below.</p>}
    {s.sites.map((x) => <div className="s6-row" key={x.id} data-testid={`row-site-${x.id}`}><span><strong>{x.name}</strong><br /><span className="s6-note">{x.holding_location}</span></span>
      <button type="button" className="button button-secondary" data-testid={`button-edit-site-${x.id}`} disabled={!can} onClick={() => setEditId(x.id)}>Edit</button></div>)}
    <form className="s6-form" key={editId} onSubmit={submit}>
      <span className="micro-label">{cur ? `EDITING ${cur.name}` : 'NEW SITE'}</span>
      <input name="name" className="field" data-testid="input-site-name" placeholder="Site name" required defaultValue={cur?.name} disabled={!can} aria-label="Site name" />
      <input name="loc" className="field" data-testid="input-site-location" placeholder="Holding location" required defaultValue={cur?.holding_location} disabled={!can} aria-label="Holding location" />
      <textarea name="proc" className="field textarea" rows={3} data-testid="input-site-procedure" placeholder="Handling procedure" required defaultValue={cur?.handling_procedure} disabled={!can} aria-label="Handling procedure" />
      <button type="submit" className="button button-primary" data-testid="button-save-site" disabled={!can}>{cur ? 'Update site' : 'Create site'}</button>
      {cur && <button type="button" className="button button-secondary" onClick={() => setEditId('')}>Cancel edit</button>}
    </form>
  </Card>;
}

function AppointmentsCard({ s, can, run, member, siteName }: { s: Snapshot; can: boolean; run: RunFn; member: (id: string) => string; siteName: (id: string) => string }) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run('appoint_reviewer', {
      site_id: f.get('site'), user_id: f.get('user'), category: f.get('cat'), capability: 'reviewer',
      qualification_reference: String(f.get('qual')).trim(), is_backup: f.get('role') === 'backup',
    }, 'Reviewer appointed.');
  };
  return <Card kicker="REVIEWERS" title="Reviewer appointments">
    <p className="s6-note">Only explicit appointments count. Template or role defaults are not appointments.</p>
    {s.appointments.length === 0 && <p className="s6-note">No reviewers appointed.</p>}
    {s.appointments.map((a) => <div className="s6-row" key={a.id} data-testid={`row-appointment-${a.id}`}>
      <span><strong>{a.is_backup ? 'Backup' : 'Primary'}: {member(a.user_id)}</strong><br /><span className="s6-note">{siteName(a.site_id)} / {label(a.category)} / qualification {a.qualification_reference}</span></span>
      <button type="button" className="button button-secondary" data-testid={`button-remove-appointment-${a.id}`} disabled={!can} onClick={() => run('remove_appointment', { id: a.id }, 'Appointment removed.')}>Remove</button></div>)}
    {s.sites.length === 0 || s.members.length === 0 ? <p className="s6-note">Create a site and ensure workspace members exist before appointing.</p> :
      <form className="s6-form" onSubmit={submit}>
        <select name="site" className="field" required disabled={!can} data-testid="select-appoint-site" aria-label="Site">{s.sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select name="user" className="field" required disabled={!can} data-testid="select-appoint-member" aria-label="Member">{s.members.map((x) => <option key={x.user_id} value={x.user_id}>{member(x.user_id)}</option>)}</select>
        <div className="s6-two">
          <select name="cat" className="field" disabled={!can} aria-label="Category" data-testid="select-appoint-category">{CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
          <select name="role" className="field" disabled={!can} aria-label="Position" data-testid="select-appoint-role"><option value="primary">Primary reviewer</option><option value="backup">Backup reviewer</option></select>
        </div>
        <input name="qual" className="field" required placeholder="Qualification reference" disabled={!can} data-testid="input-qualification" aria-label="Qualification reference" />
        <button type="submit" className="button button-primary" disabled={!can} data-testid="button-appoint">Appoint reviewer</button>
      </form>}
  </Card>;
}

function coverage(s: Snapshot, p: Profile) {
  const list = s.appointments.filter((a) => a.site_id === p.site_id && a.category === p.category && a.capability === 'reviewer' && a.qualification_reference.trim());
  const pri = list.find((a) => !a.is_backup), bak = list.find((a) => a.is_backup);
  return Boolean(pri && bak && pri.user_id !== bak.user_id);
}

function ProfilesCard({ s, can, run, siteName, member }: { s: Snapshot; can: boolean; run: RunFn; siteName: (id: string) => string; member: (id: string) => string }) {
  const [editId, setEditId] = useState('');
  const [kind, setKind] = useState('general');
  const cur = s.profiles.find((x) => x.id === editId);
  const pick = (id: string) => { setEditId(id); setKind(s.profiles.find((x) => x.id === id)?.kind || 'general'); };
  const cc = (cur?.criteria || {}) as Record<string, unknown>;
  const extra = Object.entries(cc).filter(([k]) => !CRIT.includes(k)).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const criteria: Record<string, unknown> = {};
    String(f.get('extra') || '').split('\n').forEach((line) => {
      const i = line.indexOf(':');
      if (i > 0 && line.slice(i + 1).trim()) criteria[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    if (kind === 'cold_chain') {
      CRIT.forEach((k) => { const v = String(f.get(k) ?? '').trim(); if (v !== '') criteria[k] = k.startsWith('temperature_m') ? Number(v) : v; });
    }
    run('save_profile', {
      ...(cur ? { id: cur.id } : {}), site_id: f.get('site'), name: String(f.get('name')).trim(), category: f.get('cat'), kind,
      uom: String(f.get('uom')).trim(), criteria, evidence_requirements: String(f.get('evid')).trim(),
      checklist: String(f.get('check')).split('\n').map((l) => l.trim()).filter(Boolean),
    }, cur ? 'Profile updated.' : 'Profile created.');
  };
  return <Card kicker="PROFILES" title="Receiving profiles">
    {s.profiles.length === 0 && <p className="s6-note">No profiles yet.</p>}
    {s.profiles.map((p) => <ProfileRow key={p.id} s={s} p={p} can={can} run={run} siteName={siteName} member={member} onEdit={() => pick(p.id)} />)}
    {s.sites.length === 0 ? <p className="s6-note">Create a site before adding a profile.</p> :
      <form className="s6-form" key={editId} onSubmit={submit}>
        <span className="micro-label">{cur ? `EDITING ${cur.name}` : 'NEW PROFILE'}</span>
        <input name="name" className="field" required placeholder="Profile name" defaultValue={cur?.name} disabled={!can} data-testid="input-profile-name" aria-label="Profile name" />
        <div className="s6-two">
          <select name="site" className="field" defaultValue={cur?.site_id} disabled={!can} aria-label="Site" data-testid="select-profile-site">{s.sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <select name="cat" className="field" defaultValue={cur?.category} disabled={!can} aria-label="Category" data-testid="select-profile-category">{CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
        </div>
        <div className="s6-two">
          <select className="field" value={kind} onChange={(e) => setKind(e.target.value)} disabled={!can} aria-label="Kind" data-testid="select-profile-kind">{KINDS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
          <input name="uom" className="field" required placeholder="Unit of measure" defaultValue={cur?.uom} disabled={!can} data-testid="input-profile-uom" aria-label="Unit of measure" />
        </div>
        {kind === 'clinical' && <p className="s6-note">Clinical profiles stay draft only. Medicines are excluded.</p>}
        {kind === 'cold_chain' && <div className="s6-form" data-testid="group-cold-chain">
          <span className="micro-label">COLD-CHAIN CRITERIA (ALL REQUIRED)</span>
          <div className="s6-two">
            <FormattedNumberInput name="temperature_min" step="any" className="field" placeholder="Min temperature" defaultValue={String(cc.temperature_min ?? '')} disabled={!can} aria-label="Minimum temperature" data-testid="input-temp-min" />
            <FormattedNumberInput name="temperature_max" step="any" className="field" placeholder="Max temperature" defaultValue={String(cc.temperature_max ?? '')} disabled={!can} aria-label="Maximum temperature" data-testid="input-temp-max" />
          </div>
          {CRIT.slice(2).map((k) => <input key={k} name={k} className="field" placeholder={label(k)} defaultValue={String(cc[k] ?? '')} disabled={!can} aria-label={label(k)} data-testid={`input-${k}`} />)}
        </div>}
        <label className="field-label" htmlFor="s6-extra">Item-specific criteria (one per line, key: value)</label>
        <textarea id="s6-extra" name="extra" className="field textarea" rows={3} defaultValue={extra} disabled={!can} data-testid="input-criteria-extra" />
        <label className="field-label" htmlFor="s6-check">Checklist (one item per line)</label>
        <textarea id="s6-check" name="check" className="field textarea" rows={4} required defaultValue={(cur?.checklist || []).join('\n')} disabled={!can} data-testid="input-checklist" />
        <label className="field-label" htmlFor="s6-evid">Evidence requirements</label>
        <textarea id="s6-evid" name="evid" className="field textarea" rows={3} required defaultValue={cur?.evidence_requirements} disabled={!can} data-testid="input-evidence-requirements" />
        <button type="submit" className="button button-primary" disabled={!can} data-testid="button-save-profile">{cur ? 'Update profile' : 'Create profile'}</button>
        {cur && <button type="button" className="button button-secondary" onClick={() => pick('')}>Cancel edit</button>}
      </form>}
  </Card>;
}

function ProfileRow({ s, p, can, run, siteName, member, onEdit }: { s: Snapshot; p: Profile; can: boolean; run: RunFn; siteName: (id: string) => string; member: (id: string) => string; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const rec = (k: string) => s.readiness.find((r) => r.profile_id === p.id && r.check_key === k);
  const covered = coverage(s, p);
  const blockers: string[] = [];
  if (!covered) blockers.push('Needs different primary and backup reviewers for this site and category, each with a qualification reference.');
  CHECK_KEYS.forEach((k) => { const r = rec(k); if (!r?.confirmed || !r.evidence_reference.trim()) blockers.push(`Check not attested with evidence: ${label(k)}.`); });
  if (p.kind === 'clinical') blockers.push('Clinical profiles stay draft only.');
  if (p.status === 'ready' || p.status === 'active') blockers.length = 0;
  const submit = (k: string) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run('record_readiness', { profile_id: p.id, check_key: k, confirmed: f.get('ok') === 'on', evidence_reference: String(f.get('ref')).trim() }, `Attestation recorded: ${label(k)}.`);
  };
  return <div className="s6-row" style={{ display: 'block' }} data-testid={`row-profile-${p.id}`}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
      <span><strong>{p.name}</strong> <span className="status-tag status-complete" data-testid={`status-profile-${p.id}`}>{p.status}</span><br />
        <span className="s6-note">{siteName(p.site_id)} / {label(p.category)} / {label(p.kind)} / v{p.version} / {p.uom}</span></span>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="button button-secondary" data-testid={`button-edit-profile-${p.id}`} disabled={!can} onClick={onEdit}>Edit</button>
        <button type="button" className="button button-secondary" data-testid={`button-readiness-${p.id}`} onClick={() => setOpen(!open)}>{open ? 'Hide readiness' : 'Readiness'}</button>
      </span>
    </div>
    {open && <div className="s6-form">
      <p className="s6-note"><ShieldCheck size={13} /> These are client attestations. Vireo has not inspected the site. Reviewer coverage: {covered ? 'appointed' : 'incomplete'}. Appointed here: {s.appointments.filter((a) => a.site_id === p.site_id && a.category === p.category).map((a) => `${a.is_backup ? 'backup' : 'primary'} ${member(a.user_id)}`).join(', ') || 'none'}.</p>
      {CHECK_KEYS.map((k) => { const r = rec(k); return <form key={`${k}-${r?.confirmed}-${r?.evidence_reference}`} onSubmit={submit(k)} className="s6-form" data-testid={`form-check-${p.id}-${k}`}>
        <label className="field-label"><input type="checkbox" name="ok" defaultChecked={r?.confirmed} disabled={!can} data-testid={`check-${p.id}-${k}`} /> {label(k)}{r?.confirmed_at ? ` (attested ${new Date(r.confirmed_at).toLocaleDateString()} by ${member(r.confirmed_by || '')})` : ''}</label>
        <input name="ref" className="field" placeholder="Evidence reference or explanation" defaultValue={r?.evidence_reference} disabled={!can} aria-label={`Evidence for ${label(k)}`} data-testid={`input-ref-${p.id}-${k}`} />
        <button type="submit" className="button button-secondary" disabled={!can} data-testid={`button-record-${p.id}-${k}`}>Record attestation</button>
      </form>; })}
      {s.evidence.length > 0 && <p className="s6-note">Evidence file IDs you may cite: {s.evidence.map((e) => `${e.file_name} (${e.id})`).join('; ')}</p>}
      {blockers.length > 0 && <ul className="s6-note" data-testid={`list-blockers-${p.id}`}>{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="button button-primary" data-testid={`button-mark-ready-${p.id}`} disabled={!can || blockers.length > 0 || p.status !== 'draft'} onClick={() => run('mark_ready', { profile_id: p.id }, 'Profile marked ready. It is not activated.')}>Mark ready (not activation)</button>
        <button type="button" className="button button-secondary" data-testid={`button-suspend-${p.id}`} disabled={!can || p.status === 'draft' || p.status === 'suspended'} onClick={() => run('suspend_profile', { profile_id: p.id }, 'Profile suspended.')}>Suspend</button>
        <button type="button" className="button button-secondary" disabled data-testid={`button-accept-receipt-${p.id}`} title="Use the separate Request-to-Payment Receiving phase">Use receiving workspace</button>
      </div>
    </div>}
  </div>;
}

