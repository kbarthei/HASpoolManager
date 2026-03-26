import { describe, it, expect } from "vitest";

// Integration tests call the API routes directly
// They require DATABASE_URL to be set (use .env.local)
// Skip if no database connection available

const BASE = "http://localhost:3000/api/v1";

describe.skipIf(!process.env.DATABASE_URL)("API Integration Tests", () => {
  // Note: These tests require `npm run dev` to be running
  // In CI, use a test database and start the server before tests

  describe("Health endpoint", () => {
    it("GET /api/v1/health returns ok", async () => {
      const res = await fetch(`${BASE}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.version).toBe("0.1.0");
      expect(data.timestamp).toBeDefined();
    });
  });
});
