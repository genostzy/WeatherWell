# Limits for pins, votes and photos — Design

**Date:** 29 September 2026 · **Status:** design, for the owner's review

## Why

Water-level reports have had a geofence and a rate limit since 22 September (anti-abuse layers 1-3): a report must come from within 15 km of its barangay, and one device can send one per barangay every 5 minutes. Pins and votes have neither, which the PRD records ("Pin vote protection: Partly built … Pins and votes do not yet get the geofence or rate limit"), and photo uploads have no cap per account ("A per-account count in the storage policy is the follow-up"). Today one anonymous identity can place hundreds of pins anywhere in the country, vote as fast as it can tap, and fill the photo store. Pins now steer "Find safe evacuation center" around blocked roads, so a flood of fake pins can bend real walks.

## Decisions (owner, 29 September)

The owner asked for all the recommended changes and left the numbers to this design. The numbers, which the owner can change in review:

- **A pin must be within 15 km of its barangay**, the same distance as a report.
- **5 pins an hour** from one account, anywhere.
- **30 votes an hour** from one account (a vote and a change of mind count alike).
- **10 photo uploads a day** from one account.

## What residents see

Nothing changes for anyone within the limits. Past them, the pin form, the vote buttons and the photo button say why, in the app's words, as a report's refusals already do:

- a pin too far away: "This spot is too far from {barangay} to pin there." The pin is not queued;
- too many pins: "Waiting: up to 5 pins an hour. It will send by itself." It stays queued and the outbox retries it, as a held-back report does;
- too many votes: "Waiting: up to 30 votes an hour. It will send by itself." The vote stays queued, as a held-back report does (changed while planning, 30 September: votes already go through the outbox);
- too many photos: "You've added a lot of photos today — drop the pin again to send it without this one." The form stays open, as for any failed upload (changed while planning: the form cannot speak after it closes).

## How it is built

**1. Pins.** A trigger on `community_pins` inserts, `private.enforce_pin_geofence_and_rate_limit()`, in the manner of the report trigger (`20260922094703_report_geofence_and_rate_limit`): the pin's own position within 15 km of its barangay's point (the same flat-earth distance), or `raise … using errcode = '23514', hint = 'too_far'`; then one count per account through `public.take_rate_limit('pin:' || author, 5, 3600)` (from `20260929144851_rate_limits`), or `raise … using hint = 'rate_limited'`. The count uses the database's clock, so a phone's time cannot dodge it. Officials are not limited: their pins are part of their work.

**2. Votes.** A trigger on `pin_votes` inserts and updates, `private.enforce_vote_rate_limit()`: `take_rate_limit('vote:' || voter, 30, 3600)`, or `raise … using hint = 'rate_limited'`. It runs before the net-score removal trigger, so a refused vote removes nothing.

**3. Photos.** The storage insert policy for `pin-photos` gains a count: fewer than 10 objects in `pin-photos` whose `owner_id` is the caller and whose `created_at` is within the last day. Photos are deleted after 7 days, or an hour if never attached, so the count reads the live store.

**4. The app.** `createPin` already treats a CHECK violation (`too_far`) as permanent and anything else as worth retrying, so a rate-limited pin stays queued; `voteOnPin` and `createPin` gain the two hints in their returned `reason`, and the form, the vote buttons and the outbox badge show the words above. A refused photo upload reads as a policy denial (`403`), which `uploadPinPhoto` reports as "too many photos today".

## Not in this change

- A geofence for votes: a vote carries no position, and one vote per pin (already enforced) plus the hourly count bound what one account can do.
- Limits for new anonymous identities; Supabase Auth's own per-IP sign-up limit still bounds them (the `abuse.sql` header's known limits).
- Limits for officials' markers and messages.

## Rollout

The migration goes to the live database first. Unlike the other changes this week, it refuses writes the production app still makes: until the release, the old app shows a refused pin or vote as a generic failure, and retries a rate-limited pin later, which is what it should do anyway. No resident is near the limits today (the database holds 2 pins), so the gap is harmless. The service worker bump brings the new messages.

## Testing

- **Database** (`abuse.sql`, in CI; checked once on live in a rolled-back transaction): a pin 16 km from its barangay is refused with `too_far` and one at 14 km accepted; the 6th pin in an hour is refused with `rate_limited` and an official's is not; the 31st vote in an hour is refused and removes nothing; the 11th photo in a day is refused by the storage policy and the 10th accepted.
- **Actions:** `createPin` returns `too_far` as permanent and `rate_limited` as transient; `voteOnPin` returns `rate_limited`.
- **Screens:** each refusal shows its words; a rate-limited pin stays in the outbox; a refused photo lets the pin go without it.
