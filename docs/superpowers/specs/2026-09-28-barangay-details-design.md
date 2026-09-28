# Officials fill in their barangay's hotline, instructions and centre — Design

**Date:** 28 September 2026 · **Status:** design, for the owner's review

## Why

Every barangay shows residents placeholders: no hotline ("Alerts only"), the same line for evacuation instructions everywhere ("Contact your barangay captain for evacuation instructions."), and a centre that is only the barangay's own map point. The PRD says a barangay counts as covered only with a verified hotline and centre, and that these "have to come from the barangays themselves", but the app gives officials no way to enter a hotline or instructions. The centre can only be one of the OpenStreetMap suggestions, although the database already accepts any point within 5 km, and when OpenStreetMap suggests nothing near a barangay its official cannot set a centre at all. Separately, barangay officials have no link to Drill or the Operations map, though the PRD says they rehearse in drill mode and the map is where official markers are placed.

## Decisions (owner, 28 September)

- **Instructions: one language is enough.** An official writes English, Filipino or both. A language left blank gets the other's text, so no resident is left with the placeholder.
- **Up to 3 hotline numbers.** Barangays list a Globe number, a Smart number and a landline, because one network can be down in a storm.
- **Stored in the barangay's own row** (`zones`), with the edits laid over the phone's offline copy the way centre changes already are. One source of truth; the offline file picks them up whenever it is regenerated.

## Who can change it

The same rule as alerts and centres, `private.manages_zone`: a barangay official for their barangay, a town official for the town's barangays, the admin anywhere. Everyone else is refused by the database. A change reaches residents with no second approval, and every save goes into the action record, which all officials can read.

## What officials see

**Barangay details.** On the barangay page (`/admin/zone/[zoneId]`), the Evacuation centre card gets **Edit barangay details**, shown only to officials who manage that barangay. The form has three number fields and two instruction boxes (English, Filipino), filled with what residents see now, and **Save**. Numbers can be left blank: none at all means "no hotline", which residents see as the call-911 fallback. At least one instruction box must be written. The form checks the rules below before sending, in both languages. After a save, the official's own screens show the new details at once, and the card says residents see them the next time their app opens.

