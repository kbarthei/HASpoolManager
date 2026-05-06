import type { NextConfig } from "next";
import { readFileSync } from "fs";

function readAddonVersion(): string {
  try {
    const yaml = readFileSync("ha-addon/haspoolmanager/config.yaml", "utf8");
    return yaml.match(/version:\s*"([^"]+)"/)?.[1] ?? "dev";
  } catch { return "dev"; }
}

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow dev HMR + assets when accessing via 127.0.0.1 / 9.83.x (LAN IP)
  // alongside `localhost`. Without this, hitting http://127.0.0.1:3000
  // while Next thinks the origin is `localhost` triggers a cross-origin
  // block on /_next/webpack-hmr requests — pages render but live-reload
  // breaks and the page can look "stuck". Production builds are unaffected.
  allowedDevOrigins: ["127.0.0.1", "localhost", "0.0.0.0", "*.local"],
  // In HA addon mode, serve the app under a stable /ingress basePath.
  // Next.js then emits ALL asset/link URLs with this prefix, including
  // the dynamic chunk URLs that Turbopack builds at runtime. The addon's
  // nginx then only has to rewrite `/ingress/` to include the dynamic
  // HA session prefix — a clean, unique string pattern safe for JS bundle
  // rewriting. Without this, Turbopack's chunk base is `/_next/` which
  // conflicts with unrelated string literals and can't be safely rewritten.
  ...(process.env.HA_ADDON === "true" ? { basePath: "/ingress" } : {}),
  env: {
    BUILD_TIMESTAMP: new Date().toISOString(),
    ADDON_VERSION: readAddonVersion(),
  },
  async headers() {
    // In HA addon mode, omit headers that conflict with HA ingress iframe
    // (HSTS forces HTTPS upgrades, X-Frame-Options can block embedding,
    // Permissions-Policy on subdocuments has been observed to cancel loads).
    if (process.env.HA_ADDON === "true") {
      // Keep security headers but omit X-Frame-Options (breaks HA ingress iframe)
      // and HSTS (forces HTTPS upgrades on a LAN HTTP addon)
      return [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "X-DNS-Prefetch-Control", value: "on" },
          ],
        },
      ];
    }
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
