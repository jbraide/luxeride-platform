import { LOCATIONS, type LocationZone } from "../data/locations.ts";
import { validateNGPhone } from "./validation.ts";

import type { ResolvedZone, RowSelection } from "./order-pricing.ts";

/**
 * The shared order validation layer — `commerce-backend` §5.1–5.5.
 *
 * One module, imported by **both** the server action and `/checkout`
 * (`commerce-backend` §5.2), so the client and the server cannot disagree about
 * what is acceptable. Server validation is unconditional regardless of what the
 * UI already checked: the Server Actions guide is explicit that render-time
 * gating "is not a security boundary".
 *
 * THE ONE RULE: REJECT, NEVER CLAMP
 *
 * A quantity of 0, of 100, of `-1` or of `2.5` is an error. It is not 1, not 99,
 * not 1. `commerce-backend` §5.3 states why in a sentence worth repeating: "a
 * silently corrected quantity is how a wrong order becomes a real order." The
 * same applies to an unknown payment method, an unknown delivery zone, a row
 * selection that is not `"2" | "3" | null`. Every one of them produces a
 * per-field error naming the field, and the submission is refused whole.
 *
 * THE DELIVERY ZONE IS SERVER-RESOLVED
 *
 * `commerce-backend` §5.5: "the client sends a zone identifier only. The fee
 * comes from the `Location` row, so a customer cannot choose their own delivery
 * charge." So the validated payload carries the **resolved row**, not the string
 * the customer sent and not a number anyone supplied. A caller cannot reach
 * `priceOrder()` without a fee the server chose.
 *
 * WHICH CATALOGUE, AND WHY IT IS A PARAMETER
 *
 * The default catalogue is `LOCATIONS`, the static storefront module. That is the
 * right default for `/checkout`, which renders fee and ETA before a request is
 * ever made. It is the WRONG catalogue for `POST /api/orders`: §5.5 says the fee
 * comes from the `Location` **row**, and `Order.locationId` is a foreign key into
 * that table — an order priced from `LOCATIONS` could carry a fee that no longer
 * matches any row the order points at. So `validateOrderSubmission` accepts the
 * catalogue as an argument, and the route handler passes the rows it just read.
 * Without this the two halves of §5.5 would contradict each other and the
 * authority would be the static file.
 *
 * NO EXTERNAL VALIDATION LIBRARY
 *
 * Hand-rolled because the project has zero new dependencies as a rule
 * (`commerce-backend` §9.1: "Zero new dependencies — adding a test framework
 * before the storefront trades is tooling ahead of need"). There is no zod here
 * and there will not be one added for eight fields; `scripts/pricing.test.mjs`
 * covers this file on `node --test`.
 *
 * WHY THE `.ts` IMPORT SPECIFIERS
 *
 * `./validation.ts` and `../data/locations.ts` carry explicit extensions and no
 * `@/*` alias, so `scripts/pricing.test.mjs` can import this module under Node's
 * type stripping. Node does not implement tsconfig path resolution — measured in
 * `commerce-backend` §0.3 — and the same constraint shapes
 * `src/data/fitment-catalogue.ts`.
 */

/** Re-exported so callers need one import, not three, for an order payload. */
export type { ResolvedZone, RowSelection };

/** The two payment options. `payments-paystack` adds more; this union will grow. */
export type PaymentMethod = "pod" | "prepay";

/**
 * Bounds. Every one is a rejection, and every one is here rather than in a rule
 * table so a single file answers "what did this module decide is acceptable".
 */
export const MIN_LINE_QTY = 1;
/** `commerce-backend` §5.3: quantity outside 1–99 is rejected. */
export const MAX_LINE_QTY = 99;

/**
 * The line cap.
 *
 * The spec requires "a maximum line count" and does not say what it is. 20 is
 * the number chosen: the catalogue holds seven products, a real order is one
 * product for one car plus at most a bundle or two, and 20 is far above any
 * order a person actually places while still bounding what one request can make
 * the server price. Raising it is a one-line change if a real order ever needs
 * it; the important property is that a cap exists.
 */
export const MAX_LINES = 20;

/**
 * Name and address bounds.
 *
 * The checkout only required a non-empty trimmed value
 * (`src/app/checkout/CheckoutView.tsx:97,114`), which is no bound at all — a
 * megabyte of text would have been persisted. 80 characters holds every Nigerian
 * name a rider could be asked for with room for a title and two names; 280 is
 * where a full delivery address with landmark and directions stops being one.
 */
