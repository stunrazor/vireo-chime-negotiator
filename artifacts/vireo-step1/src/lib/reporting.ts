import type {
  AwardRecord,
  QuoteRecord,
  ReportsSourceData,
  RequestRecord,
  RfqRecord,
} from '@/lib/vireo-api';
import type { DemoSnapshot } from '@/lib/mvp-api';
import type { AnalyticsAlert } from '@/lib/report-alert-types';
export type { AnalyticsAlert } from '@/lib/report-alert-types';

export const REPORT_STAGES = [
  'Request',
  'RFQ',
  'Ranking',
  'Award',
  'PO',
  'Receiving',
  'Invoice',
  'Payment',
] as const;

export type ReportStage = (typeof REPORT_STAGES)[number];
export type ReportArea = ReportStage | 'Overview' | 'Analytics';
export type ReportFormat = 'text' | 'date' | 'currency' | 'quantity' | 'status' | 'percent';
export type ReportValue = string | number | null;
export type ReportRow = { id: string } & Record<string, ReportValue>;

export type ReportColumn = {
  key: string;
  label: string;
  format?: ReportFormat;
};

export type ReportTable = {
  id: string;
  area: ReportArea;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: string[];
};

export type ReportSourceData = ReportsSourceData;

export type PeriodComparison = {
  period: 'month' | 'quarter' | 'year';
  label: string;
  currentLabel: string;
  previousLabel: string;
  currentMedianUnitCost: number | null;
  previousMedianUnitCost: number | null;
  currentInvoiceCount: number;
  previousInvoiceCount: number;
  changePercent: number | null;
  alertEligible: boolean;
};

export type MonthlyUnitCost = {
  period: string;
  medianUnitCost: number;
  invoiceCount: number;
};

export type ItemAnalytics = {
  key: string;
  item: string;
  requestCount: number;
  latestRequestQty: number | null;
  typicalRequestQty: number | null;
  priorRequestCount: number;
  quantitySignal: 'larger' | 'smaller' | null;
  matchedInvoiceCount: number;
  smallOrderMedianUnitCost: number | null;
  largeOrderMedianUnitCost: number | null;
  smallOrderCount: number;
  largeOrderCount: number;
  volumeCostChangePercent: number | null;
  monthlyUnitCost: MonthlyUnitCost[];
  periods: PeriodComparison[];
};

export type ReportsBundle = {
  tables: ReportTable[];
  defaultTableByStage: Record<ReportStage, string>;
  analyticsItems: ItemAnalytics[];
  alerts: AnalyticsAlert[];
  dataNotes: string[];
  generatedAt: string;
};

type PurchaseCost = {
  itemKey: string;
  item: string;
  date: string;
  qty: number;
  amount: number;
  unitCost: number;
  invoiceNumber: string;
  poCode: string;
};

const CURRENCY = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
});

const quantityText = (value: number) =>
  new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(value);

const moneyText = (value: number) => CURRENCY.format(value);

const normalizeItem = (value?: string | null) =>
  String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

const dateOnly = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, 10);
};

const sortNewest = <T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined = (row) =>
    (row as { created_at?: string | null }).created_at,
) =>
  [...rows].sort((a, b) => dateOnly(getDate(b)).localeCompare(dateOnly(getDate(a))));

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const stableAlertHash = (value: string) => {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
};

const percentChange = (current: number | null, previous: number | null) => {
  if (current === null || previous === null || previous <= 0) return null;
  return rounded(((current - previous) / previous) * 100);
};

const monthKey = (value: string) => dateOnly(value).slice(0, 7);
const monthIndex = (year: number, month: number) => year * 12 + month;

const monthLabel = (year: number, month: number) =>
  new Date(year, month - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });

const quarterNumber = (month: number) => Math.floor((month - 1) / 3) + 1;

const quarterKey = (value: string) => {
  const date = dateOnly(value);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return Number.isFinite(year) && Number.isFinite(month)
    ? `${year}-Q${quarterNumber(month)}`
    : '';
};

