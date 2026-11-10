import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
// 10mb cap (not the 100kb default): voice clips for /negotiator/transcribe
// ride in as base64 JSON. Other routes validate shapes strictly, so the
// larger cap weakens nothing.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
// Root is public and informational so the bare Render URL shows status
// instead of an auth error. All demo JSON lives under /api/*.
app.get("/", (_req, res) => {
  res.json({
    service: "vireo-chime-negotiator-api",
    demo: "open /negotiator-demo on the demo site",
    health: "/api/healthz",
  });
});
// HACKATHON (paypal-negotiator branch only): the demo endpoints below are
// public by design — synthetic data, PayPal Sandbox money, staging ledger —
// so the hackathon demo runs without Clerk accounts. All other paths keep
// the existing Clerk middleware untouched.
const clerkAuth = clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(
    getClerkProxyHost(req) ?? "",
    process.env.CLERK_PUBLISHABLE_KEY,
  ),
}));
const PUBLIC_DEMO_PATHS = [/^\/api\/healthz$/, /^\/api\/negotiator\//, /^\/api\/paypal\/webhook$/];
app.use((req, res, next) => {
  if (PUBLIC_DEMO_PATHS.some((pattern) => pattern.test(req.path))) return next();
  return clerkAuth(req, res, next);
});

app.use("/api", router);

export default app;
