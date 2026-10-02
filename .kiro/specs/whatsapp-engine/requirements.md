# Requirements Document — `whatsapp-engine`

## Introduction

This spec turns LuxeRide's WhatsApp from a **link the customer presses** into a **loop the system
runs**.

**The verified starting state, stated plainly:** `luxeride-web/src/lib/whatsapp.ts` is 51 lines and
contains four pure string builders plus one link builder:

- `buildOrderMessage(input, preview)` — itemised text with emoji and a payment line
  (lines 18-36). It is a **text template for a human to read**, not a Meta template, and it has no
  placeholders, no buttons and no reference code.
- `whatsappLink(message)` — `` `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}` ``
  (line 39).
- `comingSoonMessage(what, phone?)`, `notFoundMessage(query)` (lines 42-51).
- `WHATSAPP_NUMBER = "2347049621694"` in `luxeride-web/src/data/locations.ts:14`.

The only call site is `luxeride-web/src/app/checkout/page.tsx:78`:
`window.open(whatsappLink(message), "_blank")`.

**Everything that makes this a loop is absent.** No Cloud API send. No template. No webhook. No
server-side order record. No reference code in the message. No follow-up. No delivery or read
receipts. No log of anything. No rate-limit handling. No opt-out handling.

**Why this is the load-bearing spec.** Three consequences of the current design, all verified:

1. **Nothing lands anywhere until the customer presses send.** If they close the tab, dismiss the
   WhatsApp share sheet, or decide not to bother, the owner never learns the order existed. The audit
   in `00-RELEASE-READINESS-AUDIT.md` §6 draws exactly this chain.
2. **The order cannot be reconciled.** The id `LR-…` is generated in the browser at
   `src/app/checkout/page.tsx:62` and is **not included in the WhatsApp message** built at line 56.
   The owner reading the chat has a customer name, a phone number and a total — and no id.
3. **Refusals vanish.** `comingSoonMessage` and `notFoundMessage` are the fitment spec's
   demand-mapping asset, and today they go into a chat that is never recorded anywhere. The
   fitment spec is explicit that *"every refusal is the asset."*

**What this is not.** Orders are `commerce-backend`'s. The checkout form is `cart-checkout`'s.
Prepay is `payments-paystack`'s. Ref codes come from `fitment-engine`, whose naming decision already
fixes the format. UTM capture is `ad-landing-and-tracking`. This spec owns: the Cloud API client, the
templates, the inbound webhook, the ref codes, the follow-up, the retry policy, the message log, and
the operator's working surface.

**The launch constraint, stated up front.** Meta reviews templates automatically and manually and
states that *"It can take up to 24 hours for an approval decision to be made"* — **an estimate, not a
service-level agreement**. The owner wants to run ads today. So:

- The templates must be written and submitted **before** any code depends on them.
- The `wa.me` deep link must survive as a working fallback, because Meta approval is outside the
  owner's control and the business cannot stop trading while it is pending.
- No task in `tasks.md` may make the storefront depend on an unapproved template.

**Scope boundary.** The fitment spec's locked decisions are respected throughout and restated only
where they bind: owner-only administration (no roles, no permission matrix); Confirmed-only on the
front end; price on the site as `priceFrom`; one layout = one make. Nothing here builds a second
editor seat or a front-end fit decision. Where a decision belongs to another spec it is
cross-referenced rather than duplicated — `commerce-backend` (order and message persistence, the
Prisma migration, the admin console), `cart-checkout` (the checkout form and its consent checkbox),
`fitment-engine` (layout refs and the ref format), `payments-paystack` (payment state),
`ad-landing-and-tracking` (UTM capture onto the order).

---

## Requirements

### Requirement 1 — Order placed, order exists, message sent

**User Story:** As a customer who has just placed an order, I want to receive one WhatsApp message that
tells me what I ordered and lets me confirm or cancel with one tap, so that I do not have to wait for
a human to read my message.

#### Acceptance Criteria

1.1 WHEN an order is created on the server THEN THE SYSTEM SHALL send exactly one templated
confirmation to the customer's number in E.164 format within seconds, without any action from the
customer.

1.2 WHEN the confirmation is sent THEN THE SYSTEM SHALL include the order reference, an itemised
summary, the total, and the delivery zone's stated estimate.

