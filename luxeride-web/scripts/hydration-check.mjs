#!/usr/bin/env node
/**
 * Hydration check — the console half of `storefront-catalog` §15 and the M1 gate
 * assertion "the dev-server console shows no hydration warning on /cart,
 * /checkout or /order/confirmation".
 *
 *   npm run check:hydration                 (against http://localhost:3000)
 *   npm run check:hydration -- http://localhost:3001
 *
 * Why this exists: the check is otherwise a human staring at a browser console,
 * which is exactly the kind of gate that gets skipped. It drives the Chrome that
 * is already installed, over CDP, with **no new dependency** — Node 22 ships a
 * global `WebSocket`, and the transport here is a pipe, not a socket.
 *
 * Two deliberate choices:
 *
 *  - **`--remote-debugging-pipe`, not a TCP port.** Under a restrictive sandbox
 *    Chrome's `socket()` can be denied outright (`CreatePlatformSocket() failed:
 *    Permission denied` -> `Cannot start http server for devtools`), which kills
 *    the port transport while leaving the pipe transport working.
 *  - **A throwaway `--user-data-dir` with `--disable-extensions`.** React lists a
 *    browser extension as a cause of hydration mismatch, and this machine has one
 *    that stamps `cz-shortcut-listen` onto `<body>`. A real browser would report
 *    that as a mismatch forever and it is not a defect in this code.
 *
 * IMPORTANT — it needs a shell where Chrome can actually open a socket. In a
 * sandbox that denies it, every navigation lands on `chrome-error://chromewebdata/`
 * and the script reports a page that never loaded rather than a page with no
 * warnings. Read the `probe` block: `href` must be the route you asked for and
 * `textLen` must be non-trivial. An empty `problems` array on its own is not a
 * pass.
 *
 * The script seeds `localStorage` with a cart and a placed order first, so the
 * three storage-backed screens render the hydrated path rather than their empty
 * states — a mismatch in the empty state is not the one D1 was about.
 *
 * `CHROME_BIN` overrides the browser binary (default `google-chrome`).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ORIGIN = process.argv[2] ?? "http://localhost:3000";
const CHROME_BIN = process.env.CHROME_BIN ?? "google-chrome";
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "luxeride-hydration-"));
const profile = path.join(SCRATCH, "prof");
try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch {}
fs.mkdirSync(profile, { recursive: true });

const chrome = spawn(
  CHROME_BIN,
  [
    "--headless",
    "--remote-debugging-pipe",
    `--user-data-dir=${profile}`,
    `--crash-dumps-dir=${profile}`,
    "--disable-crash-reporter",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
chrome.stdio[2].on("data", (d) => { chromeErr += d.toString(); });
let chromeErr = "";
const toChrome = chrome.stdio[3];
const fromChrome = chrome.stdio[4];

let id = 0;
const pending = new Map();
let events = [];
let buffer = Buffer.alloc(0);

fromChrome.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  let idx;
  while ((idx = buffer.indexOf(0)) !== -1) {
    const raw = buffer.subarray(0, idx).toString("utf8");
    buffer = buffer.subarray(idx + 1);
    if (!raw.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      continue;
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result ?? msg.error ?? {});
      pending.delete(msg.id);
    } else if (msg.method) {
      events.push(msg);
    }
  }
});

function send(method, params = {}, sessionId) {
  const msgId = ++id;
  const payload = { id: msgId, method, params };
  if (sessionId) payload.sessionId = sessionId;
  return new Promise((resolve, reject) => {
    pending.set(msgId, resolve);
    toChrome.write(JSON.stringify(payload) + "\0");
    setTimeout(() => {
      if (pending.has(msgId)) {
        pending.delete(msgId);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 15000);
  });
}

// ── attach to the initial page target ────────────────────────────────────────
let sessionId = null;
for (let attempt = 0; attempt < 40 && !sessionId; attempt++) {
  await sleep(300);
  try {
    const targets = await send("Target.getTargets");
    const page = (targets.targetInfos ?? []).find((t) => t.type === "page");
    if (page) {
      const attached = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
      sessionId = attached.sessionId ?? null;
    }
  } catch {
    /* chrome not listening yet */
  }
}
if (!sessionId) {
  console.error("could not attach to a page target");
  console.error("chrome stderr was suppressed; profile:", profile);
  chrome.kill("SIGKILL");
  process.exit(2);
}

const evaluate = async (expression) => {
  const r = await send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId
  );
  return r?.result?.value;
};

