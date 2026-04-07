// Full end-to-end test of HA ingress via simulator + Playwright.
import { chromium } from "playwright";

const BASE = "http://localhost:8080/api/hassio_ingress/abc123";

const failedRequests = [];
const consoleErrors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Spy on document.head.appendChild to catch <link> creations
await page.addInitScript(() => {
  const log = (m, n) => {
    if (n && n.tagName === "LINK" && (n.as === "font" || /woff2/.test(n.href || ""))) {
      console.log(m + " rel=" + n.rel + " href=" + n.href + " stack=" + new Error().stack.split("\n").slice(1, 4).join(" | "));
    }
  };
  for (const fn of ["appendChild", "insertBefore", "append", "prepend", "replaceChild"]) {
    const orig = Element.prototype[fn];
    Element.prototype[fn] = function (...args) {
      log("DOM_" + fn.toUpperCase(), args[0]);
      return orig.apply(this, args);
    };
  }
  // Also catch document.createElement followed by setAttribute
  const origCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, opts) {
    const el = origCreate.call(this, tag, opts);
    if (tag.toLowerCase() === "link") {
      const origSetAttr = el.setAttribute.bind(el);
      el.setAttribute = function (k, v) {
        if (k === "href" && /woff2/.test(v)) {
          console.log("LINK_SETATTR href=" + v + " stack=" + new Error().stack.split("\n").slice(1, 4).join(" | "));
        }
        return origSetAttr(k, v);
      };
    }
    return el;
  };
});

page.on("requestfailed", (req) => {
  const init = req.frame().url();
  failedRequests.push(`FAIL ${req.failure()?.errorText} ${req.url()} (resourceType=${req.resourceType()}, frame=${init})`);
});
page.on("response", (res) => {
  if (res.status() >= 400) {
    failedRequests.push(`${res.status()} ${res.url()}`);
  }
});
page.on("request", (req) => {
  if (/\.css|woff2/.test(req.url())) {
    console.log(`REQ ${req.resourceType()} ${req.url()}`);
  }
});
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => {
  consoleErrors.push("PAGE ERROR: " + err.message);
});

console.log(`Navigating to ${BASE}/ ...`);
try {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 15000 });
} catch (e) {
  console.log("Navigation error:", e.message);
}

console.log(`Title: ${await page.title()}`);
console.log(`Current URL: ${page.url()}`);

try {
  await page.waitForSelector("a[href*='spools']", { timeout: 5000 });
  console.log("Found Spools nav link - page hydrated");
} catch {
  console.log("Spools nav link NOT found - hydration may have failed");
}

const navLinks = await page.$$eval("a[href]", (as) =>
  as.map((a) => a.getAttribute("href")).filter(Boolean).slice(0, 10)
);
console.log(`Nav links:`, navLinks);

const spoolsLink = await page.$("a[href*='spools']");
if (spoolsLink) {
  console.log("\nClicking Spools link...");
  await Promise.all([
    page.waitForURL(/\/spools(\?|$)/, { timeout: 10000 }).catch((e) => console.log("waitForURL:", e.message)),
    spoolsLink.click(),
  ]);
  console.log(`URL after click: ${page.url()}`);
  console.log(`Title after click: ${await page.title()}`);
  const headings = await page.evaluate(() => Array.from(document.querySelectorAll("h1, h2")).slice(0, 5).map((e) => e.textContent?.slice(0, 60)));
  console.log(`Headings: ${JSON.stringify(headings)}`);
}

console.log("\n=== SUMMARY ===");
console.log(`Failed requests: ${failedRequests.length}`);
failedRequests.slice(0, 20).forEach((f) => console.log("  " + f));
console.log(`Console errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 10).forEach((e) => console.log("  " + e));

await browser.close();
process.exit(failedRequests.length > 0 || consoleErrors.length > 0 ? 1 : 0);
