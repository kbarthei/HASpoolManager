/* eslint-disable no-console */
/**
 * Mock Bambu printer FTPS server for local testing.
 *
 * Mimics the parts of the printer's FTPS interface that our pull-flow uses:
 *  - Implicit TLS on a configurable port (default 9990; needs sudo for 990)
 *  - Username "bblp", password = the configured access code
 *  - cache/ directory with .3mf files served via LIST + RETR
 *  - Self-signed cert (Bambu's cert is self-signed too)
 *
 * The mock does NOT cover:
 *  - MQTT control plane (you can stub that separately if needed)
 *  - File upload (printer firmware accepts STOR but our addon never calls it)
 *  - "concurrent print blocking" timeouts (we always serve happily)
 *
 * Usage:
 *   npx tsx scripts/mock-bambu-printer.ts
 *
 *   # then in another terminal, against the mock:
 *   PRINTER_IP=127.0.0.1 PRINTER_PORT=9990 PRINTER_ACCESS_CODE=12345678 \
 *     npx tsx scripts/test-printer-ftp.ts
 *
 * Configurable via env vars:
 *   MOCK_FTP_PORT       (default 9990)
 *   MOCK_ACCESS_CODE    (default 12345678)
 *   MOCK_CACHE_DIR      (default tests/fixtures/3mf — already has 3 real 3MFs)
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { execFileSync } from "child_process";
import FtpSrv from "ftp-srv";

const PORT = parseInt(process.env.MOCK_FTP_PORT ?? "9990", 10);
const ACCESS_CODE = process.env.MOCK_ACCESS_CODE ?? "12345678";
const SOURCE_FIXTURES = process.env.MOCK_CACHE_DIR ?? path.resolve(__dirname, "../tests/fixtures/3mf");

// Build a temp dir laid out like a Bambu printer's filesystem:
//   <root>/cache/<file>.gcode.3mf
// FTP root is <root>; the printer's `cache/` directory is one level deep.
const ROOT = path.join(tmpdir(), "haspoolmanager-mock-bambu");
const CACHE = path.join(ROOT, "cache");
mkdirSync(CACHE, { recursive: true });

if (existsSync(SOURCE_FIXTURES)) {
  const fixtures = readdirSync(SOURCE_FIXTURES).filter((f) => f.endsWith(".3mf"));
  for (const f of fixtures) {
    // Bambu cache files end in .gcode.3mf — rename so the substring-match works.
    const src = path.join(SOURCE_FIXTURES, f);
    const dst = path.join(CACHE, f.replace(/\.3mf$/, ".gcode.3mf"));
    copyFileSync(src, dst);
  }
  console.log(`[mock] copied ${fixtures.length} fixture(s) to ${CACHE}/`);
} else {
  console.log(`[mock] WARN: source fixture dir ${SOURCE_FIXTURES} doesn't exist`);
}

// Generate a self-signed cert on the fly via execFile (no shell).
const certDir = path.join(ROOT, "tls");
mkdirSync(certDir, { recursive: true });
const keyPath = path.join(certDir, "key.pem");
const certPath = path.join(certDir, "cert.pem");

if (!existsSync(certPath)) {
  console.log(`[mock] generating self-signed TLS cert in ${certDir}`);
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "365",
      "-nodes",
      "-subj",
      "/CN=mock-bambu-printer",
    ],
    { stdio: "ignore" },
  );
}

const tlsOptions = {
  key: readFileSync(keyPath),
  cert: readFileSync(certPath),
};

// Implicit FTPS: ftp-srv uses ftps:// scheme to enable TLS-from-byte-0.
const ftpServer = new FtpSrv({
  url: `ftps://0.0.0.0:${PORT}`,
  tls: tlsOptions,
  pasv_url: "127.0.0.1",
  anonymous: false,
  greeting: "Mock Bambu printer (HASpoolManager test fixture)",
});

ftpServer.on(
  "login",
  (
    { username, password }: { username: string; password: string },
    resolve: (cfg: { root: string }) => void,
    reject: (err: Error) => void,
  ) => {
    if (username !== "bblp") {
      reject(new Error("Invalid username — Bambu printer accepts only 'bblp'"));
      return;
    }
    if (password !== ACCESS_CODE) {
      reject(new Error("Wrong access code (530)"));
      return;
    }
    resolve({ root: ROOT });
  },
);

ftpServer
  .listen()
  .then(() => {
    console.log("");
    console.log("Mock Bambu printer FTPS server is running.");
    console.log(`  Port:         ${PORT}`);
    console.log("  User:         bblp");
    console.log(`  Access code:  ${ACCESS_CODE}`);
    console.log(`  Files:        ${readdirSync(CACHE).length} in cache/`);
    console.log("");
    console.log("Test it (in another terminal):");
    console.log(`  PRINTER_IP=127.0.0.1 PRINTER_PORT=${PORT} \\`);
    console.log(`    PRINTER_ACCESS_CODE=${ACCESS_CODE} \\`);
    console.log("    npx tsx scripts/test-printer-ftp.ts");
    console.log("");
    console.log("Ctrl+C to stop.");
  })
  .catch((err: Error) => {
    console.error("[mock] FTP server failed to start:", err);
    process.exit(1);
  });
