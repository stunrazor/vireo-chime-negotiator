import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifyChimeBlocker, notifyChimeReview } from '../ChimeBlockerDialog';
import { AlertCircle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import {
  getMvpSnapshot,
  mvpWorkspaceKey,
  postMvpAction,
  type DemoAction,
  type DemoInvoice,
  type DemoPurchaseOrder,
  type DemoSnapshot,
} from '@/lib/mvp-api';

type Phase = 'receiving' | 'invoice' | 'payment';
type DataForm = FormEvent<HTMLFormElement>;
const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(' ');
const currency = (n: number) => new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', maximumFractionDigits: 2,
}).format(n);
const qty = (n: number) => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(n);
const label = (text: string) => text.replaceAll('_', ' ');
const today = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

const styles = `
.rtp-stack{display:grid;gap:16px}
.rtp-grid{display:grid;grid-template-columns:1fr;gap:14px}
@media(min-width:820px){.rtp-grid.two{grid-template-columns:1fr 1fr}}
.rtp-note{font-size:13px;line-height:1.55;opacity:.78}
.rtp-warning{display:flex;gap:10px;align-items:flex-start;padding:13px 15px;border:1px solid rgba(217,164,65,.35);border-radius:12px;background:rgba(217,164,65,.08);font-size:13px;line-height:1.5}
.rtp-form{display:grid;gap:10px;margin-top:14px}
.rtp-fields{display:grid;grid-template-columns:1fr;gap:10px}
@media(min-width:650px){.rtp-fields.two{grid-template-columns:1fr 1fr}}
.rtp-form label{display:grid;gap:5px;font-size:12px;font-weight:600}
.rtp-form input,.rtp-form select,.rtp-form textarea{width:100%;min-width:0;box-sizing:border-box}
.rtp-record{display:grid;gap:7px;padding:13px 0;border-top:1px solid rgba(241,239,250,.1)}
.rtp-record>header{display:flex;justify-content:space-between;align-items:center;gap:10px}
.rtp-title{font-size:14px;font-weight:650}
.rtp-meta{font-size:12px;line-height:1.5;opacity:.74}
.rtp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.rtp-actions .button{min-height:40px}
.rtp-refresh-icon{display:inline-block;flex:0 0 auto;transform-box:fill-box;transform-origin:center}
@keyframes rtp-refresh-circle{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.rtp-refresh-icon--spinning{animation:rtp-refresh-circle .85s linear infinite}
@media(prefers-reduced-motion:reduce){.rtp-refresh-icon--spinning{animation-duration:.85s!important;animation-iteration-count:infinite!important}}
.rtp-badge{display:inline-flex;align-items:center;border:1px solid rgba(241,239,250,.18);border-radius:999px;padding:4px 9px;font-size:11px;text-transform:capitalize;white-space:nowrap}
.rtp-alert{display:flex;align-items:center;gap:9px;padding:12px 14px;border-radius:10px}
.rtp-alert.error{background:rgba(200,67,67,.1);border:1px solid rgba(200,67,67,.28)}
.rtp-alert.success{background:rgba(65,155,106,.1);border:1px solid rgba(65,155,106,.28)}
.rtp-empty{padding:18px 0;font-size:13px;opacity:.72}
.rtp-details{padding:14px;border:1px solid rgba(241,239,250,.12);border-radius:12px}
.rtp-details summary{cursor:pointer;font-weight:650}
`;

