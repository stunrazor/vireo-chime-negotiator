import { apiRequest, getSelectedWorkspaceId } from '@/lib/vireo-api';

export type DemoPurchaseOrder = {
  id: string;
  po_code: string;
  supplier_name: string;
  qty: number;
  price_total: number;
  status: string;
  request_item?: string;
  site?: string;
};

export type DemoProfile = {
  id: string;
  site_name: string;
  category: string;
  name: string;
  uom: string;
  checklist: string[];
  activated: boolean;
  activation_reference?: string;
};

export type DemoReceipt = {
  id: string;
  po_id: string;
  po_code: string;
  supplier_name: string;
  request_item?: string;
  received_qty: number;
  state: 'awaiting_review' | 'accepted' | 'rejected';
  receiving_reference: string;
  received_by: string;
  reviewed_by?: string;
  reviewer_note?: string;
  created_at: string;
};

export type DemoPayment = {
  state: 'recorded_external' | 'reconciled';
  payment_date: string;
  external_reference: string;
  recorded_by: string;
  reconciliation_reference?: string;
  reconciled_by?: string;
};

export type DemoInvoice = {
  id: string;
  po_id: string;
  po_code: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  qty: number;
  amount: number;
  currency_code: 'PHP';
  invoice_reference: string;
  match_state: 'matched' | 'on_hold';
  state: 'pending_approval' | 'approved' | 'paid_external' | 'reconciled';
  submitted_by: string;
  approved_by?: string;
  submitted_at: string;
  payment: DemoPayment | null;
};

export type DemoEvent = {
  id: string;
  record_type: 'receipt' | 'invoice';
  record_id: string;
  actor_id: string;
  event_type: string;
  note: string;
  created_at: string;
};

export type DemoSnapshot = {
  schema_ready: boolean;
  money_movement_enabled: false;
  receipt_acceptance_enabled: boolean;
  can_manage_receiving: boolean;
  currency_code: 'PHP';
  actor_id: string;
  purchase_orders: DemoPurchaseOrder[];
  ready_profiles: DemoProfile[];
  receipts: DemoReceipt[];
  invoices: DemoInvoice[];
  events: DemoEvent[];
};

export type DemoAction =
  | 'activate_receiving_profile'
  | 'record_receipt'
  | 'review_receipt'
  | 'submit_invoice'
  | 'approve_invoice'
  | 'record_external_payment'
  | 'reconcile_payment';

export const mvpWorkspaceKey = () => getSelectedWorkspaceId() || 'none';
export const getMvpSnapshot = () => apiRequest<DemoSnapshot>('/request-to-payment');
export const postMvpAction = (action: DemoAction, payload: Record<string, unknown>) =>
  apiRequest<DemoSnapshot>('/request-to-payment', {
    method: 'POST',
    body: JSON.stringify({ action, payload }),
  });