1.3 WHEN the confirmation is sent THEN THE SYSTEM SHALL include two reply buttons, "Confirm order" and
"Cancel order", so that the customer replies with a tap rather than free text.

1.4 IF the order's payment method is `prepay` AND the payment is not yet confirmed THEN THE SYSTEM
SHALL state in the message that payment is still being confirmed, and SHALL NOT claim the order is
paid.

1.5 IF the order is a Pay on Delivery order THEN THE SYSTEM SHALL state that payment is collected on
arrival, and SHALL NOT ask the customer to have transferred anything.

1.6 WHEN the send call returns THEN THE SYSTEM SHALL persist the provider's message identifier against
the order, because that identifier is the only way a later delivery or read receipt can be matched
back to an order.

1.7 IF the send fails THEN THE SYSTEM SHALL record the failure and its error code, SHALL leave the
order intact, and SHALL surface the order to the owner through the working queue — never silently
drop it.

1.8 IF the customer's number fails basic validation THEN THE SYSTEM SHALL not attempt a send, and
SHALL record the order as awaiting a reachable number.

1.9 THE SYSTEM SHALL NOT send two confirmation messages for one order when an action is retried.

1.10 IF the customer's number belongs to someone else — a mistyped phone number THEN THE SYSTEM SHALL
include a line in the message telling a non-customer to ignore it and reply STOP, so that a wrong
number does not produce a stranger receiving order details.

1.11 WHEN the message cannot be sent because no Cloud API credentials are configured THEN THE SYSTEM
SHALL fall back to the existing `wa.me` link behaviour rather than failing the order.

---

### Requirement 2 — The Confirm / Cancel press arrives as a webhook and changes the order

**User Story:** As the owner, I want the customer's tap to change the order automatically, so that I
am not reading chat to find out what happened.

#### Acceptance Criteria

2.1 WHEN Meta POSTs to `/api/whatsapp/webhook` THEN THE SYSTEM SHALL complete the verification
handshake on GET by comparing `hub.mode`, comparing `hub.verify_token` against a stored secret, and
returning the `hub.challenge` value as a plain 200 response only when the token matches.

2.2 IF the verification token does not match THEN THE SYSTEM SHALL return a 4xx status and SHALL NOT
reveal the expected token.

2.3 WHEN a POST arrives THEN THE SYSTEM SHALL validate the `X-Hub-Signature-256` header as an
HMAC-SHA256 of the **raw request body** keyed with the app secret, comparing in constant time,
BEFORE parsing the payload or changing any state.

2.4 IF the signature is absent or does not match THEN THE SYSTEM SHALL reject the request and change
nothing.

2.5 IF the app secret is not configured THEN THE SYSTEM SHALL refuse to accept any webhook, rather
than accepting unsigned events.

2.6 WHEN a valid webhook contains a button press THEN THE SYSTEM SHALL read the press from the
documented field for the message type, and SHALL NOT assume every press arrives in the same field.

2.7 WHEN a button press is received THEN THE SYSTEM SHALL identify the order from the sender's
number and, where present, the ref carried by the press — and SHALL verify the sender's number matches
the number stored on that order before applying anything.

2.8 IF the sender's number does not match the order THEN THE SYSTEM SHALL record the attempt as a
mismatch for the owner and SHALL NOT change the order's state.

2.9 WHEN a valid Confirm press arrives for an order that is still unconfirmed THEN THE SYSTEM SHALL set
its confirmation state to confirmed, record who caused the change, and reply with a short confirmation
message.

2.10 WHEN a valid Cancel press arrives for an unconfirmed order THEN THE SYSTEM SHALL set its
confirmation state to cancelled, record the change, and reply confirming the cancellation.

2.11 WHEN a Confirm press arrives for an already-cancelled order THEN THE SYSTEM SHALL NOT resurrect it,
and SHALL reply explaining that the order was cancelled and offer a way to place a new one.

2.12 WHEN a button press arrives that matches no known order THEN THE SYSTEM SHALL record it for the
owner and SHALL reply with a generic help message rather than doing nothing.

2.13 WHEN the same press is delivered more than once THEN THE SYSTEM SHALL apply the change exactly
once, using the provider's per-message identifier as the deduplication key.

2.14 WHEN a delivery or read receipt arrives THEN THE SYSTEM SHALL record it against the stored message
identifier, so that the owner can see whether a customer actually saw the message.

