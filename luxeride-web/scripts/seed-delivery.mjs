// Applies the STATE delivery zones to an existing database, idempotently.
//
// The main seed (`prisma/seed.mts`) only writes `Location` rows when the table is EMPTY.
// That is right for a fresh database and useless for this change: the live table already
// holds the four legacy city-cluster rows and 6 orders point at two of them. So this
// script does the one-time move, and is safe to run more than once:
//
//   1. Ensures every state in `src/data/locations.ts` exists, by slug. A state that is
//      already there is left EXACTLY as it is — its fee is the owner's, and re-running
//      this must never clobber a price he set in the admin.
//   2. Withdraws any zone that is on the menu but is not one of the states. That is what
//      retires the four clusters: they keep their orders and disappear from the checkout.
//
// Run:  node scripts/seed-delivery.mjs
//
// Read-only with respect to orders. No order row is touched.

import fs from "node:fs";
import path from "node:path";

// Load `.env.local` (the app's file) before Prisma reads a connection string. Next loads
// it automatically; this plain node script does not.
for (const file of [".env.local", ".env"]) {
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) continue;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const { PrismaClient } = await import("@prisma/client");
const { LOCATIONS } = await import("../src/data/locations.ts");

const slugify = (name) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const prisma = new PrismaClient();
const stateSlugs = new Set(LOCATIONS.map((zone) => slugify(zone.name)));

let created = 0;
let kept = 0;
for (const zone of LOCATIONS) {
  const slug = slugify(zone.name);
  const existing = await prisma.location.findFirst({
    where: { OR: [{ slug }, { name: zone.name }] },
    select: { id: true },
  });
  if (existing) {
    kept += 1;
    continue;
  }
  await prisma.location.create({ data: { slug, name: zone.name, fee: zone.fee, etaText: zone.eta } });
  created += 1;
}

const notStates = await prisma.location.findMany({
  where: { active: true, slug: { notIn: [...stateSlugs] } },
  select: { id: true, name: true },
});
if (notStates.length > 0) {
  await prisma.location.updateMany({
    where: { id: { in: notStates.map((zone) => zone.id) } },
    data: { active: false },
  });
}

console.log(`seed-delivery: created ${created} state(s), left ${kept} existing row(s) untouched.`);
if (notStates.length > 0) {
  console.log(`seed-delivery: withdrew ${notStates.length} non-state zone(s): ${notStates.map((z) => z.name).join(", ")}.`);
}

const onMenu = await prisma.location.count({ where: { active: true } });
const off = await prisma.location.count({ where: { active: false } });
console.log(`seed-delivery: ${onMenu} zone(s) on the menu, ${off} withdrawn.`);

await prisma.$disconnect();
