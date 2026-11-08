import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowDownRight, ArrowLeft, ArrowRight, BadgeCheck, BarChart3, Check, CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck, FileText, Inbox, Layers3, Mail, PackageCheck, Plus, RefreshCw, Send, ShieldCheck, Sparkles, Truck, UserRound, X } from 'lucide-react';
import { Route, Switch } from 'wouter';
import {
  confirmPurchaseOrder,
  createAward,
  createPurchaseOrder,
  assignWorkspaceMemberRole,
  createQuote,
  createRequest,
  createSpreadsheetRequest,
  createRfq,
  createRfqBatch,
  getAwards,
  getAdminSetupSnapshot,
  getAdminWorkspaceItems,
  getAdminWorkspaceSuppliers,
  getAdminWorkspaceSupplierItems,
  getAdminWorkspaceAudit,
  getPoApprovalSnapshot,
  getPurchaseOrders,
  getReportAlertReviews,
  getQuotes,
  getRanking,
  getRequests,
  getReportsSourceData,
  getRfqs,
  getStatus,
  archivePoQuantityBaseline,
  restorePoQuantityBaseline,
  previewQuoteText,
  returnRequest,
  sendRfq,
  managePoApprover,
  setPoQuantityBaseline,
  importWorkspaceCatalogItems,
  importWorkspaceSuppliers,
  importWorkspaceSupplierItems,
  linkWorkspaceSupplierItem,
  seedDemoCatalog,
  approvePoQuantityCase,
  markPoQuantityCasesReviewed,
  preparePoQuantityClarificationDraft,
  recordPoQuantityClarificationResponse,
  returnPoQuantityCaseToMaker,
  submitMakerQuantityExplanation,
  createPoQuantityCorrectionRequest,
  reviewReportAlert,
  updateQuoteAssessment,
  type AwardRecord,
  type PurchaseOrderRecord,
  type PoApprovalSnapshot,
  type PoQuantityApprovalCase,
  type QuoteRecord,
  type RankingRecord,
  type RequestRecord,
  type RfqRecord,
  type SpreadsheetRequestPayload,
  type WorkspaceCatalogItemEnrollmentDraft,
} from '@/lib/vireo-api';
import { AuthGate, useWorkspaceRole } from '@/components/auth-gate';
import { ChimeDemoProfile } from '@/components/ChimeDemoProfile';
import { ChimeAuditTrail, ChimeBlockerDialog, createChimeEventId, notifyChimeApproval, notifyChimeBlocker, notifyChimeReview, type ChimeDecisionPhase, type ChimeEventKind, type ChimeEventNotice } from '@/components/ChimeBlockerDialog';
import AdminMemberWorkspace from '@/components/AdminMemberWorkspace';
import { ErrorBoundary } from '@/components/error-boundary';
import { SpreadsheetRequestImport } from '@/components/spreadsheet-request-import';
import { QuoteDocumentUpload } from '@/components/quote-document-upload';
import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Step6Workspace } from '@/components/receiving/step6-workspace';
import { RequestToPaymentWorkspace } from '@/components/receiving/request-to-payment-workspace';
import { ReportsHub } from '@/components/reports/reports-hub';
import { getMvpSnapshot, mvpWorkspaceKey } from '@/lib/mvp-api';
import { buildReportsBundle, type ReportArea } from '@/lib/reporting';
import type { AnalyticsAlert } from '@/lib/report-alert-types';
import NotFound from '@/pages/not-found';
import { NegotiatorDemoPage } from '@/components/negotiator/negotiator-demo';

type Step = 'Request' | 'RFQ' | 'Ranking' | 'Award' | 'PO' | 'Receiving' | 'Invoice' | 'Payment';
const steps: Step[] = ['Request', 'RFQ', 'Ranking', 'Award', 'PO', 'Receiving', 'Invoice', 'Payment'];
const workflowPhases: Array<{ name: string; detail: string; steps: Step[] }> = [
  { name: 'Request', detail: 'Request intake', steps: ['Request'] },
  { name: 'Get quotes', detail: 'Source and compare suppliers', steps: ['RFQ', 'Ranking', 'Award'] },
  { name: 'Order', detail: 'Purchase order', steps: ['PO'] },
  { name: 'Receive and close', detail: 'Confirm delivery and close out', steps: ['Receiving', 'Invoice', 'Payment'] },
];
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 0, refetchOnWindowFocus: false } },
});

const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(' ');
const fmtMoney = (amount?: number | null) =>
  typeof amount === 'number' ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(amount) : 'Awaiting quote';
const shortDate = (value?: string | null) => {
  if (!value) return 'Not specified';
  if (value.toLowerCase() === 'asap') return 'As soon as possible';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const idOf = (value?: string | null) => value || '';
const isReadyRequest = (r: RequestRecord) => {
  const status = r.status.toLowerCase();
  const hasCoreFields = Boolean(r.item && r.item_code && r.qty !== null && r.qty !== undefined && r.site && r.needed_by && r.spec);
  return status.includes('ready') && !status.includes('not ready') && !status.includes('language') && !status.includes('english') && hasCoreFields;
};
const isDraft = (status?: string) => String(status || '').toLowerCase().includes('draft');
const isManualReview = (status?: string) => /manual|review|incomplete|missing/i.test(String(status || ''));

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <Switch>
            <Route path="/" component={ProtectedWorkflow} />
            {/* Hackathon demo: deliberately outside auth — synthetic + Sandbox only. */}
            <Route path="/negotiator-demo" component={NegotiatorDemoPage} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function ProtectedWorkflow() {
  return <AuthGate queryClient={queryClient}><Workflow /></AuthGate>;
}

function WorkspacePreparingShell() {
  return (
    <div className="vireo-shell min-h-[100dvh] text-[#F1EFFA]">
      <main className="workflow-main" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 22 }}>
          <div className="brand-lockup" style={{ justifyContent: 'center', gap: 14 }}>
            <div className="brand-mark" style={{ width: 64, height: 56, flexBasis: 64 }}>
              <img className="brand-symbol workspace-loading-mark" src="/logo.svg" alt="" aria-hidden="true" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div className="brand-name" style={{ fontSize: 22 }}>Vireo<span>Intelligence</span></div>
              <div className="brand-caption">Procurement workspace</div>
            </div>
          </div>
          <p role="status" aria-live="polite" style={{ margin: 0, color: '#A19DB1', fontSize: 13 }}>
            Preparing your workspace…
          </p>
        </div>
      </main>
    </div>
  );
}

