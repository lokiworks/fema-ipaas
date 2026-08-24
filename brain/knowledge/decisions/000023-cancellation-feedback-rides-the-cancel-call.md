---
status: accepted
---

# Cancellation feedback rides the cancel call

> **历史资料 —— 描述的是上游，不是本仓库。** 本页写的 Edition 体系、计费与席位、
> license key、Cloud 形态在本仓库**都不存在**（Edition 已彻底删除，见
> [decisions/000030](./000030-this-fork-has-no-editions-the-ee-pages-are-history.md)）。
> 读它了解上游为什么那样设计可以，照着写代码不行——以 `docs/adr/` 和代码为准。

## Context

Self-serve cancellation had no churn survey. The dialog was a generic `ConfirmationDeleteDialog` carrying
only the "what happens next" copy (`dropToFreeWarning`), rendered from two
entry points that both call `cancelWithSeatCheck` in `useCancelSubscriptionGuard`.

Sales had no way to see why anyone left. Autumn records that a subscription was cancelled, not the reason.

AP already proxies the cancellation to the console: `POST /v1/platform-billing/cancel` reaches
`${AUTUMN_CONSOLE_URL}/api/v1/billing/cancel` with the platform's scoped Autumn key as Bearer, and the
console's auth hook resolves `request.autumnCustomerId` and `request.autumnCustomerPlanId` from that key.

## Decision

The survey is folded into the cancel dialog as a **single step**, and the answers travel on the **existing
cancel request** rather than a dedicated feedback endpoint. The console stores them in an append-only
`cancellation_feedback` table and lists them at `/cancellations`.

- One new AP dialog replaces `ConfirmationDeleteDialog` at both cancel entry points, shared through
  `useCancelSubscriptionGuard`. Reason checkboxes, a free-text comment, then the unchanged
  `dropToFreeWarning` alert directly above the footer.
- Answering is **optional**. Both buttons stay enabled with nothing ticked.
- Reasons are an **array of snake_case codes**, never rendered label text. Labels live in
  `translation.json`; the console maps code to label and falls back to the raw code.
- The request body adds `reasons`, `comment`, and `canceledByEmail`. Identity for the stored row comes from
  the key-verified `request.autumnCustomerId` and `request.autumnCustomerPlanId`, never the body.
- One row per cancellation, append-only. Cancel then reactivate then cancel leaves two rows.
- The insert lives in the console **controller**, not in `billingService.cancel`, and is best-effort:
  a failed insert is logged and the cancellation still succeeds.

## Why

Riding the cancel call means one round trip, no second AP to console auth path, and both AP entry points
covered by one change. The row also joins straight to `autumn_customers`, so a rep gets a real customer and
plan instead of an orphaned email.

Codes rather than label text because the dialog goes through `t()` like every AP surface: storing what the
user saw would file a Spanish customer's churn reason as Spanish free text and silently split the rep's
grouping. Codes also survive copy edits, which this dialog will get.

Optional rather than required because a survey that blocks the exit is the friction pattern click-to-cancel
rules target, and forced answers are worse than none: people tick the first option to dismiss the dialog,
which is indistinguishable from a genuine answer and poisons the dataset.

Append-only because the second cancellation after a save attempt is usually the honest one, and an upsert
would erase the first.

The insert cannot sit inside `billingService.cancel`: that method early-returns when the plan is nil or
Free, which would swallow feedback in exactly the edge cases worth reading.

## Consequences

- **Feedback is lost whenever the cancellation does not complete.** The seat floor is the live case: when
  active users exceed the Free plan's seats, `cancelWithSeatCheck` opens the deactivate-users dialog instead
  of cancelling, and a server `QUOTA_EXCEEDED` does the same after the fact. Someone who answers the survey
  and then abandons at that dialog leaves no row. Accepted for now; a separate endpoint is the fix if the
  gap turns out to matter.
- **`canceled_by_email` is unverified body data.** It is the acting admin, sent so a rep has a human to
  reply to rather than the billing address on `autumn_customers`. Use it for outreach only, never for
  identity or joins.
- **A new reason option is a two-repo ship**: AP for the code and its label, console for the display label.
  Old rows keep codes the console may no longer know, hence the raw-code fallback.
- **The seat-credit warning now sits below the survey** instead of being the first thing read, so it is
  easier to skip.
- No reason-count chart and no feedback section on `/customers/:email` in v1.
