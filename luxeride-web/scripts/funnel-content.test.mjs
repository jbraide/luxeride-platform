#!/usr/bin/env node
/**
 * The funnel content guard — `funnel-pages` §Testing Strategy (task 8.1).
 *
 * WHAT IS BEING PROTECTED, AND WHY IT IS MECHANICAL
 *
 * Every rule here is one a person can break by typing a sentence that looks
 * reasonable and is exactly the thing `trust-and-policies` and `funnel-pages`
 * forbid. The blueprint the owner started from contained all of them, which is the
 * argument for a test rather than a review note:
 *
 *   1. **No price.** A fiction as central as "Single ₦55,000 / Save ₦10,000" reads
 *      like copy and is a number the checkout would contradict. A funnel module holds
 *      no figure at all; prices are read from the catalogue at render time (4.1).
 *   2. **No scarcity, no urgency, no unearned proof.** "12 slots, 7 left", "expires
 *      Sunday", "trusted by 500+ drivers" are forbidden outright until real data
 *      produces them (`trust-and-policies` 1.1, 1.3, 11.3).
 *   3. **No analytics.** Tracking is owned by `ad-landing-and-tracking`; a funnel
 *      module declares no event, and `lead` in particular is an ORDER, never a click
 *      (10.1).
 *   4. **No dangling link.** Every `href` is in the declared route allow-list, so a
 *      page cannot point at the `/shop/tpe-mats` the blueprint named and the app does
 *      not have (7.2, 7.3).
 *
 * NO DATABASE AND NO SERVER. The modules are pure data, so they load under
 * `node --test`; the two page files and the sitemap are read as source text, which
 * is the strongest check available without booting Next.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SECTION_KINDS } from "../src/data/funnel/sections.ts";
import { EVENT_REGISTRY } from "../src/lib/analytics/events.ts";
import { whyCarpetFails } from "../src/data/funnel/why-carpet-fails.ts";
import { offer, offerFallback } from "../src/data/funnel/offer.ts";
import { CATEGORY_FUNNEL_SECTIONS } from "../src/data/funnel/category-sections.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const FUNNEL_DIR = path.join(ROOT, "src", "data", "funnel");

/**
 * Every content module, named explicitly so this file imports with the same static
 * shape the other gates use. The set is checked against the directory below, so a
 * new module that nobody added here fails rather than going unguarded.
 */
const MODULES = [
  { file: "why-carpet-fails.ts", namespace: { whyCarpetFails } },
  { file: "offer.ts", namespace: { offer, offerFallback } },
  { file: "category-sections.ts", namespace: { CATEGORY_FUNNEL_SECTIONS } },
];

test("every content module in src/data/funnel is covered by this guard", () => {
  const discovered = fs
    .readdirSync(FUNNEL_DIR)
    .filter((name) => name.endsWith(".ts") && name !== "sections.ts")
    .sort();
  assert.deepEqual(
    discovered,
    MODULES.map((module) => module.file).sort(),
    "a content module exists that this guard does not scan — add it to MODULES",
  );
});

// ── 1. No price, and no digit a reader could read as one ─────────────────────

test("no funnel content module carries a naira figure or a price-sized digit run", () => {
  for (const { file, namespace } of MODULES) {
    const serialized = JSON.stringify(namespace);
    assert.ok(!serialized.includes("₦"), `${file} contains a naira symbol`);
    assert.ok(!/\bNGN\b/.test(serialized), `${file} names a naira amount as NGN`);
    assert.ok(
      !/\d{3,}/.test(serialized),
      `${file} contains a run of three or more digits, which is a price or a count — see Requirement 4.1`,
    );
  }
});

// ── 2. No scarcity, countdown or unearned social proof ───────────────────────

const FORBIDDEN = [
  { pattern: /expir/i, why: "an urgency that expires (trust-and-policies 1.4, 11.3)" },
  { pattern: /\bslots?\b/i, why: "a scarcity slot count" },
  { pattern: /only\s+[^\s]+\s+left/i, why: "\"only N left\"" },
  { pattern: /sold in the last/i, why: "a recent-sales count" },
  { pattern: /people viewing/i, why: "an \"N people viewing\" figure" },
  { pattern: /countdown/i, why: "a countdown timer" },
  { pattern: /\bhurry\b/i, why: "manufactured urgency" },
  { pattern: /limited time/i, why: "a limited-time claim" },
  { pattern: /\bin stock\b/i, why: "a stock claim with no stock system (1.3)" },
  { pattern: /low stock/i, why: "a stock claim with no stock system (1.3)" },
  { pattern: /trusted by/i, why: "unearned social proof (1.1)" },
  { pattern: /happy (?:drivers|customers)/i, why: "unearned social proof (1.1)" },
];

test("no funnel content module carries a scarcity, urgency or unearned-proof claim", () => {
  for (const { file, namespace } of MODULES) {
    const serialized = JSON.stringify(namespace);
    for (const { pattern, why } of FORBIDDEN) {
      assert.ok(!pattern.test(serialized), `${file} contains ${why} (matched ${pattern})`);
    }
  }
});

// ── 3. No analytics, and never `lead` ────────────────────────────────────────

const ANALYTICS_TOKENS = [
  "EVENT_REGISTRY",
  "trackEvent",
  "analytics",
  "fbq(",
  "gtag(",
  "dataLayer",
  "@/lib/analytics",
];

function collectStrings(node, out) {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, out);
    return out;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectStrings(value, out);
  }
  return out;
}

