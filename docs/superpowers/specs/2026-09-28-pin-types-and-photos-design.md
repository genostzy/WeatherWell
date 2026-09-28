# Pin types and photos for officials — Design

**Date:** 28 September 2026 · **Status:** design, for the owner's review

## Why

Community pins only describe floods (flooded, rising, receding, impassable), so a resident has no way to say a road is blocked by a fallen tree, a landslide has come down, or a power line is on the ground. These matter as much as water in an evacuation, and the next piece of work ("Find safe evacuation center") can warn about them. Officials also have no way to see what a resident saw: a pin is a type and a line of text, which is hard to check and act on. The PRD held photos back until consent and retention rules existed ("Community pin photos are not supported … Consent and retention rules for photos would need to be designed before any photo upload ships"); this design supplies those rules.

## Decisions (owner, 28 September)

- **Pins get types:** Flood (with today's four water statuses), Road blocked, Landslide, Power line down, Other.
- **A pin can carry one photo, and only officials see it.** Residents still see the pin's type and description. Photos can be opened to everyone later.
- **Photos are kept 7 days,** and deleted sooner when the pin is removed.

## What residents see

**The pin form.** It asks "What's happening?" first: Flood · Road blocked · Landslide · Power line down · Other. Flood keeps today's second choice (flooded, rising, receding, impassable); the other types need none. The description stays required.

**Adding a photo.** "Add photo (only officials see it)" opens the camera or the gallery (`<input type="file" accept="image/*" capture="environment">`). The phone shrinks the photo before it is sent: at most 1280 pixels on the longer side, JPEG, about 150 KB, and never more than 500 KB. Re-drawing the image drops the metadata a phone camera writes into a photo, including where it was taken. The first time a phone adds a photo, a short notice comes first and needs OK: "Only officials see this photo. It is deleted after 7 days. Don't include people's faces or plate numbers." A preview shows the photo with a way to remove it before sending.

**Offline.** A photo needs a connection. Offline, the pin is still queued exactly as today, without the photo, and the form says "Photos need a connection — the pin will be sent without it."

**On the map.** Each type has its own icon and colour, in the existing dashed "unverified community pin" style, never mistaken for an official alert or marker. The marker legend lists every type. A pin's popup and the resident's own pin list say its type ("Road blocked") and, for floods, the water status as today. Votes and the net-score removal work for every type, as today.

## What officials see

A pin with a photo shows it as a thumbnail in the barangay page's pin list (`CommunityPinModerationPanel`) and in the Operations map popup, and opens full-size in the existing photo viewer (`photo-lightbox.tsx`). The photo loads through a signed link valid for an hour, which only an official's session can create.

## How it is built

**1. Pin types.** `community_pins.status_tag` accepts four more values: `road_blocked`, `landslide`, `power_line_down`, `other` (the check constraint is extended; no new column). `PinStatusTag` gains them, with a label, colour and icon each in `src/lib/community-pin.ts` and `marker-icons.ts`; the form, map popups, the resident's pin list, the legend and both maps' moderation read those tables, as they do today. A type is a flood when its tag is one of the four water statuses.

**2. Storage.** A private Supabase Storage bucket, `pin-photos`, created by migration: `public = false`, `file_size_limit` 500 KB, `allowed_mime_types` JPEG and WebP. Policies on `storage.objects` for that bucket:
- insert: signed-in callers, only into their own folder (`<auth.uid()>/…`);
- select: any official, as with the action record (`private.is_operator()`), which is what lets an official's session sign a link;
- no update; delete only by the service role (the cleanup job).
The free plan's 1 GB holds about 6,000 photos at 150 KB; the 7-day deletion keeps the store far below that.

**3. Attaching a photo.** The phone uploads the shrunk photo to `pin-photos/<its account id>/<new uuid>.jpg`, creates the pin as today (`createPin`), then calls a new `security definer` function `attach_pin_photo(p_pin_id uuid, p_path text)` through a Server Action. It checks the caller wrote the pin, the pin is not removed, the path is in the caller's own folder and the object exists in `storage.objects`, then sets `community_pins.photo_path`. Residents keep no direct write on `photo_path`. If the upload or the attach fails, the pin stays, without the photo, and the form says so.

**4. Showing it to officials.** The pin feeds keep carrying `photo_path` (a path is not a photo; the bucket is private). Officials' screens call `storage.from("pin-photos").createSignedUrl(path, 3600)` with their own session; a resident's session cannot sign one.

**5. Deleting.** A new daily Vercel cron route, `/api/cleanup-pin-photos` (the same free schedule and cron-secret check as `/api/cleanup-weather`), uses the service role and the Storage API, since removing a row from `storage.objects` in SQL would leave the file behind. It deletes:
- photos older than 7 days,
- photos of removed pins,
- uploads older than an hour that no pin points to,
and clears `photo_path` on the pins it touched. `vercel.json` gets the new entry.

**6. The consent notice.** Unchanged, and not asked again: the photo is optional, and the one-time notice above asks exactly when a resident chooses to add one, which is when the choice is real.

**7. Service worker.** Version bump, so every phone takes the new pin types on its next open.

## Not in this change

- Photos for residents (the owner can open them later).
- More than one photo per pin, or video.
- Pin types changing directions. The "Find safe evacuation center" design uses them.
- Photos on check-ins or official markers.

## Rollout

The migration goes to the live database first; it only adds (the extended constraint, the bucket, the policies, the function). The production app keeps working: it never writes the new types, and a phone on the old version that meets a new-type pin before it updates shows it with no colour and a raw label until its next open, when the service worker bump brings the new code.

## Testing

- **Database** (`supabase/tests/`, run in CI; checked once on live in a rolled-back transaction): the new types are accepted and an unknown one refused; `attach_pin_photo` refuses someone else's pin, a removed pin, a path outside the caller's folder and a path with no object, and sets `photo_path` otherwise; the storage policies let a resident upload only into their own folder and not read, and let an official read.
- **Form:** the type comes first; Flood asks the water status and the others do not; a photo is shrunk to 1280 pixels and at most 500 KB; the first photo shows the notice; offline sends the pin without the photo and says so; a failed upload keeps the pin and says so.
- **Map and lists:** each type's icon, colour and label, on both maps, in the legend and in the resident's pin list.
- **Officials:** the thumbnail and the full-size view appear for a pin with a photo, and not for one without.
- **Cleanup route:** refuses without the cron secret; deletes old, removed-pin and orphaned photos and clears `photo_path`; leaves a new photo on a live pin alone.
