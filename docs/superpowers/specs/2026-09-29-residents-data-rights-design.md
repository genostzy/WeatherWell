# Residents' data rights: download and delete — Design

**Date:** 29 September 2026 · **Status:** design, for the owner's review

## Why

RA 10173 (the Data Privacy Act) gives a data subject the right to access their personal data and to have it erased or blocked. The PRD lists "Data export and deletion" as not started: a resident cannot download or delete anything from the app. Before real residents use it beyond the pilot, they need both, on their own, without asking an official.

## Decisions (owner, 29 September)

- **Deleting keeps a resident's water-level reports, anonymised:** detached from the account and without their location; depth, barangay and time stay, so past alerts and the calibration record still add up.

## What residents see

A **Your data** card on the Settings page (`/resident/settings`), below Security questions:

- **Download my data.** Saves `weatherwell-my-data.json`: the account (when it was made, whether it is anonymous, its email if it has one), the chosen barangay, every water-level report (depth, barangay, time, and the position the phone sent), every pin (type, description, position, time, whether it had a photo), every vote, every check-in, the push and email alert subscriptions (barangay and date, not the push address), and the security questions (the questions, never the answers).
- **Delete my data.** A dialog says what happens, in plain words, and asks to type DELETE:
  - reports stay in the barangay's counts, but without the account or the location;
  - pins stay on the map, because they describe a place, but no longer name the account, and their photos are deleted now;
  - votes, check-ins, push and email alerts, security questions and the account itself are deleted;
  - this phone is signed out and the app starts again from the beginning.
  Then it does it, and shows "Your data is deleted."

Officials and the admin do not see the card: their accounts carry the action record and are removed by an admin (`/admin/officials`), as today.

## How it is built

**1. Download.** A new route, `GET /api/my-data`, reads the signed-in resident's rows with their own session (RLS already limits each table to its owner, and `my_water_level_reports()` returns their reports), plus two small `security definer` functions for what RLS hides from them: their reports' positions and their pins' photo flags. It answers `401` without a session and sets `Content-Disposition: attachment`.

**2. Delete.** A new `security definer` function, `delete_my_data()`, for the caller only (`auth.uid()`), refused to officials and the admin. In one transaction it:
- anonymises `water_level_reports`: `reporter_id`, `lat`, `lng` and `located` set to null (the column loses `not null`; its foreign key allows null);
- detaches `community_pins`: `author_id` set to null (same change) and `photo_path` cleared, returning the photo paths;
- deletes `pin_votes` (a pin a vote took down stays down: the removal trigger runs on insert and update only), `evacuation_check_ins`, `private.recovery_attempts` for the account's email;
- returns the photo paths.
A Server Action, `deleteMyData()`, calls it, deletes the returned photos with the Storage API (service role), then deletes the account with the Auth admin API; `profiles`, `push_subscriptions`, `email_alert_subscriptions` and `private.recovery_answers` go with it (`on delete cascade`). The page then signs out, clears this phone's queued writes and onboarding, and returns to the start.

**3. What the anonymised rows mean elsewhere.** The crowd engine counts distinct located reporters, so an anonymised report stops counting toward a live advisory, which is right: the resident has withdrawn it. Past alerts, their verdicts and the calibration record are untouched.

**4. The consent notice** stays as it is and is not asked again. The rights live in Settings, and the PRD's privacy section names them.

## Not in this change

- Deleting data for officials and the admin.
- Correcting a report after it was sent (rectification); a resident can delete everything or nothing.
- Removing old anonymous identities that never sent anything (a separate open item).

## Rollout

The migration goes to the live database first; it only relaxes two `not null` columns and adds functions. Nothing in the running app writes a null `reporter_id` or `author_id`. Readers compare the author with the signed-in account, so a null author is simply nobody's; the generated types change from `string` to `string | null`, and the readers that need it are updated in the same change. The service worker bump brings the card to every phone.

## Testing

- **Database** (in CI; checked once on live in a rolled-back transaction): `delete_my_data()` anonymises the caller's reports (and no one else's), detaches their pins and returns the photo paths, deletes their votes and check-ins, refuses officials, the admin and an anonymous caller; the crowd engine no longer counts an anonymised report; a pin's removal stays after its votes go.
- **Download route:** `401` without a session; the JSON holds the resident's own rows, the positions and the photo flags, and never another resident's rows or the security answers.
- **Delete action:** calls the function, deletes the photos and then the account, in that order; if the database refuses, deletes nothing else and says so.
- **Card:** hidden for officials; the dialog needs DELETE; after deleting, the phone is signed out with its queue and onboarding cleared.
