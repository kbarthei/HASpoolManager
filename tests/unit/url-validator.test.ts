import { describe, it, expect } from "vitest";
import { 
  validateURL, 
  validateURLs, 
  extractDomain, 
  isDomainAllowed,
  getAllowedDomains 
} from "@/lib/url-validator";

describe("URL Validator - SSRF Protection", () => {
  describe("validateURL", () => {
    it("accepts valid shop URLs", () => {
      const validUrls = [
        "https://store.bambulab.com/products/pla-basic",
        "https://eu.store.bambulab.com/products/pla-matte",
        "https://3djake.de/filament/pla",
        "https://www.amazon.de/dp/B08XYZ123",
        "https://shop.prusa3d.com/en/filament/123",
      ];

      for (const url of validUrls) {
        const result = validateURL(url);
        expect(result.valid).toBe(true);
        expect(result.sanitizedUrl).toBeDefined();
        expect(result.error).toBeUndefined();
      }
    });

    it("blocks private IP addresses (RFC 1918)", () => {
      const privateIPs = [
        "http://127.0.0.1/",
        "http://127.0.0.1:8080/admin",
        "http://10.0.0.1/",
        "http://172.16.0.1/",
        "http://172.31.255.255/",
        "http://192.168.1.1/",
        "http://192.168.0.100:3000/",
      ];

      for (const url of privateIPs) {
        const result = validateURL(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("blocked");
      }
    });

    it("blocks localhost variations", () => {
      const localhostUrls = [
        "http://localhost/",
        "http://localhost:3000/api",
        "https://localhost/admin",
      ];

      for (const url of localhostUrls) {
        const result = validateURL(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("blocked");
      }
    });

    it("blocks cloud metadata endpoints", () => {
      const metadataUrls = [
        "http://169.254.169.254/latest/meta-data/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://metadata/",
      ];

      for (const url of metadataUrls) {
        const result = validateURL(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("blocked");
      }
    });

    it("blocks link-local addresses", () => {
      const linkLocalUrls = [
        "http://169.254.1.1/",
        "http://169.254.255.255/",
      ];

      for (const url of linkLocalUrls) {
        const result = validateURL(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("blocked");
      }
    });

    it("blocks IPv6 loopback and link-local", () => {
      const ipv6Urls = [
        "http://[::1]/",
        "http://[fe80::1]/",
        "http://[fc00::1]/",
        "http://[fd00::1]/",
      ];

      for (const url of ipv6Urls) {
        const result = validateURL(url);
        expect(result.valid).toBe(false);
        // IPv6 addresses are treated as unknown domains (not in allowlist)
        expect(result.error).toBeDefined();
      }
    });

    it("blocks non-HTTP protocols", () => {
      const invalidProtocols = [
        "ftp://example.com/file.txt",
        "file:///etc/passwd",
        "gopher://example.com/",
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
      ];

      for (const url of invalidProtocols) {
        const result = validateURL(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Protocol");
      }
    });

    it("blocks non-standard ports", () => {
      const nonStandardPorts = [
        "https://store.bambulab.com:8080/products",
        "http://3djake.de:3000/filament",
        "https://amazon.de:9999/dp/123",
      ];

      for (const url of nonStandardPorts) {
        const result = validateURL(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("port");
      }
    });

    it("allows standard ports (80, 443)", () => {
      const standardPorts = [
        "http://store.bambulab.com:80/products",
        "https://3djake.de:443/filament",
      ];

      for (const url of standardPorts) {
        const result = validateURL(url);
        expect(result.valid).toBe(true);
      }
    });

    it("blocks domains not in allowlist", () => {
      const unknownDomains = [
        "https://evil.com/phishing",
        "https://attacker.net/malware",
        "https://random-shop.xyz/products",
      ];

      for (const url of unknownDomains) {
        const result = validateURL(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("not in allowlist");
      }
    });

    it("strips credentials from URLs", () => {
      const urlWithCreds = "https://user:pass@store.bambulab.com/products";
      const result = validateURL(urlWithCreds);
      
      expect(result.valid).toBe(true);
      expect(result.sanitizedUrl).not.toContain("user");
      expect(result.sanitizedUrl).not.toContain("pass");
      expect(result.sanitizedUrl).toBe("https://store.bambulab.com/products");
    });

    it("handles invalid URL format", () => {
      const invalidUrls = [
        "not a url",
        "://no-protocol.com",
        "",
        "   ",
      ];

      for (const url of invalidUrls) {
        const result = validateURL(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid URL format");
      }
    });

    it("blocks URLs with typo protocols", () => {
      // "htp://missing-t.com" is actually valid URL format, just wrong protocol
      const result = validateURL("htp://missing-t.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Protocol");
    });

    it("accepts subdomains of allowed domains", () => {
      const subdomains = [
        "https://shop.bambulab.com/products",
        "https://eu.store.bambulab.com/products",
        "https://us.store.bambulab.com/products",
        "https://www.3djake.de/filament",
      ];

      for (const url of subdomains) {
        const result = validateURL(url);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe("validateURLs", () => {
    it("validates multiple URLs in batch", () => {
      const urls = [
        "https://store.bambulab.com/products/pla",
        "http://127.0.0.1/admin",
        "https://3djake.de/filament",
        "https://evil.com/phishing",
      ];

      const results = validateURLs(urls);

      expect(results).toHaveLength(4);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
      expect(results[2].valid).toBe(true);
      expect(results[3].valid).toBe(false);
    });
  });

  describe("extractDomain", () => {
    it("extracts domain from valid URLs", () => {
      expect(extractDomain("https://store.bambulab.com/products")).toBe("store.bambulab.com");
      expect(extractDomain("http://3djake.de:443/filament")).toBe("3djake.de");
      expect(extractDomain("https://www.amazon.de/dp/123?ref=xyz")).toBe("www.amazon.de");
    });

    it("returns null for invalid URLs", () => {
      expect(extractDomain("not a url")).toBeNull();
      expect(extractDomain("")).toBeNull();
    });

    it("extracts domain even from URLs with invalid protocols", () => {
      // URL constructor accepts any protocol, so this is technically valid
      expect(extractDomain("htp://broken")).toBe("broken");
    });
  });

  describe("isDomainAllowed", () => {
    it("returns true for allowed domains", () => {
      expect(isDomainAllowed("bambulab.com")).toBe(true);
      expect(isDomainAllowed("store.bambulab.com")).toBe(true);
      expect(isDomainAllowed("3djake.de")).toBe(true);
      expect(isDomainAllowed("amazon.de")).toBe(true);
    });

    it("returns false for unknown domains", () => {
      expect(isDomainAllowed("evil.com")).toBe(false);
      expect(isDomainAllowed("random-shop.xyz")).toBe(false);
      expect(isDomainAllowed("localhost")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(isDomainAllowed("BAMBULAB.COM")).toBe(true);
      expect(isDomainAllowed("Store.BambuLab.COM")).toBe(true);
    });
  });

  describe("getAllowedDomains", () => {
    it("returns list of allowed domains", () => {
      const domains = getAllowedDomains();
      
      expect(Array.isArray(domains)).toBe(true);
      expect(domains.length).toBeGreaterThan(0);
      expect(domains).toContain("bambulab.com");
      expect(domains).toContain("3djake.de");
      expect(domains).toContain("amazon.de");
    });
  });

  describe("Edge Cases", () => {
    it("handles URLs with query parameters", () => {
      const url = "https://store.bambulab.com/products/pla?color=black&size=1kg";
      const result = validateURL(url);
      
      expect(result.valid).toBe(true);
      expect(result.sanitizedUrl).toContain("?color=black&size=1kg");
    });

    it("handles URLs with fragments", () => {
      const url = "https://3djake.de/filament/pla#reviews";
      const result = validateURL(url);
      
      expect(result.valid).toBe(true);
      expect(result.sanitizedUrl).toContain("#reviews");
    });

    it("handles URLs with encoded characters", () => {
      const url = "https://amazon.de/dp/B08XYZ123?tag=test%20value";
      const result = validateURL(url);
      
      expect(result.valid).toBe(true);
    });

    it("blocks broadcast address", () => {
      const result = validateURL("http://255.255.255.255/");
      expect(result.valid).toBe(false);
    });

    it("blocks zero address", () => {
      const result = validateURL("http://0.0.0.0/");
      expect(result.valid).toBe(false);
    });

    it("blocks multicast addresses", () => {
      const result = validateURL("http://224.0.0.1/");
      expect(result.valid).toBe(false);
    });
  });
});

// Made with Bob
