# Implementation Plan — `whatsapp-engine`

## Status

**NOT STARTED — 6 done, 104 remaining** (counting every checkbox, parent headings included). The
checked sub-tasks under section 1 record what was verified by reading the code in this session; they
describe today's behaviour, not a built feature. There is no Cloud API send, no template, no webhook,
no server-side order record, no ref code in the message, no cron and no delivery receipts.

**NOTE (verified 2026-10-05): M5.11 deferred** — Paystack/WhatsApp multi-day clocks not started; `whatsapp-templates/*.txt` does NOT exist (`glob` confirms absence; M2.9 deferred to run clock early); `wa.me` remains production path (`src/lib/whatsapp.ts` line 51: single `wa.me` builder, no Cloud API call); `fitment-live.ts` uses `liveLayoutCountLive()` (line 634) rather than deprecated `liveLayoutCount()` (line 627); order reference `LR-` format exists (`orderRef.ts`) but checkout (`CheckoutView.tsx` line 152) creates its own adapter rather than the server-minted `crypto.randomUUID()` from M6.8; `cron` installed (`E5` verified 2026-10-02: one-minute probe fired; `crontab -l` shows nightly `02:17`); backup `db-backup.sh` exists; ZERO restore rehearsals performed (`docs/launch-metrics.md` does not reference restored DB — M10.2 gate still open). No webhook (`/api/whatsapp/webhook` MISSING); no `X-Hub-Signature-256` handler; no delivery receipt; no 12-hour follow-up trigger (`whatsapp-engine` M8.7 deferred to M8).

