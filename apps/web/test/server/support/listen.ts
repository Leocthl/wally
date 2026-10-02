// Starts a Hono app on 127.0.0.1 with an ephemeral port for client tests; returns its base URL and a closer.
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import type { Hono } from "hono";

export interface Listening {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export function listen(app: Hono): Promise<Listening> {
  return new Promise((resolve) => {
    const server: ServerType = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, (info: AddressInfo) => {
      resolve({
        baseUrl: `http://127.0.0.1:${info.port}`,
        close: () =>
          new Promise<void>((done) => {
            if ("closeAllConnections" in server && typeof server.closeAllConnections === "function") server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
