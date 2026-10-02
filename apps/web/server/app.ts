// Thin API for the booth UI (Hono). Lane X wires the real ports here; no feature logic.
import { Hono } from "hono";

export function createApp(): Hono {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true, rail: "SIMULATED" }));
  app.notFound((c) => c.json({ ok: false, error: "not found" }, 404));
  app.onError((err, c) => {
    console.error("api error:", err);
    return c.json({ ok: false, error: "internal error" }, 500);
  });
  return app;
}
