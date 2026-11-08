import { useEffect, useState } from 'react';
import { Button } from '@workspace/vireo-design-system/components/ui/button';
import { ApiError, createChimeAuditEvent, decideChimeAuditEvent, getChimeAuditEvents, type ChimeAuditEvent, type ChimeProfileExtractionAuditField } from '@/lib/vireo-api';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/vireo-design-system/components/ui/dialog';
import './ChimeBlockerDialog.css';

export type ChimeEventKind = 'blocker' | 'review';
export type ChimeWorkspaceRole = 'admin-member' | 'maker' | 'reviewer-approver';
export type ChimeDecisionPhase = 'review' | 'approval';

export type ChimeEventNotice = {
  event_id: string;
  kind: ChimeEventKind;
  message: string;
  correlationKey?: string;
  phase?: ChimeDecisionPhase;
};

export const createChimeEventId = () => crypto.randomUUID();

function getSuggestedNextStep(kind: ChimeEventKind, role: ChimeWorkspaceRole) {
  if (kind === 'review') {
    if (role === 'admin-member') {
      return 'Review the onboarding checklist or setup item within your permissions. The Vireo Admin-Member remains responsible for onboarding approval.';
    }
    if (role === 'maker') {
      return 'Review the highlighted request or extracted fields against the source, correct anything needed, and submit it through your normal workflow.';
    }
    return 'Inspect the related request, quote, or purchase-order evidence, then make an independent decision using your Reviewer/Approver controls.';
  }

  if (role === 'admin-member') {
    return 'Check the client profile, required onboarding details, or workspace setup related to this message. Correct it yourself, then retry.';
  }
  if (role === 'maker') {
    return 'Check the request or imported fields related to this message. Add or correct the missing details, then retry.';
  }
  return 'Inspect the related record and its supporting details. If it needs correction, return it to the responsible person; do not approve until the evidence is sufficient.';
}

function dispatchChimeEvent(
  kind: ChimeEventKind,
  message: string,
  options: { correlationKey?: string; phase?: ChimeDecisionPhase } = {},
) : string {
  const eventId = createChimeEventId();
  if (typeof window !== 'undefined' && message.trim()) {
    window.dispatchEvent(new CustomEvent('vireo:chime-event', {
      detail: { event_id: eventId, kind, message, ...options },
    }));
  }
  return eventId;
}

export const notifyChimeBlocker = (message: string) => dispatchChimeEvent('blocker', message);
export const notifyChimeReview = (message: string, correlationKey?: string) =>
  dispatchChimeEvent('review', message, { correlationKey, phase: 'review' });
export const notifyChimeApproval = (message: string, correlationKey?: string) =>
  dispatchChimeEvent('review', message, { correlationKey, phase: 'approval' });

