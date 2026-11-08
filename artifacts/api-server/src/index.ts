import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import app from "./app";
import { logger } from "./lib/logger";

// HACKATHON (paypal-negotiator branch only): load api-server/.env for local
// runs so secrets never travel through chat or shell history. Real env always
// wins; absent file is a no-op. .env is gitignored — see .env.example.
const envFromFile: string[] = [];
const envFile = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    let value = trimmed.slice(trimmed.indexOf("=") + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
      envFromFile.push(key);
    }
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Safe startup fingerprint: names, lengths, and file-vs-shell source only.
// Never logs values. Catches stale-shell shadowing instantly.
logger.info(
  {
    envFromFile,
    paypalIdLen: (process.env["PAYPAL_CLIENT_ID"] ?? "").length,
    paypalSecretLen: (process.env["PAYPAL_CLIENT_SECRET"] ?? "").length,
    supabaseUrlLen: (process.env["SUPABASE_URL"] ?? "").length,
    supabaseKeyLen: (process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "").length,
  },
  "Negotiator env fingerprint",
);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
