import { describe, it, expect } from "vitest";
import { probeReachable } from "@/lib/printer-ftp";

describe("printer-ftp", () => {
  describe("probeReachable", () => {
    // Use a non-routable address (TEST-NET-1, RFC 5737) so we get a clean
    // timeout regardless of the host's actual network state.
    it("returns false for unreachable host within timeout", async () => {
      const result = await probeReachable("192.0.2.1", 990, 500);
      expect(result).toBe(false);
    }, 2000);

    it("returns false for closed port on a host that's reachable", async () => {
      // 127.0.0.1 with a port we don't bind to — gets RST immediately.
      const result = await probeReachable("127.0.0.1", 1, 500);
      expect(result).toBe(false);
    });
  });
});