await send("Runtime.enable", {}, sessionId);
await send("Log.enable", {}, sessionId);
await send("Page.enable", {}, sessionId);

function describe(event) {
  if (event.method === "Runtime.exceptionThrown") {
    const d = event.params.exceptionDetails;
    return `EXCEPTION: ${d.exception?.description ?? d.text}`;
  }
  if (event.method === "Log.entryAdded") {
    const e = event.params.entry;
    if (!["error", "warning"].includes(e.level)) return null;
    return `${e.level.toUpperCase()}: ${e.text}`;
  }
  if (event.method === "Runtime.consoleAPICalled") {
    if (!["error", "warning"].includes(event.params.type)) return null;
    const text = event.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    return `${event.params.type.toUpperCase()}: ${text}`;
  }
  return null;
}

const CART_ITEM = {
  id: "probe-1",
  productSlug: "double-layer-mats",
  productName: "Double Layer Mats",
  brand: "Toyota",
  model: "Camry",
  year: "2015",
  rows: "2",
  unitPrice: 68000,
  qty: 2,
  image: "/products/double-layer.svg",
};
const ORDER = {
  id: "LR-PROBE",
  name: "Probe",
  phone: "07049621694",
  address: "1 Test Road",
  location: "Lagos Mainland & Island",
  paymentMethod: "pod",
  items: [CART_ITEM],
  subtotal: 136000,
  shippingFee: 9000,
  discount: 0,
  total: 145000,
  whatsappMessage: "probe",
  placedAt: new Date().toISOString(),
};

await send("Page.navigate", { url: `${ORIGIN}/` }, sessionId);
await sleep(3000);
await evaluate(`
  localStorage.setItem('luxeride-cart', ${JSON.stringify(JSON.stringify({ state: { items: [CART_ITEM] }, version: 0 }))});
  localStorage.setItem('luxeride-last-order', ${JSON.stringify(JSON.stringify({ state: { lastOrder: ORDER }, version: 0 }))});
  'seeded'
`);

const ROUTES = ["/", "/cart", "/checkout", "/order/confirmation", "/fit-finder", "/products/seat-covers"];
const results = [];
for (const route of ROUTES) {
  events = [];
  await send("Page.navigate", { url: ORIGIN + route }, sessionId);
  await sleep(4000);

  const problems = events.map(describe).filter(Boolean);
  // Evidence that the page actually loaded and rendered — an empty `problems`
  // array is only meaningful if something rendered.
  const probe = await evaluate(`JSON.stringify({
    href: location.href,
    ready: document.readyState,
    title: document.title,
    textLen: document.body ? document.body.textContent.length : -1,
    hasDoubleLayer: document.body ? document.body.textContent.includes('Double Layer Mats') : false,
    hasOrder: document.body ? document.body.textContent.includes('LR-PROBE') : false,
    hasPlaceholder: document.body ? document.body.textContent.includes('Photo pending') : false,
    hasSkeleton: document.body ? document.body.textContent.includes('Loading your') : false
  })`);

  results.push({ route, problems, probe: probe ? JSON.parse(probe) : null });
}

console.log(JSON.stringify(results, null, 2));

const loaded = results.filter((r) => r.probe && !String(r.probe.href).startsWith("chrome-error://"));
if (loaded.length !== results.length) {
  console.error(
    `\n${results.length - loaded.length} of ${results.length} routes never loaded — Chrome could not reach ${ORIGIN}.`
  );
  console.error("That is an environment failure, not a passing check. See the header.");
  chrome.kill("SIGKILL");
  process.exit(2);
}

const warnings = results.filter((r) => r.problems.length > 0);
if (warnings.length > 0) {
  console.error(`\nhydration check FAILED — ${warnings.length} route(s) logged an error or warning.`);
  chrome.kill("SIGKILL");
  process.exit(1);
}

const hydrated = results.filter((r) => r.probe.hasDoubleLayer || r.probe.hasOrder || r.probe.hasPlaceholder);
console.log(`\nhydration check OK — ${results.length} route(s), no console errors or warnings.`);
console.log(
  `Rendered evidence on ${hydrated.length} route(s); the storage-backed screens read their persisted store without a mismatch.`
);
console.log("--- chrome stderr (network-related) ---");
console.log(chromeErr.split("\n").filter((l) => /socket|network|proxy|resolve|ERR_|devtools/i.test(l)).slice(0, 12).join("\n") || "(nothing matched)");

chrome.kill("SIGKILL");
try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch {}
