# Barangay flood profile and the downstream heads-up — Design

**Date:** 29 September 2026 · **Status:** design, for the owner's review

## Why

Two things the PRD lists as not started depend on facts nobody has entered:

- **The Hazards layer shows nothing.** Every one of the 113,676 rows in `hazard_susceptibility` (flood, landslide and storm surge for every barangay) is `unknown`, because no DENR-MGB data was ever loaded.
- **The downstream warning can never fire.** Only 3 of 41,803 barangays have a `downstream_zone_id`, and nothing reads it except the Operations map, which draws the link.

A barangay's officials know both facts about their own barangay: whether it floods, and which barangay the water reaches next. They already keep their barangay's details (hotlines, evacuation instructions) in a form. This design adds the two facts to that form and puts them to work.

## Decisions (owner, 29 September)

- **The downstream heads-up reaches officials only**: the downstream barangay's officials and their town's, on the dashboard, by push, and by email to those with email alerts on. Residents hear only when their own officials act, so an upstream alert never becomes a false alarm for them.

## What officials see

**The flood profile, in the barangay details form** (`barangay-details-form.tsx`, on the barangay page). A new section below the instructions:

- **Flood**, **Landslide**, **Storm surge**: each Low · Medium · High · Not sure. "Not sure" is today's `unknown` and stays the default.
- **Downstream barangay**: "Where does your floodwater go next?" A list of the barangays within 20 km, nearest first, with their town, plus "None / not sure". The barangay itself is not in the list.

Saved with the rest of the form, recorded in the action record like the other details ("Flood profile set"), and shown on the barangay page with when it was set.

**The heads-up.** When a barangay goes to Warning or Evacuate (from anything lower, or from no alert), and it names a downstream barangay, the downstream barangay's officials and their town's get:

- a message on their dashboard, where town and barangay updates already appear: "Upstream: {barangay} is under {Warning/Evacuate} (set {time}). Water may reach you. Check your barangay." It can be acknowledged like the others;
- a push to their phones, and an email to those with email alerts on.

Re-confirming the same level, lowering it, or lifting it sends nothing. An automatic crowd advisory is always an Advisory, so it never sends one.

## What residents see

**The Hazards layer** on the map shows each barangay's level for the chosen hazard wherever its officials have set one, in the existing hazard colours; "Not sure" draws nothing, as today. The barangay's own page and the zone list show the levels ("Flood: High") instead of "Unknown". Residents never see the downstream link or the heads-up.

## How it is built

**1. Saving.** A new `security definer` function, `set_barangay_profile(p_zone_id text, p_flood text, p_landslide text, p_storm_surge text, p_downstream_zone_id text)`, with the same official-of-this-barangay check as `set_barangay_details`. It refuses a level outside `low`, `medium`, `high`, `unknown`, a downstream barangay that is the barangay itself or more than 20 km from it, and an unknown barangay id. It updates the three `hazard_susceptibility` rows and `zones.downstream_zone_id`, sets a new `zones.profile_set_at`, and records `profile.set` in `official_actions`. Residents keep no direct write on either table.

**2. Reaching the map.** Reference data (zones and hazards) is generated and cached on phones, so officials' changes travel the way barangay details already do: `/api/barangay-details` also returns the hazard levels and downstream link of every barangay whose profile was set, and a new `applyProfileOverlay` merges them over the cached data, next to `applyDetailsOverlay`. The Operations map's downstream lines then show officials' links too.

**3. The heads-up.** `official_messages` gains a third direction, `heads_up` (to one barangay: `zone_id` is the downstream barangay, `town_code` its town), and a kind, `upstream_alert`. A trigger on `alerts` inserts one when a new active alert is `red` or `evacuate` and the row it replaced (`superseded_severity`) was neither, and the barangay names a downstream one. The read policy already shows a town's messages to every official in that town, so the downstream barangay's officials and their town's see it. `acknowledge_official_message` accepts it from the downstream barangay's own officials.

**4. Notifying.** `setZoneAlert` (and so the town's many-barangay alert) already tells residents in `after()`. On an escalation to Warning or Evacuate it also calls a new `notifyDownstreamOfficials(zoneId)`, which finds the heads-up the trigger just wrote and sends it through `notifyOfficialsOfMessage`, extended for the new direction: the downstream barangay's officials and their town's. Best effort, as today: a failure is logged, never thrown; the dashboard message is already saved.

**5. Service worker.** Version bump.

## Not in this change

- Loading DENR-MGB or UP NOAH maps. Officials' own knowledge fills the layer now; official maps can replace it later.
- A heads-up for residents (the owner's decision), and chains of more than one step (the downstream barangay's own officials decide whether to alert, which then passes it on).
- Upstream barangays in another province or more than 20 km away.

## Rollout

The migration goes to the live database first; it only adds (a column, a function, a direction and kind, a trigger, a policy change for acknowledging). Until the release, nobody can set a profile, so the trigger has nothing to act on. The service worker bump brings the new form and layer to every phone on its next open.

## Testing

- **Database** (`supabase/tests/`, in CI; checked once on live in a rolled-back transaction): only the barangay's own officials may set its profile, and a resident, another barangay's official and an anonymous caller are refused; bad levels, the barangay itself, a barangay over 20 km away and an unknown id are refused; `official_actions` records `profile.set`; the trigger writes one heads-up on a first Warning or Evacuate, none on a re-confirmation, a lower level, a lift, an Advisory, or a barangay with no downstream link; the downstream barangay's officials can read and acknowledge it and a resident cannot read it.
- **Form:** the four new fields, the 20 km list nearest first without the barangay itself, "Not sure" and "None" as defaults, and saving them with the details.
- **Overlay:** officials' levels replace `unknown` on the map and in the lists; a barangay with no profile stays `unknown`.
- **Notifying:** an escalation to Warning or Evacuate with a downstream barangay notifies its officials and their town's; the other cases notify no one; a failure does not fail the alert.
