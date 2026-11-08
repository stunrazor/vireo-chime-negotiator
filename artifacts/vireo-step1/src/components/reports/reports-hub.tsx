import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Download,
  FileText,
  Mail,
  Printer,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  REPORT_STAGES,
  type ReportArea,
  type ReportColumn,
  type ReportStage,
  type ReportTable,
  type ReportValue,
  type ReportsBundle,
} from '@/lib/reporting';
import type { AnalyticsAlert } from '@/lib/report-alert-types';
import type { AnalyticsAlertReview } from '@/lib/report-alert-types';
import './reports-hub.css';

type ReportsHubProps = {
  activeStage: ReportStage;
  bundle: ReportsBundle;
  isLoading: boolean;
  errorMessage?: string;
  partialWarning?: string;
  initialArea?: ReportArea;
  refreshedAt?: string;
  workspaceName?: string;
  alertReviews: AnalyticsAlertReview[];
  alertReviewsLoading: boolean;
  alertReviewsError?: string;
  pendingReviewAlertId?: string;
  reviewMutationError?: string;
  onMarkAlertReviewed(alert: AnalyticsAlert): void;
  onRefresh(): void;
  onClose(): void;
};

const safeColumns = (table?: ReportTable) =>
  (table?.columns || []).filter((column) => {
    const key = column.key.toLowerCase().replace(/[_-]/g, ' ').trim();
    const label = column.label.toLowerCase().replace(/[_-]/g, ' ').trim();
    return key !== 'invoice'
      && label !== 'invoice'
      && !/(requester email|raw request|raw text|invoice (reference|number|id)|external payment reference|actor id)/i.test(`${key} ${label}`);
  });

const formatValue = (value: ReportValue, format?: ReportColumn['format']) => {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'currency' && typeof value === 'number') {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(value);
  }
  if (format === 'quantity' && typeof value === 'number') {
    return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(value);
  }
  if (format === 'percent' && typeof value === 'number') {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  }
  if (format === 'date' && typeof value === 'string') {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = dateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return String(value);
};

const getTable = (bundle: ReportsBundle, area: ReportArea): ReportTable | undefined => {
  if (area === 'Overview' || area === 'Analytics') {
    return bundle.tables.find((table) => table.area === area);
  }
  const id = bundle.defaultTableByStage[area];
  return bundle.tables.find((table) => table.id === id) || bundle.tables.find((table) => table.area === area);
};

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

