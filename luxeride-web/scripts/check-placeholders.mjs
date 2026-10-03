#!/usr/bin/env node
//
// The honesty floor, enforced mechanically — `trust-and-policies` §12.1–12.4.
//
// Four assertions:
//
//   1. No `[[OWNER INPUT REQUIRED:` token is left in a shipped data module
//      (`src/data/policies.ts`, `src/data/social.ts`). A policy page that ships
//      with an unfilled slot is a page that lies by omission.
//   2. A launch-critical social profile is not declared with `url: null`.
//   3. The guarantee string and the delivery fees live in exactly one place
//      (`src/lib/copy.ts` and `src/data/locations.ts`), so no two surfaces can
//      quote a different figure.
//   4. No fabricated-proof pattern (a star rating, "trusted by", "customers
//      served", an "in stock" claim) appears anywhere under `src/`.
//
// Exits non-zero while anything is outstanding. It is deliberately NOT in the
// `verify` chain: the owner has to fill the slots, and a build that refuses to
// run until then would stop the site deploying at all. It is the pre-spend gate.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

const OWNER_INPUT_TOKEN = "[[OWNER INPUT REQUIRED:";
const GUARANTEE_NEEDLE = "100% Perfect Fit Guarantee";

const PLACEHOLDER_FILES = [
  path.join(SRC, "data", "policies.ts"),
  path.join(SRC, "data", "social.ts"),
  path.join(SRC, "data", "business.ts"),
];

const failures = [];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mjs|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const srcFiles = walk(SRC);
const rel = (file) => path.relative(ROOT, file);

// ── 0: the list above must not go stale ──────────────────────────────────────
//
// PLACEHOLDER_FILES is hand-maintained because a blanket scan of `src/` produces
// false positives: several files legitimately mention the token in a comment while
// explaining the convention (`components/PolicyPage.tsx` shows it as an example).
// But a hand-maintained list silently under-reports the moment somebody adds a data
// module with owner slots in it — which is exactly what happened when
// `src/data/business.ts` was added and the gate kept reporting the old count.
//
// So: any file under `src/data/` that contains the token must be in the list. That
// is a real check with no false positives, because data modules do not carry
// explanatory prose about the token — they carry the token as a value.

const listedDataFiles = new Set(PLACEHOLDER_FILES);
for (const file of srcFiles) {
  if (!file.includes(`${path.sep}data${path.sep}`)) continue;
  if (listedDataFiles.has(file)) continue;
  if (!fs.readFileSync(file, "utf8").includes(OWNER_INPUT_TOKEN)) continue;
  failures.push(
    `${rel(file)}: contains an ${OWNER_INPUT_TOKEN} slot but is missing from PLACEHOLDER_FILES in ` +
      `scripts/check-placeholders.mjs. Add it there so the pre-spend gate can see it.`,
  );
}

// ── 1 + 2: owner-input tokens and null social URLs ───────────────────────────

for (const file of PLACEHOLDER_FILES) {
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (line.includes(OWNER_INPUT_TOKEN)) {
      failures.push(`${rel(file)}:${index + 1}: unfilled ${OWNER_INPUT_TOKEN} slot`);
    }
  });

  if (file.endsWith("social.ts")) {
    const contents = fs.readFileSync(file, "utf8");
    // Only a LAUNCH-CRITICAL profile blocks. A declared-but-optional profile
    // with `url: null` is the honest state — `SocialLinks` renders nothing for
    // it — so flagging it would push the owner to invent a link or delete a
    // truthful declaration.
    const entryRe = /\{[^{}]*?launchCritical:\s*(true|false)[^{}]*?\}/g;
    for (const match of contents.match(entryRe) ?? []) {
      if (!/launchCritical:\s*true/.test(match)) continue;
      if (!/url:\s*null/.test(match)) continue;
      const handle = /handle:\s*"([^"]+)"/.exec(match)?.[1] ?? "(unnamed)";
      failures.push(
        `${rel(file)}: launch-critical social profile ${handle} has url: null. Supply the real URL before spending.`,
      );
    }
  }
}

// ── 3: the guarantee and the delivery fees, single-sourced ───────────────────

const COPY_FILE = path.join(SRC, "lib", "copy.ts");
const LOCATIONS_FILE = path.join(SRC, "data", "locations.ts");

for (const file of srcFiles) {
  if (file === COPY_FILE) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (line.includes(GUARANTEE_NEEDLE)) {
      failures.push(
        `${rel(file)}:${index + 1}: restates the guarantee. Import it from src/lib/copy.ts.`,
      );
    }
  });
}

for (const file of srcFiles) {
  if (file === LOCATIONS_FILE) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/\bfee:\s*\d/.test(line)) {
      failures.push(
        `${rel(file)}:${index + 1}: hardcodes a delivery fee. Read it from src/data/locations.ts.`,
      );
    }
  });
}

// ── 4: fabricated proof ──────────────────────────────────────────────────────

// `aggregateRating` / `ratingValue` are deliberately NOT here: `seo-check.mjs`
// already asserts them across the structured-data path, and repeating the
// literal in this file would make `copy.ts` (which carries its own ban list)
// match itself.
const FABRICATION_PATTERNS = [
  { pattern: /trusted by/i, why: "a 'trusted by' claim" },
  { pattern: /customers served/i, why: "a 'customers served' claim" },
  { pattern: /[★⭐]/, why: "a star rating" },
  { pattern: /\b\d+\s*reviews?\b/i, why: "a review count" },
  { pattern: /\bin stock\b/i, why: "an 'in stock' claim" },
];

for (const file of srcFiles) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const { pattern, why } of FABRICATION_PATTERNS) {
      if (pattern.test(line)) {
        failures.push(`${rel(file)}:${index + 1}: contains ${why}.`);
      }
    }
  });
}

// ── Report ───────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`check-placeholders: ${failures.length} outstanding item(s)\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "\nThese are owner inputs and honesty-floor violations, not build errors. Fill them before spending.",
  );
  process.exit(1);
}

console.log("check-placeholders: no owner-input slots, no hardcoded fees, no fabricated proof.");