function Card({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return <section className="panel"><span className="micro-label">{kicker}</span><h3>{title}</h3>{children}</section>;
}

function RecordHeading({ title, state, amount }: { title: string; state: string; amount?: number }) {
  return <header><span className="rtp-title">{title}{amount !== undefined ? ` · ${currency(amount)}` : ''}</span><span className="rtp-badge">{label(state)}</span></header>;
}

function Fields({ children }: { children: ReactNode }) {
  return <div className="rtp-fields two">{children}</div>;
}

function FormLabel({ title, children }: { title: string; children: ReactNode }) {
  return <label>{title}{children}</label>;
}

export function RequestToPaymentWorkspace({ phase, reviewerMode = false }: { phase: Phase; reviewerMode?: boolean }) {
  const queryClient = useQueryClient();
  const key = ['vireo', 'request-to-payment', mvpWorkspaceKey()];
  const query = useQuery({ queryKey: key, queryFn: getMvpSnapshot, retry: false });
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  useEffect(() => {
    if (query.isError) notifyChimeBlocker(query.error instanceof Error ? query.error.message : 'This procurement stage could not be loaded.');
  }, [query.isError, query.error]);
  const [refreshAnimationActive, setRefreshAnimationActive] = useState(false);
  const refreshRequestComplete = useRef(false);
  const seenReceiptReviewIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!reviewerMode || !query.data) return;
    const ids = (query.data.receipts || [])
      .filter((receipt) => receipt.state === 'awaiting_review')
      .map((receipt) => receipt.id);
    const previouslySeen = seenReceiptReviewIds.current;
    seenReceiptReviewIds.current = new Set(ids);
    if (previouslySeen && ids.some((id) => !previouslySeen.has(id))) {
      notifyChimeReview('A goods receipt is awaiting your independent review.');
    }
  }, [reviewerMode, query.data]);
  const mutation = useMutation({
    mutationFn: (input: { action: DemoAction; payload: Record<string, unknown>; success: string }) =>
      postMvpAction(input.action, input.payload),
    onMutate: () => { setMessage(''); setFormError(''); },
    onSuccess: async (snapshot, input) => {
      queryClient.setQueryData(key, snapshot);
      setMessage(input.success);
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error: Error) => { setFormError(error.message); notifyChimeBlocker(error.message); },
  });
  const run = (action: DemoAction, payload: Record<string, unknown>, success: string) =>
    mutation.mutate({ action, payload, success });
  const submit = (event: DataForm, action: DemoAction, success: string) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    run(action, values, success);
  };
  const refreshActive = query.isFetching || refreshAnimationActive;
  const refresh = () => {
    if (query.isFetching || mutation.isPending || refreshAnimationActive) return;
    refreshRequestComplete.current = false;
    setRefreshAnimationActive(true);
    void query.refetch().then(
      () => { refreshRequestComplete.current = true; },
      () => { refreshRequestComplete.current = true; },
    );
  };
  const finishRefreshRotation = () => {
    if (!refreshRequestComplete.current) return;
    refreshRequestComplete.current = false;
    setRefreshAnimationActive(false);
  };
  const phaseNumber = phase === 'receiving' ? '06' : phase === 'invoice' ? '07' : '08';
  const phaseTitle = phase === 'receiving'
    ? 'Receive and inspect'
    : phase === 'invoice'
      ? 'Match and approve invoices'
      : 'Record and reconcile payment';
  const phaseDescription = phase === 'receiving'
    ? 'Record goods against a sent purchase order. A separate, appointed reviewer must accept them.'
    : phase === 'invoice'
      ? 'Enter supplier invoice details, match them against accepted goods, and approve matched invoices.'
      : 'Record payment made outside Vireo, then capture another member’s reconciliation reference.';

  const wrapper = (children: ReactNode) => <section className="step-content animate-rise-in">
    <style>{styles}</style>
    <div className="section-heading">
      <div>
        <p className="section-kicker">{phaseNumber} / {phaseTitle.toUpperCase()}</p>
        <h2>{phaseTitle}</h2>
        <p>{phaseDescription}</p>
      </div>
      <button
        type="button"
        className="button button-secondary"
        aria-label={refreshActive ? 'Refreshing Request-to-Payment' : 'Refresh Request-to-Payment'}
        aria-busy={refreshActive}
        disabled={refreshActive || mutation.isPending}
        onClick={refresh}
      >
        <RefreshCw
          size={14}
          className={refreshActive ? 'rtp-refresh-icon rtp-refresh-icon--spinning' : 'rtp-refresh-icon'}
          onAnimationIteration={finishRefreshRotation}
          aria-hidden="true"
        />
        <span aria-live="polite">{refreshActive ? 'Refreshing…' : 'Refresh'}</span>
      </button>
    </div>
    <div className="rtp-warning" role="note">
      <ShieldCheck size={17} />
      <span><strong>Manual, limited demo.</strong> Amounts are PHP. Invoice matching uses PO quantity and per-unit total only; tax, freight, currency conversions and price exceptions stay on hold. Vireo never sends money or connects to bank accounts. Payment references are user-reported and not independently verified.</span>
    </div>
    {message && <div className="rtp-alert success" role="status"><CheckCircle2 size={16} />{message}</div>}
    {formError && <div className="rtp-alert error" role="alert"><AlertCircle size={16} />{formError}</div>}
    {children}
  </section>;

  if (query.isPending) return wrapper(<div className="state-skeleton" aria-label="Loading Request-to-Payment"><div /><div /><div /></div>);
  if (query.isError) return wrapper(<div className="state-box state-error">
    <AlertCircle size={20} /><strong>The Request-to-Payment workflow is unavailable.</strong>
    <span>{query.error.message}</span>
    <button
      type="button"
      className="button button-secondary"
      aria-label={refreshActive ? 'Retrying Request-to-Payment load' : 'Retry Request-to-Payment load'}
      aria-busy={refreshActive}
      disabled={refreshActive}
      onClick={refresh}
    >
      <RefreshCw
        size={14}
        className={refreshActive ? 'rtp-refresh-icon rtp-refresh-icon--spinning' : 'rtp-refresh-icon'}
        onAnimationIteration={finishRefreshRotation}
        aria-hidden="true"
      />
      <span aria-live="polite">{refreshActive ? 'Retrying…' : 'Retry'}</span>
    </button>
  </div>);
  const s = query.data;
  const sentOrders = s.purchase_orders || [];
  const activeProfiles = (s.ready_profiles || []).filter((profile) => profile.activated);
  const ownId = s.actor_id;

  return wrapper(phase === 'receiving'
    ? <ReceivingPhase
      snapshot={s} orders={sentOrders} profiles={activeProfiles} run={run}
      submit={submit} busy={mutation.isPending} reviewerMode={reviewerMode}
    />
    : phase === 'invoice'
      ? <InvoicePhase
        snapshot={s} orders={sentOrders} run={run} submit={submit}
        busy={mutation.isPending} reviewerMode={reviewerMode}
      />
      : <PaymentPhase
      snapshot={s} submit={submit} reviewerMode={reviewerMode}
      busy={mutation.isPending}
    />);
}