function downloadCsv(table: ReportTable) {
  const columns = safeColumns(table);
  const lines = [
    columns.map((column) => csvEscape(column.label)).join(','),
    ...table.rows.map((row) =>
      columns.map((column) => csvEscape(formatValue(row[column.key] ?? null, column.format))).join(','),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${table.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report'}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function reportAreaLabel(area: ReportArea) {
  return area === 'PO' ? 'Purchase order' : area;
}

function ReportDataTable({ table }: { table: ReportTable }) {
  const columns = safeColumns(table);
  if (table.rows.length === 0) {
    return (
      <div className="rh-empty">
        <div className="rh-empty-icon"><FileText size={18} /></div>
        <strong>No records in this report yet</strong>
        <p>When this stage has workspace activity, its report will appear here.</p>
      </div>
    );
  }
  return (
    <div className="rh-table-scroll">
      <table className="rh-table">
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => {
                const value = row[column.key] ?? null;
                const isStatus = column.format === 'status';
                return <td key={column.key}>
                  {isStatus
                    ? <span className="rh-status">{formatValue(value, column.format)}</span>
                    : formatValue(value, column.format)}
                </td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsContent({
  bundle,
  alertReviews,
  alertReviewsLoading,
  alertReviewsError,
  pendingReviewAlertId,
  reviewMutationError,
  onMarkAlertReviewed,
}: {
  bundle: ReportsBundle;
  alertReviews: AnalyticsAlertReview[];
  alertReviewsLoading: boolean;
  alertReviewsError?: string;
  pendingReviewAlertId?: string;
  reviewMutationError?: string;
  onMarkAlertReviewed(alert: AnalyticsAlert): void;
}) {
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [alertView, setAlertView] = useState<'needs_review' | 'reviewed'>('needs_review');
  const [selectedItemKey, setSelectedItemKey] = useState('');
  const selectedItem = bundle.analyticsItems.find((item) => item.key === selectedItemKey) || bundle.analyticsItems[0];
  const reviewedAlertIds = new Set(alertReviews.map((review) => review.alert_id));
  const needsReviewAlerts = bundle.alerts.filter((alert) => !reviewedAlertIds.has(alert.id));
  const visibleAlerts = alertView === 'needs_review'
    ? needsReviewAlerts
    : alertReviews.map((review) => review.alert_snapshot);
  const alerts = showAllAlerts ? visibleAlerts : visibleAlerts.slice(0, 4);
  const sortedCosts = selectedItem?.monthlyUnitCost || [];
  const maxCost = Math.max(0, ...sortedCosts.map((point) => point.medianUnitCost));

  return (
    <div className="rh-analytics">
      <section className="rh-panel rh-alert-panel" aria-labelledby="rh-alert-title">
        <div className="rh-panel-heading">
          <div>
            <p className="rh-overline">{alertView === 'needs_review' ? 'Needs a look' : 'Review history'}</p>
            <h3 id="rh-alert-title">Notable changes</h3>
          </div>
          <span className="rh-count">{visibleAlerts.length}</span>
        </div>
        <div className="rh-alert-tabs" role="tablist" aria-label="Analytics alert status">
          <button
            type="button"
            role="tab"
            aria-selected={alertView === 'needs_review'}
            className={alertView === 'needs_review' ? 'is-active' : ''}
            onClick={() => { setAlertView('needs_review'); setShowAllAlerts(false); }}
            data-testid="analytics-alerts-needs-review"
          >Needs review <span>{needsReviewAlerts.length}</span></button>
          <button
            type="button"
            role="tab"
            aria-selected={alertView === 'reviewed'}
            className={alertView === 'reviewed' ? 'is-active' : ''}
            onClick={() => { setAlertView('reviewed'); setShowAllAlerts(false); }}
            data-testid="analytics-alerts-reviewed"
          >Reviewed <span>{alertReviews.length}</span></button>
        </div>
        {alertReviewsError && (
          <div className="rh-review-warning" role="alert">
            <AlertTriangle size={16} />
            <p>Saved review history is unavailable. {alertReviewsError}</p>
          </div>
        )}
        {reviewMutationError && (
          <div className="rh-review-warning" role="alert">
            <AlertTriangle size={16} />
            <p>{reviewMutationError}</p>
          </div>
        )}
        {visibleAlerts.length === 0 ? (
          <div className="rh-quiet-empty">
            {alertView === 'reviewed' ? <CheckCircle2 size={17} /> : <CircleHelp size={17} />}
            <span>{alertView === 'reviewed'
              ? 'No Analytics alerts have been marked reviewed yet.'
              : 'No demand or price changes currently need review.'}</span>
          </div>
        ) : (
          <>
            <div className="rh-alert-list">
              {alerts.map((alert) => {
                const price = alert.kind === 'price_change';
                const up = alert.kind === 'order_larger' || (price && (alert.changePercent || 0) > 0);
                const reviewRecord = alertView === 'reviewed'
                  ? alertReviews.find((review) => review.alert_id === alert.id)
                  : undefined;
                const reviewedDate = reviewRecord?.reviewed_at
                  ? new Date(reviewRecord.reviewed_at).toLocaleString()
                  : '';
                const isSaving = pendingReviewAlertId === alert.id;
                return (
                  <article className={`rh-alert ${price ? 'rh-alert-price' : ''}`} key={reviewRecord?.alert_id || alert.id}>
                    <span className={`rh-alert-mark ${up ? 'rh-mark-up' : 'rh-mark-down'}`}>
                      {price ? <AlertTriangle size={16} /> : up ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    </span>
                    <div className="rh-alert-copy">
                      <div className="rh-alert-titleline"><strong>{alert.item}</strong><span>{alert.title}</span></div>
                      <p>{alert.detail}</p>
                      {reviewRecord && <p className="rh-review-meta">
                        Reviewed by {reviewRecord.reviewed_by_email || 'workspace member'}
                        {reviewedDate ? ` · ${reviewedDate}` : ''}
                      </p>}
                    </div>
                    <time dateTime={alert.date}>{formatValue(alert.date, 'date')}</time>
                    {alertView === 'needs_review' && <button
                      type="button"
                      className="rh-review-button"
                      onClick={() => onMarkAlertReviewed(alert)}
                      disabled={alertReviewsLoading || Boolean(alertReviewsError) || Boolean(pendingReviewAlertId)}
                      aria-label={`Mark ${alert.item} alert reviewed`}
                      data-testid={`button-mark-alert-reviewed-${alert.id}`}
                    >{isSaving ? 'Saving…' : 'Mark reviewed'}</button>}
                  </article>
                );
              })}
            </div>
            {visibleAlerts.length > 4 && <button className="rh-text-action" type="button" onClick={() => setShowAllAlerts((value) => !value)}>
              {showAllAlerts ? 'Show fewer' : `See all ${visibleAlerts.length} alerts`}
            </button>}
          </>
        )}
        {alertView === 'needs_review' && alertReviewsLoading && (
          <p className="rh-review-loading" role="status">Loading workspace review history…</p>
        )}
        {alertView === 'needs_review' && !alertReviewsError && !alertReviewsLoading && (
          <p className="rh-review-note">Marking an alert reviewed acknowledges it for this workspace. It does not resolve an operational issue or change a PO approval.</p>
        )}
      </section>

      <section className="rh-panel" aria-labelledby="rh-item-title">
        <div className="rh-panel-heading rh-item-heading">
          <div>
            <p className="rh-overline">By item</p>
            <h3 id="rh-item-title">Demand &amp; unit-cost history</h3>
          </div>
          {bundle.analyticsItems.length > 0 && <label className="rh-item-select">
            <span className="rh-sr-only">Choose an item</span>
            <select value={selectedItem?.key || ''} onChange={(event) => setSelectedItemKey(event.target.value)}>
              {bundle.analyticsItems.map((item) => <option key={item.key} value={item.key}>{item.item}</option>)}
            </select><ChevronDown size={14} aria-hidden="true" />
          </label>}
        </div>
        {!selectedItem ? (
          <div className="rh-empty rh-empty-compact"><strong>No item history to show</strong><p>Analytics will appear when requests or matched invoices are available.</p></div>
        ) : (
          <>
            <div className="rh-metric-strip">
              <div><span>Requests</span><strong>{selectedItem.requestCount}</strong></div>
              <div><span>Latest / usual qty.</span><strong>{formatValue(selectedItem.latestRequestQty, 'quantity')} <i>/</i> {formatValue(selectedItem.typicalRequestQty, 'quantity')}</strong></div>
              <div><span>Matched invoices</span><strong>{selectedItem.matchedInvoiceCount}</strong></div>
              {selectedItem.volumeCostChangePercent !== null && <div><span>Large vs. small order cost</span><strong className={selectedItem.volumeCostChangePercent > 0 ? 'rh-value-warn' : 'rh-value-good'}>{formatValue(selectedItem.volumeCostChangePercent, 'percent')}</strong></div>}
            </div>
            {selectedItem.quantitySignal && <p className="rh-signal-note">
              {selectedItem.quantitySignal === 'larger' ? 'Latest request is unusually large' : 'Latest request is unusually small'} compared with prior demand.
            </p>}
            <div className="rh-cost-section">
              <div className="rh-cost-title"><strong>Monthly median unit cost</strong><span>Matched, approved invoices · PHP / unit</span></div>
              {sortedCosts.length === 0 ? (
                <p className="rh-no-cost">No matched invoice unit-cost history for this item.</p>
              ) : (
                <div className="rh-cost-chart" role="img" aria-label={`Monthly median unit cost history for ${selectedItem.item}`}>
                  {sortedCosts.map((point) => (
                    <div className="rh-cost-point" key={point.period} title={`${point.period}: ${formatValue(point.medianUnitCost, 'currency')} from ${point.invoiceCount} invoices`}>
                      <span className="rh-cost-value">{formatValue(point.medianUnitCost, 'currency')}</span>
                      <div className="rh-cost-track"><span style={{ height: `${Math.max(7, maxCost ? point.medianUnitCost / maxCost * 100 : 7)}%` }} /></div>
                      <span className="rh-cost-period">{point.period}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rh-comparisons" aria-label="Period comparisons">
              {selectedItem.periods.map((period) => (
                <div className="rh-comparison" key={period.period}>
                  <span>{period.label}</span>
                  <strong className={period.changePercent === null ? '' : period.changePercent > 0 ? 'rh-value-warn' : 'rh-value-good'}>
                    {period.changePercent === null ? 'Insufficient history' : formatValue(period.changePercent, 'percent')}
                  </strong>
                  <small>{period.currentLabel} vs. {period.previousLabel} · {period.currentInvoiceCount}/{period.previousInvoiceCount} invoices</small>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      <aside className="rh-analytics-caveat">
        <CircleHelp size={15} />
        <p>Price is comparison context only. Supplier ranking follows buyer-reviewed quality fit, compliance and delivery.</p>
      </aside>
    </div>
  );
}

export function ReportsHub({
  activeStage,
  bundle,
  isLoading,
  errorMessage,
  partialWarning,
  initialArea,
  refreshedAt,
  workspaceName,
  alertReviews,
  alertReviewsLoading,
  alertReviewsError,
  pendingReviewAlertId,
  reviewMutationError,
  onMarkAlertReviewed,
  onRefresh,
  onClose,
}: ReportsHubProps) {
  const [area, setArea] = useState<ReportArea>(initialArea || activeStage);
  const table = useMemo(() => getTable(bundle, area), [bundle, area]);
  const isAnalytics = area === 'Analytics';
  const navItems: ReportArea[] = ['Overview', 'Analytics', ...REPORT_STAGES];

  useEffect(() => setArea(initialArea || activeStage), [activeStage, initialArea]);

  const title = isAnalytics ? 'Analytics' : table?.title || `${reportAreaLabel(area)} report`;
  const description = isAnalytics
    ? 'Review significant demand and matched-invoice cost signals across recurring items.'
    : table?.description || 'A current view of activity in this workflow stage.';
  const summaryLines = table?.summary || [];
  const emailSummary = [
    `${title}${workspaceName ? ` — ${workspaceName}` : ''}`,
    ...summaryLines.slice(0, 3),
    '',
    'Please attach a printed or saved PDF yourself. Vireo does not send report attachments.',
  ].join('\n');

  const handleEmail = () => {
    const subject = encodeURIComponent(`Vireo report: ${title}`);
    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(emailSummary)}`;
  };

  return (
    <div className="reports-hub" data-testid="reports-hub">
      <div className="rh-frame">
        <header className="rh-header">
          <div className="rh-brandline">
            <div className="rh-brand-icon"><BarChart3 size={17} /></div>
            <div>
              <p className="rh-overline">Vireo / Reports</p>
              <h1>Reports</h1>
            </div>
            {workspaceName && <span className="rh-workspace">{workspaceName}</span>}
          </div>
          <div className="rh-actions">
            <button type="button" className="rh-button rh-button-subtle" onClick={onRefresh} disabled={isLoading} data-testid="button-refresh-reports">
              <RefreshCw size={15} className={isLoading ? 'rh-spinning' : ''} /> Refresh
            </button>
            <button type="button" className="rh-button rh-button-subtle" onClick={() => window.print()} disabled={isLoading} data-testid="button-print-report">
              <Printer size={15} /> Print / PDF
            </button>
            <button type="button" className="rh-button rh-button-subtle" onClick={handleEmail} disabled={isLoading} data-testid="button-email-report">
              <Mail size={15} /> Email
            </button>
            <button type="button" className="rh-icon-button" aria-label="Close reports" onClick={onClose} data-testid="button-close-reports"><X size={17} /></button>
          </div>
        </header>
        <div className="rh-meta-row">
          <p>{description}</p>
          {refreshedAt && <span className="rh-refreshed">Updated {refreshedAt}</span>}
        </div>
        {partialWarning && <p className="rh-partial-warning" role="status">{partialWarning}</p>}

        <nav className="rh-nav" aria-label="Report views">
          {navItems.map((item) => (
            <button
              type="button"
              key={item}
              className={`rh-nav-item ${area === item ? 'is-active' : ''} ${item === 'Request' ? 'rh-stage-start' : ''}`}
              aria-current={area === item ? 'page' : undefined}
              onClick={() => setArea(item)}
              data-testid={`report-nav-${String(item).toLowerCase()}`}
            >{reportAreaLabel(item)}</button>
          ))}
        </nav>

        <main className="rh-main">
          {isLoading ? (
            <div className="rh-loading" aria-live="polite" aria-label="Loading report data">
              <div className="rh-loading-top"><span /><span /><span /></div>
              <div className="rh-skeleton" /><div className="rh-skeleton rh-skeleton-short" />
              <div className="rh-skeleton rh-skeleton-table" />
            </div>
          ) : errorMessage ? (
            <div className="rh-state rh-error" role="alert">
              <div className="rh-empty-icon"><AlertTriangle size={18} /></div>
              <h2>Reports could not be loaded</h2>
              <p>{errorMessage}</p>
              <button className="rh-button rh-button-primary" type="button" onClick={onRefresh}><RefreshCw size={14} /> Try again</button>
            </div>
          ) : isAnalytics ? (
            <AnalyticsContent
              bundle={bundle}
              alertReviews={alertReviews}
              alertReviewsLoading={alertReviewsLoading}
              alertReviewsError={alertReviewsError}
              pendingReviewAlertId={pendingReviewAlertId}
              reviewMutationError={reviewMutationError}
              onMarkAlertReviewed={onMarkAlertReviewed}
            />
          ) : !table ? (
            <div className="rh-state">
              <div className="rh-empty-icon"><FileText size={18} /></div>
              <h2>This report is not available</h2>
              <p>No report table was supplied for this view.</p>
            </div>
          ) : (
            <>
              <section className="rh-report-intro">
                <div>
                  <p className="rh-overline">{reportAreaLabel(area)} report</p>
                  <h2>{title}</h2>
                  <p>{description}</p>
                </div>
                <div className="rh-intro-controls">
                  <span>{table.rows.length} {table.rows.length === 1 ? 'record' : 'records'}</span>
                  <button type="button" className="rh-button rh-button-export" onClick={() => downloadCsv(table)} disabled={table.rows.length === 0} data-testid="button-export-report-csv">
                    <Download size={14} /> Export CSV
                  </button>
                </div>
              </section>
              {summaryLines.length > 0 && (
                <div className="rh-summary" aria-label="Report summary">
                  {summaryLines.map((line, index) => <p key={`${index}-${line}`}><span>{String(index + 1).padStart(2, '0')}</span>{line}</p>)}
                </div>
              )}
              <section className="rh-panel rh-register" aria-label={title}>
                <ReportDataTable table={table} />
              </section>
            </>
          )}

          {!isLoading && !errorMessage && area === 'Analytics' && table && table.rows.length > 0 && (
            <div className="rh-export-line">
              <button type="button" className="rh-button rh-button-export" onClick={() => downloadCsv(table)} data-testid="button-export-analytics-csv"><Download size={14} /> Export analytics CSV</button>
            </div>
          )}
          {!isLoading && !errorMessage && bundle.dataNotes.length > 0 && (
            <details className="rh-notes">
              <summary><CircleHelp size={15} /><span>About this report data</span><ChevronDown size={14} className="rh-notes-chevron" /></summary>
              <ul>{bundle.dataNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul>
            </details>
          )}
        </main>
        <footer className="rh-footer">
          <span>Review before acting</span>
          <span>Reports reflect workspace records at the time shown.</span>
        </footer>
      </div>
    </div>
  );
}

export default ReportsHub;
