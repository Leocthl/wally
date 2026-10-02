// The booth backend behind the HTTP routes: exactly the ApiClient operations (apps/web/src/api/types.ts) plus the
// export for the offline verifier page. The routes know nothing else, so the HTTP and SSE layer is tested on its
// own and the orchestrator-backed implementation (src/booth/backend/backend.ts, shared with the on-device client)
// plugs in behind the same interface.
export type { BoothBackend, ExportView, PublicKeysView } from "../src/booth/backend/types";