function ReceivingPhase({ snapshot, orders, profiles, run, submit, busy, reviewerMode }: {
  snapshot: DemoSnapshot;
  orders: DemoPurchaseOrder[];
  profiles: DemoSnapshot['ready_profiles'];
  run: (action: DemoAction, payload: Record<string, unknown>, success: string) => void;
  submit: (event: DataForm, action: DemoAction, success: string) => void;
  busy: boolean;
  reviewerMode: boolean;
}) {
  const candidates = (snapshot.ready_profiles || []).filter((p) => !p.activated);
  const itemsForOrder = (poId: string) => orders.find((po) => po.id === poId);
  const simulatedProfiles = profiles.filter((profile) =>
    profile.activation_reference?.trim().toUpperCase().startsWith('DEMO ONLY'));
  return <div className="rtp-stack">
    {simulatedProfiles.length > 0 && <div className="rtp-warning" role="note" data-testid="notice-demo-activation">
      <ShieldCheck size={17} />
      <span><strong>DEMO ONLY — STAGING SIMULATION.</strong> This profile is active for the demo using a simulation-only reference. No real client/site approval or physical site inspection is represented. Use synthetic records only.</span>
    </div>}
    {candidates.length > 0 && snapshot.can_manage_receiving && <Card kicker="PROFILE ACTIVATION" title="Activate a ready receiving profile">
      <p className="rtp-note">Readiness is not activation. Only an appointed receiving setup administrator can activate a ready profile. For staging simulations, the reference must clearly state that no real client/site approval or physical inspection occurred. Clinical profiles cannot be activated here.</p>
      {candidates.map((profile) => <form key={profile.id} className="rtp-form" onSubmit={(event) => submit(event, 'activate_receiving_profile', `${profile.name} activated using the submitted reference.`)}>
        <div className="rtp-meta">{profile.name} · {profile.site_name} · {label(profile.category)}</div>
        <FormLabel title="Client/site approval or staging-simulation reference"><input name="approval_reference" maxLength={1000} required placeholder="DEMO ONLY — STAGING SIMULATION: no real approval occurred" /></FormLabel>
        <input type="hidden" name="profile_id" value={profile.id} />
        <button className="button button-primary" disabled={busy}>Activate receiving profile</button>
      </form>)}
    </Card>}

    <div className="rtp-grid two">
      <Card kicker="INBOUND" title="Record a delivery">
        {reviewerMode || orders.length === 0 ? <p className="rtp-empty">{reviewerMode ? 'Maker-members record deliveries. Review submitted receipts in the independent-review queue.' : 'A purchase order must be marked sent before its goods can be received.'}</p> :
          <form className="rtp-form" onSubmit={(event) => submit(event, 'record_receipt', 'Delivery recorded and sent for independent review.')}>
            <FormLabel title="Sent purchase order"><select name="po_id" required defaultValue="">
              <option value="" disabled>Choose a purchase order</option>
              {orders.map((po) => <option key={po.id} value={po.id}>{po.po_code} · {po.supplier_name} · {po.request_item || 'Purchase'} · {po.site || 'Site not recorded'}</option>)}
            </select></FormLabel>
            <FormLabel title="Activated receiving profile for that site"><select name="profile_id" required defaultValue="">
              <option value="" disabled>Choose a profile</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.site_name} · {profile.uom}</option>)}
            </select></FormLabel>
            <Fields>
              <FormLabel title="Physical quantity delivered"><FormattedNumberInput name="received_qty" min={0.001} step={0.001} required /></FormLabel>
              <FormLabel title="Delivery note / source reference"><input name="receiving_reference" maxLength={1000} required placeholder="e.g. delivery note number and check result" /></FormLabel>
            </Fields>
            <p className="rtp-note">The server rejects cross-site profiles, unsigned purchase orders, unauthorised excess quantities, and duplicate or oversized entries. Do not enter bank or login details.</p>
            <button className="button button-primary" disabled={busy || profiles.length === 0}>Submit receipt for review</button>
          </form>}
        {orders.length > 0 && profiles.length === 0 && <p className="rtp-empty">No activated, ready non-clinical profile matches yet. Finish site setup, reviewer appointments and readiness checks first.</p>}
      </Card>

      {reviewerMode && <Card kicker="REVIEW QUEUE" title="Pending independent reviews">
        {(snapshot.receipts || []).filter((receipt) => receipt.state === 'awaiting_review').length === 0 &&
          <p className="rtp-empty">No goods receipts are waiting for review.</p>}
        {(snapshot.receipts || []).filter((receipt) => receipt.state === 'awaiting_review').map((receipt) =>
          <form key={receipt.id} className="rtp-record" onSubmit={(event) => {
            event.preventDefault();
            const decision = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const values = Object.fromEntries(new FormData(event.currentTarget).entries());
            const accepted = decision?.value === 'accept';
            run('review_receipt', { ...values, accepted }, accepted
              ? 'Receipt accepted by its independent reviewer.'
              : 'Receipt rejected and its reason recorded.');
          }}>
            <RecordHeading title={`${receipt.po_code} · ${qty(receipt.received_qty)} ${itemsForOrder(receipt.po_id)?.request_item || 'units'}`} state="awaiting_review" />
            <p className="rtp-meta">{receipt.supplier_name} · Received by {receipt.received_by.slice(0, 8)} · {receipt.receiving_reference}</p>
            <input type="hidden" name="receipt_id" value={receipt.id} />
            <FormLabel title="Independent inspection and checklist note"><input name="reviewer_note" maxLength={1000} required placeholder="Record the observed result or reason for rejection" /></FormLabel>
            <div className="rtp-actions">
              <button type="submit" name="decision" value="accept" className="button button-primary" disabled={busy || receipt.received_by === snapshot.actor_id}>Accept goods</button>
              <button type="submit" name="decision" value="reject" className="button button-secondary" disabled={busy || receipt.received_by === snapshot.actor_id}>Reject with reason</button>
              {receipt.received_by === snapshot.actor_id && <span className="rtp-meta">A different appointed reviewer must decide this receipt.</span>}
            </div>
          </form>)}
      </Card>}
    </div>

    <Card kicker="RECEIPT HISTORY" title="Recorded deliveries">
      {(snapshot.receipts || []).length === 0 ? <p className="rtp-empty">Delivery and review history will appear here.</p> :
        (snapshot.receipts || []).map((receipt) => <div className="rtp-record" key={receipt.id}>
          <RecordHeading title={`${receipt.po_code} · ${qty(receipt.received_qty)} delivered`} state={receipt.state} />
          <p className="rtp-meta">{receipt.supplier_name} · {receipt.request_item || ''} · {receipt.receiving_reference}</p>
          {receipt.reviewer_note && <p className="rtp-meta">Reviewer: {receipt.reviewer_note}</p>}
        </div>)}
    </Card>
  </div>;
}