2.15 WHEN a message reports a failure status THEN THE SYSTEM SHALL record the error code and raise the
order in the working queue.

2.16 WHEN the webhook cannot complete its work THEN THE SYSTEM SHALL still return 200 once the event
has been durably stored, because unacknowledged webhooks are retried for days and then dropped.

---

### Requirement 3 — Ref codes

**User Story:** As the owner, I want every message and every order to carry a short reference, so that
I can answer an enquiry without working out which order it is.

#### Acceptance Criteria

3.1 THE SYSTEM SHALL use two distinct reference namespaces and SHALL never conflate them: a layout ref
for fitment enquiries, in the format already fixed by the fitment spec (`TC-2009-2013`), and an order
ref for orders, in the `LR-` format the codebase already produces.

3.2 WHEN an order reference is shown to a customer THEN THE SYSTEM SHALL use the server-generated value
in the `LR-` family, composed only of characters that survive a WhatsApp message and a URL query.

3.3 WHEN a fitment enquiry message is built THEN THE SYSTEM SHALL append the layout ref in the form the
fitment spec specifies — *"…(ref TC-2009-2013)"* — and SHALL NOT show the internal code anywhere else.

3.4 WHEN the order confirmation template is sent THEN THE SYSTEM SHALL include the order ref in the
message body, because that is what makes a screenshot of the chat usable months later.

3.5 WHEN a reply button is pressed THEN THE SYSTEM SHALL carry the ref as the button's payload so the
press is self-describing, and SHALL additionally verify the sender's number, so that a forged payload
alone changes nothing.

3.6 IF the button payload cannot carry the ref THEN THE SYSTEM SHALL fall back to identifying the
order by the sender's number plus the most recent unconfirmed order for that number, and SHALL say so
in the design rather than failing silently.

3.7 WHEN a customer sends free text containing a ref THEN THE SYSTEM SHALL match it to the matching
order or layout, so that "TC-2009-2013" typed into the chat is enough to answer a question.

3.8 THE SYSTEM SHALL make the ref the primary key in the operator's queue view, so that sorting by
ref groups a conversation.

3.9 THE SYSTEM SHALL NOT put a full order detail dump in the message body — a WhatsApp message is
visible to whoever holds the phone, and address lines do not belong there by default.

---

### Requirement 4 — The 12-hour follow-up

**User Story:** As the owner, I want unconfirmed orders chased automatically after 12 hours, so that
orders do not die silently while I am asleep.

#### Acceptance Criteria

4.1 WHEN an order has been unconfirmed for 12 hours THEN THE SYSTEM SHALL send exactly one follow-up
template to that customer.

4.2 WHEN the follow-up is sent THEN THE SYSTEM SHALL restate the ref, what is waiting, and carry the
same Confirm / Cancel buttons, so the customer can resolve it with one tap.

4.3 WHEN the follow-up is sent THEN THE SYSTEM SHALL record that it was sent and when, so it cannot be
sent twice for one order.

4.4 IF the order was confirmed or cancelled between selection and sending THEN THE SYSTEM SHALL send
nothing.

4.5 WHEN the follow-up job runs THEN IT SHALL be safe to run repeatedly, because nothing in the
repository yet schedules anything and the cadence is a hosting choice.

4.6 WHEN no answer arrives after the follow-up THEN THE SYSTEM SHALL leave the order visible to the
owner rather than auto-cancelling it, because cancelling a customer's order because they were asleep
is worse than chasing them.

4.7 IF the follow-up template has not been approved THEN THE SYSTEM SHALL skip sending and record why,
rather than failing the job.

4.8 WHILE an order remains unconfirmed THEN THE SYSTEM SHALL show the owner how long it has been
waiting, so the queue can be triaged by age.

---

### Requirement 5 — Templates

**User Story:** As the owner, I want the messages LuxeRide sends to be reviewed and approved in
advance, so that I can send them without risking a quality downgrade on my number.

#### Acceptance Criteria

5.1 THE SYSTEM SHALL maintain at least four templates: order confirmation, refusal / not-stocked with
waitlist, the 12-hour follow-up, and a demand-log acknowledgement.

5.2 WHEN a template is created THEN ITS category SHALL be `UTILITY`, because every message in this
engine is transactional and the fitment spec's confirmation-card language is explicitly
non-promotional.