const dayKey = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const calendarPeriods = (now: Date) => {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const previousMonthDate = new Date(year, month - 2, 1);
  const currentQuarter = quarterNumber(month);
  const previousQuarterStart = new Date(year, (currentQuarter - 2) * 3, 1);
  const previousYearEnd = new Date(year - 1, month - 1, day);
  if (previousYearEnd.getMonth() !== month - 1) previousYearEnd.setDate(0);

  const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`;
  const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const previousQuarterKey = `${previousQuarterStart.getFullYear()}-Q${quarterNumber(previousQuarterStart.getMonth() + 1)}`;

  return [
    {
      period: 'month' as const,
      label: 'Month over month',
      currentLabel: monthLabel(year, month),
      previousLabel: monthLabel(previousMonthDate.getFullYear(), previousMonthDate.getMonth() + 1),
      select: (date: string, side: 'current' | 'previous') =>
        monthKey(date) === (side === 'current' ? currentMonthKey : previousMonthKey),
    },
    {
      period: 'quarter' as const,
      label: 'Quarter over quarter',
      currentLabel: `Q${currentQuarter} ${year}`,
      previousLabel: previousQuarterKey.replace('-', ' '),
      select: (date: string, side: 'current' | 'previous') =>
        quarterKey(date) === (side === 'current' ? `${year}-Q${currentQuarter}` : previousQuarterKey),
    },
    {
      period: 'year' as const,
      label: 'Year over year',
      currentLabel: `${year} YTD`,
      previousLabel: `${year - 1} YTD`,
      select: (date: string, side: 'current' | 'previous') => {
        const key = dateOnly(date);
        if (side === 'current') return key >= `${year}-01-01` && key <= dayKey(year, month, day);
        return key >= `${year - 1}-01-01` && key <= dayKey(year - 1, previousYearEnd.getMonth() + 1, previousYearEnd.getDate());
      },
    },
  ];
};

const makeTable = (
  id: string,
  area: ReportArea,
  title: string,
  description: string,
  columns: ReportColumn[],
  rows: ReportRow[],
  summary: string[] = [],
): ReportTable => ({ id, area, title, description, columns, rows, summary });

const unitCostsFor = (items: PurchaseCost[]) => items.map((row) => row.unitCost);

function buildAnalytics(
  requests: RequestRecord[],
  snapshot: DemoSnapshot | null,
  now: Date,
  allowQuantitySignals: boolean,
): { items: ItemAnalytics[]; alerts: AnalyticsAlert[] } {
  const requestGroups = new Map<string, { item: string; rows: RequestRecord[] }>();
  for (const request of requests) {
    const key = normalizeItem(request.item);
    if (!key) continue;
    const group = requestGroups.get(key) || { item: String(request.item).trim(), rows: [] };
    group.rows.push(request);
    requestGroups.set(key, group);
  }

  const sentPoById = new Map(
    (snapshot?.purchase_orders || [])
      .filter((po) => po.status.toLowerCase() === 'sent')
      .map((po) => [po.id, po]),
  );
  const costs: PurchaseCost[] = [];
  for (const invoice of snapshot?.invoices || []) {
    if (
      invoice.match_state !== 'matched'
      || !['approved', 'paid_external', 'reconciled'].includes(invoice.state)
      || invoice.currency_code !== 'PHP'
      || !Number.isFinite(invoice.amount)
      || !Number.isFinite(invoice.qty)
      || invoice.amount <= 0
      || invoice.qty <= 0
    ) continue;
    const po = sentPoById.get(invoice.po_id);
    const key = normalizeItem(po?.request_item);
    const date = dateOnly(invoice.invoice_date);
    if (!po || !key || !date || !Number.isFinite(Date.parse(`${date}T00:00:00`))) continue;
    costs.push({
      itemKey: key,
      item: String(po.request_item).trim(),
      date,
      qty: invoice.qty,
      amount: invoice.amount,
      unitCost: invoice.amount / invoice.qty,
      invoiceNumber: invoice.invoice_number,
      poCode: po.po_code,
    });
  }

  const costGroups = new Map<string, PurchaseCost[]>();
  for (const cost of costs) {
    const group = costGroups.get(cost.itemKey) || [];
    group.push(cost);
    costGroups.set(cost.itemKey, group);
    if (!requestGroups.has(cost.itemKey)) requestGroups.set(cost.itemKey, { item: cost.item, rows: [] });
  }

  const alerts: AnalyticsAlert[] = [];
  const periods = calendarPeriods(now);
  const items: ItemAnalytics[] = [];

  for (const [key, group] of requestGroups) {
    const validRequests = group.rows
      .filter((row) => Number.isFinite(row.qty) && Number(row.qty) > 0 && Boolean(dateOnly(row.created_at)))
      .sort((a, b) => dateOnly(b.created_at).localeCompare(dateOnly(a.created_at)));
    const latestRequest = validRequests[0];
    const priorRequests = validRequests.slice(1);
    const typicalRequestQty = priorRequests.length >= 3
      ? median(priorRequests.map((row) => Number(row.qty)))
      : null;
    let quantitySignal: ItemAnalytics['quantitySignal'] = null;
    if (
      allowQuantitySignals
      && latestRequest
      && typicalRequestQty
      && typicalRequestQty > 0
      && priorRequests.length >= 3
    ) {
      const latestQty = Number(latestRequest.qty);
      if (latestQty >= typicalRequestQty * 2) quantitySignal = 'larger';
      else if (latestQty <= typicalRequestQty * 0.5) quantitySignal = 'smaller';
      if (quantitySignal) {
        alerts.push({
          id: `request-${latestRequest.id}-${quantitySignal}`,
          item: group.item,
          kind: quantitySignal === 'larger' ? 'order_larger' : 'order_smaller',
          title: quantitySignal === 'larger' ? 'Unusually large request' : 'Unusually small request',
          detail: `${quantityText(latestQty)} requested; the prior median is ${quantityText(typicalRequestQty)} across ${priorRequests.length} earlier requests.`,
          date: dateOnly(latestRequest.created_at),
          value: latestQty,
          baseline: typicalRequestQty,
          sampleCount: priorRequests.length,
        });
      }
    }

    const itemCosts = (costGroups.get(key) || []).sort((a, b) => a.date.localeCompare(b.date));
    const orderedByQty = [...itemCosts].sort((a, b) => a.qty - b.qty || a.date.localeCompare(b.date));
    const half = Math.floor(orderedByQty.length / 2);
    const smallOrders = orderedByQty.slice(0, half);
    const largeOrders = orderedByQty.slice(Math.ceil(orderedByQty.length / 2));
    const smallOrderMedianUnitCost = smallOrders.length >= 3
      ? median(unitCostsFor(smallOrders))
      : null;
    const largeOrderMedianUnitCost = largeOrders.length >= 3
      ? median(unitCostsFor(largeOrders))
      : null;
    const lowQtyMedian = median(smallOrders.map((row) => row.qty));
    const highQtyMedian = median(largeOrders.map((row) => row.qty));
    const distinctVolumeBands = lowQtyMedian !== null && highQtyMedian !== null && highQtyMedian > lowQtyMedian;
    const volumeCostChangePercent = distinctVolumeBands
      ? percentChange(largeOrderMedianUnitCost, smallOrderMedianUnitCost)
      : null;

    const periodComparisons: PeriodComparison[] = periods.map((period) => {
      const current = itemCosts.filter((row) => period.select(row.date, 'current'));
      const previous = itemCosts.filter((row) => period.select(row.date, 'previous'));
      const currentMedian = median(unitCostsFor(current));
      const previousMedian = median(unitCostsFor(previous));
      const changePercent = percentChange(currentMedian, previousMedian);
      const alertEligible = current.length >= 3
        && previous.length >= 3
        && changePercent !== null
        && Math.abs(changePercent) >= 10;
      if (alertEligible && currentMedian !== null && previousMedian !== null && changePercent !== null) {
        const date = current.map((row) => row.date).sort().at(-1) || '';
        const direction = changePercent > 0 ? 'increased' : 'decreased';
        const alertFingerprint = [
          key,
          period.period,
          period.currentLabel,
          rounded(currentMedian),
          rounded(previousMedian),
          current.length,
          previous.length,
        ].join('|');
        alerts.push({
          id: `price-${stableAlertHash(alertFingerprint)}`,
          item: group.item,
          kind: 'price_change',
          title: `${period.label}: unit cost ${direction}`,
          detail: `Median matched-invoice unit cost ${direction} ${Math.abs(changePercent).toFixed(1)}% to ${moneyText(currentMedian)} from ${moneyText(previousMedian)}.`,
          date,
          value: currentMedian,
          baseline: previousMedian,
          changePercent,
          period: period.label,
          sampleCount: current.length + previous.length,
        });
      }
      return {
        period: period.period,
        label: period.label,
        currentLabel: period.currentLabel,
        previousLabel: period.previousLabel,
        currentMedianUnitCost: currentMedian === null ? null : rounded(currentMedian),
        previousMedianUnitCost: previousMedian === null ? null : rounded(previousMedian),
        currentInvoiceCount: current.length,
        previousInvoiceCount: previous.length,
        changePercent,
        alertEligible,
      };
    });

    const monthBuckets = new Map<string, PurchaseCost[]>();
    for (const cost of itemCosts) {
      const bucket = monthKey(cost.date);
      const rows = monthBuckets.get(bucket) || [];
      rows.push(cost);
      monthBuckets.set(bucket, rows);
    }
    const currentMonth = monthIndex(now.getFullYear(), now.getMonth() + 1);
    const monthlyUnitCost = [...monthBuckets.entries()]
      .map(([key, rows]) => {
        const [year, month] = key.split('-').map(Number);
        return {
          index: monthIndex(year, month),
          period: monthLabel(year, month),
          medianUnitCost: rounded(median(unitCostsFor(rows)) || 0),
          invoiceCount: rows.length,
        };
      })
      .filter((bucket) => bucket.index >= currentMonth - 11 && bucket.index <= currentMonth)
      .sort((a, b) => a.index - b.index)
      .map(({ period, medianUnitCost, invoiceCount }) => ({ period, medianUnitCost, invoiceCount }));

    const latestQty = latestRequest && Number.isFinite(latestRequest.qty) ? Number(latestRequest.qty) : null;
    items.push({
      key,
      item: group.item,
      requestCount: group.rows.length,
      latestRequestQty: latestQty,
      typicalRequestQty: typicalRequestQty === null ? null : rounded(typicalRequestQty),
      priorRequestCount: priorRequests.length,
      quantitySignal,
      matchedInvoiceCount: itemCosts.length,
      smallOrderMedianUnitCost: distinctVolumeBands && smallOrderMedianUnitCost !== null
        ? rounded(smallOrderMedianUnitCost)
        : null,
      largeOrderMedianUnitCost: distinctVolumeBands && largeOrderMedianUnitCost !== null
        ? rounded(largeOrderMedianUnitCost)
        : null,
      smallOrderCount: distinctVolumeBands ? smallOrders.length : 0,
      largeOrderCount: distinctVolumeBands ? largeOrders.length : 0,
      volumeCostChangePercent: distinctVolumeBands ? volumeCostChangePercent : null,
      monthlyUnitCost,
      periods: periodComparisons,
    });
  }

  items.sort((a, b) => b.requestCount - a.requestCount || a.item.localeCompare(b.item));
  alerts.sort((a, b) => b.date.localeCompare(a.date) || a.item.localeCompare(b.item));
  return { items, alerts };
}

export function buildReportsBundle(
  source: ReportSourceData,
  snapshot: DemoSnapshot | null,
  now = new Date(),
): ReportsBundle {
  const requests = sortNewest(source.requests || []);
  const rfqs = sortNewest(source.rfqs || []);
  const quotes = sortNewest(source.quotes || []);
  const awards = sortNewest(source.awards || []);
  const purchaseOrders = sortNewest(source.purchase_orders || []);
  const receipts = sortNewest(snapshot?.receipts || []);
  const invoices = sortNewest(
    snapshot?.invoices || [],
    (row) => row.invoice_date || row.submitted_at,
  );

  const rfqById = new Map(rfqs.map((row) => [row.id, row]));
  const requestById = new Map(requests.map((row) => [row.id, row]));
  const awardById = new Map(awards.map((row) => [row.id, row]));
  const reportTables: ReportTable[] = [];

  const requestRows = requests.map((row) => ({
    id: row.id,
    reference: row.batch_number || row.id.slice(0, 8),
    item: row.item || 'Not specified',
    qty: row.qty ?? null,
    site: row.site || 'Not specified',
    needed_by: row.needed_by || 'Not specified',
    status: row.status,
    date: dateOnly(row.created_at),
  }));
  reportTables.push(makeTable(
    'requests-register',
    'Request',
    'Request register',
    'Items, quantities and request status. Requester email and raw request text are intentionally omitted.',
    [
      { key: 'reference', label: 'Reference' },
      { key: 'item', label: 'Item' },
      { key: 'qty', label: 'Quantity', format: 'quantity' },
      { key: 'site', label: 'Delivery site' },
      { key: 'needed_by', label: 'Needed by', format: 'date' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'date', label: 'Received', format: 'date' },
    ],
    requestRows,
    [`${requests.length} requests in this report.`],
  ));

  const rfqRows = rfqs.map((row) => ({
    id: row.id,
    reference: row.rfq_code,
    batch: row.batch_number || '—',
    item: row.title || requestById.get(row.request_id)?.item || 'Not specified',
    qty: row.qty ?? null,
    site: row.site || 'Not specified',
    status: row.status,
    date: dateOnly(row.created_at),
  }));
  reportTables.push(makeTable(
    'rfq-register',
    'RFQ',
    'RFQ register',
    'RFQs, quantities, batch references and status.',
    [
      { key: 'reference', label: 'RFQ' },
      { key: 'batch', label: 'Batch' },
      { key: 'item', label: 'Item' },
      { key: 'qty', label: 'Quantity', format: 'quantity' },
      { key: 'site', label: 'Site' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'date', label: 'Created', format: 'date' },
    ],
    rfqRows,
    [`${rfqs.length} RFQs in this report.`],
  ));

  const quoteRows = quotes.map((row) => ({
    id: row.id,
    rfq: rfqById.get(row.rfq_id)?.rfq_code || row.rfq_id.slice(0, 8),
    item: rfqById.get(row.rfq_id)?.title || 'Item not available',
    supplier: row.supplier_name,
    quote_total: row.price ?? null,
    delivery_days: row.delivery_days ?? null,
    quality_fit: row.quality_fit_status || 'unreviewed',
    compliance: row.compliance_status || 'unreviewed',
    status: row.status,
    date: dateOnly(row.created_at),
  }));
  reportTables.push(makeTable(
    'quote-review-register',
    'Ranking',
    'Quote review register',
    'Buyer-reviewed quality fit, compliance and delivery. Price is shown for comparison only; it does not determine supplier ranking.',
    [
      { key: 'rfq', label: 'RFQ' },
      { key: 'item', label: 'Item' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'quote_total', label: 'Quote total (PHP)', format: 'currency' },
      { key: 'delivery_days', label: 'Delivery (days)', format: 'quantity' },
      { key: 'quality_fit', label: 'Quality fit', format: 'status' },
      { key: 'compliance', label: 'Compliance', format: 'status' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'date', label: 'Received', format: 'date' },
    ],
    quoteRows,
    [`${quotes.length} supplier quote records in this report.`],
  ));

  const awardRows = awards.map((row) => ({
    id: row.id,
    reference: row.award_code,
    rfq: row.rfq_code,
    item: rfqById.get(row.rfq_id)?.title || 'Item not available',
    supplier: row.supplier_name,
    qty: row.qty,
    total: row.price,
    delivery_days: row.delivery_days ?? null,
    status: row.status,
    date: dateOnly(row.created_at),
  }));
  reportTables.push(makeTable(
    'award-register',
    'Award',
    'Supplier awards',
    'Confirmed supplier awards and their recorded amounts. Award values are commitments, not verified payments.',
    [
      { key: 'reference', label: 'Award' },
      { key: 'rfq', label: 'RFQ' },
      { key: 'item', label: 'Item' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'qty', label: 'Quantity', format: 'quantity' },
      { key: 'total', label: 'Award total (PHP)', format: 'currency' },
      { key: 'delivery_days', label: 'Delivery (days)', format: 'quantity' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'date', label: 'Date', format: 'date' },
    ],
    awardRows,
    [`${awards.length} supplier awards in this report.`],
  ));

  const poRows = purchaseOrders.map((row) => ({
    id: row.id,
    reference: row.po_code,
    rfq: awardById.get(row.award_id)?.rfq_code || 'Not linked',
    item: (() => {
      const award = awardById.get(row.award_id);
      const rfq = award && rfqById.get(award.rfq_id);
      return rfq?.title || 'Item not available';
    })(),
    supplier: row.supplier_name,
    qty: row.qty,
    total: row.price_total,
    status: row.status,
    date: dateOnly(row.created_at),
  }));
  reportTables.push(makeTable(
    'purchase-order-register',
    'PO',
    'Purchase order register',
    'Draft and sent purchase orders. Sent totals represent recorded commitments; they are not proof of delivery or payment.',
    [
      { key: 'reference', label: 'Purchase order' },
      { key: 'rfq', label: 'RFQ' },
      { key: 'item', label: 'Item' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'qty', label: 'Quantity', format: 'quantity' },
      { key: 'total', label: 'PO total (PHP)', format: 'currency' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'date', label: 'Created', format: 'date' },
    ],
    poRows,
    [`${purchaseOrders.filter((row) => row.status.toLowerCase() === 'sent').length} sent POs; ${purchaseOrders.filter((row) => row.status.toLowerCase() === 'draft').length} drafts.`],
  ));

  const receiptRows = receipts.map((row) => ({
    id: row.id,
    po: row.po_code,
    item: row.request_item || 'Item not available',
    supplier: row.supplier_name,
    received_qty: row.received_qty,
    state: row.state,
    date: dateOnly(row.created_at),
  }));
  reportTables.push(makeTable(
    'receiving-register',
    'Receiving',
    'Receiving and inspection register',
    'Recorded deliveries and independent receipt-review outcomes. Reference notes and reviewer identities are omitted.',
    [
      { key: 'po', label: 'Purchase order' },
      { key: 'item', label: 'Item' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'received_qty', label: 'Quantity received', format: 'quantity' },
      { key: 'state', label: 'Review state', format: 'status' },
      { key: 'date', label: 'Received', format: 'date' },
    ],
    receiptRows,
    snapshot ? [`${receipts.length} delivery records in this report.`] : ['Receiving data is unavailable until the workspace reporting snapshot loads.'],
  ));

  const invoiceRows = invoices.map((row) => ({
    id: row.id,
    po: row.po_code,
    invoice: row.invoice_number,
    supplier: row.supplier_name,
    invoice_date: dateOnly(row.invoice_date),
    qty: row.qty,
    amount: row.amount,
    match: row.match_state,
    state: row.state,
  }));
  reportTables.push(makeTable(
    'invoice-register',
    'Invoice',
    'Invoice review register',
    'Supplier-submitted invoice amounts, match state and approval state. A match is not independent verification of settlement.',
    [
      { key: 'po', label: 'Purchase order' },
      { key: 'invoice', label: 'Invoice' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'invoice_date', label: 'Invoice date', format: 'date' },
      { key: 'qty', label: 'Quantity', format: 'quantity' },
      { key: 'amount', label: 'Amount (PHP)', format: 'currency' },
      { key: 'match', label: 'Match', format: 'status' },
      { key: 'state', label: 'Approval state', format: 'status' },
    ],
    invoiceRows,
    snapshot ? [`${invoices.length} submitted invoices in this report.`] : ['Invoice data is unavailable until the workspace reporting snapshot loads.'],
  ));

  const paymentRows = invoices
    .filter((row) => row.payment || ['paid_external', 'reconciled'].includes(row.state))
    .map((row) => ({
      id: row.id,
      po: row.po_code,
      invoice: row.invoice_number,
      supplier: row.supplier_name,
      amount: row.amount,
      status: row.payment?.state || row.state,
      payment_date: row.payment?.payment_date || null,
      reconciliation: row.payment?.reconciled_by ? 'Reconciled by another member' : row.state === 'reconciled' ? 'Reconciled' : 'Not reconciled',
    }));
  reportTables.push(makeTable(
    'payment-reconciliation-register',
    'Payment',
    'Payment reconciliation register',
    'Off-platform payments reported by workspace users. Vireo does not move money or independently verify bank settlement.',
    [
      { key: 'po', label: 'Purchase order' },
      { key: 'invoice', label: 'Invoice' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'amount', label: 'Invoice amount (PHP)', format: 'currency' },
      { key: 'status', label: 'Recorded state', format: 'status' },
      { key: 'payment_date', label: 'Reported date paid', format: 'date' },
      { key: 'reconciliation', label: 'Reconciliation', format: 'status' },
    ],
    paymentRows,
    snapshot ? [`${paymentRows.length} external payment records in this report.`] : ['Payment data is unavailable until the workspace reporting snapshot loads.'],
  ));

  const { items: analyticsItems, alerts } = buildAnalytics(
    requests,
    snapshot,
    now,
    source.capped?.requests !== true,
  );
  const analyticsRows = analyticsItems.map((item) => {
    const volumeCost = item.volumeCostChangePercent === null
      ? 'Not enough distinct purchase history'
      : `${item.volumeCostChangePercent > 0 ? '+' : ''}${item.volumeCostChangePercent.toFixed(1)}%`;
    const periodText = item.periods.map((period) =>
      `${period.label}: ${period.changePercent === null ? 'insufficient comparison data' : `${period.changePercent > 0 ? '+' : ''}${period.changePercent.toFixed(1)}%`}`,
    ).join(' · ');
    return {
      id: item.key,
      item: item.item,
      requests: item.requestCount,
      latest_request_qty: item.latestRequestQty,
      usual_request_qty: item.typicalRequestQty,
      quantity_signal: item.quantitySignal || 'No unusual quantity',
      matched_invoices: item.matchedInvoiceCount,
      small_order_unit_cost: item.smallOrderMedianUnitCost,
      large_order_unit_cost: item.largeOrderMedianUnitCost,
      volume_cost_change: volumeCost,
      period_changes: periodText,
    };
  });
  reportTables.push(makeTable(
    'item-demand-and-cost',
    'Analytics',
    'Item demand and cost signals',
    'Unusual request quantities and matched supplier-invoice unit costs for comparable recorded quantities.',
    [
      { key: 'item', label: 'Item' },
      { key: 'requests', label: 'Requests', format: 'quantity' },
      { key: 'latest_request_qty', label: 'Latest quantity', format: 'quantity' },
      { key: 'usual_request_qty', label: 'Usual quantity', format: 'quantity' },
      { key: 'quantity_signal', label: 'Order-size signal', format: 'status' },
      { key: 'matched_invoices', label: 'Matched invoices', format: 'quantity' },
      { key: 'small_order_unit_cost', label: 'Smaller-order median / unit (PHP)', format: 'currency' },
      { key: 'large_order_unit_cost', label: 'Larger-order median / unit (PHP)', format: 'currency' },
      { key: 'volume_cost_change', label: 'Large vs. small', format: 'percent' },
      { key: 'period_changes', label: 'MoM · QoQ · YoY' },
    ],
    analyticsRows,
    [
      `${analyticsItems.length} exact item descriptions found in request or matched-invoice history.`,
      `${alerts.length} notable demand or unit-cost signals meet the current alert rules.`,
    ],
  ));

  const stageTableIds = Object.fromEntries(
    reportTables.filter((table) => REPORT_STAGES.includes(table.area as ReportStage))
      .map((table) => [table.area, table.id]),
  ) as Record<ReportStage, string>;

  const counts = {
    requests: requests.length,
    rfqs: rfqs.length,
    quotes: quotes.length,
    awards: awards.length,
    purchase_orders: purchaseOrders.length,
    receipts: receipts.length,
    invoices: invoices.length,
    payments: paymentRows.length,
  };
  const overviewRows = REPORT_STAGES.map((stage) => {
    const table = reportTables.find((row) => row.area === stage);
    return {
      id: stage,
      stage,
      records: table?.rows.length || 0,
      latest: table?.rows[0]?.date || table?.rows[0]?.invoice_date || '—',
    };
  });
  reportTables.unshift(makeTable(
    'procurement-overview',
    'Overview',
    'Procurement overview',
    'A workspace-scoped snapshot of activity across the eight procurement steps.',
    [
      { key: 'stage', label: 'Workflow stage' },
      { key: 'records', label: 'Records', format: 'quantity' },
      { key: 'latest', label: 'Most recent activity', format: 'date' },
    ],
    overviewRows,
    [
      `${counts.requests} requests · ${counts.rfqs} RFQs · ${counts.quotes} quotes.`,
      `${counts.awards} awards · ${counts.purchase_orders} purchase orders.`,
      `${counts.receipts} receipt records · ${counts.invoices} invoices · ${counts.payments} payment/reconciliation records.`,
    ],
  ));

  const capped = Object.entries(source.capped || {}).filter(([, value]) => value);
  const dataNotes = [
    'Order-size alerts compare the newest request with the median of at least three earlier requests for the same normalized item name. An alert means the quantity is at least twice, or at most half, the prior median.',
    'Unit-cost analysis uses matched, approved supplier invoices linked to sent purchase orders and accepted quantities. A payment reported in Vireo is not independently verified.',
    'Smaller and larger order groups are the lower and upper halves of matched invoices by recorded quantity. Each half needs at least three invoices and a distinct median quantity.',
    'Monthly, quarterly and year-to-date comparisons use median PHP per recorded quantity unit. A workspace alert requires at least three invoices in each period and a price movement of 10% or more.',
    'Items match by normalized item text only. Pack size, specification variants and unit-of-measure conversions are not inferred.',
    ...(source.capped?.requests
      ? ['Order-size alerts are suppressed because the request history reached the report limit; the full prior-item baseline is not available.']
      : []),
    ...(capped.length
      ? [`Some source lists reached the ${Math.max(0, ...Object.values(source.capped || {}).map((value) => value ? 1000 : 0))}-record report limit (${capped.map(([name]) => name).join(', ')}). Older records may be missing from this snapshot; interpret historical comparisons cautiously.`]
      : []),
  ];

  return {
    tables: reportTables,
    defaultTableByStage: stageTableIds,
    analyticsItems,
    alerts,
    dataNotes,
    generatedAt: now.toISOString(),
  };
}
