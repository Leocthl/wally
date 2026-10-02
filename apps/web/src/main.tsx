import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { HttpApiClient } from "./api/http/HttpApiClient";
import { MockApiClient } from "./api/MockApiClient";
import type { ApiClient } from "./api/types";
import "./design/tokens.css";
import "./design/tokens-fallback.css";
import "./design/base.css";
import "./design/chips.css";
import "./design/components.css";
import "./design/shell.css";

/** The offline mock replays the SIMULATED storyline; the HTTP + SSE client talks to the booth server. */
const SWEEP_EVERY_MS = 1000;
/** How long the start-up probe of /api/info may take before the page falls back to the mock (UI only, ASSUMED). */
const PROBE_TIMEOUT_MS = 1500;

/** `?api=mock` or VITE_API=mock forces the mock (tests, vite dev without the server). */
function mockForced(): boolean {
  const fromQuery = new URLSearchParams(window.location.search).get("api");
  return fromQuery === "mock" || (fromQuery === null && import.meta.env["VITE_API"] === "mock");
}

/** The HTTP client when the booth server answers /api/info, else the mock (the UI then shows its mock-mode notes). */
async function pickClient(): Promise<ApiClient> {
  if (!mockForced()) {
    try {
      const res = await fetch("/api/info", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      const info: unknown = res.ok ? await res.json() : null;
      if (info !== null && typeof info === "object" && (info as { kind?: unknown }).kind === "http") return new HttpApiClient();
    } catch {
      // No server (static hosting, vite dev alone): fall back to the offline mock below.
    }
  }
  return new MockApiClient({ sweepEveryMs: SWEEP_EVERY_MS });
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
void pickClient().then((api) =>
  createRoot(root).render(
    <StrictMode>
      <App api={api} />
    </StrictMode>,
  ),
);
