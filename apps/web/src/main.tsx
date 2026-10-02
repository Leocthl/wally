import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MockApiClient } from "./api/MockApiClient";
import "./design/tokens.css";
import "./design/tokens-fallback.css";
import "./design/base.css";
import "./design/chips.css";
import "./design/components.css";
import "./design/shell.css";

/** The offline mock replays the SIMULATED storyline; the HTTP + SSE client replaces it behind the same ApiClient. */
const SWEEP_EVERY_MS = 1000;
const api = new MockApiClient({ sweepEveryMs: SWEEP_EVERY_MS });

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
createRoot(root).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
