// Staging-project RPC caller for the Chime Negotiator prototype.
//
// Server-side only. Uses SUPABASE_SERVICE_ROLE_KEY, which must NEVER reach
// the browser. Fails closed when env is absent. Targets the isolated staging
// project only — never production Main.
export type StagingConfig = { url: string; serviceRoleKey: string };

export function stagingConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StagingConfig | null {
  const url = env["SUPABASE_URL"] ?? "";
  const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  if (!url || !serviceRoleKey) return null;
  // Tolerate a pasted "/rest/v1" suffix: the RPC caller appends it itself.
  const base = url.replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  return { url: base, serviceRoleKey };
}

export async function callStagingRpc<T>(
  cfg: StagingConfig,
  fn: string,
  params: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: cfg.serviceRoleKey,
      authorization: `Bearer ${cfg.serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`staging_rpc_failed:${fn}:${res.status}`);
  }
  return (await res.json()) as T;
}