export const NAME_MAX_LENGTH = 80;
export const ADDRESS_MAX_LENGTH = 280;

/**
 * Phone length, around `validateNGPhone`.
 *
 * That function accepts any string whose digits match a Nigerian pattern, so
 * without a length bound a 100 KB string of digits would be persisted as a
 * `String` column. 32 is the widest real input: "+234 803 123 4567" and its
 * variants fit well inside it.
 */
export const PHONE_MAX_LENGTH = 32;

/** Slugs and brand names, to bound before they reach a `String` column. */
export const SLUG_MAX_LENGTH = 64;
export const BRAND_MAX_LENGTH = 64;
export const MODEL_MAX_LENGTH = 80;

/**
 * The model-year sanity band.
 *
 * Deliberately much wider than the 2000–2026 the Fit Finder offers
 * (`src/components/FitFinder.tsx:43-44`). That range is a design choice about
 * what to put in a dropdown; this is a guard against a body carrying
 * `"9999999999"` into `OrderItem.yearSnapshot Int`. The order is a historical
 * record and must stay writable for a year the finder later stops offering, so
 * this refuses only what cannot be a year at all.
 */
export const YEAR_MIN = 1900;
export const YEAR_MAX = 2100;

/** The per-line fields that can carry their own error, for `lines.N.<field>`. */
export type OrderLineField = "productSlug" | "brand" | "model" | "year" | "rows" | "qty";

/**
 * A dotted path to the control that failed, so `/checkout` can render per-field
 * errors with `aria-describedby` (`cart-checkout` §6.5) without re-deriving the
 * naming convention. `-1` for the whole submission rather than one line.
 */
export type OrderFieldPath =
  | "name"
  | "phone"
  | "address"
  | "location"
  | "paymentMethod"
  | "lines"
  /**
   * The privacy consent control. It is the one field `validateOrderSubmission`
   * never produces an error for, because it is not sent to the server — the box
   * gates submission in the browser only. It is on this union anyway because the
   * union is also the naming convention `/checkout` uses to place an error next
   * to a control, and a client-only control with no path would be an
   * unplaceable error.
   */
  | "consent"
  /**
   * The whole request, as distinct from the whole order. For a body that could
   * not be read at all — oversized, not JSON, cross-origin, missing
   * `idempotencyKey`, or a server that could not price anything. It is a path
   * rather than a free-form key so a caller cannot invent an error the client
   * would not know how to place, and so the `Record` below keeps accepting only
   * keys that mean something.
   */
  | "request"
  | `lines.${number}.${OrderLineField}`;

export type OrderFieldErrors = Partial<Record<OrderFieldPath, string>>;

export interface ValidatedOrderLine {
  productSlug: string;
  brand: string;
  model: string;
  /**
   * The canonical string form of the model year, as the cart holds it
   * (`CartItem.year` is a `string`), narrowed to a plausible integer.
   * `OrderItem.yearSnapshot` is an `Int`, so the write path does `Number(...)`
   * — from this validated value, never from the raw request.
   */
  year: string;
  rows: RowSelection;
  qty: number;
}

export interface ValidatedOrderSubmission {
  name: string;
  phone: string;
  address: string;
  /** The resolved row. Its `fee` is what gets charged. */
  zone: ResolvedZone;
  paymentMethod: PaymentMethod;
  lines: ValidatedOrderLine[];
}

export type ValidateOrderResult =
  | { ok: true; value: ValidatedOrderSubmission }
  | { ok: false; errors: OrderFieldErrors };

/**
 * A zone catalogue. `LOCATIONS` satisfies it; so do `Location` rows read from
 * the database, which is where the `slug` comes from.
 */
export interface ZoneCatalogueEntry extends LocationZone {
  slug?: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Trim, then bound. Trimming is whitespace normalisation, not a corrected value
 * — the customer still has to type the name.
 */
function boundedText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/** `name`, with the checkout's own "the rider should ask for this" rule kept. */
export function validateName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Enter the name the rider should ask for." };
  }
  const value = raw.trim();
  if (value.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `Keep the name under ${NAME_MAX_LENGTH} characters.` };
  }
  return { ok: true, value };
}

/**
 * The phone, through `validateNGPhone` from `src/lib/validation.ts` — imported,
 * never reimplemented, so one rule decides what a Nigerian number is.
 */
