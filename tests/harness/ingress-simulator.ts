/**
 * HA Ingress simulator.
 *
 * Mimics what Home Assistant's aiohttp ingress proxy does in front of an
 * addon: strips the `/api/hassio_ingress/<token>` prefix, sets the
 * `X-Ingress-Path` header to that prefix, and forwards everything to the
 * addon's nginx on :3000.
 *
 * This is a pure Node.js HTTP proxy — no dependencies beyond the stdlib —
 * so the e2e harness can start it as part of `npm run test:e2e` on any
 * machine without touching HA.
 */

import http, { type Server } from "node:http";

export const INGRESS_TOKEN = "e2etoken";
export const INGRESS_PREFIX = `/api/hassio_ingress/${INGRESS_TOKEN}`;

const PREFIX_RE = /^(\/api\/hassio_ingress\/[^/]+)(\/.*)?$/;

export type IngressSimulator = {
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startIngressSimulator(opts: {
  upstreamHost: string;
  upstreamPort: number;
  listenPort?: number;
}): Promise<IngressSimulator> {
  const { upstreamHost, upstreamPort } = opts;
  const listenPort = opts.listenPort ?? 0; // 0 = pick any free port

  const server: Server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    const match = url.match(PREFIX_RE);
    if (!match) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not an ingress path");
      return;
    }
    const ingressPath = match[1];
    const upstreamPath = match[2] || "/";

    const headers: Record<string, string | string[] | undefined> = {
      ...req.headers,
      "x-ingress-path": ingressPath,
      host: `${upstreamHost}:${upstreamPort}`,
    };
    // Strip accept-encoding so nginx sub_filter can rewrite response bodies
    delete headers["accept-encoding"];

    const upstream = http.request(
      {
        host: upstreamHost,
        port: upstreamPort,
        method: req.method,
        path: upstreamPath,
        headers: headers as http.OutgoingHttpHeaders,
      },
      (ures) => {
        res.writeHead(ures.statusCode ?? 502, ures.headers);
        ures.pipe(res);
      },
    );
    upstream.on("error", (err) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(`upstream error: ${err.message}`);
    });
    req.pipe(upstream);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("ingress simulator failed to bind");
  }
  const boundPort = address.port;

  return {
    port: boundPort,
    // Trailing slash is load-bearing: Playwright joins relative URLs via
    // `new URL(url, baseURL)`, and without it the ingress prefix gets
    // stripped on goto("./").
    baseUrl: `http://127.0.0.1:${boundPort}${INGRESS_PREFIX}/`,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