export function ChimeBlockerDialog({
  kind = 'blocker',
  phase = 'review',
  message,
  eventId,
  role = 'maker',
  onClose,
}: {
  kind?: ChimeEventKind;
  phase?: ChimeDecisionPhase;
  message: string;
  eventId: string;
  role?: ChimeWorkspaceRole;
  onClose: () => void;
}) {
  const open = Boolean(message);
  const suggestedNextStep = getSuggestedNextStep(kind, role);
  const [auditSaved, setAuditSaved] = useState(false);
  const [auditSaving, setAuditSaving] = useState(false);
  const [auditError, setAuditError] = useState('');

  useEffect(() => {
    if (!open || !eventId) return;
    let active = true;
    setAuditSaved(false);
    setAuditError('');
    createChimeAuditEvent(eventId, kind).then(() => {
      if (active) setAuditSaved(true);
    }).catch((error: unknown) => {
      if (active) setAuditError(error instanceof Error ? error.message : 'Chime could not save this audit event.');
    });
    return () => { active = false; };
  }, [eventId, kind, open]);

  useEffect(() => {
    if (!open) return;
    document.body.dataset.chimeBlockerOpen = 'true';
    return () => {
      delete document.body.dataset.chimeBlockerOpen;
    };
  }, [open]);

  const saveDecision = async (decision: 'acknowledged' | 'dismissed') => {
    if (auditSaving) return;
    setAuditSaving(true);
    setAuditError('');
    try {
      await createChimeAuditEvent(eventId, kind);
      await decideChimeAuditEvent(eventId, decision);
      setAuditSaved(true);
      window.dispatchEvent(new CustomEvent('vireo:chime-decision', {
        detail: { event_id: eventId, decision },
      }));
      onClose();
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : 'Chime could not save your decision.');
    } finally {
      setAuditSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) void saveDecision('dismissed'); }}>
      <DialogContent className="chime-blocker-dialog">
        <div className="chime-blocker-dialog__content">
          <div className={`chime-blocker-dialog__orb ${kind === 'review' ? 'chime-blocker-dialog__orb--review' : ''} ${open ? 'chime-blocker-dialog__orb--alert' : ''}`} aria-hidden="true">
            <img src="/chime-voice-orb.png" alt="" />
            <span className={`chime-blocker-dialog__eyes ${open ? 'chime-blocker-dialog__eyes--alert' : ''}`}><i /><i /></span>
          </div>
          <DialogHeader className="chime-blocker-dialog__header">
            <p className="chime-blocker-dialog__eyebrow">VIREO’S WORKSPACE AGENT</p>
            <DialogTitle>
              {kind === 'blocker'
                ? 'Chime found a blocker'
                : phase === 'approval'
                  ? 'Chime has an approval decision to review'
                  : 'Chime has something to review'}
            </DialogTitle>
            <div className="chime-blocker-dialog__guidance">
              <section className="chime-blocker-dialog__guidance-block" data-testid="chime-event-evidence">
                <h3>What Chime noticed</h3>
                <DialogDescription>{message}</DialogDescription>
              </section>
              <section className="chime-blocker-dialog__guidance-block" data-testid="chime-suggested-next-step">
                <h3>Suggested next step</h3>
                <p>{suggestedNextStep}</p>
              </section>
            </div>
            <p className="chime-blocker-dialog__hint">Guidance only. Chime has not changed the record or made an approval.</p>
            <p className="chime-blocker-dialog__audit-status" role={auditError ? 'alert' : 'status'} aria-live="polite">
              {auditError
                ? `Audit not saved: ${auditError}`
                : auditSaving
                  ? 'Saving this event and your decision…'
                  : auditSaved
                    ? 'Event recorded. Your decision will be recorded when you respond.'
                    : 'Recording this event…'}
            </p>
          </DialogHeader>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={auditSaving} onClick={() => void saveDecision('dismissed')} data-testid="button-dismiss-chime">
            Dismiss
          </Button>
          <Button type="button" disabled={auditSaving} onClick={() => void saveDecision('acknowledged')} data-testid="button-acknowledge-chime">
            {auditSaving ? 'Saving…' : 'Acknowledge'}
          </Button>
          {auditError && <Button type="button" variant="ghost" onClick={onClose} data-testid="button-close-chime-without-audit">
            Close anyway—decision may not be saved
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatAuditDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function auditEventLabel(event: ChimeAuditEvent) {
  const eventLabel = event.event_kind === 'blocker' ? 'Blocker alert' : 'Review suggestion';
  const decisionLabel = {
    pending: 'Awaiting response',
    acknowledged: 'Acknowledged',
    dismissed: 'Dismissed',
  }[event.decision];
  const roleLabel = event.actor_role === 'workspace_admin' ? 'Admin-Member' : 'Workspace member';
  return { eventLabel, decisionLabel, roleLabel };
}

const profileFieldLabels: Record<ChimeProfileExtractionAuditField["field_name"], string> = {
  legal_name: "Legal name",
  jurisdiction: "Country / jurisdiction",
  industry: "Industry",
  contact_name: "Contact name",
  contact_email: "Contact email",
  company_registered_representative: "Company Registered Representative",
  company_email: "Company email",
  contact_mobile: "Contact mobile",
  contact_landline: "Contact landline",
  company_website: "Company website",
};

export function ChimeAuditTrail() {
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [events, setEvents] = useState<ChimeAuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError('');
    getChimeAuditEvents().then((rows) => {
      if (active) setEvents(rows);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof ApiError ? loadError.message : 'Chime activity could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [open, reload]);

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="chime-audit-trigger" onClick={() => setOpen(true)} data-testid="button-open-chime-audit">
        Chime activity
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="chime-audit-dialog">
          <DialogHeader>
            <p className="chime-blocker-dialog__eyebrow">WORKSPACE AUDIT</p>
            <DialogTitle>Chime activity</DialogTitle>
            <DialogDescription>Recent alerts, human responses, and profile extraction field results. Source evidence and document contents are not stored here.</DialogDescription>
          </DialogHeader>
          <div className="chime-audit-list" aria-live="polite">
            {loading && <p role="status">Loading Chime activity…</p>}
            {error && <p role="alert">{error}</p>}
            {!loading && !error && events.length === 0 && <p>No Chime events have been recorded in this workspace yet.</p>}
            {!loading && !error && events.map((event) => {
              const labels = auditEventLabel(event);
              return (
                <article className="chime-audit-event" key={event.event_id} data-testid={`chime-audit-event-${event.event_id}`}>
                  <div>
                    <strong>{labels.eventLabel}</strong>
                    <span>{labels.roleLabel} · {event.workspace_area === 'onboarding' ? 'Onboarding' : 'Procurement'}</span>
                  </div>
                  <div>
                    <strong>{labels.decisionLabel}</strong>
                    <time dateTime={event.created_at}>{formatAuditDate(event.created_at)}</time>
                  </div>
                  {event.details && event.details.length > 0 && (
                    <dl className="chime-audit-fields" aria-label="Profile extraction fields">
                      {event.details.map((field) => (
                        <div key={field.field_name}>
                          <dt>{profileFieldLabels[field.field_name]}</dt>
                          <dd><span>{field.status.replace("_", " ")}</span>{field.value ? ` · ${field.value}` : ""}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </article>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReload((current) => current + 1)} disabled={loading} data-testid="button-refresh-chime-audit">
              Refresh
            </Button>
            <DialogClose asChild><Button type="button">Close</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
