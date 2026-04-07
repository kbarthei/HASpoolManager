// Tiny HA-Ingress simulator. Listens on :8080, mimics what HA's aiohttp
// ingress proxy does: strips the /api/hassio_ingress/<token> prefix, sets
// X-Ingress-Path to that prefix, and forwards everything to the addon
// container on :3000.
import http from "node:http";

const UPSTREAM_HOST = "127.0.0.1";
const UPSTREAM_PORT = 3000;
const LISTEN_PORT = 8080;
const PREFIX_RE = /^(\/api\/hassio_ingress\/[^/]+)(\/.*)?$/;

const server = http.createServer((req, res) => {
  const m = req.url.match(PREFIX_RE);
  if (!m) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not an ingress path");
    return;
  }
  const ingressPath = m[1];
  const upstreamPath = m[2] || "/";

  const headers = { ...req.headers, "x-ingress-path": ingressPath, host: `${UPSTREAM_HOST}:${UPSTREAM_PORT}` };
  delete headers["accept-encoding"]; // make sub_filter work, and easier to inspect

  const upstream = http.request(
    { host: UPSTREAM_HOST, port: UPSTREAM_PORT, method: req.method, path: upstreamPath, headers },
    (ures) => {
      res.writeHead(ures.statusCode || 502, ures.headers);
      ures.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("upstream error: " + err.message);
  });
  req.pipe(upstream);
});

server.listen(LISTEN_PORT, () => {
  console.log(`Ingress simulator listening on http://127.0.0.1:${LISTEN_PORT}`);
  console.log(`Try: http://127.0.0.1:${LISTEN_PORT}/api/hassio_ingress/abc123/`);
});