**Evacuation centre.** The "Set your evacuation centre" card no longer disappears when OpenStreetMap has no suggestions. It gains **Place it on the map**: a small map centred on the current centre (the barangay's point when there is none), where the official taps the spot, or uses **Place at map centre** from the keyboard. With a name and a capacity, Save sets it through the existing `confirm_evacuation_center`, which keeps its 5 km limit. The suggestions stay as quick picks above it, and the card keeps its current "Saved" message.

**Menus.** The barangay officials' menu gains **Operations map** and **Drill**, and the town officials' menu gains **Drill** (theirs is only on the dashboard today). Both pages already work for them, and the drill already limits itself to the official's area.

## What residents see

- The header call button, the flood-mode call button and a forwarded alert (`/a`) use the main number, as today.
- Evacuation instructions show one call button per number, or the 911 button when there is none.
- The emergency card, the printable plan (`/plan/[zoneId]`) and the officials' barangay page list every number.
- Call links dial only the digits and a leading `+`, so a number typed as "(075) 522-1234" still works.
- The instructions replace the placeholder wherever it shows today: the evacuation page, the emergency card and the printable plan.
- A barangay with a real hotline and a real centre shows as covered by itself: `hasRealHotline` and `hasRealEvacuationCenter` already decide that.

## How it is built

**1. Database** (one migration, applied to the live database first):
- `zones.extra_hotlines text[] not null default '{}'`, at most 2 (`cardinality(extra_hotlines) <= 2`). `hotline_number` stays the main number.
- `zones.details_set_at timestamptz`, null until an official saves, with a partial index on the rows where it is set.
- `public.set_barangay_details(p_zone_id text, p_hotlines text[], p_instructions_en text, p_instructions_fil text)`, `security definer`, `search_path ''`, executable by `authenticated` only:
  - Refuses a caller who does not manage the barangay (`42501`, "not an official for this barangay").
  - Trims every number and drops blank ones. Refuses more than 3; a number that is not 3–20 characters of digits, spaces and `+ - ( )`; one with fewer than 3 digits; and one that is all zeros (`22023`, each with its own message).
  - Trims both instruction texts. Refuses both blank, and either over 1,000 characters.
  - Fills a blank language with the other's text.
  - Sets `hotline_number` to the first number (the all-zero placeholder when there is none), `extra_hotlines` to the rest, `evacuation_route_text` to `{en, fil}` and `details_set_at` to now.
  - Records `barangay.details` in the action record, with the numbers saved and which languages the official wrote. The action check constraint gains that name.

**2. The feed.** `GET /api/barangay-details` returns `id`, `hotline_number`, `extra_hotlines` and `evacuation_route_text` for every barangay whose `details_set_at` is set, read in pages past PostgREST's 1,000-row limit as `/api/alert-bars` does. It is public data (the `zones` table is already world-readable), cached by the CDN for 30 seconds. The service worker adds it to `PUBLIC_API_PATHS`, so it is stale-while-revalidate and a phone keeps the hotline offline. Service worker version bump.

**3. On the phone.** `Zone` gains an optional `extraHotlines`. `applyDetailsOverlay(zones, rows)` sits beside `applyCentreOverlay`, and the reference-data provider fetches the feed next to `/api/centres` after the gate opens, never blocking it. After an official's save, a `useSetBarangayDetails()` hook calls the Server Action (`src/app/actions/set-barangay-details.ts`, a thin wrapper like `confirm-evacuation-center.ts`) and patches that barangay in the provider's state, as `useSetCenterStatus` already does.

**4. Shared rules.** `src/lib/barangay-details.ts` holds the limits (3 numbers, 1,000 characters), the number check the form uses and a `telHref(number)` helper for every call link. The database enforces the same rules. Its new messages join `friendlyError`'s translated list.

**5. The action record.** `describeAction` gains `barangay.details`: "Barangay details updated: hotline 0917 123 4567 (+2 more)" / "Na-update ang detalye ng barangay: hotline 0917 123 4567 (+2 pa)", or "no hotline" / "walang hotline".

**6. Docs.** The PRD's Build Status (coverage, evacuation guidance and officials rows) and the stale "no admin screen, no in-app role" line in Who It Serves; the README's Screens.

## Not in this change

- Drawing an evacuation route line on the map (`evacuation_route_path`). Directions come from the routing server.
- A second approval step, or the town verifying a barangay's details.
- Labels for numbers ("Globe", "Smart"), or more than 3 numbers.
- Regenerating the offline file. The feed covers every edit until it is regenerated.
- Showing a newly confirmed centre on the official's own screen before a reload. The centre card keeps its current behaviour.

## Testing

- **Database** (`supabase/tests/`, run in CI): an official saves for their own barangay; a town official for one in their town; the admin anywhere; an official for another barangay and a resident are refused. Each number and instruction check refuses what it should. A blank language gets the other's text. No numbers stores the placeholder. The action record gets a `barangay.details` row. After the migration, the same checks run once against the live database inside a rolled-back transaction.
- **Feed:** lists only barangays with details set, with the right fields.
- **Overlay:** `applyDetailsOverlay` patches only the listed barangays; an empty feed changes nothing.
- **Form:** prefilled from the barangay; refuses what the database refuses, in both languages; saves and shows the new details at once; shown only to officials who manage the barangay.
- **Centre on the map:** shown with no OpenStreetMap suggestions; a tap and "Place at map centre" set the point; Save sends name, capacity and the point.
- **Resident screens:** one call button per number, 911 with none; the card and the plan list every number; `telHref` strips formatting.
- **Menus:** barangay officials see Operations map and Drill; town officials see Drill.
- **Service worker:** the feed is served stale-while-revalidate from the API cache.
