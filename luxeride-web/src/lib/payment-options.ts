/**
 * Which payment methods the checkout may offer.
 *
 * **Prepay is hidden, not merely relabelled.** Nothing in `src/` contains a bank
 * name or an account number, so today the option asks a customer at the
 * highest-intent screen to choose a payment they cannot actually make. An option
 * that cannot be honoured is worse than no option (`cart-checkout` OQ 1,
 * `payments-paystack` §3).
 *
 * Flip this to `true` only when there is an account to name. When that happens,
 * the copy already on the option is the honest version: bank transfer, details
 * sent afterwards, discount applies once the transfer is *received* — not an
 * online payment, and not an automatic discount.
 *
 * `payments-paystack` §3.3 replaces this constant with a server-provided flag
 * keyed on `PAYSTACK_SECRET_KEY`, which will also distinguish a `sk_test_` key.
 */
export const PREPAY_AVAILABLE = false;