Two things are on the critical path and neither is code: **template approval** (Meta documents "up to
24 hours", no SLA) and **a server-side order record** (`commerce-backend`). Section 2 submits the
templates before anything depends on them; section 3 keeps the existing `wa.me` path working
throughout, so trading never stops for a review queue.

---

- [x] 1. Verified current WhatsApp behaviour
  - [x] 1.1 Confirm `src/lib/whatsapp.ts` is 51 lines of pure string builders plus one `wa.me` link builder — `buildOrderMessage`, `whatsappLink`, `comingSoonMessage`, `notFoundMessage` — with no API call _(P0)_
    - _(verified: luxeride-web/src/lib/whatsapp.ts:1-51)_
    - _Requirements: 1.11_
  - [x] 1.2 Confirm the single call site is `window.open(whatsappLink(message), "_blank")` in the checkout submit handler, so nothing happens until the customer presses send in WhatsApp _(P0)_
    - _(verified: luxeride-web/src/app/checkout/page.tsx:78)_
    - _Requirements: 1.1, 1.11_
  - [x] 1.3 Confirm the order id `LR-…` generated at `src/app/checkout/page.tsx:62` is never passed into `buildOrderMessage`, so the chat carries no reference the owner can reconcile against _(P0)_
    - _(verified: luxeride-web/src/app/checkout/page.tsx:56-75, luxeride-web/src/lib/whatsapp.ts:5-16)_
    - _Requirements: 3.2, 3.4_
  - [x] 1.4 Confirm `WHATSAPP_NUMBER = "2347049621694"` lives in `src/data/locations.ts` and is the only WhatsApp identifier in the codebase _(P0)_
    - _(verified: luxeride-web/src/data/locations.ts:14)_
    - _Requirements: 1.7, 6.7_
  - [x] 1.5 Confirm `validateNGPhone` in `src/lib/validation.ts` accepts 070/080/081/090/091 locals and `234…` forms, and is reusable as the pre-send guard _(P1)_
    - _(verified: luxeride-web/src/lib/validation.ts)_
    - _Requirements: 1.8, 8.5_

- [ ] 2. Submit the templates *(longest pole — start before any code)*
  - [ ] 2.1 Create `src/lib/whatsapp-templates/*.txt` holding the exact body text of all four templates, so the submitted template and the documented one cannot drift _(P0)_
    - _Requirements: 5.8_
  - [ ] 2.2 Write `luxeride_order_confirmation` as category `UTILITY` with sub-category `ORDER_DETAILS`, carrying ref, item lines, total, delivery zone + ETA and a payment line that reflects `payments-paystack`'s state _(P0)_
    - _Requirements: 1.2, 1.4, 1.5, 5.2_
  - [ ] 2.3 Give the confirmation template two reply buttons, "Confirm order" and "Cancel order", both within the 25-character label limit _(P0)_
    - _Requirements: 1.3, 5.7_
  - [ ] 2.4 Write `luxeride_not_stocked` as `UTILITY`, carrying the honest "we don't have it yet", a waitlist offer and the layout ref when one exists _(P0)_
    - _Requirements: 5.1, 10.3_
  - [ ] 2.5 Write `luxeride_order_followup` as `UTILITY` / `ORDER_STATUS` with the same two buttons _(P0)_
    - _Requirements: 4.2, 5.1_
  - [ ] 2.6 Write `luxeride_demand_ack` as `UTILITY` _(P0)_
    - _Requirements: 5.1_
  - [ ] 2.7 Add an "if you didn't order this, reply STOP" line to the confirmation body, and check every body against the published limits — body 1024, header 60, footer 60, label 25 _(P0)_
    - _Requirements: 1.10, 5.7_
  - [ ] 2.8 Strip all urgency, cross-sell and offer language from every template, because a utility template judged promotional is now approved as `MARKETING` and becomes billable everywhere _(P0)_
    - _Requirements: 5.3, 5.4_
  - [ ] 2.9 Submit all four through the Message Template API or WhatsApp Manager, record the actual approval latency, and treat that number as the launch lead time _(P0)_
    - _Requirements: 5.10_
  - [ ] 2.10 Keep a documented manual submission route in case approval slips past launch _(P1)_
    - _Requirements: 5.10_

- [ ] 3. Reference codes
  - [ ] 3.1 Create `src/lib/refs.ts` exporting `orderRef()` producing server-generated `LR-…` values from characters safe in both a URL query and a WhatsApp body _(P0)_
    - _Requirements: 3.2_
  - [ ] 3.2 Add `layoutRef()` reading the fitment spec's `TC-2009-2013` format, and cross-check it with `fitment-engine` so the two namespaces are never conflated _(P0)_
    - _Requirements: 3.1, 3.3_
  - [ ] 3.3 Extend `OrderMessageInput` in `src/lib/whatsapp.ts` with an optional `ref`, and append `(ref TC-…)` to the fitment enquiry message exactly as the fitment spec specifies _(P0)_
    - _Requirements: 3.3_
  - [ ] 3.4 Include the order ref in the confirmation template body, so a screenshot of the chat is still usable months later _(P0)_
    - _Requirements: 3.4_
  - [ ] 3.5 Attach `LR-…-CFM` and `LR-…-CNL` as the two button payloads at send time, keeping the template's own labels static _(P1)_
    - _Requirements: 3.5_
  - [ ] 3.6 Implement free-text ref matching so a customer who types `TC-2009-2013` or `LR-…` into the chat is matched to the right record _(P1)_
    - _Requirements: 3.7_
  - [ ] 3.7 Keep the full address out of the message body by default _(P1)_
    - _Requirements: 3.9_

- [ ] 4. Cloud API client
  - [ ] 4.1 Create `src/lib/whatsapp-cloud.ts` guarded by `import "server-only"`, holding the Graph version (`v26.0`), the phone-number id and the bearer token _(P0)_
    - _Requirements: 1.1_
  - [ ] 4.2 Implement `sendTemplate()` against `POST /{version}/{phoneNumberId}/messages` with `messaging_product`, `to` in E.164, `type: "template"`, and the button components carrying the ref payloads _(P1)_
    - _Requirements: 1.1, 3.5_
  - [ ] 4.3 Set `biz_opaque_callback_data` to the order ref on every send, so delivery receipts correlate without parsing `wamid` strings _(P1)_
    - _Requirements: 1.6, 9.1_
  - [ ] 4.4 Persist the returned `messages[0].id` as the order's `whatsappMessageId` _(P1)_
    - _Requirements: 1.6, 1.9_
  - [ ] 4.5 Normalise the recipient with `validateNGPhone` before calling the API, and refuse invalid numbers without a network call _(P1)_
    - _Requirements: 1.8, 8.5_
  - [ ] 4.6 Capture the send-response `message_status` as a pacing status only — never as delivery — and keep it out of the delivery model _(P1)_
    - _Requirements: 1.6, 8.6_

- [ ] 5. Webhook: handshake and signature
  - [ ] 5.1 Create `src/app/api/whatsapp/webhook/route.ts` as a Route Handler exporting `GET` and `POST` _(P0)_
    - _Requirements: 2.1_
  - [ ] 5.2 In `GET`, compare `hub.mode`, compare `hub.verify_token` against `WHATSAPP_VERIFY_TOKEN`, and return the `hub.challenge` as a plain 200 only on a match; return 4xx otherwise and never reveal the expected token _(P0)_
    - _Requirements: 2.1, 2.2_
  - [ ] 5.3 In `POST`, read the body with `await request.text()` and HMAC-SHA256 it with `WHATSAPP_APP_SECRET`, comparing against `X-Hub-Signature-256` after `sha256=` with `crypto.timingSafeEqual` — never parse first _(P0)_
    - _Requirements: 2.3, 2.4_
  - [ ] 5.4 Refuse every POST when the app secret is unset, rather than accepting unsigned events _(P0)_
    - _Requirements: 2.5, 8.7_
  - [ ] 5.5 Parse only after verification, then insert the event keyed on the provider's per-message identifier before applying anything _(P1)_
    - _Requirements: 2.6, 2.13, 7.6_

- [ ] 6. Webhook: button presses
  - [ ] 6.1 Handle `type: "button"` with `button.payload` and `button.text` — the template quick-reply shape — and document why `interactive.button_reply` is not the path here _(P0)_
    - _Requirements: 2.6_
  - [ ] 6.2 Also handle `type: "interactive"` with `interactive.button_reply.id` so an interactive send path added later works without a rewrite _(P1)_
    - _Requirements: 2.6_
  - [ ] 6.3 Resolve the order by `messages[].from` first, falling back to the button payload only to disambiguate intent _(P0)_
    - _Requirements: 2.7, 3.6_
  - [ ] 6.4 Normalise both the webhook sender and the stored order phone to comparable E.164 strings, because `wa_id` is not guaranteed to equal the phone number _(P1)_
    - _Requirements: 2.7_
  - [ ] 6.5 Reject the press when the sender does not match the order's stored number, record the mismatch for the owner, and change nothing _(P0)_
    - _Requirements: 2.8, 8.8_
  - [ ] 6.6 On Confirm for an unconfirmed order, set `confirmationStatus = confirmed`, record the actor as the WhatsApp button, and reply with a short confirmation _(P0)_
    - _Requirements: 2.9_
  - [ ] 6.7 On Cancel for an unconfirmed order, set `confirmationStatus = cancelled` and reply confirming it _(P0)_
    - _Requirements: 2.10_
  - [ ] 6.8 On a press for an already-cancelled order, refuse to resurrect it and reply explaining how to place a new one _(P0)_
    - _Requirements: 2.11_
  - [ ] 6.9 On a press matching no order, record it and reply with a generic help message _(P1)_
    - _Requirements: 2.12_
  - [ ] 6.10 When exactly one order is open for that number and the payload is unreadable, fall back to `button.text` for the intent and record that the fallback was used _(P1)_
    - _Requirements: 3.6, 7.7_
  - [ ] 6.11 Return 200 once the event is durably stored, even when downstream work fails, because Meta retries for days and then drops _(P1)_
    - _Requirements: 2.16_

- [ ] 7. Webhook: delivery receipts
  - [ ] 7.1 Consume `statuses[]` and record `sent`, `delivered`, `read`, `failed` and `played` against the stored `wamid` _(P1)_
    - _Requirements: 2.14_
  - [ ] 7.2 Never require `delivered` before `read` — Meta omits the delivered webhook when a message is read immediately _(P1)_
    - _Requirements: 2.14, 7.8_
  - [ ] 7.3 Treat absence of a receipt as absence, never as failure _(P1)_
    - _Requirements: 7.8, 8.6_
  - [ ] 7.4 On `status: failed`, record `errors[].code` and raise the order in the queue _(P1)_
    - _Requirements: 2.15, 8.4_
  - [ ] 7.5 Suppress further sends to a number that fails with Meta's blocked-or-opted-out code, and record the suppression with a timestamp _(P1)_
    - _Requirements: 6.3, 6.4_

- [ ] 8. The 12-hour follow-up
  - [ ] 8.1 Add `followUpSentAt` and `consentShownAt` to the order model _(P1)_
    - _Requirements: 4.3, 6.1_
  - [ ] 8.2 Create `src/app/api/cron/whatsapp-follow-up/route.ts` as an idempotent bearer-guarded Route Handler selecting unconfirmed orders older than 12 hours with `followUpSentAt IS NULL` _(P1)_
    - _Requirements: 4.1, 4.3, 4.5_
  - [ ] 8.3 Send the follow-up with the same two buttons and the same ref _(P1)_
    - _Requirements: 4.2_
  - [ ] 8.4 Re-check confirmation state immediately before sending, so an order answered in the meantime gets nothing _(P1)_
    - _Requirements: 4.4_
  - [ ] 8.5 Skip and record the reason when the follow-up template is not `APPROVED`, instead of failing the job _(P1)_
    - _Requirements: 4.7_
  - [ ] 8.6 Never auto-cancel after the follow-up _(P1)_
    - _Requirements: 4.6_
  - [ ] 8.7 Expose the waiting time on the queue so backlog ages visibly _(P1)_
    - _Requirements: 4.8, 10.6_
  - [ ] 8.8 Wire the sweep to the chosen host's scheduler; the handler must stay safe at any cadence _(P2)_
    - _Requirements: 4.5_

- [ ] 9. Failure paths and the fallback
  - [ ] 9.1 Fall back to `whatsappLink()` from `src/lib/whatsapp.ts` whenever credentials are missing, a template is `PENDING`, or a send errors — and flag the order for manual follow-up _(P0)_
    - _Requirements: 1.7, 1.11, 5.6, 8.1, 8.2_
  - [ ] 9.2 Mark an order `UNREACHABLE` when the send or a status reports failure, keep its ref, and put it at the top of the queue _(P1)_
    - _Requirements: 8.4_
  - [ ] 9.3 Only attempt free-form replies inside an open customer-service window; never send one outside it _(P1)_
    - _Requirements: 6.5, 8.3_
  - [ ] 9.4 Retry transient send failures with exponential backoff and jitter, bounded, and stop on permanent failure _(P1)_
    - _Requirements: 7.1, 7.2_
  - [ ] 9.5 Back off and resume in order when Meta returns the throughput error, without replaying the batch _(P1)_
    - _Requirements: 7.4_
  - [ ] 9.6 Guard against a duplicate message record for the same order, template and attempt on retry _(P1)_
    - _Requirements: 1.9, 7.3_
  - [ ] 9.7 Alert the owner as the business messaging limit is approached, and read the current limit from `whatsapp_business_manager_messaging_limit` rather than the deprecated `messaging_limit_tier` _(P2)_
    - _Requirements: 7.5_
  - [ ] 9.8 Surface a loud health failure when the app secret is missing or a signature cannot be verified, rather than silently accepting events _(P1)_
    - _Requirements: 8.7_

- [ ] 10. Consent and opt-out
  - [ ] 10.1 Add a consent disclosure to the checkout form in `src/app/checkout/page.tsx` stating that the number will be used for order messages on WhatsApp, and stamp `consentShownAt` — coordinate with `cart-checkout` _(P0)_
    - _Requirements: 6.1_
  - [ ] 10.2 Log a missing disclosure when the confirmation sends without one, rather than blocking a transactional message _(P1)_
    - _Requirements: 6.2_
  - [ ] 10.3 Handle an inbound `STOP` reply: suppress marketing-category sends and record the opt-out with a timestamp _(P1)_
    - _Requirements: 6.3_
  - [ ] 10.4 Keep the engine out of promotional sending entirely, so a WhatsApp conversation is never treated as marketing consent _(P1)_
    - _Requirements: 6.6_
  - [ ] 10.5 Record recipients as E.164 numbers rather than any internal contact identifier _(P1)_
    - _Requirements: 6.7_

- [ ] 11. Message log and audit
  - [ ] 11.1 Add `WhatsappMessage`, `WhatsappEvent` and `WhatsappTemplate` models with a unique `providerId` on the message log _(P1)_
    - _Requirements: 9.1, 9.2, 2.13_
  - [ ] 11.2 Write a log row for every send and every inbound event with direction, template, recipient, ref, provider id, time, status and error code _(P1)_
    - _Requirements: 9.1, 9.2_
  - [ ] 11.3 Persist the exact rendered body of every message so disputes settle from the record _(P1)_
    - _Requirements: 9.3_
  - [ ] 11.4 Never store the access token, the app secret or the verify token in the log _(P1)_
    - _Requirements: 9.6_
  - [ ] 11.5 Subscribe to `message_template_status_update` and `template_category_update` and alert on rejection or recategorisation to `MARKETING` _(P2)_
    - _Requirements: 5.5, 5.3_
  - [ ] 11.6 Record the template status as Meta's ten-value enum, never a boolean _(P2)_
    - _Requirements: 5.5_

- [ ] 12. Operator queue
  - [ ] 12.1 Create `src/app/admin/orders/page.tsx` as a Server Component grouped by what needs doing — awaiting a press, unreachable, unanswered after follow-up, cancelled — not a message feed _(P1)_
    - _Requirements: 10.1_
  - [ ] 12.2 Show ref, customer, total, delivery zone, waiting time, delivered and read state on each row _(P1)_
    - _Requirements: 10.2_
  - [ ] 12.3 Add a per-order timeline view rendering order created, sent, delivered, read, button pressed and state change in one ordered list _(P1)_
    - _Requirements: 9.5_
  - [ ] 12.4 Surface layout refusals in the same queue as orders, since the demand log is a sourcing roadmap _(P1)_
    - _Requirements: 10.3_
  - [ ] 12.5 Sort oldest-unconfirmed first and flag two or more open orders on the same number _(P1)_
    - _Requirements: 10.4, 10.6_
  - [ ] 12.6 Render an explicit empty state rather than a blank screen _(P1)_
    - _Requirements: 10.5_
  - [ ] 12.7 Remove an order from attention as soon as a press resolves it, so nothing is ticked off by hand _(P1)_
    - _Requirements: 10.8_
  - [ ] 12.8 Make the log queryable by ref, by recipient and by date without the owner writing SQL _(P1)_
    - _Requirements: 9.4_
  - [ ] 12.9 Build this with `commerce-backend` and the other admin work; do not build a second editor seat or a permission matrix _(P2)_
    - _Requirements: 10.7_

- [ ] 13. Configuration and secrets
  - [ ] 13.1 Add `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_GRAPH_VERSION` to `luxeride-web/.env` and a documented `.env.example`, none carrying the `NEXT_PUBLIC_` prefix _(P0)_
    - _Requirements: 9.6_
  - [ ] 13.2 Add `server-only` to `package.json` if not already present by the time this runs _(P0)_
    - _Requirements: 2.3_
  - [ ] 13.3 Confirm `npm run build` still succeeds with no WhatsApp credentials present _(P0)_
    - _Requirements: 1.11, 5.4_
  - [ ] 13.4 Document every WhatsApp environment variable, its scope, and what must never reach the browser _(P1)_
    - _Requirements: 9.6_

- [ ] 14. Rehearsal
  - [ ] 14.1 Run step 1 of `design.md` § Testing Strategy: the handshake accepts a correct token and rejects a wrong one _(P0)_
    - _Requirements: 2.1, 2.2_
  - [ ] 14.2 Run step 2: a correctly signed webhook is accepted and a corrupted one returns 401 with its malformed body never parsed _(P0)_
    - _Requirements: 2.3, 2.4_
  - [ ] 14.3 Run steps 3-5: one message per order with the ref and two buttons; Confirm and Cancel each flip the state once _(P0)_
    - _Requirements: 1.1, 1.3, 2.9, 2.10_
  - [ ] 14.4 Run steps 6-7: replaying a delivery has no second effect, and a payload mutated to name another order is rejected by the sender-number check _(P0)_
    - _Requirements: 2.13, 2.8, 3.5_
  - [ ] 14.5 Run step 8: only the unanswered order receives a follow-up, and a second sweep sends nothing extra _(P1)_
    - _Requirements: 4.3, 4.4, 4.5_
  - [ ] 14.6 Run steps 9-10: the link fallback carries a real order, and an unreachable number lands in the queue with its ref intact _(P1)_
    - _Requirements: 1.11, 8.4, 8.9_
  - [ ] 14.7 Record the measured template approval latency and update the launch plan with the real number _(P1)_
    - _Requirements: 5.10_