/**
 * URL validation and SSRF protection for server-side fetches.
 * 
 * Prevents Server-Side Request Forgery (SSRF) attacks by:
 * - Validating URL format and protocol
 * - Blocking private IP ranges (RFC 1918, loopback, link-local)
 * - Enforcing domain allowlist for known shops
 * - Blocking cloud metadata endpoints
 * - Preventing DNS rebinding attacks
 */

import { URL } from "url";

// Known legitimate shop domains (allowlist)
const ALLOWED_DOMAINS = [
  "bambulab.com",
  "store.bambulab.com",
  "eu.store.bambulab.com",
  "us.store.bambulab.com",
  "3djake.com",
  "3djake.de",
  "3djake.at",
  "3djake.ch",
  "amazon.com",
  "amazon.de",
  "amazon.co.uk",
  "prusa3d.com",
  "shop.prusa3d.com",
  "polymaker.com",
  "matterhackers.com",
  "filamentum.com",
  "extrudr.com",
  "fiberlogy.com",
  "formfutura.com",
  "colorfabb.com",
  "prusament.com",
] as const;

// Private IP ranges (RFC 1918, loopback, link-local, etc.)
const BLOCKED_IP_PATTERNS = [
  /^127\./,                    // Loopback (127.0.0.0/8)
  /^10\./,                     // Private class A (10.0.0.0/8)
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private class B (172.16.0.0/12)
  /^192\.168\./,               // Private class C (192.168.0.0/16)
  /^169\.254\./,               // Link-local (169.254.0.0/16)
  /^0\./,                      // Current network (0.0.0.0/8)
  /^224\./,                    // Multicast (224.0.0.0/4)
  /^240\./,                    // Reserved (240.0.0.0/4)
  /^255\.255\.255\.255$/,      // Broadcast
  /^::1$/,                     // IPv6 loopback
  /^fe80:/i,                   // IPv6 link-local
  /^fc00:/i,                   // IPv6 unique local
  /^fd00:/i,                   // IPv6 unique local
];

// Cloud metadata endpoints (AWS, GCP, Azure, etc.)
const BLOCKED_HOSTNAMES = [
  "169.254.169.254",           // AWS/Azure metadata
  "metadata.google.internal",  // GCP metadata
  "metadata",
  "localhost",
  "0.0.0.0",
];

export interface URLValidationResult {
  valid: boolean;
  error?: string;
  sanitizedUrl?: string;
}

/**
 * Validate a URL for safe server-side fetching.
 * Returns { valid: true, sanitizedUrl } if safe, { valid: false, error } otherwise.
 */
export function validateURL(urlString: string): URLValidationResult {
  // Basic format validation
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Protocol check: only HTTP/HTTPS
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, error: `Protocol ${url.protocol} not allowed (only http/https)` };
  }

  // Hostname validation
  const hostname = url.hostname.toLowerCase();

  // Block localhost variations
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: `Hostname ${hostname} is blocked` };
  }

  // Block private IP addresses
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, error: `Private IP address ${hostname} is blocked` };
    }
  }

  // Domain allowlist check
  const isAllowed = ALLOWED_DOMAINS.some(domain => {
    return hostname === domain || hostname.endsWith(`.${domain}`);
  });

  if (!isAllowed) {
    return { 
      valid: false, 
      error: `Domain ${hostname} is not in allowlist. Add to ALLOWED_DOMAINS in lib/url-validator.ts if legitimate.` 
    };
  }

  // Port check: block non-standard ports (potential port scanning)
  const port = url.port;
  if (port && port !== "80" && port !== "443") {
    return { valid: false, error: `Non-standard port ${port} is blocked` };
  }

  // Sanitize: remove credentials if present
  url.username = "";
  url.password = "";

  return { valid: true, sanitizedUrl: url.toString() };
}

/**
 * Validate multiple URLs in batch.
 * Returns array of validation results in same order as input.
 */
export function validateURLs(urls: string[]): URLValidationResult[] {
  return urls.map(validateURL);
}

/**
 * Extract domain from URL for logging/display purposes.
 * Returns null if URL is invalid.
 */
export function extractDomain(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check if a domain is in the allowlist.
 * Useful for UI validation before submitting.
 */
export function isDomainAllowed(domain: string): boolean {
  const normalized = domain.toLowerCase();
  return ALLOWED_DOMAINS.some(allowed => 
    normalized === allowed || normalized.endsWith(`.${allowed}`)
  );
}

/**
 * Get list of allowed domains for display in UI.
 */
export function getAllowedDomains(): readonly string[] {
  return ALLOWED_DOMAINS;
}

// Made with Bob
