// Staging ledger viewer (AG Grid, read-only).
//
// Shows the current run's money trail — one transfer plus its events —
// straight from the staging ledger, so judges never need Supabase access.
// Read-only by construction: the data comes from GET /negotiator/ledger,
// which only serves DEMO-marked refs through a security-definer RPC.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { themeQuartz, type ColDef } from "ag-grid-community";
import { Button } from "@/components/ui/button";
import { getLedger, minorToDecimal, type LedgerEvent, type LedgerTransfer } from "@/lib/negotiator-api";

const gridTheme = themeQuartz.withParams(
  {
    backgroundColor: "hsl(252 24% 14%)",
    foregroundColor: "hsl(250 24% 93%)",
    headerBackgroundColor: "hsl(251 18% 20%)",
    headerTextColor: "hsl(250 24% 93%)",
    borderColor: "hsl(251 17% 23%)",
    rowHoverColor: "hsl(251 18% 20%)",
  },
  "dark",
);

function shortTime(iso: string): string {
  return iso.length >= 19 ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}` : iso;
}

function money(minor: number, currency: string): string {
  return `${currency} ${minorToDecimal(minor)}`;
}

type LedgerGridProps = {
  demoRef: string;
};

export function LedgerGrid({ demoRef }: LedgerGridProps) {
  const [transfer, setTransfer] = useState<LedgerTransfer | null>(null);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [status, setStatus] = useState("Loading ledger…");

  const load = useCallback(async () => {
    setStatus("Loading ledger…");
    try {
      const ledger = await getLedger(demoRef);
      setTransfer(ledger.transfer);
      setEvents(ledger.events);
      setStatus(
        ledger.transfer
          ? `Transfer ${ledger.transfer.status} · ${ledger.events.length} event(s). Staging only, synthetic DEMO data.`
          : "No transfer row yet for this run.",
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "ledger_failed");
    }
  }, [demoRef]);

  useEffect(() => {
    void load();
  }, [load]);

  const transferColumns = useMemo<ColDef<LedgerTransfer>[]>(
    () => [
      { field: "demo_ref", headerName: "Demo ref", flex: 1, minWidth: 150 },
      { field: "status", headerName: "Status", width: 170 },
      {
        headerName: "Amount",
        width: 150,
        valueGetter: (params) =>
          params.data ? money(params.data.amount_minor, params.data.currency_code) : "",
      },
      { field: "paypal_order_id", headerName: "PayPal order", flex: 1, minWidth: 170 },
      { field: "approved_by_label", headerName: "Approved by", width: 150 },
      {
        field: "approved_at",
        headerName: "Approved at",
        width: 180,
        valueFormatter: (params) => (typeof params.value === "string" ? shortTime(params.value) : ""),
      },
    ],
    [],
  );

  const eventColumns = useMemo<ColDef<LedgerEvent>[]>(
    () => [
      {
        field: "received_at",
        headerName: "Received",
        width: 180,
        valueFormatter: (params) => (typeof params.value === "string" ? shortTime(params.value) : ""),
      },
      { field: "status", headerName: "Status", width: 130 },
      { field: "provider_event_id", headerName: "Provider event", flex: 1, minWidth: 200 },
      {
        headerName: "Amount",
        width: 150,
        valueGetter: (params) =>
          params.data ? money(params.data.amount_minor, params.data.currency_code) : "",
      },
      {
        field: "occurred_at",
        headerName: "Occurred",
        width: 180,
        valueFormatter: (params) => (typeof params.value === "string" ? shortTime(params.value) : ""),
      },
    ],
    [],
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Ledger trail (staging, read-only)</p>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh ledger
        </Button>
      </div>
      <p className="font-mono text-xs text-muted-foreground">{status}</p>
      {transfer && (
        <AgGridReact<LedgerTransfer>
          theme={gridTheme}
          rowData={[transfer]}
          columnDefs={transferColumns}
          domLayout="autoHeight"
        />
      )}
      {events.length > 0 && (
        <AgGridReact<LedgerEvent>
          theme={gridTheme}
          rowData={events}
          columnDefs={eventColumns}
          domLayout="autoHeight"
        />
      )}
    </div>
  );
}