export function validatePhone(
  raw: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Enter the WhatsApp number we should confirm this order on." };
  }
  const value = raw.trim();
  if (value.length > PHONE_MAX_LENGTH || !validateNGPhone(value)) {
    return {
      ok: false,
      error: "Enter a valid Nigerian number (070/080/081/090/091 or +234).",
    };
  }
  return { ok: true, value };
}

export function validateAddress(
  raw: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Enter the address the rider should deliver to." };
  }
  const value = raw.trim();
  if (value.length > ADDRESS_MAX_LENGTH) {
    return { ok: false, error: `Keep the address under ${ADDRESS_MAX_LENGTH} characters.` };
  }
  return { ok: true, value };
}

/**
 * Resolve a zone identifier to its row — `commerce-backend` §5.4.
 *
 * Accepts either the `Location.slug` or the **exact** `Location.name`, so
 * `/checkout` can move from name to slug in its own time without a coordinated
 * deploy against a live order path. Exact means exact: no case folding, no
 * trimming of inner punctuation, because a fuzzy match that picks the wrong
 * Nigerian state is a wrong delivery fee.
 *
 * Anything not in the catalogue is an error. There is no default zone and no
 * fallback fee — `src/app/checkout/CheckoutView.tsx` used to default the select
 * to `LOCATIONS[0]`, which quoted every non-Lagos customer 24–48 hours against a
 * real 5–7 days.
 */
export function validateZone(
  raw: unknown,
  zones: readonly ZoneCatalogueEntry[] = LOCATIONS
): { ok: true; value: ResolvedZone } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Choose the zone we deliver to, so the fee and the estimate are right." };
  }
  const key = raw.trim();
  const match = zones.find((zone) => zone.slug === key || zone.name === key);
  if (!match) {
    return { ok: false, error: "That is not a delivery zone we serve." };
  }
  return {
    ok: true,
    value: { slug: match.slug ?? null, name: match.name, fee: match.fee, eta: match.eta },
  };
}

export function validatePaymentMethod(
  raw: unknown
): { ok: true; value: PaymentMethod } | { ok: false; error: string } {
  if (raw !== "pod" && raw !== "prepay") {
    return { ok: false, error: "Choose how you will pay: on delivery or by transfer." };
  }
  return { ok: true, value: raw };
}

/**
 * Row selection. `"2" | "3" | null` and nothing else.
 *
 * `null` is a real value — it means the product is not a row question — so it
 * is accepted explicitly. `""`, `"all"`, `0` and the number `2` are not: the
 * string forms come from a `<select>`, and accepting a number here would make
 * `rows: 3` and `rows: "3"` two different products depending on how the JSON was
 * built (`lineKey()` would give them different keys for one cart).
 */
export function validateRows(
  raw: unknown
): { ok: true; value: RowSelection } | { ok: false; error: string } {
  // `undefined` is rejected on purpose. `CartItem.rows` in `src/store/cart.ts`
  // is `"2" | "3" | null` — never `undefined` — so a missing key means the
  // caller built the payload wrong, and quietly reading it as "not a row
  // question" would drop a surcharge the customer was quoted.
  if (raw === null) return { ok: true, value: null };
  if (raw === "2" || raw === "3") return { ok: true, value: raw };
  return { ok: false, error: "Choose two rows or three rows." };
}

/** Quantity: an integer in 1–99. Never clamped. */
export function validateQty(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return { ok: false, error: `Enter a whole number between ${MIN_LINE_QTY} and ${MAX_LINE_QTY}.` };
  }
  if (raw < MIN_LINE_QTY || raw > MAX_LINE_QTY) {
    return { ok: false, error: `Enter a whole number between ${MIN_LINE_QTY} and ${MAX_LINE_QTY}.` };
  }
  return { ok: true, value: raw };
}

/** The model year: a string on the wire, a plausible integer underneath. */
function validateYear(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  // An integer number is accepted as the same value in its other form, not
  // corrected: 2020 and "2020" are one year. Anything else is an error, because
  // coercing a value is how a wrong year becomes a real order.
  const text =
    typeof raw === "number" && Number.isInteger(raw) ? String(raw) : typeof raw === "string" ? raw : null;
  if (text === null) {
    return { ok: false, error: "Enter the model year." };
  }

  const trimmed = text.trim();
  const year = Number(trimmed);
  if (!/^\d{4}$/.test(trimmed) || !Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) {
    return { ok: false, error: "Enter a four-digit model year." };
  }
  return { ok: true, value: trimmed };
}