function InvoicePhase({ snapshot, orders, run, submit, busy, reviewerMode }: {
  snapshot: DemoSnapshot;
  orders: DemoPurchaseOrder[];
  run: (action: DemoAction, payload: Record<string, unknown>, success: string) => void;
  submit: (event: DataForm, action: DemoAction, success: string) => void;
  busy: boolean;
  reviewerMode: boolean;
}) {
  const invoices = snapshot.invoices || [];
  const acceptedByPo = new Map<string, number>();
  const billedByPo = new Map<string, number>();
  snapshot.receipts.filter((receipt) => receipt.state === 'accepted').forEach((receipt) => {
    acceptedByPo.set(receipt.po_id, (acceptedByPo.get(receipt.po_id) || 0) + receipt.received_qty);
  });
  invoices.forEach((invoice) => billedByPo.set(invoice.po_id, (billedByPo.get(invoice.po_id) || 0) + invoice.qty));
  const invoiceable = orders.filter((po) =>
    (acceptedByPo.get(po.id) || 0) - (billedByPo.get(po.id) || 0) > 0);
  const actor = snapshot.actor_id;

  return <div className="rtp-stack">
    <div className="rtp-grid two">
      <Card kicker="SUPPLIER INVOICE" title="Capture and match">
        <p className="rtp-note">The demo records a supplier invoice reference and amounts; it does not ingest or extract an invoice document.</p>
        {invoiceable.length === 0 || reviewerMode ? <div className="rtp-empty" role="status">
          <strong>{reviewerMode ? 'Invoice intake is a Maker-member action.' : 'The invoice fields are hidden until a PO is ready for invoicing.'}</strong>
          <p>At least one sent PO needs an independently accepted Step 6 receipt and accepted quantity that has not already been invoiced. Check Receiving (06) → Recorded deliveries. If no receipt is accepted, record only an approved staging delivery and have a different workspace member accept it. Then return here and tap Refresh. If the accepted quantity is already fully invoiced, no invoice form will appear for that PO.</p>
        </div> :
          <form className="rtp-form" onSubmit={(event) => submit(event, 'submit_invoice', 'Invoice recorded; review the explicit PO match result below.')}>
            <FormLabel title="Purchase order"><select name="po_id" required defaultValue="">
              <option value="" disabled>Choose a PO with accepted goods</option>
              {invoiceable.map((po) => <option key={po.id} value={po.id}>{po.po_code} · {po.supplier_name}</option>)}
            </select></FormLabel>
            <Fields>
              <FormLabel title="Supplier invoice number"><input name="invoice_number" maxLength={160} required /></FormLabel>
              <FormLabel title="Invoice date"><input name="invoice_date" type="date" max={today()} defaultValue={today()} required /></FormLabel>
              <FormLabel title="Invoice quantity"><FormattedNumberInput name="qty" min={0.001} step={0.001} required /></FormLabel>
              <FormLabel title="Invoice total (PHP)"><FormattedNumberInput name="amount" min={0.01} step={0.01} required /></FormLabel>
            </Fields>
            <FormLabel title="Invoice / supporting document reference"><input name="invoice_reference" maxLength={1000} required placeholder="Internal file, email or document locator" /></FormLabel>
            <p className="rtp-note">Exact quantity and pro-rated PO unit price are compared against accepted goods. Tax, freight, FX, unmatched lines and pricing exceptions are not resolved in this demo and remain on hold.</p>
            <button className="button button-primary" disabled={busy}>Match invoice to accepted goods</button>
          </form>}
      </Card>
      <Card kicker="DECISIONS" title="Invoice approval">
        {invoices.filter((invoice) => invoice.match_state === 'matched' && invoice.state === 'pending_approval').length === 0 &&
          <p className="rtp-empty">No matched invoices are waiting for approval.</p>}
        {invoices.filter((invoice) => invoice.match_state === 'matched' && invoice.state === 'pending_approval').map((invoice) =>
          <div className="rtp-record" key={invoice.id}>
            <RecordHeading title={`${invoice.po_code} · ${invoice.invoice_number}`} state="pending_approval" amount={invoice.amount} />
            <p className="rtp-meta">{invoice.supplier_name} · {qty(invoice.qty)} units · Submitted by {invoice.submitted_by.slice(0, 8)}</p>
            <p className="rtp-meta">PO total and independently accepted quantity matched under this demo's PHP-only rule.</p>
            {!reviewerMode
              ? <span className="rtp-meta">Invoice approval is reserved for Reviewer/Approver members.</span>
              : invoice.submitted_by === actor
                ? <span className="rtp-meta">A different workspace member must approve.</span>
                : <button type="button" className="button button-primary" disabled={busy} onClick={() => run('approve_invoice', { invoice_id: invoice.id }, 'Invoice approved by a different workspace member. No payment was made.')}>Approve invoice</button>}
          </div>)}
      </Card>
    </div>

    <Card kicker="MATCH REGISTER" title="Invoice outcomes and status">
      {invoices.length === 0 ? <p className="rtp-empty">Submitted invoices and their match decisions will appear here.</p> :
        invoices.map((invoice) => <div className="rtp-record" key={invoice.id}>
          <RecordHeading title={`${invoice.po_code} · ${invoice.invoice_number}`} state={
            invoice.match_state === 'on_hold' ? 'on_hold — source review required' : invoice.state
          } amount={invoice.amount} />
          <p className="rtp-meta">{invoice.supplier_name} · {qty(invoice.qty)} {invoice.currency_code} · {invoice.invoice_reference}</p>
          {invoice.match_state === 'on_hold' && <p className="rtp-note">This invoice cannot be approved or paid in the demo. Corrected source documents and exceptions must be resolved outside Vireo; no match override is available.</p>}
        </div>)}
    </Card>

    <Card kicker="AUDIT TRAIL" title="Receipt, invoice and payment events">
      {snapshot.events.length === 0 ? <p className="rtp-empty">The immutable action history will appear here.</p> :
        snapshot.events.map((event) => <div className="rtp-record" key={event.id}>
          <RecordHeading title={label(event.event_type)} state={event.record_type} />
          <p className="rtp-meta">{new Date(event.created_at).toLocaleString()} · {event.actor_id.slice(0, 8)} · {event.note}</p>
        </div>)}
    </Card>
  </div>;
}