test("no funnel content module declares or fires an analytics event", () => {
  const eventNames = new Set(Object.keys(EVENT_REGISTRY));

  for (const { file, namespace } of MODULES) {
    const source = fs.readFileSync(path.join(FUNNEL_DIR, file), "utf8");

    for (const token of ANALYTICS_TOKENS) {
      assert.ok(!source.includes(token), `${file} mentions ${token} — tracking is not this spec's to add`);
    }
    assert.ok(!source.includes("dangerouslySetInnerHTML"), `${file} can inject markup`);
    assert.ok(!source.includes("innerHTML"), `${file} can inject markup`);

    for (const value of collectStrings(namespace, [])) {
      assert.ok(
        !eventNames.has(value),
        `${file} names the analytics event "${value}" — events belong to ad-landing-and-tracking (10.2)`,
      );
    }
  }
});

// ── 4. Every link points at a route that exists ──────────────────────────────

/**
 * The route allow-list from `design.md`. The two patterns are the dynamic routes,
 * matched concretely: `/shop/<slug>` and `/products/<slug>`.
 */
const STATIC_ROUTES = new Set([
  "/",
  "/shop",
  "/fit-finder",
  "/cart",
  "/checkout",
  "/contact",
  "/offer",
  "/why-carpet-fails",
]);
const ROUTE_PATTERNS = [/^\/shop\/[a-z0-9-]+$/, /^\/products\/[a-z0-9-]+$/];

function isAllowedHref(href) {
  return STATIC_ROUTES.has(href) || ROUTE_PATTERNS.some((pattern) => pattern.test(href));
}

function collectHrefs(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectHrefs(item, out);
    return out;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "href" && typeof value === "string") out.push(value);
      collectHrefs(value, out);
    }
  }
  return out;
}

test("every link target in a funnel content module is a route that exists", () => {
  let checked = 0;
  for (const { file, namespace } of MODULES) {
    for (const href of collectHrefs(namespace, [])) {
      checked += 1;
      assert.ok(isAllowedHref(href), `${file} links to "${href}", which is not in the allow-list`);
    }
  }
  assert.ok(checked > 0, "no links were checked — the walker or the content changed shape");
});

// ── 5. Structure the renderer can actually render ────────────────────────────

function collectSections(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectSections(item, out);
    return out;
  }
  if (node && typeof node === "object") {
    if (typeof node.kind === "string") out.push(node);
    for (const value of Object.values(node)) collectSections(value, out);
  }
  return out;
}

test("every section uses a kind the renderer knows", () => {
  const known = new Set(Object.keys(SECTION_KINDS));
  let checked = 0;
  for (const { file, namespace } of MODULES) {
    for (const section of collectSections(namespace, [])) {
      checked += 1;
      assert.ok(known.has(section.kind), `${file} uses section kind "${section.kind}", which nothing renders`);
    }
  }
  assert.ok(checked > 0, "no sections were checked — the walker or the content changed shape");
});

test("every comparison row matches its column count", () => {
  for (const { file, namespace } of MODULES) {
    for (const section of collectSections(namespace, [])) {
      if (section.kind !== "comparison") continue;
      for (const row of section.rows) {
        assert.equal(
          row.cells.length,
          section.columns.length,
          `${file}: row "${row.label}" has ${row.cells.length} cells for ${section.columns.length} columns`,
        );
      }
    }
  }
});

// ── 6. Each page gives itself a canonical at the route it serves ─────────────

test("each funnel page module carries its own self-referencing path", () => {
  assert.equal(whyCarpetFails.metadata.path, "/why-carpet-fails");
  assert.equal(offer.metadata.path, "/offer");
});

test("both funnel page files are Server Components that call pageMetadata", () => {
  for (const [dir, route] of [
    ["why-carpet-fails", "/why-carpet-fails"],
    ["offer", "/offer"],
  ]) {
    const file = path.join(ROOT, "src", "app", dir, "page.tsx");
    assert.ok(fs.existsSync(file), `src/app${route}/page.tsx is missing`);
    const source = fs.readFileSync(file, "utf8");
    assert.ok(source.includes("pageMetadata("), `${file} does not call pageMetadata`);
    assert.ok(!source.includes('"use client"'), `${file} is a Client Component; it must render on the server`);
  }
});

// ── 7. Discoverability: sitemap lists them, robots does not exclude them ─────

test("both funnel routes are in the sitemap", () => {
  const source = fs.readFileSync(path.join(ROOT, "src", "app", "sitemap.ts"), "utf8");
  assert.ok(source.includes('"/why-carpet-fails"'), "the sitemap does not list /why-carpet-fails");
  assert.ok(source.includes('"/offer"'), "the sitemap does not list /offer");
});

test("robots does not disallow either funnel route", () => {
  const source = fs.readFileSync(path.join(ROOT, "src", "app", "robots.ts"), "utf8");
  const disallow = /disallow:\s*\[([^\]]*)\]/.exec(source);
  assert.ok(disallow, "robots.ts has no disallow list to check");
  assert.ok(!disallow[1].includes("/why-carpet-fails"), "robots disallows /why-carpet-fails");
  assert.ok(!disallow[1].includes("/offer"), "robots disallows /offer");
});

// ── 8. The FAQ opens without JavaScript ──────────────────────────────────────

test("the funnel FAQ renders as <details>/<summary>, the ProductFaq pattern", () => {
  const source = fs.readFileSync(path.join(ROOT, "src", "components", "funnel", "FaqBlock.tsx"), "utf8");
  assert.ok(source.includes("<details"), "FaqBlock does not use <details>");
  assert.ok(source.includes("<summary"), "FaqBlock does not use <summary>");
});