/**
 * Narrow and bound a whole submission.
 *
 * `zones` is the catalogue the delivery zone is resolved against — `LOCATIONS`
 * for the storefront, the `Location` rows for `POST /api/orders`. See the header
 * note on why the server must not read the static module. Every validation below
 * is unconditional regardless of what a UI already checked.
 *
 * Returns every error it found rather than the first, because a form that
 * reveals one field at a time makes a customer play whack-a-mole to discover
 * they also typed a bad quantity on line 3. The submission is refused whole
 * either way: there is no "ok" alongside errors, and no partial payload.
 *
 * The `lines` array is not deduplicated or merged here. `cart-checkout` §8.1
 * merges by `lineKey()` in the cart store, where the customer can see it happen;
 * silently collapsing two lines on the server would change what was ordered
 * without telling anyone.
 */
export function validateOrderSubmission(
  input: unknown,
  zones: readonly ZoneCatalogueEntry[] = LOCATIONS,
): ValidateOrderResult {
  const errors: OrderFieldErrors = {};

  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: { name: "This is not a valid order submission." },
    };
  }

  const name = validateName(input.name);
  if (!name.ok) errors.name = name.error;

  const phone = validatePhone(input.phone);
  if (!phone.ok) errors.phone = phone.error;

  const address = validateAddress(input.address);
  if (!address.ok) errors.address = address.error;

  // The field is named `location` because that is what `OrderMessageInput` in
  // `src/lib/whatsapp.ts` and the checkout's own state call it. Deliberately
  // there is no `zone` alias: a payload carrying `zone: { fee: 0, … }` is a
  // payload trying to choose its own delivery charge, and the only correct
  // response to one is a refusal, not a convenient fallback field.
  const zone = validateZone(input.location, zones);
  if (!zone.ok) errors.location = zone.error;

  const paymentMethod = validatePaymentMethod(input.paymentMethod);
  if (!paymentMethod.ok) errors.paymentMethod = paymentMethod.error;

  // ── Lines ────────────────────────────────────────────────────────────────────

  const rawLines = input.lines ?? input.items;
  const lines: ValidatedOrderLine[] = [];

  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    errors.lines = "Your cart is empty.";
  } else if (rawLines.length > MAX_LINES) {
    errors.lines = `An order carries at most ${MAX_LINES} lines; this one has ${rawLines.length}.`;
  } else {
    rawLines.forEach((raw, index) => {
      const at: `lines.${number}` = `lines.${index}`;
      const push = (field: OrderLineField, error: string) => {
        errors[`${at}.${field}`] = error;
      };

      if (!isPlainObject(raw)) {
        errors.lines = `Line ${index + 1} is not a valid order line.`;
        return;
      }

      const productSlug = boundedText(raw.productSlug, SLUG_MAX_LENGTH);
      if (productSlug === null) {
        push("productSlug", "Choose a product for this line.");
      }

      const brand = boundedText(raw.brand, BRAND_MAX_LENGTH);
      if (brand === null) {
        push("brand", "Choose the make of the car this is for.");
      }

      const model = boundedText(raw.model, MODEL_MAX_LENGTH);
      if (model === null) {
        push("model", "Choose the model this is for.");
      }

      const year = validateYear(raw.year);
      if (!year.ok) push("year", year.error);

      const rows = validateRows(raw.rows);
      if (!rows.ok) push("rows", rows.error);

      const qty = validateQty(raw.qty);
      if (!qty.ok) push("qty", qty.error);

      // One bad line does not silently become a shorter order. If anything on
      // this line failed, the line is not collected, and the caller refuses the
      // whole submission on the error map.
      if (
        productSlug === null ||
        brand === null ||
        model === null ||
        !year.ok ||
        !rows.ok ||
        !qty.ok
      ) {
        return;
      }

      lines.push({ productSlug, brand, model, year: year.value, rows: rows.value, qty: qty.value });
    });
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // Every validator above returned `ok` on this path — each failure sets an
  // error, and the map is empty. This guard is what tells the compiler that, and
  // without it the payload below would need five casts to narrow.
  if (!name.ok || !phone.ok || !address.ok || !zone.ok || !paymentMethod.ok) {
    return { ok: false, errors: { name: "This submission could not be read." } };
  }

  return {
    ok: true,
    value: {
      name: name.value,
      phone: phone.value,
      address: address.value,
      zone: zone.value,
      paymentMethod: paymentMethod.value,
      lines,
    },
  };
}