function PaymentPhase({ snapshot, submit, busy, reviewerMode }: {
  snapshot: DemoSnapshot;
  submit: (event: DataForm, action: DemoAction, success: string) => void;
  busy: boolean;
  reviewerMode: boolean;
}) {
  const invoices = snapshot.invoices || [];
  const paymentEvents = snapshot.events.filter((event) =>
    event.event_type === 'external_payment_recorded' || event.event_type === 'payment_reconciled');
  const payableInvoices = invoices.filter((invoice) =>
    ['approved', 'paid_external', 'reconciled'].includes(invoice.state));

  return <div className="rtp-stack">
    <Card kicker="OFF-PLATFORM PAYMENT" title="Record payment and reconciliation">
      <p className="rtp-note">Use a transaction reference only—never bank details or credentials. Recording and reconciling are manual user declarations; Vireo does not verify bank settlement.</p>
      {payableInvoices.length === 0
        ? <p className="rtp-empty">Approved invoices will appear here after invoice approval.</p>
        : payableInvoices.map((invoice) =>
          <div className="rtp-record" key={invoice.id}>
            <RecordHeading title={`${invoice.po_code} · ${invoice.invoice_number}`} state={invoice.state} amount={invoice.amount} />
            <p className="rtp-meta">{invoice.supplier_name} · {invoice.currency_code} · status: {invoice.payment?.state || invoice.state}</p>
            {invoice.state === 'approved' && !reviewerMode && <form className="rtp-form" onSubmit={(event) => submit(event, 'record_external_payment', 'External payment report recorded. No funds were moved by Vireo.')}>
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <Fields>
                <FormLabel title="Date paid outside Vireo"><input name="payment_date" type="date" max={today()} defaultValue={today()} required /></FormLabel>
                <FormLabel title="External transaction reference"><input name="external_reference" maxLength={160} required placeholder="Reference only—no account details" /></FormLabel>
              </Fields>
              <button className="button button-primary" disabled={busy}>Record payment made outside Vireo</button>
            </form>}
            {invoice.state === 'paid_external' && invoice.payment && !invoice.payment.reconciled_by && reviewerMode && <form className="rtp-form" onSubmit={(event) => submit(event, 'reconcile_payment', 'External payment reconciled by another member. Vireo did not independently verify settlement.')}>
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <FormLabel title="Reconciliation evidence reference"><input name="reconciliation_reference" maxLength={1000} required placeholder="Reference to a reviewed external record" /></FormLabel>
              {invoice.payment.recorded_by === snapshot.actor_id
                ? <p className="rtp-meta">A different workspace member must reconcile this report.</p>
                : <button className="button button-secondary" disabled={busy}>Mark externally reconciled</button>}
            </form>}
            {invoice.payment?.external_reference && <p className="rtp-meta">Reported external reference: {invoice.payment.external_reference}</p>}
            {invoice.payment?.reconciliation_reference && <p className="rtp-meta">Reconciliation reference: {invoice.payment.reconciliation_reference}</p>}
          </div>)}
    </Card>

    <Card kicker="PAYMENT AUDIT" title="Recorded payment and reconciliation events">
      {paymentEvents.length === 0
        ? <p className="rtp-empty">No external payment or reconciliation events have been recorded.</p>
        : paymentEvents.map((event) =>
          <div className="rtp-record" key={event.id}>
            <RecordHeading title={label(event.event_type)} state={event.record_type} />
            <p className="rtp-meta">{new Date(event.created_at).toLocaleString()} · {event.actor_id.slice(0, 8)} · {event.note}</p>
          </div>)}
    </Card>
  </div>;
}