5.3 IF a template is created with promotional or upsell wording THEN THE SYSTEM SHALL expect it to be
recategorised to `MARKETING`, and SHALL treat a recategorisation webhook as a pricing event, because a
utility template is free while a customer-service window is open and a marketing template never is.

5.4 THE SYSTEM SHALL keep the confirmation template free of cross-sell and urgency language, so that it
stays a utility template under Meta's categorisation rule that mixed content is reclassified.

5.5 WHEN a template's status changes THEN THE SYSTEM SHALL record it, because the status enum has ten
values and only `APPROVED` permits sending.

5.6 IF a template is not approved WHEN the order-confirmation send is attempted THEN THE SYSTEM SHALL
fall back to the `wa.me` link path and flag the order for manual follow-up.

5.7 THE SYSTEM SHALL keep every template body within Meta's published limits — body 1024 characters,
header 60, footer 60, reply-button label 25 — and SHALL fail a template submission loudly rather than
silently truncating.

5.8 THE SYSTEM SHALL write the templates as files in the repository with their exact body text, so that
the submitted template and the documented template cannot drift.

5.9 WHEN a template body carries variable values — ref, items, total THEN THE SYSTEM SHALL declare
those as named parameters and supply them at send time, rather than generating a new template per
order.

5.10 THE SYSTEM SHALL assume template approval can take up to 24 hours and provide a manual
submission route, because there is no service-level agreement.

---

### Requirement 6 — Consent and messaging rules

**User Story:** As a customer, I want to know why I am being messaged and be able to stop, so that
LuxeRide is not a nuisance on my phone.

#### Acceptance Criteria

6.1 WHEN the checkout collects a phone number THEN THE SYSTEM SHALL disclose that the number will be
used to send order messages on WhatsApp, and SHALL record when that disclosure was shown.

6.2 IF no consent disclosure has been shown THEN THE SYSTEM SHALL still send the transactional
confirmation, because it is a service message about an order the customer placed, but SHALL log the
missing disclosure so the gap is visible.

6.3 WHEN a customer replies `STOP` to a LuxeRide message THEN THE SYSTEM SHALL suppress all further
marketing-category messages to that number and record the opt-out.

6.4 WHEN a send fails with the error code Meta returns for a blocked or opted-out recipient THEN THE
SYSTEM SHALL record the suppression and stop retrying that number.

6.5 THE SYSTEM SHALL only send free-form (non-template) messages inside an open customer-service window
— that is Meta's rule, and outside the window only approved templates are permitted.

6.6 THE SYSTEM SHALL never treat a WhatsApp conversation as a substitute for the customer's consent to
marketing, and SHALL not send promotional messages through this engine at all.

6.7 WHEN the engine records a message THEN THE SYSTEM SHALL record the recipient's E.164 number, not
any internal contact identifier.

---

### Requirement 7 — Rate limits, retries and idempotency

**User Story:** As the owner, I want the engine to survive Meta's failures without duplicating
messages, so that a bad afternoon does not become a flood of angry customers.

#### Acceptance Criteria

7.1 WHEN a send fails with a transient error THEN THE SYSTEM SHALL retry with exponential backoff and
jitter, up to a bounded number of attempts.

7.2 WHEN a send fails permanently THEN THE SYSTEM SHALL stop retrying, record the final error, and
raise the order in the operator queue.

7.3 WHEN a send is retried THEN THE SYSTEM SHALL not create a second message record for the same
order, template and attempt.

7.4 WHEN Meta rejects a batch for exceeding throughput THEN THE SYSTEM SHALL back off and resume, rather
than retrying the whole batch at once.

7.5 THE SYSTEM SHALL track the business's current messaging limit and treat an approach to it as an
operator alert, not as a per-message error.

7.6 WHEN an inbound webhook is delivered more than once THEN THE SYSTEM SHALL process it once, keyed on
the provider's per-message identifier.

7.7 WHEN two orders for the same number are open simultaneously THEN THE SYSTEM SHALL not silently
attach a button press to the wrong one, and SHALL prefer the most recent unconfirmed order only when
exactly one exists.

7.8 WHEN a delivery receipt is missing for a message — which Meta does not guarantee in the order they
were sent — THEN THE SYSTEM SHALL not treat absence as failure.

---

### Requirement 8 — Failure modes are products, not exceptions