function Workflow() {
  const workspaceRole = useWorkspaceRole();
  const isAdminMember = workspaceRole === 'workspace_admin';
  const [activeStep, setActiveStep] = useState<Step>('Request');
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportsInitialArea, setReportsInitialArea] = useState<ReportArea>();
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [batchRfqRequestIds, setBatchRfqRequestIds] = useState<string[]>([]);
  const [rfqBatchProgress, setRfqBatchProgress] = useState<{ completed: number; total: number }>();
  const [selectedRfqId, setSelectedRfqId] = useState('');
  const [selectedAwardId, setSelectedAwardId] = useState('');
  const [notice, setNoticeState] = useState<{ tone: 'success' | 'error'; text: string }>();
  const [chimeQueue, setChimeQueue] = useState<ChimeEventNotice[]>([]);
  const seenChimeCorrelationKeys = useRef(new Set<string>());
  const chimeNotice = chimeQueue[0];
  const enqueueChimeNotice = (notice: ChimeEventNotice) => {
    const key = notice.kind === 'review' ? notice.correlationKey : undefined;
    if (key && seenChimeCorrelationKeys.current.has(key)) return;
    if (key) seenChimeCorrelationKeys.current.add(key);
    setChimeQueue((current) => [...current, notice]);
  };
  const closeChimeNotice = () => setChimeQueue((current) => current.slice(1));
  const showChimeBlocker = (message: string) =>
    enqueueChimeNotice({ event_id: createChimeEventId(), kind: 'blocker', message });
  const setNotice = (value: { tone: 'success' | 'error'; text: string } | undefined) => {
    setNoticeState(value);
    if (value?.tone === 'error') showChimeBlocker(value.text);
  };
  useEffect(() => {
    const onChimeEvent = (event: Event) => {
      const detail = (event as CustomEvent<Partial<ChimeEventNotice> & { kind: ChimeEventKind; message: string }>).detail;
      if (detail?.message) enqueueChimeNotice({
        event_id: detail.event_id || createChimeEventId(),
        kind: detail.kind,
        message: detail.message,
        correlationKey: detail.correlationKey,
        phase: detail.phase as ChimeDecisionPhase | undefined,
      });
    };
    window.addEventListener('vireo:chime-event', onChimeEvent);
    return () => window.removeEventListener('vireo:chime-event', onChimeEvent);
  }, []);
  const [workspaceRefreshActive, setWorkspaceRefreshActive] = useState(false);
  const workspaceRefreshRequestsComplete = useRef(false);

  const statusQuery = useQuery({ queryKey: ['vireo', 'status'], queryFn: getStatus });
  const requestsQuery = useQuery({ queryKey: ['vireo', 'requests'], queryFn: getRequests, enabled: !isAdminMember });
  const rfqsQuery = useQuery({ queryKey: ['vireo', 'rfqs'], queryFn: getRfqs, enabled: !isAdminMember });
  const awardsQuery = useQuery({ queryKey: ['vireo', 'awards'], queryFn: getAwards, enabled: !isAdminMember });
  const purchaseOrdersQuery = useQuery({ queryKey: ['vireo', 'purchase-orders'], queryFn: getPurchaseOrders, enabled: !isAdminMember });
  const workspaceKey = mvpWorkspaceKey();
  const poApprovalQuery = useQuery({
    queryKey: ['vireo', 'po-approval-controls', workspaceKey],
    queryFn: getPoApprovalSnapshot,
    enabled: !isAdminMember && statusQuery.data?.connected === true,
    staleTime: 15_000,
    refetchInterval: activeStep === 'PO' ? 15_000 : false,
    refetchOnWindowFocus: true,
  });
  const isReviewer = !isAdminMember && poApprovalQuery.data?.is_approver === true;
  const seenPendingReviewIds = useRef<Set<string> | null>(null);
  const notifiedPendingReviewIds = useRef(new Set<string>());
  useEffect(() => {
    if (!isReviewer || !poApprovalQuery.data) return;
    const currentIds = poApprovalQuery.data.pending_cases.map((item) => item.case_id);
    const seen = seenPendingReviewIds.current;
    seenPendingReviewIds.current = new Set(currentIds);
    if (seen) {
      for (const item of poApprovalQuery.data.pending_cases) {
        if (!seen.has(item.case_id)) {
          notifiedPendingReviewIds.current.add(item.case_id);
          notifyChimeReview(
            'A purchase-order quantity case is awaiting your review and approval.',
            `po-quantity-case:${item.case_id}`,
          );
        }
      }
    }
  }, [isReviewer, poApprovalQuery.data]);
  useEffect(() => {
    if (isReviewer && activeStep === 'Request') setActiveStep('RFQ');
  }, [isReviewer, activeStep]);
  const adminSetupQuery = useQuery({
    queryKey: ['vireo', 'workspace-admin-setup', workspaceKey],
    queryFn: getAdminSetupSnapshot,
    enabled: isAdminMember,
    staleTime: 30_000,
  });
  const adminItemsQuery = useQuery({
    queryKey: ['vireo', 'workspace-admin-items', workspaceKey],
    queryFn: getAdminWorkspaceItems,
    enabled: isAdminMember,
    staleTime: 30_000,
  });
  const adminSuppliersQuery = useQuery({
    queryKey: ['vireo', 'workspace-admin-suppliers', workspaceKey],
    queryFn: getAdminWorkspaceSuppliers,
    enabled: isAdminMember,
    staleTime: 30_000,
  });
  const adminSupplierItemsQuery = useQuery({
    queryKey: ['vireo', 'workspace-admin-supplier-items', workspaceKey],
    queryFn: getAdminWorkspaceSupplierItems,
    enabled: isAdminMember,
    staleTime: 30_000,
  });
  const adminAuditQuery = useQuery({
    queryKey: ['vireo', 'workspace-admin-audit', workspaceKey],
    queryFn: getAdminWorkspaceAudit,
    enabled: isAdminMember,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const reportsSourceQuery = useQuery({
    queryKey: ['vireo', 'reports-source', workspaceKey],
    queryFn: getReportsSourceData,
    staleTime: 60_000,
    enabled: !isAdminMember,
  });
  const reportAlertReviewsQuery = useQuery({
    queryKey: ['vireo', 'report-alert-reviews', workspaceKey],
    queryFn: getReportAlertReviews,
    enabled: !isAdminMember && statusQuery.data?.connected === true,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const reportSnapshotQuery = useQuery({
    queryKey: ['vireo', 'reports-payment-snapshot', workspaceKey],
    queryFn: getMvpSnapshot,
    staleTime: 60_000,
    enabled: !isAdminMember,
  });
  const quotesQuery = useQuery({
    queryKey: ['vireo', 'quotes', selectedRfqId],
    queryFn: () => getQuotes(selectedRfqId),
    enabled: !isAdminMember && Boolean(selectedRfqId),
  });
  const rankingQuery = useQuery({
    queryKey: ['vireo', 'ranking', selectedRfqId],
    queryFn: () => getRanking(selectedRfqId),
    enabled: !isAdminMember && Boolean(selectedRfqId),
  });
  useEffect(() => {
    const failing = [
      statusQuery, requestsQuery, rfqsQuery, awardsQuery, purchaseOrdersQuery,
      poApprovalQuery, adminSetupQuery, adminItemsQuery, reportsSourceQuery,
      reportAlertReviewsQuery, reportSnapshotQuery, quotesQuery, rankingQuery,
    ].find((query) => query.isError);
    if (failing?.isError) {
      const error = failing.error;
      showChimeBlocker(error instanceof Error ? error.message : 'A workspace record could not be loaded.');
    }
  }, [
    statusQuery.error, requestsQuery.error, rfqsQuery.error, awardsQuery.error,
    purchaseOrdersQuery.error, poApprovalQuery.error, adminSetupQuery.error,
    adminItemsQuery.error, reportsSourceQuery.error, reportAlertReviewsQuery.error,
    reportSnapshotQuery.error, quotesQuery.error, rankingQuery.error,
  ]);

  const selectedRfq = rfqsQuery.data?.find((rfq) => rfq.id === selectedRfqId);
  const selectedRequest = requestsQuery.data?.find((request) => request.id === selectedRequestId);
  const selectedAward = awardsQuery.data?.find((award) => award.id === selectedAwardId);
  const bestMatch = rankingQuery.data?.find((row) => row.rank === 1);
  const reportsBundle = useMemo(
    () => buildReportsBundle(
      reportsSourceQuery.data || {
        requests: [],
        rfqs: [],
        quotes: [],
        awards: [],
        purchase_orders: [],
      },
      reportSnapshotQuery.data || null,
    ),
    [reportsSourceQuery.data, reportSnapshotQuery.data],
  );
  const connected = statusQuery.data?.connected === true;
  const reviewedAlertIds = useMemo(
    () => new Set((reportAlertReviewsQuery.data || []).map((review) => review.alert_id)),
    [reportAlertReviewsQuery.data],
  );
  const unreviewedReportAlerts = useMemo(
    () => reportsBundle.alerts.filter((alert) => !reviewedAlertIds.has(alert.id)),
    [reportsBundle.alerts, reviewedAlertIds],
  );
  const refreshAll = () => {
    if (workspaceRefreshActive) return;
    workspaceRefreshRequestsComplete.current = false;
    setWorkspaceRefreshActive(true);
    void Promise.allSettled([
      statusQuery.refetch(), requestsQuery.refetch(), rfqsQuery.refetch(),
      awardsQuery.refetch(), purchaseOrdersQuery.refetch(),
      reportsSourceQuery.refetch(), reportSnapshotQuery.refetch(),
      connected ? reportAlertReviewsQuery.refetch() : Promise.resolve(),
      activeStep === 'PO' ? poApprovalQuery.refetch() : Promise.resolve(),
      selectedRfqId ? quotesQuery.refetch() : Promise.resolve(),
      selectedRfqId ? rankingQuery.refetch() : Promise.resolve(),
    ]).then(() => {
      workspaceRefreshRequestsComplete.current = true;
    });
  };
  const finishWorkspaceRefreshRotation = () => {
    if (!workspaceRefreshRequestsComplete.current) return;
    workspaceRefreshRequestsComplete.current = false;
    setWorkspaceRefreshActive(false);
  };
  const invalidate = async (...keys: string[][]) => {
    await Promise.all([
      ...keys,
      ['vireo', 'reports-source', workspaceKey],
      ['vireo', 'reports-payment-snapshot', workspaceKey],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };
  const reviewReportAlertMutation = useMutation({
    mutationFn: (alert: AnalyticsAlert) => reviewReportAlert(alert),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['vireo', 'report-alert-reviews', workspaceKey],
      });
    },
  });
  const openReports = (area: ReportArea = activeStep) => {
    setReportsInitialArea(area);
    setReportsOpen(true);
  };
  const closeReports = () => {
    setReportsOpen(false);
    setReportsInitialArea(undefined);
  };
  const toggleBatchRfqRequest = (requestId: string) => {
    setBatchRfqRequestIds((current) =>
      current.includes(requestId)
        ? current.filter((id) => id !== requestId)
        : [...current, requestId],
    );
  };

  const createRequestMutation = useMutation({
    mutationFn: createRequest,
    onSuccess: async (result) => {
      setNotice({ tone: 'success', text: `${result.status}: ${result.message}` });
      setSelectedRequestId(result.request.id);
      const unresolvedFields = [
        !result.request.item && 'Item',
        !result.request.item_code && 'Item code',
        !result.request.qty && 'Quantity',
        !result.request.site && 'Delivery site',
        !result.request.spec && 'Specification',
        !result.request.needed_by && 'Needed-by date',
      ].filter((field): field is string => Boolean(field));
      if (result.status !== 'Ready for RFQ') {
        showChimeBlocker(unresolvedFields.length
          ? `Request saved for clarification. Review all fields Vireo could not confidently extract: ${unresolvedFields.join(', ')}.`
          : `Request saved for clarification. Extraction confidence is ${Math.round(result.confidence * 100)}%; compare all extracted details with the original request before creating an RFQ.`);
      }
      await invalidate(['vireo', 'requests']);
    },
    onError: (error) => {
      setNotice({ tone: 'error', text: error.message });
    },
  });
  const returnMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => returnRequest(id, reason),
    onSuccess: async (result) => {
      setNotice({ tone: 'success', text: `Request ${result.request.id} returned to its requestor.` });
      await invalidate(['vireo', 'requests']);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const createRfqMutation = useMutation({
    mutationFn: createRfq,
    onSuccess: async (rfq) => {
      setSelectedRfqId(rfq.id);
      setBatchRfqRequestIds((current) => current.filter((id) => id !== rfq.request_id));
      setNotice({
        tone: 'success',
        text: `${rfq.rfq_code} created as a draft RFQ${rfq.batch_number ? ` · Batch ${rfq.batch_number}` : ''}.`,
      });
      await invalidate(['vireo', 'rfqs'], ['vireo', 'requests']);
      setActiveStep('RFQ');
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const createRfqBatchMutation = useMutation({
    mutationFn: async (requestIds: string[]) => {
      setRfqBatchProgress({ completed: 0, total: requestIds.length });
      try {
        return { requestIds, ...(await createRfqBatch(requestIds)) };
      } finally {
        setRfqBatchProgress({ completed: requestIds.length, total: requestIds.length });
      }
    },
    onSuccess: async (result) => {
      const successful = [...result.created, ...result.existing];
      const createdRequestIds = new Set(successful.map((rfq) => rfq.request_id));
      setBatchRfqRequestIds((current) => current.filter((id) => !createdRequestIds.has(id)));
      await invalidate(['vireo', 'rfqs'], ['vireo', 'requests']);

      if (successful.length > 0) {
        setSelectedRfqId(successful[0].id);
        setActiveStep('RFQ');
      }

      if (result.failures.length > 0) {
        const failedNames = result.failures.map(({ request_id: requestId }) => {
          const item = requestsQuery.data?.find((request) => request.id === requestId)?.item;
          return item?.trim() || requestId;
        });
        const failedSummary = failedNames.slice(0, 3).join(', ');
        const moreFailures = failedNames.length > 3 ? `, and ${failedNames.length - 3} more` : '';
        const failureReasons = [...new Set(result.failures.map(({ reason }) => reason || 'Database error'))];
        const reasonSummary = failureReasons.length ? ` Reason: ${failureReasons.join(', ')}.` : '';
        const errorReferences = [...new Set(
          result.failures
            .map(({ batch_number }) => batch_number)
            .filter((reference): reference is string => Boolean(reference)),
        )];
        const referenceSummary = errorReferences.length
          ? ` Error reference${errorReferences.length > 1 ? 's' : ''}: ${errorReferences.join(', ')}.`
          : '';
        setNotice({
          tone: 'error',
          text: `${result.created.length} RFQs created. Could not create: ${failedSummary}${moreFailures}.${reasonSummary}${referenceSummary} Failed requests remain selected to retry.${result.batch_number ? ` RFQ batch ${result.batch_number}.` : ''}`,
        });
      } else if (successful.length > 0) {
        setNotice({
          tone: 'success',
          text: `${successful.length} RFQs are in batch ${result.batch_number || 'created'}. Step 2 is open to review them.`,
        });
      }
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
    onSettled: () => setRfqBatchProgress(undefined),
  });
  const sendRfqMutation = useMutation({
    mutationFn: sendRfq,
    onSuccess: async (rfq) => {
      setNotice({ tone: 'success', text: `${rfq.rfq_code} is now open in Vireo. No supplier email was sent.` });
      await invalidate(['vireo', 'rfqs']);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const createQuoteMutation = useMutation({
    mutationFn: createQuote,
    onSuccess: async (result) => {
      setNotice({ tone: 'success', text: `${result.status}: ${result.message}` });
      await invalidate(['vireo', 'quotes', selectedRfqId], ['vireo', 'ranking', selectedRfqId]);
      setSupplierName('');
      setQuoteText('');
      setReviewedTotal('');
      setReviewedDelivery('');
      setQualityFitStatus('unreviewed');
      setComplianceStatus('unreviewed');
      setReviewEvidence('');
      setEditingQuoteId('');
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const updateQuoteAssessmentMutation = useMutation({
    mutationFn: updateQuoteAssessment,
    onSuccess: async () => {
      setNotice({ tone: 'success', text: 'Quality fit and compliance review saved to the quote record.' });
      await invalidate(['vireo', 'quotes', selectedRfqId], ['vireo', 'ranking', selectedRfqId]);
      setSupplierName('');
      setQuoteText('');
      setReviewedTotal('');
      setReviewedDelivery('');
      setEditingQuoteId('');
      setQualityFitStatus('unreviewed');
      setComplianceStatus('unreviewed');
      setReviewEvidence('');
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const awardMutation = useMutation({
    mutationFn: createAward,
    onSuccess: async (award) => {
      setSelectedAwardId(award.id);
      setNotice({ tone: 'success', text: `${award.award_code} recorded for ${award.supplier_name}.` });
      await invalidate(['vireo', 'awards'], ['vireo', 'rfqs']);
      setActiveStep('PO');
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const createPoMutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: async (po) => {
      setNotice({ tone: 'success', text: `${po.po_code} created as a draft purchase order.` });
      await invalidate(['vireo', 'purchase-orders'], ['vireo', 'po-approval-controls', workspaceKey]);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const confirmPoMutation = useMutation({
    mutationFn: confirmPurchaseOrder,
    onSuccess: async (po) => {
      setNotice({ tone: 'success', text: `${po.po_code} is marked Sent in Vireo. Email remains a manual step.` });
      await invalidate(['vireo', 'purchase-orders'], ['vireo', 'po-approval-controls', workspaceKey]);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const managePoApproverMutation = useMutation({
    mutationFn: managePoApprover,
    onSuccess: async (_snapshot, variables) => {
      setNotice({
        tone: 'success',
        text: variables.assign ? 'Designated PO approver added.' : 'Designated PO approver removed.',
      });
      await invalidate(['vireo', 'po-approval-controls', workspaceKey], ['vireo', 'workspace-admin-setup', workspaceKey], ['vireo', 'workspace-admin-audit', workspaceKey]);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const workspaceMemberRoleMutation = useMutation({
    mutationFn: assignWorkspaceMemberRole,
    onSuccess: async (_snapshot, variables) => {
      setNotice({
        tone: 'success',
        text: `${variables.role === 'maker' ? 'Maker' : 'Reviewer/Approver'} role saved for the selected workspace member.`,
      });
      await invalidate(
        ['vireo', 'workspace-admin-setup', workspaceKey],
        ['vireo', 'po-approval-controls', workspaceKey],
        ['vireo', 'workspace-admin-audit', workspaceKey],
      );
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const setPoQuantityBaselineMutation = useMutation({
    mutationFn: setPoQuantityBaseline,
    onSuccess: async (_snapshot, variables) => {
      setNotice({
        tone: 'success',
        text: `Usual quantity saved for ${variables.item_name}. Existing held orders were rechecked.`,
      });
      await invalidate(['vireo', 'po-approval-controls', workspaceKey], ['vireo', 'purchase-orders'], ['vireo', 'workspace-admin-setup', workspaceKey], ['vireo', 'workspace-admin-items', workspaceKey], ['vireo', 'workspace-admin-audit', workspaceKey]);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const importWorkspaceCatalogItemsMutation = useMutation({
    mutationFn: importWorkspaceCatalogItems,
    onSuccess: async (result) => {
      setNotice({ tone: 'success', text: `${result.imported_count} catalog item${result.imported_count === 1 ? '' : 's'} enrolled. Generated codes are shown in the saved item list.` });
      await invalidate(['vireo', 'workspace-admin-items', workspaceKey], ['vireo', 'workspace-admin-setup', workspaceKey], ['vireo', 'po-approval-controls', workspaceKey], ['vireo', 'workspace-admin-audit', workspaceKey]);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const importWorkspaceSuppliersMutation = useMutation({
    mutationFn: importWorkspaceSuppliers,
    onSuccess: async (result) => {
      setNotice({ tone: 'success', text: `${result.imported_count} supplier${result.imported_count === 1 ? '' : 's'} enrolled.` });
      await invalidate(['vireo', 'workspace-admin-suppliers', workspaceKey], ['vireo', 'workspace-admin-audit', workspaceKey]);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const importWorkspaceSupplierItemsMutation = useMutation({
    mutationFn: importWorkspaceSupplierItems,
    onSuccess: async (result) => {
      setNotice({ tone: 'success', text: `${result.imported_count} supplier item${result.imported_count === 1 ? '' : 's'} enrolled.` });
      await invalidate(['vireo', 'workspace-admin-supplier-items', workspaceKey], ['vireo', 'workspace-admin-items', workspaceKey], ['vireo', 'workspace-admin-audit', workspaceKey]);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const linkWorkspaceSupplierItemMutation = useMutation({
    mutationFn: linkWorkspaceSupplierItem,
    onSuccess: async () => {
      setNotice({ tone: 'success', text: 'Supplier item link saved.' });
      await invalidate(['vireo', 'workspace-admin-supplier-items', workspaceKey], ['vireo', 'workspace-admin-audit', workspaceKey]);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const seedDemoCatalogMutation = useMutation({
    mutationFn: seedDemoCatalog,
    onSuccess: async (result) => {
      setNotice({
        tone: 'success',
        text: `Demo catalog ready: ${result.suppliers.length} suppliers and ${result.items.length} items in this Demo workspace only.`,
      });
      await invalidate(
        ['vireo', 'workspace-admin-suppliers', workspaceKey],
        ['vireo', 'workspace-admin-items', workspaceKey],
        ['vireo', 'workspace-admin-supplier-items', workspaceKey],
        ['vireo', 'workspace-admin-setup', workspaceKey],
        ['vireo', 'po-approval-controls', workspaceKey],
        ['vireo', 'workspace-admin-audit', workspaceKey],
      );
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const archiveBaselineMutation = useMutation({
    mutationFn: archivePoQuantityBaseline,
    onSuccess: async (_snapshot, variables) => {
      setNotice({ tone: 'success', text: `Usual quantity archived for ${variables.item_name}. It can be restored later.` });
      await invalidate(['vireo', 'workspace-admin-setup', workspaceKey], ['vireo', 'po-approval-controls', workspaceKey], ['vireo', 'workspace-admin-audit', workspaceKey]);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const restoreBaselineMutation = useMutation({
    mutationFn: restorePoQuantityBaseline,
    onSuccess: async (_snapshot, variables) => {
      setNotice({ tone: 'success', text: `Usual quantity restored for ${variables.item_name}.` });
      await invalidate(['vireo', 'workspace-admin-setup', workspaceKey], ['vireo', 'po-approval-controls', workspaceKey], ['vireo', 'workspace-admin-audit', workspaceKey]);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });
  const approvePoQuantityMutation = useMutation({
    mutationFn: ({ poId, caseId }: { poId: string; caseId: string }) =>
      approvePoQuantityCase(poId, caseId),
    onSuccess: async (po, variables) => {
      setNotice({ tone: 'success', text: `${po.po_code} passed quantity review. It remains a Draft until the buyer sends it.` });
      if (notifiedPendingReviewIds.current.has(variables.caseId)) {
        notifyChimeApproval(
          `${po.po_code} has completed the approval step for its quantity review.`,
          `po-quantity-case:${variables.caseId}`,
        );
      }
      await invalidate(['vireo', 'purchase-orders'], ['vireo', 'po-approval-controls', workspaceKey]);
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  });

  const [requestText, setRequestText] = useState('');
  const [requestItemCode, setRequestItemCode] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [quoteText, setQuoteText] = useState('');
  const [reviewedTotal, setReviewedTotal] = useState('');
  const [reviewedDelivery, setReviewedDelivery] = useState('');
  const [qualityFitStatus, setQualityFitStatus] = useState<NonNullable<QuoteRecord['quality_fit_status']>>('unreviewed');
  const [complianceStatus, setComplianceStatus] = useState<NonNullable<QuoteRecord['compliance_status']>>('unreviewed');
  const [reviewEvidence, setReviewEvidence] = useState('');
  const [editingQuoteId, setEditingQuoteId] = useState('');
  const [returnEmail, setReturnEmail] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [awardConfirmed, setAwardConfirmed] = useState(false);
  const [validation, setValidationState] = useState('');
  const setValidation = (message: string) => {
    setValidationState(message);
    if (message) showChimeBlocker(message);
  };

  const chooseRfq = (id: string) => {
    setSelectedRfqId(id);
    setSelectedAwardId('');
    setAwardConfirmed(false);
    setTermsAccepted(false);
    setSupplierName('');
    setQuoteText('');
    setReviewedTotal('');
    setReviewedDelivery('');
    setQualityFitStatus('unreviewed');
    setComplianceStatus('unreviewed');
    setReviewEvidence('');
    setEditingQuoteId('');
    setValidation('');
  };

  const existingRfqForRequest = useMemo(
    () => selectedRequest ? rfqsQuery.data?.find((rfq) => rfq.request_id === selectedRequest.id) : undefined,
    [selectedRequest, rfqsQuery.data],
  );
  const matchingAward = awardsQuery.data?.find((award) => award.rfq_id === selectedRfqId);
  const latestPo = purchaseOrdersQuery.data?.find((po) => po.award_id === (selectedAward?.id || matchingAward?.id));

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidation('');
    const issues: string[] = [];
    if (requestText.trim().length < 12) issues.push('Original request: add enough detail to understand what is needed');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestEmail.trim())) issues.push('Requester email: enter a valid email');
    if (!requestItemCode.trim()) issues.push('Item code: enter the enrolled code or include “Item Code: …” in the pasted email');
    if (issues.length) {
      const message = `Before creating the request, fix all detected issues: ${issues.join('; ')}.`;
      setValidation(message);
      return;
    }
    createRequestMutation.mutate({ raw_text: requestText.trim(), requester_email: requestEmail.trim(), item_code: requestItemCode.trim() });
  };

  useEffect(() => {
    const match = requestText.match(/^\s*(?:item\s*code|product\s*code|sku)\s*[:#]\s*([A-Z0-9][A-Z0-9._-]{0,63})\s*$/im);
    if (match) setRequestItemCode(match[1]);
  }, [requestText]);

  const importSpreadsheetRow = async (payload: SpreadsheetRequestPayload) => {
    const result = await createSpreadsheetRequest(payload);
    setNotice({ tone: 'success', text: `Spreadsheet row added as a request: ${result.request.item || 'item'}.` });
    setSelectedRequestId(result.request.id);
    await invalidate(['vireo', 'requests']);
    return result.request;
  };

  const submitReturn = (event: FormEvent<HTMLFormElement>, request: RequestRecord) => {
    event.preventDefault();
    if (!returnReason) return setValidation('Choose the reason to return this request.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(returnEmail.trim())) return setValidation('Enter the requestor email for the follow-up.');
    const subject = encodeURIComponent(`More information needed: ${request.item || 'procurement request'}`);
    const body = encodeURIComponent(`Hello,\n\nWe need a little more information before we can move this request forward.\n\nReason: ${returnReason}\nRequest reference: ${request.id}\n\nPlease reply with the missing details.\n`);
    window.open(`mailto:${encodeURIComponent(returnEmail.trim())}?subject=${subject}&body=${body}`, '_blank', 'noopener,noreferrer');
    returnMutation.mutate({ id: request.id, reason: returnReason });
  };

  const currentIndex = steps.indexOf(activeStep);
  const recommendationEmphasis = (activeStep === 'Ranking' || activeStep === 'Award')
    && Boolean(selectedRfq)
    && rankingQuery.isSuccess && !rankingQuery.isFetching
    && Boolean(rankingQuery.data?.length)
    && rankingQuery.data!.every((quote) => quote.rfq_id === selectedRfqId);
  const activeId = selectedRfq?.rfq_code || selectedRequest?.id || (selectedAward?.award_code || '');
  const goNext = () => setActiveStep(steps[Math.min(currentIndex + 1, steps.length - 1)]);
  const reportErrorMessage = reportsSourceQuery.isError
    ? reportsSourceQuery.error instanceof Error
      ? reportsSourceQuery.error.message
      : 'Workspace report data could not be loaded. Refresh and try again.'
    : undefined;
  const reportPartialWarning = reportSnapshotQuery.isError
    ? 'Receiving, invoice, payment, and matched-invoice cost details are temporarily unavailable. Other workspace reports can still be viewed.'
    : undefined;
  const retryWorkspaceAccess = async () => {
    if (statusQuery.data?.connected !== true) {
      const statusResult = await statusQuery.refetch();
      if (statusResult.data?.connected !== true) return;
    }
    await poApprovalQuery.refetch();
  };

  if (isAdminMember && adminSetupQuery.isPending) {
    return <WorkspacePreparingShell />;
  }

  if (isAdminMember) {
    const setup = adminSetupQuery.data;
    return <AdminMemberWorkspace
      workspaceName={setup?.workspace_name || 'Workspace administration'}
      members={setup?.members || []}
      approvers={setup?.approvers || []}
      baselines={setup?.baselines || []}
      catalogItems={adminItemsQuery.data?.items || []}
      suppliers={adminSuppliersQuery.data?.suppliers || []}
      supplierDirectoryReady={adminSuppliersQuery.isSuccess}
      supplierItems={adminSupplierItemsQuery.data?.supplier_items || []}
      auditEvents={adminAuditQuery.data?.events || []}
      supplierItemDirectoryReady={adminSupplierItemsQuery.isSuccess}
      auditReady={adminAuditQuery.isSuccess}
      archivedBaselines={setup?.archived_baselines || []}
      memberRoleAssignmentReady={setup?.member_role_assignment_ready === true}
      baselineArchiveReady={Array.isArray(setup?.archived_baselines)}
      loading={adminSetupQuery.isPending}
      error={adminSetupQuery.isError ? adminSetupQuery.error.message : false}
      retry={() => void adminSetupQuery.refetch()}
      onManageApprover={(userId, assign) => managePoApproverMutation.mutateAsync({ user_id: userId, assign })}
      onManageWorkspaceRole={(payload) => workspaceMemberRoleMutation.mutateAsync(payload)}
      onSetBaseline={(itemName, usualQty, itemCode) => setPoQuantityBaselineMutation.mutateAsync({ item_name: itemName, item_code: itemCode, usual_qty: usualQty })}
      onImportCatalogItems={(items: WorkspaceCatalogItemEnrollmentDraft[]) => importWorkspaceCatalogItemsMutation.mutateAsync(items)}
      onImportSuppliers={(rows: Array<{supplier_code?: string; supplier_name: string; category: string}>) => importWorkspaceSuppliersMutation.mutateAsync(rows)}
      onImportSupplierItems={(rows: Array<{supplier_code: string; supplier_item_code: string; supplier_item_name: string; item_code?: string}>) => importWorkspaceSupplierItemsMutation.mutateAsync(rows)}
      onLinkSupplierItem={(payload: {supplier_code: string; supplier_item_code: string; item_code: string | null}) => linkWorkspaceSupplierItemMutation.mutateAsync(payload)}
      onSeedDemoCatalog={() => seedDemoCatalogMutation.mutateAsync()}
      onArchiveBaseline={(itemName) => archiveBaselineMutation.mutateAsync({ item_name: itemName })}
      onRestoreBaseline={(itemName) => restoreBaselineMutation.mutateAsync({ item_name: itemName })}
      chimeNotice={chimeNotice}
      onCloseChime={closeChimeNotice}
      managingApprovers={managePoApproverMutation.isPending}
      managingWorkspaceRole={workspaceMemberRoleMutation.isPending}
      settingBaseline={setPoQuantityBaselineMutation.isPending}
      importingCatalogItems={importWorkspaceCatalogItemsMutation.isPending}
      importingSuppliers={importWorkspaceSuppliersMutation.isPending}
      importingSupplierItems={importWorkspaceSupplierItemsMutation.isPending}
      linkingSupplierItem={linkWorkspaceSupplierItemMutation.isPending}
      seedingDemoCatalog={seedDemoCatalogMutation.isPending}
      archivingBaseline={archiveBaselineMutation.isPending}
      restoringBaseline={restoreBaselineMutation.isPending}
    />;
  }

  if (statusQuery.isPending || (statusQuery.data?.connected === true && poApprovalQuery.isPending)) {
    return <WorkspacePreparingShell />;
  }
  if (statusQuery.isError || statusQuery.data?.connected !== true || poApprovalQuery.isError) {
    const accessFailureMessage = statusQuery.isError || statusQuery.data?.connected !== true
      ? statusQuery.data?.message || 'Vireo could not confirm the connection to this workspace.'
      : poApprovalQuery.error instanceof Error
        && poApprovalQuery.error.message.includes('Step 5 quantity-approval migration')
        ? 'The Step 5 approval migration is not available in this workspace yet.'
        : 'Vireo connected, but could not verify Reviewer/Approver access and Step 5 controls. Confirm the active workspace and approver assignment.';
    return <div className="vireo-shell min-h-[100dvh] text-[#F1EFFA]"><main className="workflow-main">
      <div className="state-box state-error" role="alert">
        <strong>Workspace access could not be verified.</strong>
        <span>{accessFailureMessage} Procurement records and actions remain paused until the check succeeds.</span>
        <button type="button" className="button button-secondary" onClick={() => { void retryWorkspaceAccess(); }}>Retry access check</button>
      </div>
    </main></div>;
  }

  return (
    <div className="vireo-shell min-h-[100dvh] text-[#F1EFFA]" data-combo={recommendationEmphasis ? 'combo2' : 'combo1'}>
      {reportsOpen ? <ReportsHub
        activeStage={activeStep}
        initialArea={reportsInitialArea}
        bundle={reportsBundle}
        isLoading={reportsSourceQuery.isPending || reportSnapshotQuery.isPending}
        errorMessage={reportErrorMessage}
        partialWarning={reportPartialWarning}
        alertReviews={reportAlertReviewsQuery.data || []}
        alertReviewsLoading={reportAlertReviewsQuery.isPending}
        alertReviewsError={reportAlertReviewsQuery.isError
          ? reportAlertReviewsQuery.error instanceof Error
            ? reportAlertReviewsQuery.error.message
            : 'Saved Analytics review history could not be loaded. Refresh and try again.'
          : undefined}
        pendingReviewAlertId={reviewReportAlertMutation.isPending
          ? reviewReportAlertMutation.variables?.id
          : undefined}
        reviewMutationError={reviewReportAlertMutation.isError
          ? reviewReportAlertMutation.error instanceof Error
            ? reviewReportAlertMutation.error.message
            : 'The alert could not be marked reviewed. Refresh and try again.'
          : undefined}
        onMarkAlertReviewed={(alert) => reviewReportAlertMutation.mutate(alert)}
        refreshedAt={reportsSourceQuery.data ? new Date(reportsBundle.generatedAt).toLocaleString() : undefined}
        onRefresh={() => { void Promise.all([
          reportsSourceQuery.refetch(),
          reportSnapshotQuery.refetch(),
          reportAlertReviewsQuery.refetch(),
        ]); }}
        onClose={closeReports}
      /> : <>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><img className="brand-symbol" src="/logo.svg" alt="" aria-hidden="true" /></div>
          <div><div className="brand-name">Vireo<span>Intelligence</span></div><div className="brand-caption">Procurement workspace</div></div>
        </div>
        <div className="topbar-meta">
          <span className={cx('connection-dot', connected ? 'is-connected' : '')} />
          <span>{statusQuery.isPending ? 'Connecting' : statusQuery.isError ? 'Service unavailable' : connected && statusQuery.data?.schemaReady === false ? 'Setup incomplete' : connected ? 'Workspace connected' : 'Workspace ready'}</span>
          <button type="button" className="button button-secondary reports-access-button" onClick={() => openReports()} data-testid="button-open-reports">
            <BarChart3 size={15} /> Reports
          </button>
          <button
            type="button"
            className="icon-button top-refresh"
            aria-label={workspaceRefreshActive ? 'Refreshing workspace data' : 'Refresh workspace data'}
            aria-busy={workspaceRefreshActive}
            data-testid="button-refresh-workspace"
            disabled={workspaceRefreshActive}
            onClick={refreshAll}
          >
            <RefreshCw
              size={15}
              className={cx('top-refresh-icon', workspaceRefreshActive && 'is-spinning')}
              onAnimationIteration={finishWorkspaceRefreshRotation}
              aria-hidden="true"
            />
          </button>
        </div>
      </header>

      <main className="workflow-main">
        <div className="page-heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-mark" /> Procurement / Guided workflow</p>
            <h1>Smart from Request<br className="mobile-break" /> to <em>Payment</em></h1>
            <p className="heading-copy">Keep every purchase decision connected from request through payment reconciliation, with a clear action at each stage.</p>
          </div>
          <div className="review-note"><ShieldCheck size={17} /><span>Human review at every<br />important checkpoint</span></div>
        </div>

        {!isAdminMember && <ChimeDemoProfile />}

        {connected && statusQuery.data?.schemaReady === false && <div role="alert" className="notice-bar notice-warning">
          <span className="notice-icon"><CircleHelp size={16} /></span>
          <span>
            {statusQuery.data.missingBatchMetadata
              ? 'Request and RFQ records are readable, but batch numbering and journey audit are unavailable until the pending migration is applied.'
              : 'Supabase is reachable, but the workflow schema needs attention.'}
            {statusQuery.data.missingTables?.length ? ` Missing tables: ${statusQuery.data.missingTables.join(', ')}.` : ''}
            {statusQuery.data.inaccessibleTables?.length ? ` Check access policies for: ${statusQuery.data.inaccessibleTables.join(', ')}.` : ''}
            {!statusQuery.data.missingBatchMetadata && ' Apply the Vireo setup SQL before using quotes, awards, and purchase orders.'}
          </span>
        </div>}

        {notice && <div role="status" className={cx('notice-bar', notice.tone === 'error' ? 'notice-error' : 'notice-success')}><span className="notice-icon">{notice.tone === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}</span><span>{notice.text}</span><button type="button" aria-label="Dismiss message" data-testid="button-dismiss-notice" onClick={() => setNotice(undefined)}><X size={15} /></button></div>}
        {(reportAlertReviewsQuery.isSuccess || reportAlertReviewsQuery.isError)
          && unreviewedReportAlerts.length > 0 && <div role="status" className="notice-bar notice-warning" data-testid="notice-significant-report-changes">
          <span className="notice-icon"><AlertCircle size={16} /></span>
          <span>{unreviewedReportAlerts.length} significant procurement {unreviewedReportAlerts.length === 1 ? 'change needs' : 'changes need'} review.</span>
          <button type="button" className="button button-secondary" onClick={() => openReports('Analytics')} data-testid="button-review-report-alerts">Review reports</button>
        </div>}

        {isReviewer && <div className="notice-bar notice-success" role="status">
          <span className="notice-icon"><ShieldCheck size={16} /></span>
          <span>Reviewer/Approver-Member · review and approval actions only. Step 01 is reserved for Maker-members.</span>
        </div>}
        <nav className="workflow-phase-nav" aria-label="Procurement phases">
          {workflowPhases.map((phase, phaseIndex) => {
            const isCurrentPhase = phase.steps.includes(activeStep);
            const phaseLocked = isReviewer && phase.steps.every((step) => step === 'Request');
            const phaseStart = phase.steps.find((step) => !(isReviewer && step === 'Request')) ?? phase.steps[0];
            return <section key={phase.name} className={cx('workflow-phase-card', isCurrentPhase && 'phase-current', phaseLocked && 'phase-locked')} aria-label={`${phase.name} phase`}>
              <button
                type="button"
                className="workflow-phase-heading"
                data-testid={`phase-${phase.name.toLowerCase().replaceAll(' ', '-')}`}
                aria-current={isCurrentPhase ? 'step' : undefined}
                disabled={phaseLocked}
                title={phaseLocked ? 'Request intake is available to Maker-members only' : undefined}
                onClick={() => { setActiveStep(phaseStart); setNotice(undefined); }}
              >
                <span className="workflow-phase-number">{String(phaseIndex + 1).padStart(2, '0')} / 04</span>
                {isCurrentPhase && <span className="workflow-phase-current">Current phase</span>}
                <strong>{phase.name}</strong>
                <span className="workflow-phase-detail">{phase.detail}</span>
              </button>
              <div className="workflow-phase-steps" aria-label={`${phase.name} steps`}>
                {phase.steps.map((step) => {
                  const stepIndex = steps.indexOf(step);
                  const isActive = activeStep === step;
                  const makerOnly = isReviewer && step === 'Request';
                  return <button
                    type="button"
                    key={step}
                    data-testid={`step-${step.toLowerCase()}`}
                    className={cx('workflow-phase-step', isActive && 'step-active', makerOnly && 'step-locked')}
                    aria-current={isActive ? 'step' : undefined}
                    aria-disabled={makerOnly || undefined}
                    disabled={makerOnly}
                    title={makerOnly ? 'Step 01 is available to Maker-members only' : undefined}
                    onClick={() => { if (makerOnly) return; setActiveStep(step); setNotice(undefined); }}
                  >
                    <span className="step-index">{String(stepIndex + 1).padStart(2, '0')}</span>
                    <span>{step}</span>
                    {makerOnly && <span className="step-role-label">Maker only</span>}
                  </button>;
                })}
              </div>
            </section>;
          })}
        </nav>

        <div className="workflow-context">
          <div className="context-label"><span className="context-pulse" /> CURRENT WORK</div>
          <span className="context-value">{activeId || 'No item selected'}</span>
          <span className="context-divider" />
          <span className="context-help">Changes are saved as you move through the workflow.</span>
        </div>

        {activeStep === 'Request' && !isReviewer && <RequestStep
          requests={requestsQuery.data || []}
          query={requestsQuery}
          rfqs={rfqsQuery.data || []}
          selectedId={selectedRequestId}
          setSelectedId={setSelectedRequestId}
          batchSelectedIds={batchRfqRequestIds}
          rfqCreationAvailable={!isAdminMember && statusQuery.data?.batchNumberingReady === true && statusQuery.data?.journeyAuditReady === true}
          canCreateRequests={!isAdminMember}
          onToggleBatchRequest={toggleBatchRfqRequest}
          onSetBatchRequests={setBatchRfqRequestIds}
          onCreateBatchRfqs={(ids) => createRfqBatchMutation.mutate(ids)}
          batchCreating={createRfqBatchMutation.isPending}
          batchProgress={rfqBatchProgress}
          requestText={requestText}
          setRequestText={setRequestText}
          requestItemCode={requestItemCode}
          setRequestItemCode={setRequestItemCode}
          requestEmail={requestEmail}
          setRequestEmail={setRequestEmail}
          onRequestBlocker={showChimeBlocker}
          onSubmit={submitRequest}
          creating={createRequestMutation.isPending}
          onCreateRfq={(id) => createRfqMutation.mutate(id)}
          creatingRfq={createRfqMutation.isPending}
          existingRfq={existingRfqForRequest}
          returnEmail={returnEmail}
          setReturnEmail={setReturnEmail}
          returnReason={returnReason}
          setReturnReason={setReturnReason}
          onReturn={(event, request) => submitReturn(event, request)}
          returning={returnMutation.isPending}
          validation={validation}
          setValidation={setValidation}
          onImportSpreadsheetRow={importSpreadsheetRow}
          onContinue={() => { if (existingRfqForRequest && selectedRequest) createRfqMutation.mutate(selectedRequest.id); }}
        />}
        {activeStep === 'RFQ' && <RfqStep
          rfqs={rfqsQuery.data || []}
          query={rfqsQuery}
          selectedId={selectedRfqId}
           setSelectedId={chooseRfq}
          requests={requestsQuery.data || []}
          onOpen={(id) => sendRfqMutation.mutate(id)}
          opening={sendRfqMutation.isPending}
          reviewerMode={isReviewer}
          onContinue={() => setActiveStep('Ranking')}
        />}
        {activeStep === 'Ranking' && <RankingStep
          rfq={selectedRfq}
          rfqs={rfqsQuery.data || []}
           setSelectedRfq={chooseRfq}
          ranking={rankingQuery.data || []}
          rankingQuery={rankingQuery}
          quotes={quotesQuery.data || []}
          quotesQuery={quotesQuery}
          supplierName={supplierName}
          setSupplierName={setSupplierName}
          quoteText={quoteText}
          setQuoteText={setQuoteText}
           reviewedTotal={reviewedTotal}
           setReviewedTotal={setReviewedTotal}
           reviewedDelivery={reviewedDelivery}
           setReviewedDelivery={setReviewedDelivery}
           qualityFitStatus={qualityFitStatus}
           setQualityFitStatus={setQualityFitStatus}
           complianceStatus={complianceStatus}
           setComplianceStatus={setComplianceStatus}
           reviewEvidence={reviewEvidence}
           setReviewEvidence={setReviewEvidence}
           editingQuoteId={editingQuoteId}
           setEditingQuoteId={setEditingQuoteId}
           quoteQualityReviewReady={statusQuery.data?.quoteQualityReviewReady !== false}
           onReview={(quote) => {
             setSupplierName(quote.supplier_name);
             setQuoteText(quote.quote_text || '');
             setReviewedTotal(quote.price == null ? '' : String(quote.price));
             setReviewedDelivery(quote.delivery_days == null ? '' : String(quote.delivery_days));
             setQualityFitStatus(quote.quality_fit_status || 'unreviewed');
             setComplianceStatus(quote.compliance_status || 'unreviewed');
             setReviewEvidence(quote.review_evidence || '');
             setEditingQuoteId('');
             setValidation('');
             document.getElementById('reviewed-total')?.focus();
           }}
           onReviewAssessment={(quote) => {
             setSupplierName(quote.supplier_name);
             setQuoteText(quote.quote_text || '');
             setReviewedTotal(quote.price == null ? '' : String(quote.price));
             setReviewedDelivery(quote.delivery_days == null ? '' : String(quote.delivery_days));
             setQualityFitStatus(quote.quality_fit_status || 'unreviewed');
             setComplianceStatus(quote.compliance_status || 'unreviewed');
             setReviewEvidence(quote.review_evidence || '');
             setEditingQuoteId(quote.id);
             setValidation('');
             document.getElementById('quality-fit-status')?.focus();
           }}
           onReviewCancel={() => {
             setEditingQuoteId('');
             setSupplierName('');
             setQuoteText('');
             setReviewedTotal('');
             setReviewedDelivery('');
             setQualityFitStatus('unreviewed');
             setComplianceStatus('unreviewed');
             setReviewEvidence('');
             setValidation('');
           }}
           onSubmit={(event) => {
             event.preventDefault();
             setValidation('');
             const bothUnreviewed = qualityFitStatus === 'unreviewed' && complianceStatus === 'unreviewed';
             if ((qualityFitStatus === 'unreviewed') !== (complianceStatus === 'unreviewed')) {
               return setValidation('Review both quality fit and compliance together, or leave both unreviewed.');
             }
             if (editingQuoteId && bothUnreviewed) return setValidation('Choose both review results before saving this assessment.');
             if (!bothUnreviewed && !reviewEvidence.trim()) return setValidation('Add a brief evidence note for the quality and compliance review.');
             if (bothUnreviewed && reviewEvidence.trim()) return setValidation('Clear the evidence note or complete both review selections.');
             if (reviewEvidence.trim().length > 1000) return setValidation('Keep the evidence note to 1,000 characters or fewer.');
             if (editingQuoteId) {
               updateQuoteAssessmentMutation.mutate({
                 quote_id: editingQuoteId,
                 quality_fit_status: qualityFitStatus as Exclude<NonNullable<QuoteRecord['quality_fit_status']>, 'unreviewed'>,
                 compliance_status: complianceStatus as Exclude<NonNullable<QuoteRecord['compliance_status']>, 'unreviewed'>,
                 review_evidence: reviewEvidence.trim(),
               });
               return;
             }
              if (!selectedRfqId || !supplierName.trim() || !quoteText.trim()) return setValidation('Add a supplier name and quote text.');
              const rfqQuantity = selectedRfq?.qty;
              if (typeof rfqQuantity !== 'number' || !Number.isInteger(rfqQuantity) || rfqQuantity <= 0) {
                return setValidation('The selected RFQ needs a positive whole-number quantity before adding quotes.');
              }
              if (!reviewedTotal.trim()) return setValidation('Price is required.');
              const total = Number(reviewedTotal);
             const days = reviewedDelivery.trim() ? Number(reviewedDelivery) : undefined;
              if (!Number.isFinite(total) || total <= 0) return setValidation('Price must be a positive PHP amount.');
             if (days !== undefined && (!Number.isInteger(days) || days <= 0)) return setValidation('Reviewed delivery must be a positive whole number of days.');
             createQuoteMutation.mutate({
               rfq_id: selectedRfqId,
               supplier_name: supplierName.trim(),
               quote_text: quoteText.trim(),
               price_total: total,
               delivery_days: days,
               quality_fit_status: qualityFitStatus,
               compliance_status: complianceStatus,
               review_evidence: reviewEvidence.trim(),
             });
           }}
          creating={createQuoteMutation.isPending || updateQuoteAssessmentMutation.isPending}
           reviewerMode={isReviewer}
          validation={validation}
          setValidation={setValidation}
          onContinue={() => setActiveStep('Award')}
        />}
        {activeStep === 'Award' && <AwardStep
           key={selectedRfqId}
          rfq={selectedRfq}
          rfqs={rfqsQuery.data || []}
           setSelectedRfq={chooseRfq}
          ranking={rankingQuery.data || []}
          rankingQuery={rankingQuery}
          awards={awardsQuery.data || []}
          awardsQuery={awardsQuery}
          bestMatch={bestMatch}
          confirmed={awardConfirmed}
          setConfirmed={setAwardConfirmed}
           onAward={(quoteId) => selectedRfqId && awardMutation.mutate({ rfq_id: selectedRfqId, quote_id: quoteId })}
          creating={awardMutation.isPending}
          existingAward={matchingAward}
           reviewerMode={isReviewer}
           onContinue={() => {
             if (matchingAward?.quote_id) awardMutation.mutate({ rfq_id: matchingAward.rfq_id, quote_id: matchingAward.quote_id });
             else setNotice({ tone: 'error', text: 'This legacy award has no source quote reference. Reconcile it before continuing.' });
           }}
        />}
        {activeStep === 'PO' && <PurchaseOrderStep
          awards={awardsQuery.data || []}
          awardsQuery={awardsQuery}
          selectedAwardId={selectedAwardId}
          setSelectedAwardId={setSelectedAwardId}
          orders={purchaseOrdersQuery.data || []}
          ordersQuery={purchaseOrdersQuery}
          selectedAward={selectedAward || matchingAward}
          requests={requestsQuery.data || []}
          rfqs={rfqsQuery.data || []}
          termsAccepted={termsAccepted}
          setTermsAccepted={setTermsAccepted}
          onCreate={() => { const award = selectedAward || matchingAward; if (award) createPoMutation.mutate({ award_id: award.id, terms_accepted: true }); }}
          creating={createPoMutation.isPending}
          onConfirm={(po) => confirmPoMutation.mutate(po.id)}
          confirming={confirmPoMutation.isPending}
          activePo={latestPo}
           approvalSnapshot={poApprovalQuery.data}
           approvalPending={poApprovalQuery.isPending}
           approvalError={poApprovalQuery.isError}
           retryApproval={() => void poApprovalQuery.refetch()}
           approvalReady={poApprovalQuery.isSuccess && poApprovalQuery.data?.schema_ready === true}
           onManageApprover={(user_id, assign) => managePoApproverMutation.mutate({ user_id, assign })}
           managingApprovers={managePoApproverMutation.isPending}
            onSetBaseline={(item_name, usual_qty) => setPoQuantityBaselineMutation.mutateAsync({ item_name, usual_qty })}
            settingBaseline={setPoQuantityBaselineMutation.isPending}
           onApproveCase={(poId, caseId) => approvePoQuantityMutation.mutate({ poId, caseId })}
           approvingCaseId={approvePoQuantityMutation.variables?.caseId}
           approvingCase={approvePoQuantityMutation.isPending}
          onBulkApprove={async (cases) => {
            const results = await Promise.allSettled(cases.map((entry) => approvePoQuantityCase(entry.po_id, entry.case_id)));
            await invalidate(['vireo', 'purchase-orders'], ['vireo', 'po-approval-controls', workspaceKey]);
            const succeeded = results.filter((result) => result.status === 'fulfilled').length;
            const failed = results.length - succeeded;
            setNotice({ tone: failed ? 'error' : 'success', text: `${succeeded} of ${results.length} selected PO quantity approvals completed.${failed ? ` ${failed} case${failed === 1 ? '' : 's'} failed and remain held.` : ' Every approved PO remains Draft until manually sent.'}` });
          }}
          onMarkReviewed={async (caseIds) => {
            await markPoQuantityCasesReviewed({ case_ids: caseIds });
            await invalidate(['vireo', 'po-approval-controls', workspaceKey]);
          }}
          onRequestClarification={async (caseIds) => {
            await preparePoQuantityClarificationDraft({ case_ids: caseIds });
            await invalidate(['vireo', 'po-approval-controls', workspaceKey]);
          }}
          onRecordClarificationResponse={async (caseId, response) => {
            await recordPoQuantityClarificationResponse({ case_id: caseId, response });
            await invalidate(['vireo', 'po-approval-controls', workspaceKey]);
          }}
           onReturnQuantityCase={async (caseId, reason) => {
             await returnPoQuantityCaseToMaker({ case_id: caseId, reason });
             await invalidate(['vireo', 'po-approval-controls', workspaceKey]);
           }}
           onSubmitMakerExplanation={async (caseId, explanation) => {
             const result = await submitMakerQuantityExplanation({ case_id: caseId, explanation });
             await invalidate(
               ['vireo', 'requests'],
               ['vireo', 'rfqs'],
               ['vireo', 'awards'],
               ['vireo', 'purchase-orders'],
               ['vireo', 'po-approval-controls', workspaceKey],
             );
             setNotice({ tone: 'success', text: `Explanation sent for review. The item now has its own Batch ${result.returned_item_batch_number || 'assigned'}; the existing quote and award are preserved while its PO awaits review.` });
           }}
           onCreateQuantityCorrection={async (caseId, correctedQty, reason) => {
             const result = await createPoQuantityCorrectionRequest({ case_id: caseId, corrected_qty: correctedQty, reason });
             await invalidate(
               ['vireo', 'requests'],
               ['vireo', 'rfqs'],
               ['vireo', 'po-approval-controls', workspaceKey],
             );
             setNotice({ tone: 'success', text: `Corrected request created as RFQ Batch ${result.batch_number}. Only the old PO for this item remains held; unaffected original-batch items can continue.` });
             setSelectedRfqId(result.rfq_id);
             setActiveStep('RFQ');
             return result.request_id;
           }}
           reviewerMode={isReviewer}
        />}
        {activeStep === 'Receiving' && <div className="space-y-5">
          <RequestToPaymentWorkspace phase="receiving" reviewerMode={isReviewer} />
          {!isReviewer && <details className="rtp-details">
            <summary>Set up sites, receiving profiles and reviewers</summary>
            <div className="mt-5"><Step6Workspace /></div>
          </details>}
        </div>}
        {activeStep === 'Invoice' && <RequestToPaymentWorkspace phase="invoice" reviewerMode={isReviewer} />}
        {activeStep === 'Payment' && <RequestToPaymentWorkspace phase="payment" reviewerMode={isReviewer} />}
      </main>
      <ChimeBlockerDialog
        kind={chimeNotice?.kind}
        phase={chimeNotice?.phase}
        message={chimeNotice?.message || ''}
        eventId={chimeNotice?.event_id || ''}
        role={isAdminMember ? 'admin-member' : isReviewer ? 'reviewer-approver' : 'maker'}
        onClose={closeChimeNotice}
      />
      <footer className="app-footer"><span>VireoIntelligence</span><span>Careful decisions. Clear records.</span><ChimeAuditTrail /><span className="footer-status"><span /> Signed-in workspace</span></footer>
      </>}
    </div>
  );
}

function StepHeading({ number, title, description, right }: { number: string; title: string; description: string; right?: ReactNode }) {
  return <div className="section-heading"><div><p className="section-kicker">{number} / {title.toUpperCase()}</p><h2>{title}</h2><p>{description}</p></div>{right}</div>;
}

function Panel({ children, className = '', id, tabIndex, 'data-testid': testId }: { children: ReactNode; className?: string; id?: string; tabIndex?: number; 'data-testid'?: string }) {
  return <section className={`panel ${className}`} id={id} tabIndex={tabIndex} data-testid={testId}>{children}</section>;
}

function QueryState({ pending, error, retry, label }: { pending: boolean; error: boolean; retry: () => void; label: string }) {
  if (pending) return <div className="state-skeleton" aria-label={`Loading ${label}`}><div /><div /><div /></div>;
  if (error) return <div className="state-box state-error"><AlertCircle size={20} /><strong>{label} could not be loaded.</strong><button type="button" onClick={retry} className="button button-secondary" data-testid={`button-retry-${label.toLowerCase().replace(/\s/g, '-')}`}><RefreshCw size={14} /> Retry</button></div>;
  return null;
}

function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{description}</p></div>;
}

function RequestStep(props: {
  requests: RequestRecord[]; query: ReturnType<typeof useQuery<RequestRecord[]>>; rfqs: RfqRecord[]; selectedId: string; setSelectedId: (id: string) => void;
  batchSelectedIds: string[]; rfqCreationAvailable: boolean; canCreateRequests: boolean; onToggleBatchRequest: (id: string) => void; onSetBatchRequests: (ids: string[]) => void;
  onCreateBatchRfqs: (ids: string[]) => void; batchCreating: boolean; batchProgress?: { completed: number; total: number };
  requestText: string; setRequestText: (value: string) => void; requestItemCode: string; setRequestItemCode: (value: string) => void; requestEmail: string; setRequestEmail: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  creating: boolean; onCreateRfq: (id: string) => void; creatingRfq: boolean; existingRfq?: RfqRecord; returnEmail: string; setReturnEmail: (value: string) => void;
  returnReason: string; setReturnReason: (value: string) => void; onReturn: (event: FormEvent<HTMLFormElement>, request: RequestRecord) => void; returning: boolean; validation: string; setValidation: (value: string) => void; onContinue: () => void;
  onImportSpreadsheetRow: (payload: SpreadsheetRequestPayload) => Promise<RequestRecord>;
  onRequestBlocker: (message: string) => void;
}) {
  const selected = props.requests.find((request) => request.id === props.selectedId);
  const existingRequestIds = new Set(props.rfqs.map((rfq) => rfq.request_id));
  const batchEligibleRequests = props.requests.filter(
    (request) => isReadyRequest(request) && !existingRequestIds.has(request.id),
  );
  const batchEligibleIds = batchEligibleRequests.map((request) => request.id);
  const selectedBatchIds = batchEligibleIds.filter((id) => props.batchSelectedIds.includes(id));
  const allBatchRequestsSelected = batchEligibleIds.length > 0 && selectedBatchIds.length === batchEligibleIds.length;
  const returnOptions = ['missing qty/site/date', 'not English', 'spec unclear'];
  return <section className="step-content animate-rise-in">
    <StepHeading number="01" title="Request intake" description="Start with the request as it arrived. Review what the system understood before creating an RFQ." right={<span className="human-chip"><UserRound size={14} /> Human reviewed</span>} />
    <div className="request-grid">
      {props.canCreateRequests ? <Panel className="intake-panel">
        <div className="panel-title-row"><div><span className="micro-label">NEW INTAKE</span><h3>Bring in a request</h3></div><span className="outline-icon"><Inbox size={17} /></span></div>
        <form noValidate onSubmit={props.onSubmit}>
          <label className="field-label" htmlFor="request-text">Original request <span>English only</span></label>
          <textarea id="request-text" data-testid="input-request-text" className="field textarea" aria-invalid={props.validation.toLowerCase().includes('original request')} value={props.requestText} onChange={(e) => { props.setRequestText(e.target.value); props.setValidation(''); }} placeholder="Paste the request email or describe what your team needs…" rows={7} />
          <label className="field-label" htmlFor="request-item-code">Item code <span>Required</span></label>
          <input id="request-item-code" data-testid="input-request-item-code" className="field" aria-invalid={props.validation.toLowerCase().includes('item code')} value={props.requestItemCode} onChange={(e) => { props.setRequestItemCode(e.target.value.toUpperCase()); props.setValidation(''); }} placeholder="e.g. VIR-000123" autoCapitalize="characters" maxLength={64} />
          <p className="input-hint">The request email should include a line like “Item Code: VIR-000123”. Vireo checks the code against this workspace’s enrolled items.</p>
          <label className="field-label" htmlFor="request-email">Requestor email</label>
          <input id="request-email" data-testid="input-request-email" type="email" className="field" aria-invalid={props.validation.toLowerCase().includes('requester email')} value={props.requestEmail} onChange={(e) => { props.setRequestEmail(e.target.value); props.setValidation(''); }} placeholder="name@company.com" />
          {props.validation && <p className="form-error" role="alert"><AlertCircle size={14} />{props.validation}</p>}
          <button type="submit" data-testid="button-submit-request" disabled={props.creating} className="button button-primary full-width">{props.creating ? <RefreshCw size={15} className="spin" /> : <Plus size={16} />}{props.creating ? 'Reading request…' : 'Create request'}<ArrowRight size={15} className="button-tail" /></button>
        </form>
        <SpreadsheetRequestImport requesterEmail={props.requestEmail} onImport={props.onImportSpreadsheetRow} onBlocker={props.onRequestBlocker} />
        <div className="privacy-note"><ShieldCheck size={15} /> Workspace-scoped Supabase data is available only to invited members.</div>
      </Panel> : <Panel className="intake-panel" data-testid="admin-member-request-restriction">
        <div className="panel-title-row"><div><span className="micro-label">ADMIN-MEMBER ACCESS</span><h3>Request intake is Maker-only</h3></div><span className="outline-icon"><ShieldCheck size={17} /></span></div>
        <p className="muted-copy">Admin-Members manage workspace access and onboarding. A Maker-member must create or import requests.</p>
      </Panel>}
      <Panel className="request-list-panel">
        <div className="panel-title-row"><div><span className="micro-label">INCOMING QUEUE</span><h3>Requests to review <span className="count-badge">{props.requests.length}</span></h3></div><span className="tiny-note">Most recent first</span></div>
        {batchEligibleRequests.length > 0 && <div className="request-batch-toolbar">
          <div className="request-batch-summary">
            <strong>{batchEligibleRequests.length} ready without an RFQ</strong>
            <button type="button" className="request-batch-select-all" onClick={() => props.onSetBatchRequests(allBatchRequestsSelected ? [] : batchEligibleIds)} disabled={!props.rfqCreationAvailable || props.batchCreating || props.creatingRfq}>
              {allBatchRequestsSelected ? 'Clear selection' : 'Select all ready'}
            </button>
          </div>
          {selectedBatchIds.length > 0 && <div className="request-batch-action">
            <span>{selectedBatchIds.length} selected · one RFQ per request</span>
            <button
              type="button"
              className="button button-secondary"
              data-testid="button-create-batch-rfqs"
              disabled={!props.rfqCreationAvailable || props.batchCreating || props.creatingRfq}
              aria-busy={props.batchCreating}
              onClick={() => props.onCreateBatchRfqs(selectedBatchIds)}
            >
              {props.batchCreating && props.batchProgress
                ? `Creating ${props.batchProgress.completed} of ${props.batchProgress.total}…`
                : `Create ${selectedBatchIds.length} separate RFQs`}
              <ArrowRight size={15} />
            </button>
          </div>}
        </div>}
        {props.query.isPending || props.query.isError ? <QueryState pending={props.query.isPending} error={props.query.isError} retry={() => void props.query.refetch()} label="Requests" /> :
          props.requests.length === 0 ? <EmptyState icon={<Inbox size={20} />} title="The intake queue is clear" description="New requests appear here for review before they become RFQs." /> :
          <div className="request-list">{props.requests.map((request) => {
            const ready = isReadyRequest(request);
            const existing = props.rfqs.find((rfq) => rfq.request_id === request.id);
            const canBatch = ready && !existing;
            const active = props.selectedId === request.id;
            return <div key={request.id} className={cx('request-row', active && 'request-row-active')} data-testid={`request-row-${request.id}`}>
              <input
                type="checkbox"
                className="request-batch-checkbox"
                data-testid={`batch-select-request-${request.id}`}
                aria-label={`Select ${request.item || 'request'} for RFQ creation`}
                checked={canBatch && selectedBatchIds.includes(request.id)}
                disabled={!canBatch || !props.rfqCreationAvailable || props.batchCreating || props.creatingRfq}
                onChange={() => props.onToggleBatchRequest(request.id)}
              />
              <button type="button" className="request-row-select" onClick={() => { props.setSelectedId(request.id); props.setReturnEmail(request.requester_email || ''); props.setReturnReason(''); props.setValidation(''); }}>
                <span className={cx('request-indicator', ready ? 'indicator-ready' : 'indicator-return')} />
                <span className="request-row-main"><span className="request-row-title">{request.item || request.raw_text?.trim().slice(0, 68) || 'Untitled request'}</span><span className="request-row-sub">{request.qty ? `${request.qty} units` : 'Quantity missing'} <i /> {request.site || 'Site missing'} <i /> {request.needed_by ? `By ${shortDate(request.needed_by)}` : 'Date missing'}</span></span>
        <span className={cx('status-tag', ready ? 'status-ready' : existing ? 'status-complete' : 'status-return')}>{existing ? 'RFQ created' : ready ? 'Ready for RFQ' : 'Needs details'}</span>
                <ArrowRight size={15} className="row-arrow" />
              </button>
            </div>;
          })}</div>}
      </Panel>
    </div>
    {selected && <Panel className="review-panel">
      <div className="panel-title-row review-title"><div><span className="micro-label">REQUEST REVIEW · {selected.id}</span><h3>{selected.item || 'Request details'}</h3></div><span className={cx('status-tag', isReadyRequest(selected) ? 'status-ready' : 'status-return')}>{selected.status}</span></div>
        <div className="request-detail-grid">
          <Detail label="Item code" value={selected.item_code || 'Not linked'} />
        <Detail label="Quantity" value={selected.qty ? `${selected.qty}` : 'Missing'} />
        <Detail label="Delivery site" value={selected.site || 'Missing'} />
        <Detail label="Needed by" value={shortDate(selected.needed_by)} />
        <Detail label="Specification" value={selected.spec || 'Missing'} />
      </div>
      {selected.raw_text && <blockquote className="request-original">{selected.raw_text}</blockquote>}
      {props.existingRfq ? <div className="review-actions"><p className="inline-success"><CheckCircle2 size={16} /> RFQ {props.existingRfq.rfq_code} · Batch {props.existingRfq.batch_number || 'not assigned'}.</p><button type="button" className="button button-primary" data-testid="button-open-existing-rfq" onClick={props.onContinue}>Continue to RFQ<ArrowRight size={15} /></button></div> :
         isReadyRequest(selected) ? <div className="review-actions"><p className="inline-success"><BadgeCheck size={16} /> Complete request · Ready for RFQ</p><button type="button" data-testid="button-create-rfq" className="button button-primary" disabled={!props.rfqCreationAvailable || props.creatingRfq || props.batchCreating} onClick={() => props.onCreateRfq(selected.id)}>{props.creatingRfq ? 'Creating RFQ…' : 'Create RFQ'}<ArrowRight size={15} /></button></div> :
         !props.canCreateRequests ? <p className="muted-copy">Returning a request for correction is also a Maker-member action.</p> : <form className="return-form" onSubmit={(event) => props.onReturn(event, selected)}>
          <div className="return-heading"><div><span className="micro-label">RETURN TO REQUESTOR</span><p>English is required. Incomplete or unclear requests return for correction instead of moving forward.</p></div><ArrowDownRight size={19} /></div>
          <div className="return-fields">
            <div><label className="field-label" htmlFor="return-email">Requestor email</label><input id="return-email" data-testid="input-return-email" className="field" type="email" value={props.returnEmail || selected.requester_email || ''} onChange={(event) => props.setReturnEmail(event.target.value)} placeholder="name@company.com" /></div>
            <div><label className="field-label" htmlFor="return-reason">Reason for return</label><div className="select-wrap"><select id="return-reason" data-testid="select-return-reason" className="field" value={props.returnReason} onChange={(event) => props.setReturnReason(event.target.value)}><option value="">Choose a reason</option>{returnOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={15} /></div></div>
          </div>
          {props.validation && <p className="form-error" role="alert"><AlertCircle size={14} />{props.validation}</p>}
          <div className="review-actions"><span className="quiet-hint">Opens a prefilled email and records the return.</span><button type="submit" data-testid="button-return-request" className="button button-secondary" disabled={props.returning}>{props.returning ? 'Returning…' : 'Return to requestor'}<Mail size={15} /></button></div>
         </form>}
    </Panel>}
  </section>;
}

function rfqPickerLabel(rfq: RfqRecord): string {
  const title = rfq.title?.trim() || 'Untitled RFQ';
  return rfq.batch_number
    ? `Batch ${rfq.batch_number} · ${title}`
    : `${rfq.rfq_code} · ${title} · Batch not assigned`;
}

function RfqStep(props: { rfqs: RfqRecord[]; query: ReturnType<typeof useQuery<RfqRecord[]>>; selectedId: string; setSelectedId: (id: string) => void; requests: RequestRecord[]; onOpen: (id: string) => void; opening: boolean; onContinue: () => void; reviewerMode: boolean }) {
  const selected = props.rfqs.find((rfq) => rfq.id === props.selectedId);
  return <section className="step-content animate-rise-in">
    <StepHeading number="02" title="Build the RFQ" description="Check the request translated cleanly into a supplier-ready brief. Opening an RFQ changes its Vireo status only." />
    <div className="rfq-layout">
      <Panel className="rfq-list-panel"><div className="panel-title-row"><div><span className="micro-label">RFQ REGISTER</span><h3>Drafts &amp; open RFQs</h3></div><span className="count-badge">{props.rfqs.length}</span></div>
        {props.query.isPending || props.query.isError ? <QueryState pending={props.query.isPending} error={props.query.isError} retry={() => void props.query.refetch()} label="RFQs" /> :
          props.rfqs.length ? <div className="rfq-list">{props.rfqs.map((rfq) => <button type="button" key={rfq.id} data-testid={`rfq-row-${rfq.id}`} onClick={() => props.setSelectedId(rfq.id)} className={cx('rfq-row', props.selectedId === rfq.id && 'rfq-row-active')}><span className="rfq-code">{rfq.rfq_code}</span><span className="rfq-row-main"><strong>{rfq.title}</strong><small>{rfq.batch_number ? `Batch ${rfq.batch_number} · ` : ''}{rfq.qty || '—'} units · {rfq.site || 'Site pending'}</small></span><span className={cx('status-tag', isDraft(rfq.status) ? 'status-draft' : 'status-open')}>{rfq.status}</span></button>)}</div> :
          <EmptyState icon={<FileText size={20} />} title="No RFQs yet" description="Create an RFQ from a complete request in step 1." />}
      </Panel>
      <Panel className="rfq-brief-panel">
        {selected ? <>
           <div className="brief-top"><div><span className="micro-label">RFQ BRIEF</span><span className="rfq-large-code">{selected.rfq_code}</span><span className="rfq-batch-number">Batch {selected.batch_number || 'not assigned'}</span></div><span className={cx('status-tag', isDraft(selected.status) ? 'status-draft' : 'status-open')}>{selected.status}</span></div>
          <h3 className="brief-title">{selected.title}</h3>
          <div className="brief-spec">{selected.spec || 'No specification was attached to this request.'}</div>
          <div className="brief-facts"><Detail label="Quantity" value={selected.qty ? `${selected.qty} units` : 'Not specified'} /><Detail label="Delivery site" value={selected.site || 'Not specified'} /><Detail label="Needed by" value={shortDate(selected.needed_by)} /></div>
          <div className="supplier-section"><span className="micro-label">SUPPLIERS</span><div className="supplier-chips">{selected.suppliers?.length ? selected.suppliers.map((supplier) => <span key={supplier} className="supplier-chip">{supplier}</span>) : <span className="quiet-hint">Supplier list not attached</span>}</div></div>
          {isDraft(selected.status) && <div className="caution-note"><CircleHelp size={15} /><span>Open this RFQ in Vireo to continue. This does not send supplier email.</span></div>}
           <div className="brief-actions">{isDraft(selected.status) ? props.reviewerMode ? <p className="quiet-hint">Opening an RFQ is a Maker-member action. You can review the current brief.</p> : <button type="button" className="button button-primary" data-testid="button-open-rfq" disabled={props.opening} onClick={() => props.onOpen(selected.id)}>{props.opening ? 'Opening RFQ…' : 'Open RFQ'}<ArrowRight size={15} /></button> : <button type="button" className="button button-primary" data-testid="button-continue-ranking" onClick={props.onContinue}>Continue to ranking<ArrowRight size={15} /></button>}</div>
        </> : <EmptyState icon={<Layers3 size={20} />} title="Choose an RFQ" description="Select a draft or open RFQ to review its brief." />}
      </Panel>
    </div>
  </section>;
}

function RankingStep(props: {
  rfq?: RfqRecord; rfqs: RfqRecord[]; setSelectedRfq: (id: string) => void; ranking: RankingRecord[]; rankingQuery: ReturnType<typeof useQuery<RankingRecord[]>>; quotes: QuoteRecord[]; quotesQuery: ReturnType<typeof useQuery<QuoteRecord[]>>;
  supplierName: string; setSupplierName: (value: string) => void; quoteText: string; setQuoteText: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; creating: boolean; validation: string; setValidation: (value: string) => void; onContinue: () => void;
  reviewedTotal: string; setReviewedTotal: (value: string) => void; reviewedDelivery: string; setReviewedDelivery: (value: string) => void; onReview: (quote: QuoteRecord) => void;
  qualityFitStatus: NonNullable<QuoteRecord['quality_fit_status']>; setQualityFitStatus: (value: NonNullable<QuoteRecord['quality_fit_status']>) => void;
  complianceStatus: NonNullable<QuoteRecord['compliance_status']>; setComplianceStatus: (value: NonNullable<QuoteRecord['compliance_status']>) => void;
  reviewEvidence: string; setReviewEvidence: (value: string) => void; editingQuoteId: string; setEditingQuoteId: (value: string) => void;
  quoteQualityReviewReady: boolean; onReviewAssessment: (quote: QuoteRecord) => void;
  onReviewCancel: () => void;
  reviewerMode: boolean;
}) {
  const [textPreviewPending, setTextPreviewPending] = useState(false);
  const [textPreviewMessage, setTextPreviewMessage] = useState('');
  const [previewedText, setPreviewedText] = useState<{ rfqId: string; text: string } | null>(null);
  const suggestedValues = useRef<{
    rfqId: string;
    price?: string;
    delivery?: string;
  } | null>(null);
  const currentSupplierName = useRef(props.supplierName);
  currentSupplierName.current = props.supplierName;
  const automaticSupplierName = useRef('');
  const suggestSupplierName = (candidate?: string | null) => {
    if (!candidate || currentSupplierName.current.trim()) return false;
    currentSupplierName.current = candidate;
    automaticSupplierName.current = candidate;
    props.setSupplierName(candidate);
    return true;
  };
  const ranked = props.ranking.slice().sort((a, b) => a.rank - b.rank).slice(0, 5);
  const best = ranked.find((quote) => quote.rank === 1);
  const bestFitLabel = best?.quality_fit_status === 'meets'
    ? 'Meets specification'
    : best?.quality_fit_status === 'partial'
      ? 'Partially meets'
      : 'Review quality fit';
  const handleQuoteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    if (props.editingQuoteId) {
      props.onSubmit(event);
      return;
    }
    const currentRfq = props.rfq;
    if (!currentRfq) {
      event.preventDefault();
      return;
    }
    const trimmedText = props.quoteText.trim();
    const needsSuggestion = trimmedText
      && (!props.supplierName.trim() || !props.reviewedTotal.trim() || !props.reviewedDelivery.trim());
    const alreadyPreviewed = previewedText?.rfqId === currentRfq.id
      && previewedText.text === trimmedText;
    if (!needsSuggestion || alreadyPreviewed) {
      props.onSubmit(event);
      return;
    }

    event.preventDefault();
    props.setValidation('');
    setTextPreviewPending(true);
    setTextPreviewMessage('');
    try {
      const result = await previewQuoteText(currentRfq.id, trimmedText);
      const newSuggestions: { rfqId: string; price?: string; delivery?: string } = {
        rfqId: currentRfq.id,
      };
      const applied: string[] = [];
      if (suggestSupplierName(result.supplier_name)) {
        applied.push('supplier name');
      }
      if (!props.reviewedTotal.trim() && result.price_total !== null) {
        newSuggestions.price = String(result.price_total);
        props.setReviewedTotal(newSuggestions.price);
        applied.push('total price');
      }
      if (!props.reviewedDelivery.trim() && result.delivery_days !== null) {
        newSuggestions.delivery = String(result.delivery_days);
        props.setReviewedDelivery(newSuggestions.delivery);
        applied.push('delivery time');
      }
      suggestedValues.current = newSuggestions;
      setPreviewedText({ rfqId: currentRfq.id, text: trimmedText });
      setTextPreviewMessage(
        applied.length
          ? `${result.status}: suggested ${applied.join(' and ')} added. Check the values, then click “Add supplier quote” again to save.`
          : `${result.status}: no clear supplier name or missing quote values were found. Enter them manually, then click “Add supplier quote” again.`,
      );
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'The quote could not be read. Enter the values manually and try again.';
      setTextPreviewMessage(
        `${message} You can enter the values manually and try again.`,
      );
      notifyChimeBlocker(message);
    } finally {
      setTextPreviewPending(false);
    }
  };

  const handleQuoteTextChange = (value: string) => {
    const previousSuggestions = suggestedValues.current;
    if (automaticSupplierName.current && currentSupplierName.current === automaticSupplierName.current) {
      currentSupplierName.current = '';
      props.setSupplierName('');
    }
    automaticSupplierName.current = '';
    if (previousSuggestions && previousSuggestions.rfqId === props.rfq?.id) {
      if (previousSuggestions.price && props.reviewedTotal === previousSuggestions.price) {
        props.setReviewedTotal('');
      }
      if (previousSuggestions.delivery && props.reviewedDelivery === previousSuggestions.delivery) {
        props.setReviewedDelivery('');
      }
    }
    suggestedValues.current = null;
    setPreviewedText(null);
    setTextPreviewMessage('');
    props.setQuoteText(value);
    props.setValidation('');
  };
  const handleSupplierNameChange = (value: string) => {
    currentSupplierName.current = value;
    automaticSupplierName.current = '';
    props.setSupplierName(value);
  };
   return <section className="step-content animate-rise-in">
      <StepHeading number="03" title="Compare supplier quotes" description="Check each response against the RFQ. Price stays visible, but quality fit, compliance, and delivery determine the order." right={<span className="human-chip"><ClipboardCheck size={14} /> Buyer-reviewed criteria</span>} />
    <div className="rfq-select-line"><label htmlFor="ranking-rfq">Active RFQ</label><div className="select-wrap"><select id="ranking-rfq" className="field compact-field" data-testid="select-ranking-rfq" value={props.rfq?.id || ''} onChange={(event) => props.setSelectedRfq(event.target.value)}><option value="">Select an RFQ</option>{props.rfqs.map((rfq) => <option key={rfq.id} value={rfq.id}>{rfqPickerLabel(rfq)}</option>)}</select><ChevronDown size={15} /></div>{props.rfq && <span className="rfq-active-tag">{props.rfq.status}</span>}</div>
    {!props.rfq ? <Panel><EmptyState icon={<FileText size={20} />} title="Select an RFQ to begin" description="Choose a draft or open RFQ above, then add supplier quote text." /></Panel> :
    <div className="ranking-layout">
       {(!props.reviewerMode || Boolean(props.editingQuoteId)) && <Panel className="quote-entry">
          <div className="panel-title-row"><div><span className="micro-label">{props.reviewerMode ? 'BUYER REVIEW' : 'QUOTE INTAKE'}</span><h3>{props.reviewerMode ? 'Assess fit and compliance' : 'Add a supplier response'}</h3></div><span className="outline-icon"><Inbox size={17} /></span></div>
        {!props.quoteQualityReviewReady && <div role="alert" className="notice-bar notice-warning">Quote quality-review fields are not active yet. Apply the pending database migration before saving or awarding quotes.</div>}
         <form onSubmit={(event) => void handleQuoteSubmit(event)}>
           <div className="brief-facts"><Detail label="Required RFQ quantity" value={Number.isInteger(props.rfq.qty) && (props.rfq.qty || 0) > 0 ? `${props.rfq.qty} units` : 'Missing — update the request'} /></div>
            <label className="field-label" htmlFor="supplier-name">Supplier name</label><input id="supplier-name" data-testid="input-supplier-name" className="field" value={props.supplierName} disabled={props.reviewerMode} onChange={(event) => handleSupplierNameChange(event.target.value)} placeholder="Company name" />
           {!props.reviewerMode && <QuoteDocumentUpload rfqId={props.rfq.id} onPreview={(result) => {
            props.setQualityFitStatus('unreviewed');
            props.setComplianceStatus('unreviewed');
            props.setReviewEvidence('');
            props.setEditingQuoteId('');
             suggestSupplierName(result.supplier_name);
            if (result.quote_text.trim()) {
              props.setQuoteText(result.quote_text);
              props.setReviewedTotal(result.price_total === null ? '' : String(result.price_total));
              props.setReviewedDelivery(result.delivery_days === null ? '' : String(result.delivery_days));
            }
            props.setValidation('');
           }} />}
            <label className="field-label field-label-spaced" htmlFor="quote-text">Quote text for review</label><textarea id="quote-text" data-testid="input-quote-text" className="field textarea" rows={8} value={props.quoteText} disabled={props.reviewerMode} onChange={(event) => handleQuoteTextChange(event.target.value)} placeholder={'Paste the supplier’s full response, including price, delivery timing, and any terms…'} />
           {textPreviewMessage && <p className="input-hint" role="status">{textPreviewMessage}</p>}
           <p className="input-hint">Use an explicit PHP total, or PHP unit price with “each”. Ambiguous amounts stay out of ranking. To correct a manual-review quote, confirm its full total and delivery below and add a corrected version; the original is retained.</p>
            <label className="field-label" htmlFor="reviewed-total">Price for all units (PHP, required)</label>
              <FormattedNumberInput id="reviewed-total" data-testid="input-reviewed-total" className="field" min={0.01} step={0.01} value={props.reviewedTotal} disabled={props.reviewerMode} onValueChange={(value) => { props.setReviewedTotal(value); setPreviewedText(null); }} placeholder="Full order total, not price per unit" />
           <label className="field-label field-label-spaced" htmlFor="reviewed-delivery">Quoted delivery days <span>Required for ranking</span></label>
              <FormattedNumberInput id="reviewed-delivery" data-testid="input-reviewed-delivery" className="field" min={1} step={1} value={props.reviewedDelivery} disabled={props.reviewerMode} onValueChange={(value) => { props.setReviewedDelivery(value); setPreviewedText(null); }} placeholder="Whole number of days" />
          <div className="quote-assessment-grid">
            <div>
              <label className="field-label field-label-spaced" htmlFor="quality-fit-status">Quality fit</label>
              <div className="select-wrap">
                <select id="quality-fit-status" data-testid="select-quality-fit" className="field" value={props.qualityFitStatus} disabled={!props.quoteQualityReviewReady} onChange={(event) => { props.setQualityFitStatus(event.target.value as NonNullable<QuoteRecord['quality_fit_status']>); props.setValidation(''); }}>
                  <option value="unreviewed">Not reviewed</option>
                  <option value="meets">Meets the specification</option>
                  <option value="partial">Partially meets</option>
                  <option value="does_not_meet">Does not meet</option>
                </select>
                <ChevronDown size={15} />
              </div>
            </div>
            <div>
              <label className="field-label field-label-spaced" htmlFor="compliance-status">Compliance</label>
              <div className="select-wrap">
                <select id="compliance-status" data-testid="select-compliance" className="field" value={props.complianceStatus} disabled={!props.quoteQualityReviewReady} onChange={(event) => { props.setComplianceStatus(event.target.value as NonNullable<QuoteRecord['compliance_status']>); props.setValidation(''); }}>
                  <option value="unreviewed">Not reviewed</option>
                  <option value="verified">Buyer-verified evidence</option>
                  <option value="needs_review">Needs more review</option>
                  <option value="non_compliant">Does not meet requirements</option>
                </select>
                <ChevronDown size={15} />
              </div>
            </div>
          </div>
          <label className="field-label field-label-spaced" htmlFor="quote-review-evidence">Specification assessment <span>Required for an assessment</span></label>
          <textarea id="quote-review-evidence" data-testid="input-quote-review-evidence" className="field textarea" rows={3} maxLength={1000} value={props.reviewEvidence} disabled={!props.quoteQualityReviewReady} onChange={(event) => { props.setReviewEvidence(event.target.value); props.setValidation(''); }} placeholder="Name the requirement checked, cite supporting quote evidence, and note any gap." />
          <p className="input-hint">Only buyer-assessed specification fit and buyer-verified compliance can qualify a quote. Delivery is the supplier’s quoted lead time—not a history-based reliability score. Price stays visible for comparison, never rank.</p>
          {props.validation && <p className="form-error" role="alert"><AlertCircle size={14} />{props.validation}</p>}
          <div className="quote-form-actions">
            {props.editingQuoteId && <button type="button" className="button button-secondary" onClick={() => { props.setValidation(''); props.onReviewCancel(); }}>Cancel review</button>}
             <button type="submit" className="button button-primary full-width" data-testid="button-submit-quote" disabled={props.creating || textPreviewPending || !props.rfq || !props.quoteQualityReviewReady}>{textPreviewPending ? 'Reading quote…' : props.creating ? 'Saving quote…' : props.editingQuoteId ? 'Save quote review' : 'Add supplier quote'}<ArrowRight size={15} /></button>
          </div>
        </form>
       </Panel>}
      <div className="ranking-results">
        <Panel className="quotes-panel"><div className="panel-title-row"><div><span className="micro-label">RECEIVED</span><h3>Quote checks <span className="count-badge">{props.quotes.length}</span></h3></div></div>
          {props.quotesQuery.isPending || props.quotesQuery.isError ? <QueryState pending={props.quotesQuery.isPending} error={props.quotesQuery.isError} retry={() => void props.quotesQuery.refetch()} label="Quotes" /> : props.quotes.length === 0 ? <EmptyState icon={<FileText size={20} />} title="No supplier quotes yet" description="Add the first response using the quote intake form." /> :
           <div className="quote-check-list">{props.quotes.map((quote) => {
             const assessed = quote.quality_fit_status !== 'unreviewed' && quote.compliance_status !== 'unreviewed';
             const qualified = (quote.quality_fit_status === 'meets' || quote.quality_fit_status === 'partial') && quote.compliance_status === 'verified';
             const assessable = props.quoteQualityReviewReady && quote.status === 'Parsed';
             const complianceLabel = quote.compliance_status === 'verified'
               ? 'buyer verified'
               : quote.compliance_status?.replaceAll('_', ' ') || 'not reviewed';
             return <div key={quote.id} className="quote-check-row">
               <span className={cx('quote-icon', isManualReview(quote.status) || !qualified ? 'quote-icon-review' : 'quote-icon-ok')}>
                 {isManualReview(quote.status) || !qualified ? <CircleHelp size={15} /> : <Check size={15} />}
               </span>
               <div className="quote-check-main">
                 <strong>{quote.supplier_name}</strong>
                 <small>{quote.price != null ? `${fmtMoney(quote.price)} total` : 'Total not confirmed'} <i /> {quote.delivery_days ? `${quote.delivery_days} day delivery` : 'Delivery timing pending'}</small>
                 <small>Fit: {quote.quality_fit_status?.replaceAll('_', ' ') || 'not reviewed'} · Compliance: {complianceLabel}</small>
               </div>
               <div className="quote-check-actions">
                  {!props.reviewerMode && isManualReview(quote.status) && <button type="button" className="button button-secondary" onClick={() => props.onReview(quote)} data-testid={`review-quote-${quote.id}`}>Correct quote</button>}
                   {props.reviewerMode && assessable && <button type="button" className="button button-secondary" onClick={() => props.onReviewAssessment(quote)} data-testid={`assess-quote-${quote.id}`}>{assessed ? 'Edit assessment' : 'Review criteria'}</button>}
               </div>
             </div>;
           })}</div>}
        </Panel>
         <Panel className="ranking-panel"><div className="panel-title-row"><div><span className="micro-label">DECISION SUPPORT</span><h3>Quality-led ranking</h3></div><span className="rank-caption">Fit → compliance → delivery</span></div>
          {props.rankingQuery.isPending || props.rankingQuery.isError ? <QueryState pending={props.rankingQuery.isPending} error={props.rankingQuery.isError} retry={() => void props.rankingQuery.refetch()} label="Ranking" /> : ranked.length === 0 ? <EmptyState icon={<Sparkles size={19} />} title={props.quotes.length ? 'No award-ready quote yet' : 'No ranked quotes yet'} description={props.quotes.length ? 'Review specification fit and compliance evidence. Price alone will not create a recommendation.' : 'Add supplier quotes, then review their fit, compliance, and delivery evidence.'} /> :
          <>
             {best && <div className="best-match-banner"><span className="best-number">#1</span><div><small>BEST MATCH</small><strong>{best.supplier_name}</strong><small>{bestFitLabel} · buyer-verified compliance · {best.delivery_days} day lead time</small></div><span className="best-price">{fmtMoney(best.price)}</span></div>}
             <div className="ranking-table" role="table" aria-label="Supplier quote ranking"><div className="ranking-table-head" role="row"><span>Rank / Supplier</span><span>Total (PHP)</span><span>Delivery</span><span>Quote</span></div>
               {ranked.map((quote) => <div key={quote.id} role="row" className={cx('ranking-row', quote.rank === 1 && 'ranking-row-best')}>
                 <span className="rank-supplier"><b>{String(quote.rank).padStart(2, '0')}</b><span>{quote.supplier_name}<small>{quote.quality_fit_status === 'meets' ? 'Meets specification' : 'Partially meets'} · buyer-verified compliance</small></span></span>
                 <strong>{fmtMoney(quote.price)}</strong><span>{quote.delivery_days ? `${quote.delivery_days} days` : '—'}</span><span>{quote.id.slice(0, 8)}</span>
               </div>)}
            </div>
             <div className="ranking-bottom"><span><ShieldCheck size={15} /> Price is visible for comparison and does not determine rank. Buyer makes the award.</span>{best && <button type="button" className="button button-primary" data-testid="button-review-award" onClick={props.onContinue}>Review award<ArrowRight size={15} /></button>}</div>
          </>}
        </Panel>
      </div>
    </div>}
  </section>;
}

function AwardStep(props: {
  rfq?: RfqRecord; rfqs: RfqRecord[]; setSelectedRfq: (id: string) => void; ranking: RankingRecord[]; rankingQuery: ReturnType<typeof useQuery<RankingRecord[]>>; awards: AwardRecord[]; awardsQuery: ReturnType<typeof useQuery<AwardRecord[]>>;
   bestMatch?: RankingRecord; confirmed: boolean; setConfirmed: (value: boolean) => void; onAward: (quoteId: string) => void; creating: boolean; existingAward?: AwardRecord; onContinue: () => void; reviewerMode: boolean;
}) {
   const [selectedQuoteId, setSelectedQuoteId] = useState('');
   const selectedQuote = props.ranking.find((quote) => quote.id === selectedQuoteId);
  const bestMatch = props.ranking.find((row) => row.rank === 1) || props.bestMatch;
  const amber = Boolean(bestMatch);
  return <section className="step-content animate-rise-in">
    <StepHeading number="04" title="Confirm supplier award" description="The ranking is a recommendation. A person chooses the supplier and explicitly confirms the award." right={<span className="human-chip"><UserRound size={14} /> Decision belongs to you</span>} />
      <div className="rfq-select-line"><label htmlFor="award-rfq">RFQ to award</label><div className="select-wrap"><select id="award-rfq" className="field compact-field" data-testid="select-award-rfq" value={props.rfq?.id || ''} disabled={props.reviewerMode} onChange={(event) => { props.setSelectedRfq(event.target.value); props.setConfirmed(false); }}><option value="">Select an RFQ</option>{props.rfqs.map((rfq) => <option key={rfq.id} value={rfq.id}>{rfqPickerLabel(rfq)}</option>)}</select><ChevronDown size={15} /></div></div>
    {!props.rfq ? <Panel><EmptyState icon={<PackageCheck size={20} />} title="Choose an RFQ to review" description="Award is available once supplier quotes have been ranked." /></Panel> :
     props.existingAward ? <Panel className="award-success"><span className="success-emblem"><Check size={22} /></span><span className="micro-label">AWARD RECORDED</span><h3>{props.existingAward.award_code}</h3><p>{props.existingAward.supplier_name} · {fmtMoney(props.existingAward.price)} · {props.existingAward.qty} units</p>{!props.reviewerMode && <button type="button" onClick={props.onContinue} disabled={props.creating} data-testid="button-continue-po" className="button button-primary">Continue to purchase order<ArrowRight size={15} /></button>}</Panel> :
    <div className="award-layout">
      <Panel className="award-choice-panel"><div className="panel-title-row"><div><span className="micro-label">RANKED OPTIONS</span><h3>Select the supplier</h3></div><span className="count-badge">{props.ranking.length}</span></div>
         {props.rankingQuery.isPending || props.rankingQuery.isError ? <QueryState pending={props.rankingQuery.isPending} error={props.rankingQuery.isError} retry={() => void props.rankingQuery.refetch()} label="Ranking" /> : props.ranking.length === 0 ? <EmptyState icon={<Sparkles size={19} />} title="No eligible quotes" description="Review the quote’s specification fit, compliance evidence, total, and delivery in the Ranking step." /> :
          <div className="award-options">{props.ranking.slice().sort((a, b) => a.rank - b.rank).map((quote) => <button type="button" key={quote.id} data-testid={`award-option-${quote.id}`} disabled={props.reviewerMode} onClick={() => { setSelectedQuoteId(quote.id); props.setConfirmed(false); }} className={cx('award-option', selectedQuoteId === quote.id && 'award-option-active', quote.rank === 1 && 'award-option-best')}><span className="award-rank">#{quote.rank}</span><span className="award-supplier"><strong>{quote.supplier_name}</strong><small>{quote.delivery_days ? `${quote.delivery_days} day delivery` : 'Delivery pending'} · Quote {quote.id.slice(0, 8)}</small></span><strong className="award-option-price">{fmtMoney(quote.price)}</strong>{quote.rank === 1 && <span className="best-badge">BEST MATCH</span>}</button>)}</div>}
      </Panel>
       <Panel className={cx('award-confirm-panel', amber && selectedQuoteId === bestMatch?.id && 'award-confirm-amber')}>
        <span className="micro-label">HUMAN CONFIRMATION</span><h3>Make the decision explicit.</h3>
         {selectedQuote ? <div className="award-selected"><span className="outline-icon"><PackageCheck size={18} /></span><div><small>Selected quote {selectedQuote.id.slice(0, 8)}</small><strong>{selectedQuote.supplier_name}</strong><span>{fmtMoney(selectedQuote.price)} total · {selectedQuote.delivery_days} days</span><span>{bestMatch?.id === selectedQuoteId ? 'Ranked #1 · Best Match' : 'Alternative selected by your team'}</span></div></div> : <p className="muted-copy">Select one ranked quote to prepare the award record.</p>}
         {!props.reviewerMode && <><label className="check-row"><input type="checkbox" data-testid="checkbox-confirm-award" checked={props.confirmed} onChange={(event) => props.setConfirmed(event.target.checked)} disabled={!selectedQuote} /><span className="custom-check"><Check size={12} /></span><span>I have reviewed the quotes and approve this supplier award.</span></label>
          <button type="button" className={cx('button full-width', amber && selectedQuoteId === bestMatch?.id ? 'button-amber' : 'button-primary')} data-testid="button-confirm-award" onClick={() => selectedQuote && props.onAward(selectedQuote.id)} disabled={!selectedQuote || !props.confirmed || props.creating}>{props.creating ? 'Recording award…' : 'Confirm supplier award'}<ArrowRight size={15} /></button></>}
        <p className="fine-print">This creates an award record. It does not issue a purchase order.</p>
      </Panel>
    </div>}
  </section>;
}

function PurchaseOrderStep(props: {
  awards: AwardRecord[]; awardsQuery: ReturnType<typeof useQuery<AwardRecord[]>>; selectedAwardId: string; setSelectedAwardId: (id: string) => void; orders: PurchaseOrderRecord[]; ordersQuery: ReturnType<typeof useQuery<PurchaseOrderRecord[]>>;
  requests: RequestRecord[]; rfqs: RfqRecord[];
  selectedAward?: AwardRecord; termsAccepted: boolean; setTermsAccepted: (value: boolean) => void; onCreate: () => void; creating: boolean; onConfirm: (po: PurchaseOrderRecord) => void; confirming: boolean; activePo?: PurchaseOrderRecord;
  approvalSnapshot?: PoApprovalSnapshot; approvalPending: boolean; approvalError: boolean; retryApproval: () => void; approvalReady: boolean;
  onManageApprover: (userId: string, assign: boolean) => void; managingApprovers: boolean;
  onSetBaseline: (itemName: string, usualQty: number) => Promise<unknown>; settingBaseline: boolean;
  onApproveCase: (poId: string, caseId: string) => void; approvingCaseId?: string; approvingCase: boolean;
  onBulkApprove: (cases: PoQuantityApprovalCase[]) => Promise<void>;
  onMarkReviewed: (caseIds: string[]) => Promise<void>;
  onRequestClarification: (caseIds: string[]) => Promise<void>;
  onRecordClarificationResponse: (caseId: string, response: string) => Promise<void>;
  onReturnQuantityCase: (caseId: string, reason: string) => Promise<void>;
  onSubmitMakerExplanation: (caseId: string, explanation: string) => Promise<void>;
  onCreateQuantityCorrection: (caseId: string, correctedQty: number, reason: string) => Promise<string>;
  reviewerMode: boolean;
}) {
  const [focusReviewPoId, setFocusReviewPoId] = useState<string | null>(null);
  const selectedAward = props.selectedAward || props.awards.find((award) => award.id === props.selectedAwardId);
  const existingOrder = props.orders.find((po) => po.award_id === selectedAward?.id) || props.activePo;
  const pendingCases = props.approvalSnapshot?.pending_cases || [];
  const quantityHold = pendingCases.find((entry) => entry.po_id === existingOrder?.id);
  const approvedQuantityCase = props.approvalSnapshot?.approved_cases.find((entry) => entry.po_id === existingOrder?.id);
  const openPoReview = (poId: string) => {
    setFocusReviewPoId(poId);
    requestAnimationFrame(() => {
      const targetId = props.approvalReady ? 'po-batch-review' : 'po-approval-controls';
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target?.focus({ preventScroll: true });
    });
  };
  const openBaselineSetup = () => {
    const target = document.getElementById('po-baseline-admin');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.focus({ preventScroll: true });
  };
  return <section className="step-content animate-rise-in po-step">
    <StepHeading number="05" title="Prepare purchase order" description="Review the awarded terms, accept the standard conditions, then create a draft for final review." right={<span className="po-combo-chip"><PackageCheck size={14} /> Order desk</span>} />
    <PoApprovalPanel
      snapshot={props.approvalSnapshot}
      pending={props.approvalPending}
      error={props.approvalError}
      ready={props.approvalReady}
      retry={props.retryApproval}
      onManageApprover={props.onManageApprover}
      managingApprovers={props.managingApprovers}
      onSetBaseline={props.onSetBaseline}
      settingBaseline={props.settingBaseline}
      onApproveCase={props.onApproveCase}
      approvingCaseId={props.approvingCaseId}
      approvingCase={props.approvingCase}
      onBulkApprove={props.onBulkApprove}
      onMarkReviewed={props.onMarkReviewed}
      onRequestClarification={props.onRequestClarification}
      onRecordClarificationResponse={props.onRecordClarificationResponse}
    />
    {props.approvalReady && <BatchReviewPanel
      snapshot={props.approvalSnapshot}
      orders={props.orders}
      requests={props.requests}
      rfqs={props.rfqs}
      awards={props.awards}
      onMarkReviewed={props.onMarkReviewed}
      onRequestClarification={props.onRequestClarification}
      onRecordClarificationResponse={props.onRecordClarificationResponse}
      onReturnQuantityCase={props.onReturnQuantityCase}
      onSubmitMakerExplanation={props.onSubmitMakerExplanation}
      onCreateQuantityCorrection={props.onCreateQuantityCorrection}
       focusPoId={focusReviewPoId}
    />}
    {props.reviewerMode ? <Panel className="po-review-register">
      <span className="micro-label">PURCHASE ORDER REGISTER</span>
      <h3>Review and approval queue</h3>
      {props.orders.length === 0
        ? <p className="muted-copy">No purchase orders have been created yet.</p>
        : <div className="rfq-list">{props.orders.map((po) => {
          const heldCase = pendingCases.find((entry) => entry.po_id === po.id);
          const quantityApproved = props.approvalSnapshot?.approved_cases.some((entry) => entry.po_id === po.id);
          let nextStep = '';
          if (heldCase?.signal === 'baseline_missing') {
            nextStep = 'Waiting for the Admin-Member to set this item’s usual quantity.';
          } else if (heldCase?.requester_unverified) {
            nextStep = 'The requester must be verified before this held PO can be approved.';
          } else if (heldCase) {
            nextStep = 'A different designated Reviewer/Approver must review this PO.';
          } else if (isDraft(po.status) && quantityApproved) {
            nextStep = 'Quantity exception approved. The Maker-member must send this draft PO.';
          } else if (isDraft(po.status)) {
            nextStep = 'No quantity review is pending. The Maker-member sends this draft PO, then continues to Receiving.';
          } else {
            nextStep = `This PO is marked ${po.status}. The next workflow activity is Receiving.`;
          }
          return <div className="rfq-row po-review-register__row" key={po.id}>
            <span className="rfq-code">{po.po_code}</span>
            <span className="rfq-row-main">
              <strong>{po.supplier_name}</strong>
              <small>{po.qty} units · {fmtMoney(po.price_total)} · {po.status}</small>
              <small className="po-review-register__next">{nextStep}</small>
            </span>
            {heldCase?.can_approve && <button
              type="button"
              className="button button-secondary"
              onClick={() => openPoReview(po.id)}
            >Go to review</button>}
          </div>;
        })}</div>}
    </Panel> :
    props.awardsQuery.isPending || props.awardsQuery.isError ? <Panel><QueryState pending={props.awardsQuery.isPending} error={props.awardsQuery.isError} retry={() => void props.awardsQuery.refetch()} label="Awards" /></Panel> :
      props.awards.length === 0 ? <Panel><EmptyState icon={<PackageCheck size={20} />} title="An award is needed first" description="Confirm a supplier award in step 4. Purchase orders are created from an approved award." /></Panel> :
      <div className="po-layout">
        <div className="po-left">
          <Panel className="award-select-panel"><div className="panel-title-row"><div><span className="micro-label">APPROVED AWARDS</span><h3>Select an award</h3></div><span className="count-badge">{props.awards.length}</span></div>
            <div className="award-select-list">{props.awards.map((award) => <button type="button" key={award.id} data-testid={`po-award-${award.id}`} className={cx('award-select-row', (selectedAward?.id === award.id) && 'award-select-active')} onClick={() => { if (selectedAward?.id !== award.id) props.setTermsAccepted(false); props.setSelectedAwardId(award.id); }}><span className="award-select-icon"><BadgeCheck size={16} /></span><span><strong>{award.supplier_name}</strong><small>{award.award_code} · {award.qty} units</small></span><b>{fmtMoney(award.price)}</b></button>)}</div>
          </Panel>
          <Panel className="terms-panel"><span className="micro-label">STANDARD TERMS</span><h3>Confirm the baseline terms</h3><p className="terms-intro">Vireo applies the standard purchase conditions to this order. Review before accepting.</p><div className="terms-list"><div><span>Payment</span><strong>Net 30 from accepted invoice</strong></div><div><span>Delivery</span><strong>As committed in the RFQ</strong></div><div><span>Warranty</span><strong>Standard supplier warranty</strong></div><div><span>Validity</span><strong>15 days from issue</strong></div></div>
            <label className="check-row terms-check"><input type="checkbox" data-testid="checkbox-accept-terms" checked={props.termsAccepted} onChange={(event) => props.setTermsAccepted(event.target.checked)} disabled={!selectedAward || Boolean(existingOrder)} /><span className="custom-check"><Check size={12} /></span><span>I accept these standard terms for this purchase order.</span></label>
             <button type="button" data-testid="button-create-po" className="button button-primary full-width" disabled={!selectedAward || !props.termsAccepted || props.creating || Boolean(existingOrder) || !props.approvalReady} onClick={props.onCreate}>{props.creating ? 'Creating draft…' : 'Create draft purchase order'}<ArrowRight size={15} /></button>
             {!props.approvalReady && <p className="fine-print">Order creation is paused until Vireo’s quantity-approval controls are available.</p>}
          </Panel>
        </div>
        <Panel className="po-preview-panel">
          {props.ordersQuery.isPending || props.ordersQuery.isError ? <QueryState pending={props.ordersQuery.isPending} error={props.ordersQuery.isError} retry={() => void props.ordersQuery.refetch()} label="Purchase orders" /> :
              existingOrder ? <PoRecord
                po={existingOrder}
                onConfirm={() => props.onConfirm(existingOrder)}
                confirming={props.confirming}
                quantityHold={quantityHold}
                approvedQuantityCase={approvedQuantityCase}
                approvalReady={props.approvalReady}
                canManageBaseline={Boolean(props.approvalSnapshot?.can_manage_approvers)}
                adminEmails={props.approvalSnapshot?.members.filter((member) => member.role === 'workspace_admin').map((member) => member.email).filter((email): email is string => Boolean(email)) || []}
                approverEmails={props.approvalSnapshot?.approvers.map((approver) => approver.email).filter((email): email is string => Boolean(email)) || []}
                onOpenReview={() => openPoReview(existingOrder.id)}
                onOpenBaseline={openBaselineSetup}
              /> : selectedAward ? <PoPreview award={selectedAward} /> : <EmptyState icon={<FileText size={20} />} title="Choose an award" description="Your order preview will appear here." />}
        </Panel>
      </div>}
  </section>;
}

function PoApprovalPanel(props: {
  snapshot?: PoApprovalSnapshot;
  pending: boolean;
  error: boolean;
  ready: boolean;
  retry: () => void;
  onManageApprover: (userId: string, assign: boolean) => void;
  managingApprovers: boolean;
  onSetBaseline: (itemName: string, usualQty: number) => Promise<unknown>;
  settingBaseline: boolean;
  onApproveCase: (poId: string, caseId: string) => void;
  approvingCaseId?: string;
  approvingCase: boolean;
  onBulkApprove: (cases: PoQuantityApprovalCase[]) => Promise<void>;
  onMarkReviewed: (caseIds: string[]) => Promise<void>;
  onRequestClarification: (caseIds: string[]) => Promise<void>;
  onRecordClarificationResponse: (caseId: string, response: string) => Promise<void>;
}) {
  const [memberId, setMemberId] = useState('');
  const [baselineRows, setBaselineRows] = useState([{ item: '', qty: '' }]);
  const [baselineMessage, setBaselineMessage] = useState('');
  const snapshot = props.snapshot;
  const eligibleMembers = snapshot?.members.filter((member) => member.role === 'member' && !member.is_approver) || [];
  const eligibleCases = (snapshot?.pending_cases || []).filter((entry) =>
    !snapshot?.can_manage_approvers
      && entry.signal !== 'baseline_missing' && !entry.requester_unverified && entry.can_approve,
  );
  const saveBaselines = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = baselineRows.map((row) => ({ item_name: row.item.trim(), usual_qty: Number(row.qty) }))
      .filter((row) => row.item_name && Number.isSafeInteger(row.usual_qty) && row.usual_qty > 0);
    if (!values.length) return;
    const results = await Promise.allSettled(values.map((value) => props.onSetBaseline(value.item_name, value.usual_qty)));
    const successCount = results.filter((result) => result.status === 'fulfilled').length;
    const failedItems = values.filter((_value, index) => results[index].status === 'rejected').map((value) => value.item_name);
    setBaselineMessage(`${successCount} of ${values.length} item baselines saved.${failedItems.length ? ` Could not save: ${failedItems.join(', ')}.` : ''}`);
    if (!failedItems.length) setBaselineRows([{ item: '', qty: '' }]);
  };
  return <Panel className="po-approval-panel" id="po-approval-controls" tabIndex={-1}>
    <div className="panel-title-row">
      <div><span className="micro-label">QUANTITY CONTROL</span><h3>Unusual order quantities</h3></div>
      <span className="status-tag status-draft">{snapshot?.pending_cases.length || 0} awaiting review</span>
    </div>
    <p className="po-approval-explainer">A rules-based safeguard compares each order with its item baseline. After 3 earlier Sent POs, the reference becomes the median of that item’s workspace history. An order at least 2× or at most ½ its reference is held for a different designated approver. Approval leaves the PO in Draft until a buyer manually sends it.</p>
    {props.pending && <p className="muted-copy" role="status">Checking the workspace’s approval controls…</p>}
    {props.error && <div role="alert" className="po-approval-warning">
      <AlertCircle size={16} /><span>Quantity-approval setup is unavailable. PO creation and sending are paused. Apply the reviewed database migration, then retry.</span>
      <button type="button" className="button button-secondary" onClick={props.retry}>Retry</button>
    </div>}
    {!props.pending && !props.error && props.ready && snapshot && <>
      {snapshot.can_manage_approvers && <div className="po-approver-admin">
        <div className="panel-title-row"><div><span className="micro-label">WORKSPACE ADMIN</span><h4>Designated approvers</h4></div><span className="count-badge">{snapshot.approver_count}</span></div>
        {snapshot.approvers.length > 0 ? <ul className="po-approver-list">
          {snapshot.approvers.map((approver) => <li key={approver.user_id}>
            <span>{approver.email || `Member ${approver.user_id.slice(0, 8)}`}</span>
            <button type="button" className="button button-secondary" disabled={props.managingApprovers} onClick={() => props.onManageApprover(approver.user_id, false)}>Remove</button>
          </li>)}
        </ul> : <p className="po-approval-warning" role="status">No approver is assigned. Add at least one authorized, MFA-verified workspace member.</p>}
        <div className="po-approver-assign">
          <label className="sr-only" htmlFor="po-approver-member">Workspace member</label>
          <select id="po-approver-member" value={memberId} onChange={(event) => setMemberId(event.target.value)} disabled={props.managingApprovers || eligibleMembers.length === 0}>
            <option value="">Choose a workspace member</option>
            {eligibleMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.email || `Member ${member.user_id.slice(0, 8)}`} · {member.role}</option>)}
          </select>
          <button type="button" className="button button-secondary" disabled={!memberId || props.managingApprovers} onClick={() => { props.onManageApprover(memberId, true); setMemberId(''); }}>{props.managingApprovers ? 'Saving…' : 'Add approver'}</button>
        </div>
      </div>}
      {snapshot.can_manage_approvers && <div className="po-baseline-admin" id="po-baseline-admin" tabIndex={-1}>
        <div className="panel-title-row"><div><span className="micro-label">ONBOARDING BASELINES</span><h4>Usual quantity by item</h4></div><span className="count-badge">{snapshot.baselines.length}</span></div>
        <p className="po-baseline-copy">The buyer workspace administrator sets the usual quantity for each item. It is the reference until 3 earlier Sent POs exist; from then on VireoIntelligence uses the median of the item’s prior Sent POs.</p>
        <form className="po-baseline-batch" onSubmit={(event) => void saveBaselines(event)}>
          {baselineRows.map((row, index) => <div className="po-baseline-form" key={index}>
            <label><span>Item or product</span><input value={row.item} onChange={(event) => setBaselineRows((current) => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, item: event.target.value } : entry))} maxLength={240} placeholder="e.g. A4 copy paper" required disabled={props.settingBaseline} /></label>
            <label><span>Usual quantity</span><input type="number" min="1" step="1" inputMode="numeric" value={row.qty} onChange={(event) => setBaselineRows((current) => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, qty: event.target.value } : entry))} placeholder="e.g. 48" required disabled={props.settingBaseline} /></label>
            {baselineRows.length > 1 && <button type="button" className="baseline-remove" aria-label={`Remove baseline row ${index + 1}`} onClick={() => setBaselineRows((current) => current.filter((_entry, rowIndex) => rowIndex !== index))}>Remove</button>}
          </div>)}
          <div className="baseline-batch-actions">
            <button type="button" className="button button-secondary" disabled={props.settingBaseline} onClick={() => setBaselineRows((current) => [...current, { item: '', qty: '' }])}><Plus size={14} /> Add item</button>
            <button type="submit" className="button button-primary" disabled={props.settingBaseline || baselineRows.some((row) => !row.item.trim() || !row.qty)}>{props.settingBaseline ? 'Saving baselines…' : `Save ${baselineRows.length} baseline${baselineRows.length === 1 ? '' : 's'}`}</button>
          </div>
        </form>
        {baselineMessage && <p className="batch-action-message" role="status">{baselineMessage}</p>}
        {snapshot.baselines.length > 0 ? <ul className="po-baseline-list" aria-label="Saved usual quantities">
          {snapshot.baselines.map((baseline) => <li key={baseline.item_key}><span>{baseline.item_name}</span><strong>{baseline.usual_qty.toLocaleString()} units</strong></li>)}
        </ul> : <p className="fine-print">No usual quantities saved yet. Items without a baseline and fewer than 3 earlier Sent POs are held for workspace-admin setup.</p>}
      </div>}
      {snapshot.approver_count === 0 && !snapshot.can_manage_approvers && <p className="po-approval-warning" role="status">No designated approver is assigned yet. Ask the buyer workspace administrator to assign one; flagged POs cannot be sent without approval.</p>}
      {eligibleCases.length > 1 && snapshot.is_approver && <div className="po-bulk-approve">
        <div><strong>{eligibleCases.length} eligible exception{eligibleCases.length === 1 ? '' : 's'}</strong><small>Bulk action still submits a separate approval for every PO and item.</small></div>
        <button type="button" className="button button-primary" disabled={props.approvingCase} onClick={() => void props.onBulkApprove(eligibleCases)}><ClipboardCheck size={14} /> Approve all eligible exceptions</button>
      </div>}
      {snapshot.pending_cases.length > 0 ? <div className="po-pending-cases" aria-label="Purchase orders awaiting quantity approval">
        {snapshot.pending_cases.map((entry) => <article className="po-pending-case" key={entry.case_id}>
          <div><span className="micro-label">{entry.po_code} · {entry.signal === 'baseline_missing' ? 'USUAL QUANTITY NEEDED' : entry.signal === 'larger' ? 'UNUSUALLY LARGE' : 'BELOW USUAL'}</span><h4>{entry.item}</h4>
            {entry.signal === 'baseline_missing'
              ? <p>Order: <strong>{entry.order_qty.toLocaleString()} units</strong>. No onboarding baseline is saved and fewer than 3 earlier Sent POs exist. The workspace administrator must set the usual quantity before review can continue.</p>
              : <p>Order: <strong>{entry.order_qty.toLocaleString()} units</strong> · Reference: <strong>{entry.reference_qty?.toLocaleString()} units</strong> ({entry.basis === 'history' ? `median of ${entry.history_order_count} earlier Sent POs` : 'onboarding usual quantity'}).</p>}
          </div>
          {entry.signal === 'baseline_missing' ? <span className="fine-print">Approval is disabled until the buyer workspace administrator sets a usual quantity.</span> :
          entry.requester_unverified ? <span className="fine-print">Requester must be verified before this held order can be approved.</span> :
                entry.can_approve && !snapshot.can_manage_approvers ? <button type="button" className="button button-primary" disabled={props.approvingCase} onClick={() => props.onApproveCase(entry.po_id, entry.case_id)}>{props.approvingCaseId === entry.case_id ? 'Approving…' : 'Approve quantity exception'}</button> :
              <span className="fine-print">{snapshot.is_approver ? 'The PO creator cannot approve their own order.' : 'Awaiting a different designated approver.'}</span>}
        </article>)}
      </div> : <p className="po-approval-clear"><CheckCircle2 size={15} /> No unusual-quantity POs are awaiting approval.</p>}
    </>}
  </Panel>;
}

function BatchReviewPanel(props: {
  snapshot?: PoApprovalSnapshot;
  orders: PurchaseOrderRecord[];
  requests: RequestRecord[];
  rfqs: RfqRecord[];
  awards: AwardRecord[];
  onMarkReviewed: (caseIds: string[]) => Promise<void>;
  onRequestClarification: (caseIds: string[]) => Promise<void>;
  onRecordClarificationResponse: (caseId: string, response: string) => Promise<void>;
  onReturnQuantityCase: (caseId: string, reason: string) => Promise<void>;
  onSubmitMakerExplanation: (caseId: string, explanation: string) => Promise<void>;
  onCreateQuantityCorrection: (caseId: string, correctedQty: number, reason: string) => Promise<string>;
  focusPoId?: string | null;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [returnReasons, setReturnReasons] = useState<Record<string, string>>({});
  const [makerExplanations, setMakerExplanations] = useState<Record<string, string>>({});
  const [correctionQtys, setCorrectionQtys] = useState<Record<string, string>>({});
  const [correctionReasons, setCorrectionReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pending = props.snapshot?.pending_cases || [];
  const canAct = Boolean(props.snapshot?.is_approver && !props.snapshot?.can_manage_approvers);
  const reviewReady = props.snapshot?.batch_review_ready === true;
  const casesByPo = new Map(pending.map((entry) => [entry.po_id, entry]));
  useEffect(() => {
    if (!props.focusPoId) return;
    const target = pending.find((entry) => entry.po_id === props.focusPoId);
    if (target) setSelectedIds([target.case_id]);
  }, [props.focusPoId, pending]);
  const joined = (po: PurchaseOrderRecord) => {
    const award = props.awards.find((row) => row.id === po.award_id);
    const rfq = props.rfqs.find((row) => row.id === award?.rfq_id);
    const request = props.requests.find((row) => row.id === rfq?.request_id);
    const quantityCase = casesByPo.get(po.id);
    const batch = quantityCase?.batch_number || rfq?.batch_number || request?.batch_number || 'Unbatched';
    const email = quantityCase?.requester_email || request?.requester_email || 'Requester not recorded';
    return { award, rfq, request, quantityCase, batch, email, key: `${batch}::${email}` };
  };
  const draftOrders = props.orders.filter((po) => isDraft(po.status)).map((po) => ({ po, ...joined(po) }));
  const groups = new Map<string, typeof draftOrders>();
  draftOrders.forEach((row) => groups.set(row.key, [...(groups.get(row.key) || []), row]));
  const selectedCases = pending.filter((entry) => selectedIds.includes(entry.case_id));
  const selectedRequester = selectedCases.length ? (selectedCases[0].requester_email || props.requests.find((request) => request.id === selectedCases[0].request_id)?.requester_email || '') : '';
  const canPrepareClarification = Boolean(selectedRequester) && selectedCases.every((entry) => {
    const email = entry.requester_email || props.requests.find((request) => request.id === entry.request_id)?.requester_email || '';
    return email === selectedRequester;
  });
  const canRequestSelected = canPrepareClarification && selectedCases.every((entry) =>
    !entry.clarification_status || entry.clarification_status === 'needed',
  );
  const runAction = async (label: string, action: () => Promise<void>, success: string) => {
    setBusy(label); setError(''); setMessage('');
    try { await action(); setMessage(success); }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The update could not be saved. Retry the action.';
      setError(message);
      notifyChimeBlocker(message);
    }
    finally { setBusy(''); }
  };
  const toggleCase = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const prepareEmail = () => {
    const recipient = selectedRequester;
    const lines = selectedCases.map((entry) => `• ${entry.po_code} — ${entry.item}; order quantity ${entry.order_qty.toLocaleString()} units${entry.reference_qty ? `, reference ${entry.reference_qty.toLocaleString()} units` : ''}`);
    const subject = encodeURIComponent(`Quantity clarification for ${selectedCases.length} purchase order${selectedCases.length === 1 ? '' : 's'}`);
    const body = encodeURIComponent(`Hello,\n\nCould you clarify the requested quantities for these purchase orders?\n\n${lines.join('\n')}\n\nPlease reply with the context for each item.\n`);
    window.open(`mailto:${encodeURIComponent(recipient)}?subject=${subject}&body=${body}`, '_blank', 'noopener,noreferrer');
    void runAction('clarification', () => props.onRequestClarification(selectedCases.map((entry) => entry.case_id)), 'Email draft prepared. Your mail app opened a draft; Vireo did not send it.');
  };
  return <Panel className="po-batch-panel" id="po-batch-review" tabIndex={-1}>
    <div className="batch-panel-heading">
      <div><span className="micro-label">BATCH REVIEW</span><h3>Resolve related orders together</h3><p>Draft POs are grouped by RFQ batch and requester email. Quantity holds stay attached to their own PO; unaffected drafts remain ready to continue.</p></div>
      <span className="batch-order-count">{draftOrders.length} draft{draftOrders.length === 1 ? '' : 's'}</span>
    </div>
    {!reviewReady && <div className="po-approval-warning batch-migration-notice" role="status">
      <AlertCircle size={16} /><span>Batch review, “Mark reviewed,” and clarification tracking are not activated in this workspace yet. Apply the reviewed Step 5 batch-review migration to enable them. Baseline setup and quantity approval remain in the controls above.</span>
    </div>}
    {draftOrders.length === 0 ? <EmptyState icon={<Layers3 size={19} />} title="No draft orders to group" description="Draft purchase orders will appear here with their RFQ batch and requester context." /> :
      <div className="batch-groups">
        {[...groups.entries()].map(([key, rows]) => {
          const held = rows.filter((row) => Boolean(row.quantityCase)).length;
          return <section className="batch-group" key={key}>
            <header><div><span className="batch-group-kicker">RFQ BATCH · {rows[0].batch}</span><strong>{rows[0].email}</strong></div><span className="batch-progress">{rows.length - held} ready <i /> {held} held</span></header>
            <div className="batch-progress-track"><span style={{ width: `${rows.length ? ((rows.length - held) / rows.length) * 100 : 0}%` }} /></div>
            <div className="batch-order-list">{rows.map(({ po, quantityCase, request, rfq }) => <div className="batch-order-row" key={po.id}>
              <span className={cx('batch-state-mark', quantityCase ? 'is-held' : 'is-ready')} />
              <div><strong>{po.po_code} <i /> {request?.item || rfq?.title || 'Procurement item'}</strong><small>{po.qty.toLocaleString()} units · {po.supplier_name} · {po.status}</small></div>
              <span className={cx('batch-order-status', quantityCase ? 'held' : 'ready')}>{quantityCase ? 'Held for review' : 'Ready to continue'}</span>
            </div>)}</div>
          </section>;
        })}
      </div>}
    {pending.length > 0 && <div className="batch-followup">
      <div className="batch-followup-heading"><div><span className="micro-label">CASE FOLLOW-UP</span><h4>One pass, case-level records</h4></div><span>{selectedCases.length} selected</span></div>
      <div className="batch-case-list">{pending.map((entry) => {
        const request = props.requests.find((row) => row.id === entry.request_id);
        const email = entry.requester_email || request?.requester_email || '';
        const caseStatus = entry.clarification_status === 'response_recorded'
          ? 'Response received'
          : entry.clarification_status === 'draft_prepared'
            ? 'Email draft prepared'
            : entry.reviewed_at ? 'Reviewed' : 'Open';
        return <label className="batch-case-select" key={entry.case_id}>
          <input type="checkbox" checked={selectedIds.includes(entry.case_id)} disabled={!canAct || !reviewReady} onChange={() => toggleCase(entry.case_id)} />
          <span><strong>{entry.po_code} <i /> {entry.item}</strong><small>{entry.order_qty.toLocaleString()} ordered · {email || 'Requester not recorded'}{entry.reviewed_at ? ` · Reviewed${entry.reviewed_by_email ? ` by ${entry.reviewed_by_email}` : ''}` : ''}</small></span>
          <span className={cx('reviewed-flag', (entry.reviewed_at || entry.clarification_status === 'response_recorded') && 'done')}>{entry.maker_correction_request_id ? 'Corrected RFQ request created' : entry.maker_returned_at ? entry.maker_explanation ? 'Maker replied · decision needed' : 'Returned to Maker' : caseStatus}</span>
        </label>;
      })}</div>
      {canAct && pending.filter((entry) => entry.signal !== 'baseline_missing' && !entry.maker_correction_request_id).map((entry) => <div className="batch-response" key={`maker-return-${entry.case_id}`}>
        <div><strong>Return only {entry.item} to the Maker</strong><small>{entry.maker_explanation ? `Maker explanation: ${entry.maker_explanation}` : 'Explain what needs to be corrected or justified for this quantity.'}</small></div>
        <textarea className="field" rows={2} maxLength={1000} value={returnReasons[entry.case_id] || ''} onChange={(event) => setReturnReasons((current) => ({ ...current, [entry.case_id]: event.target.value }))} placeholder="Required reason for returning this item" aria-label={`Return reason for ${entry.item}`} />
        <button type="button" className="button button-secondary" disabled={!returnReasons[entry.case_id]?.trim() || Boolean(busy)} onClick={() => void runAction(`return-${entry.case_id}`, () => props.onReturnQuantityCase(entry.case_id, returnReasons[entry.case_id].trim()), `${entry.item} returned to the Maker. Other batch items are unchanged.`)}>{busy === `return-${entry.case_id}` ? 'Returning…' : 'Return affected item to Maker'}</button>
      </div>)}
      {pending.filter((entry) => entry.maker_returned_at && entry.requested_by === props.snapshot?.actor_id).map((entry) => <div className="batch-response" key={`maker-explanation-${entry.case_id}`}>
        <div><strong>{entry.item} was returned to you</strong><small>Reviewer/Approver: {entry.maker_return_reason}</small></div>
        {entry.maker_correction_request_id ? <p className="batch-action-message">Corrected request created for {entry.maker_corrected_qty} units. The original PO remains held and cannot be approved.</p> : entry.maker_explanation ? <p className="batch-action-message">Explanation submitted. The PO remains held until the Reviewer/Approver decides.</p> : <>
          <textarea className="field" rows={3} maxLength={2000} required value={makerExplanations[entry.case_id] || ''} onChange={(event) => setMakerExplanations((current) => ({ ...current, [entry.case_id]: event.target.value }))} placeholder="Explain why this unusual quantity is needed" aria-label={`Required explanation for ${entry.item}`} />
          <button type="button" className="button button-primary" disabled={!makerExplanations[entry.case_id]?.trim() || Boolean(busy)} onClick={() => void runAction(`explain-${entry.case_id}`, () => props.onSubmitMakerExplanation(entry.case_id, makerExplanations[entry.case_id].trim()), 'Explanation sent for review. The PO remains held.')}>{busy === `explain-${entry.case_id}` ? 'Submitting…' : 'OK to proceed'}</button>
          <div className="batch-correction">
            <strong>Wrong quantity? Create a corrected RFQ request</strong>
            <label>Correct quantity<input type="number" min="1" step="1" inputMode="numeric" value={correctionQtys[entry.case_id] || ''} onChange={(event) => setCorrectionQtys((current) => ({ ...current, [entry.case_id]: event.target.value }))} /></label>
            <textarea className="field" rows={2} maxLength={2000} value={correctionReasons[entry.case_id] || ''} onChange={(event) => setCorrectionReasons((current) => ({ ...current, [entry.case_id]: event.target.value }))} placeholder="Required reason for correcting the quantity" aria-label={`Correction reason for ${entry.item}`} />
            <button type="button" className="button button-secondary" disabled={!correctionQtys[entry.case_id] || !correctionReasons[entry.case_id]?.trim() || Boolean(busy)} onClick={() => void runAction(`correction-${entry.case_id}`, async () => { await props.onCreateQuantityCorrection(entry.case_id, Number(correctionQtys[entry.case_id]), correctionReasons[entry.case_id].trim()); }, 'Corrected request created; continue at RFQ. The original PO stays held.')}>{busy === `correction-${entry.case_id}` ? 'Creating corrected request…' : 'Create corrected RFQ request'}</button>
          </div>
        </>}
      </div>)}
      {canAct && reviewReady ? <div className="batch-toolbar">
        <button type="button" className="button button-secondary" disabled={!selectedCases.length || Boolean(busy)} onClick={() => void runAction('review', () => props.onMarkReviewed(selectedCases.map((entry) => entry.case_id)), 'Selected cases marked reviewed. This does not release or approve any PO.')}>
          {busy === 'review' ? 'Saving review…' : 'Mark selected reviewed'}
        </button>
        <button type="button" className="button button-secondary" disabled={!canRequestSelected || Boolean(busy)} onClick={prepareEmail}>
          <Mail size={14} /> Prepare clarification email
        </button>
        {selectedCases.length > 0 && !canPrepareClarification && <small>Select cases for one recorded requester email to prepare a consolidated draft.</small>}
        {selectedCases.length > 0 && canPrepareClarification && !canRequestSelected && <small>An email draft has already been prepared or a reply recorded for one or more selected cases.</small>}
      </div> : !canAct ? <p className="batch-caveat">Review actions are limited to workspace administrators and designated PO approvers. Ask your workspace administrator for access.</p> : null}
      {canAct && reviewReady && <p className="batch-caveat">Email is a draft in your mail app. Vireo never sends it. Marking reviewed is a persistent record only and does not clear the quantity hold.</p>}
      {pending.filter((entry) => entry.clarification_status === 'draft_prepared' || entry.clarification_status === 'response_recorded').map((entry) => <div className="batch-response" key={entry.case_id}>
        <div><strong>{entry.po_code} · {entry.item}</strong><small>{entry.clarification_response ? `Response captured${entry.clarification_responded_at ? ` · ${shortDate(entry.clarification_responded_at)}` : ''}` : `Email draft prepared${entry.clarification_draft_prepared_at ? ` · ${shortDate(entry.clarification_draft_prepared_at)}` : ''}. Record the reply after the requester responds.`}</small></div>
         <textarea className="field" value={responses[entry.case_id] ?? entry.clarification_response ?? ''} onChange={(event) => setResponses((current) => ({ ...current, [entry.case_id]: event.target.value }))} disabled={!canAct || !reviewReady || Boolean(busy)} rows={2} maxLength={2000} placeholder="Capture clarification response" aria-label={`Clarification response for ${entry.po_code} ${entry.item}`} />
         {canAct && <button type="button" className="button button-secondary" disabled={!reviewReady || !responses[entry.case_id]?.trim() || Boolean(busy)} onClick={() => void runAction(`response-${entry.case_id}`, () => props.onRecordClarificationResponse(entry.case_id, responses[entry.case_id].trim()), `Response recorded for ${entry.po_code} / ${entry.item}.`)}>{busy === `response-${entry.case_id}` ? 'Saving…' : 'Save response'}</button>}
      </div>)}
    </div>}
    {(message || error) && <div className={cx('batch-feedback', error && 'has-error')} role={error ? 'alert' : 'status'}>{error || message}</div>}
  </Panel>;
}

function PoPreview({ award }: { award: AwardRecord }) {
  return <div className="po-preview-content"><div className="po-preview-header"><span className="micro-label">PURCHASE ORDER PREVIEW</span><span className="status-tag status-draft">Not created</span></div><h3>Ready for your terms approval.</h3><p>This preview is based on the confirmed supplier award. A draft will be created only after terms are accepted.</p><div className="po-document"><div className="po-doc-top"><span>VIREOINTELLIGENCE</span><span>PREVIEW</span></div><div className="po-doc-name">Purchase order</div><div className="po-doc-number">From award {award.award_code}</div><div className="po-doc-line"><span>Supplier</span><strong>{award.supplier_name}</strong></div><div className="po-doc-line"><span>Quantity</span><strong>{award.qty} units</strong></div><div className="po-doc-line"><span>Quote amount</span><strong>{fmtMoney(award.price)}</strong></div><div className="po-doc-line po-total"><span>Estimated total</span><strong>{fmtMoney(award.price)}</strong></div><div className="po-doc-footer">Payment and delivery commitments included in draft.</div></div><div className="po-privacy"><ShieldCheck size={15} /> Draft only. Nothing is sent automatically.</div></div>;
}

function PoRecord({ po, onConfirm, confirming, quantityHold, approvedQuantityCase, approvalReady, canManageBaseline, adminEmails, approverEmails, onOpenReview, onOpenBaseline }: {
  po: PurchaseOrderRecord;
  onConfirm: () => void;
  confirming: boolean;
  quantityHold?: PoApprovalSnapshot['pending_cases'][number];
  approvedQuantityCase?: PoApprovalSnapshot['approved_cases'][number];
  approvalReady: boolean;
  canManageBaseline: boolean;
  adminEmails: string[];
  approverEmails: string[];
  onOpenReview: () => void;
  onOpenBaseline: () => void;
}) {
  const isSent = !isDraft(po.status);
  const baselineMissing = quantityHold?.signal === 'baseline_missing';
  const nextStepRecipients = baselineMissing ? adminEmails : approverEmails;
  const nextStepRole = baselineMissing ? 'Workspace Admin-Member' : 'Reviewer/Approver';
  const nextStepAction = baselineMissing
    ? 'Please set the usual quantity baseline so this PO can move to review.'
    : 'Please review the quantity hold and approve it or request clarification.';
  const nextStepSubject = encodeURIComponent(`${baselineMissing ? 'Usual quantity setup' : 'PO review needed'} · ${po.po_code}`);
  const nextStepBody = encodeURIComponent(
    `Hello,\n\n${nextStepAction}\n\nPO: ${po.po_code}\nSupplier: ${po.supplier_name}\nQuantity: ${po.qty} units\n\nI am requesting the next required action in Vireo. This email is a draft only; Vireo has not sent it.\n`,
  );
  const nextStepMailto = `mailto:${nextStepRecipients.join(',')}?subject=${nextStepSubject}&body=${nextStepBody}`;
  const subject = encodeURIComponent(`Purchase order ${po.po_code}`);
  const body = encodeURIComponent(`Hello ${po.supplier_name},\n\nPlease find our purchase order ${po.po_code} for ${po.qty} units, total ${fmtMoney(po.price_total)}.\n\nPayment terms: ${po.payment_terms}\nDelivery commitment: ${po.delivery_commit}\nWarranty: ${po.warranty}\n\nPlease confirm receipt.\n`);
  const mailto = `mailto:?subject=${subject}&body=${body}`;
  return <div className="po-preview-content"><div className="po-preview-header"><span className="micro-label">PURCHASE ORDER</span><span className={cx('status-tag', isSent ? 'status-open' : 'status-draft')}>{po.status}</span></div><h3>{po.po_code}</h3><p>{isSent ? 'This order is marked sent in Vireo.' : 'Review the generated order before marking it sent.'}</p><div className="po-document"><div className="po-doc-top"><span>VIREOINTELLIGENCE</span><span>{po.po_code}</span></div><div className="po-doc-name">{po.supplier_name}</div><div className="po-doc-line"><span>Quantity</span><strong>{po.qty} units</strong></div><div className="po-doc-line"><span>Total</span><strong>{fmtMoney(po.price_total)}</strong></div><div className="po-doc-line"><span>Payment terms</span><strong>{po.payment_terms}</strong></div><div className="po-doc-line"><span>Delivery</span><strong>{po.delivery_commit}</strong></div><div className="po-doc-line"><span>Warranty</span><strong>{po.warranty}</strong></div><div className="po-doc-line"><span>Valid for</span><strong>{po.validity_days} days</strong></div></div>
    {!isSent ? quantityHold
      ? <div className="po-approval-warning po-hold-warning" role="status">
        <AlertCircle size={16} />
         <div className="po-hold-copy">
           <strong>{baselineMissing ? 'Awaiting Workspace Admin-Member' : 'Awaiting Reviewer/Approver'}</strong>
           <span>{baselineMissing
             ? 'The item has no usual-quantity baseline and fewer than 3 earlier Sent POs. Maker next: ask the workspace Admin-Member to set it; then the Reviewer/Approver can review this PO.'
             : 'This unusual quantity needs review. Maker next: contact the designated Reviewer/Approver; do not create a duplicate PO. After approval, you can send this draft.'}</span>
           <small>Responsible role: {nextStepRole}. Vireo will not send an email automatically.</small>
         </div>
        <div className="po-hold-actions">
          {quantityHold.signal === 'baseline_missing' && canManageBaseline && <button type="button" className="button button-secondary" onClick={onOpenBaseline}>Set usual quantity <ArrowRight size={13} /></button>}
           <a className="button button-primary" href={nextStepMailto}>Prepare email to {baselineMissing ? 'Admin-Member' : 'designated approver'} <ArrowRight size={13} /></a>
           <button type="button" className="button button-secondary" onClick={onOpenReview}>View review status <ArrowRight size={13} /></button>
        </div>
      </div>
      : approvalReady
        ? <>{approvedQuantityCase && <div className="inline-success po-quantity-approved" role="status"><CheckCircle2 size={16} /><span>Quantity variance approved by a designated approver. The PO remains Draft until you send it.</span></div>}<div className="po-send-actions"><button type="button" className="button button-primary full-width" data-testid="button-confirm-po-sent" disabled={confirming} onClick={onConfirm}>{confirming ? 'Updating order…' : 'Confirm sent'}<Check size={15} /></button><a className="button button-secondary full-width" data-testid="link-email-po" href={mailto}>Open prefilled email<Mail size={15} /></a><span className="fine-print">Vireo records the status; email is opened for you and is not sent by the app.</span></div></>
        : <div className="po-approval-warning" role="status"><AlertCircle size={16} /><span>Sending is paused until the quantity-approval controls are available.</span></div>
      : <div className="inline-success po-sent"><CheckCircle2 size={16} /> Sent status recorded.</div>}
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="detail-item"><span>{label}</span><strong>{value}</strong></div>;
}

export default App;