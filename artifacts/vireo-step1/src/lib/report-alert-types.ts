export type AnalyticsAlert = {
  id: string;
  item: string;
  kind: 'order_larger' | 'order_smaller' | 'price_change';
  title: string;
  detail: string;
  date: string;
  value: number;
  baseline: number;
  changePercent?: number;
  period?: string;
  sampleCount: number;
};

export type AnalyticsAlertReview = {
  alert_id: string;
  alert_kind: AnalyticsAlert['kind'];
  alert_snapshot: AnalyticsAlert;
  reviewed_by: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string;
};