**User Story:** As the owner, I want every way this can go wrong to have a defined, visible outcome, so
that I am never surprised by a customer telling me something I cannot see.

#### Acceptance Criteria

8.1 WHEN a template is rejected THEN THE SYSTEM SHALL record the rejection reason and fall back to the
link path.

8.2 WHEN a template is still pending review at send time THEN THE SYSTEM SHALL fall back to the link
path rather than sending an unapproved message.

8.3 WHEN the 24-hour customer-service window has closed THEN THE SYSTEM SHALL still send an approved
template, and SHALL NOT attempt a free-form message.

8.4 IF the customer's number is unreachable THEN THE SYSTEM SHALL mark the order `UNREACHABLE`, keep it
in the queue, and preserve the order ref so the owner can call instead.

8.5 IF the number is invalid THEN THE SYSTEM SHALL not call the API at all, and SHALL report the
specific validation failure.

8.6 WHEN a message is delivered but never read THEN THE SYSTEM SHALL surface that fact, because "sent"
and "seen" are different and the follow-up decision differs.

8.7 IF the webhook signature cannot be verified because the app secret is missing or rotated THEN THE
SYSTEM SHALL fail loudly on the owner-facing health surface rather than silently accepting events.

8.8 WHEN an order cannot be confirmed because the customer pressed a button for an order belonging to a
different number THEN THE SYSTEM SHALL keep both records intact for the owner to reconcile.

8.9 IF the operator's queue is itself unavailable THEN THE SYSTEM SHALL keep writing to the message log
regardless, because the log is the dispute-resolution record.

---

### Requirement 9 — Auditability

**User Story:** As the owner, I want to be able to prove what I sent and what the customer did, so
that a "you never sent my order" argument can be settled with evidence.

#### Acceptance Criteria

9.1 WHEN any message is sent THE SYSTEM SHALL record: direction, template name, recipient number, the
order or layout ref it relates to, the provider message identifier, the render time, the delivery
status, and any error code.

9.2 WHEN any inbound message or button press is received THEN THE SYSTEM SHALL record it with the same
fields plus the raw provider event identifier.

9.3 THE SYSTEM SHALL retain the rendered body of every message sent, so that a dispute can be settled
from the record rather than from memory.

9.4 THE SYSTEM SHALL make the message log queryable by ref, by recipient number, and by date, without
requiring the owner to write SQL.

9.5 WHEN a dispute arises about a specific order THEN THE SYSTEM SHALL be able to produce its complete
timeline — order created, message sent, delivered, read, button pressed, status changed — as one
ordered list.

9.6 THE SYSTEM SHALL not log the Cloud API access token, the app secret, or the verify token anywhere in
the message log.

---

### Requirement 10 — The operator works the queue, not the chat

**User Story:** As the owner, I want a list of what needs a decision rather than a transcript to read,
so that the business keeps up when there are more orders than I have time to read messages.

#### Acceptance Criteria

10.1 WHEN the operator opens the queue THEN THE SYSTEM SHALL show orders grouped by what needs doing —
confirmations awaiting a press, unreachable, unanswered after the follow-up, cancelled — and SHALL NOT
present an unread message feed.

10.2 WHEN an order needs a decision THEN THE SYSTEM SHALL show its ref, the customer, the total, the
delivery zone, how long it has been waiting, and whether the message was delivered and read.

10.3 WHEN a layout refusal is waiting THEN THE SYSTEM SHALL show it in the same queue as an order,
because the fitment spec's demand log is a ranking of what to source next.

10.4 WHEN two or more orders for the same number are open THEN THE SYSTEM SHALL surface that fact
explicitly, because it is the situation where a wrong press causes the most confusion.

10.5 WHEN the queue is empty THEN THE SYSTEM SHALL say so plainly, rather than showing a blank screen
that reads as broken.

10.6 IF the number of open items exceeds what one person can work in a day THEN THE SYSTEM SHALL make
the oldest unconfirmed items sort first, so that the backlog ages visibly rather than silently.

10.7 THE SYSTEM SHALL keep the operator's manual ability to reply in the WhatsApp Business inbox, and
SHALL NOT require the operator to do anything inside LuxeRide that blocks sending a message.

10.8 WHEN an order is resolved by a button press THEN THE SYSTEM SHALL remove it from the operator's
attention queue automatically, so that confirmed orders do not need to be ticked off by hand.