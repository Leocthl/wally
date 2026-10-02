import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { OnDeviceNote } from "./api/local/OnDeviceNote";
import { pickClient } from "./api/local/select";
import "./design/tokens.css";
import "./design/tokens-fallback.css";
import "./design/base.css";
import "./design/chips.css";
import "./design/components.css";
import "./pwa/register";

/**
 * The HTTP + SSE client when the booth server answers /api/info (live mode); otherwise, or with `?api=local` or
 * VITE_API=local, the real stack runs on this device with recorded answers (src/api/local/select.ts).
 */
const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
void pickClient().then(({ api, onDevice }) =>
  createRoot(root).render(
    <StrictMode>
      {onDevice ? <OnDeviceNote /> : null}
      <App api={api} />
    </StrictMode>,
  ),
);
