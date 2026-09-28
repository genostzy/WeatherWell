# Pin Types and Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Community pins get types beyond flood, and a pin can carry one photo that only officials see, kept 7 days.

**Architecture:**
- **Types:** the new values join `community_pins.status_tag`, which gains its first check constraint.
- **Photos:** stored in a private Supabase Storage bucket. The phone shrinks the photo and uploads it into the resident's own folder. `createPin` attaches it through a `security definer` function. Officials view it through signed links. A daily Vercel cron route deletes expired, removed-pin and orphaned photos through the Storage API.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres, RLS, Storage), react-leaflet, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-28-pin-types-and-photos-design.md`

## Global Constraints

- Zero cost; no new accounts or services. Supabase Storage free plan (1 GB); Vercel's free daily cron.
- Migrations hit the live database: apply with the Supabase MCP `apply_migration`, read the version from `supabase_migrations.schema_migrations`, save as `supabase/migrations/<version>_<name>.sql`. Additive only.
- Live database writes only inside a transaction that is rolled back. New database test blocks use fixture ids no other block in `supabase/tests/` uses (grep first; CI runs each file in one transaction).
- Pin types, in this order: Flood (`flooded`, `rising`, `receding`, `impassable`), Road blocked (`road_blocked`), Landslide (`landslide`), Power line down (`power_line_down`), Other (`other`).
- Photos: one per pin, JPEG, at most 1280 px on the longer side and 500 KB, only officials can read them, deleted after 7 days, when the pin is removed, or after 1 hour if no pin points to them.
- Bucket: `pin-photos`, private, `file_size_limit` 512000, `allowed_mime_types` `image/jpeg` and `image/webp`; objects at `<auth.uid()>/<uuid>.jpg`.
- The one-time notice copy (English / Filipino): "Only officials see this photo. It is deleted after 7 days. Don't include people's faces or plate numbers." / "Mga opisyal lang ang makakakita ng larawang ito. Buburahin ito pagkalipas ng 7 araw. Huwag isama ang mukha ng tao o plate number."
- Every user-facing string is a `LocalizedText` rendered with `t(text, lang)`, with `lang={lang}` on the element.
- One service worker version bump for this plan: `VERSION = "v22"`.
- Keep each file's line endings. Helper scripts go in the session scratchpad, never inside the repo (ESLint scans every folder).
- Commits are authored by Wilson <wilsondayritjrapex@gmail.com>, with no Co-Authored-By or other attribution lines.

## Review Focus

1. A photo the browser cannot decode (for example HEIC on some Android browsers), or one that stays over 500 KB at the lowest quality, leaves the pin sendable without it, and says so (Task 3).
2. A 12-megapixel photo sent over a slow connection is shrunk before upload, never sent full-size (Task 3).
3. Going offline between picking the photo and pressing Send queues the pin without the photo and says so (Task 3).
4. A resident cannot read or sign a link to anyone's photo, including their own (Task 1).
5. Pressing Send twice uploads one photo and queues one pin (Task 3).

---

### Task 1: Database — the pin-type constraint, the bucket, the attach function and the cleanup list

**Files:**
- Create: `supabase/migrations/<version>_pin_types_and_photos.sql`
- Modify: `supabase/tests/rls.sql` (new block just before the final `rollback;`), `src/lib/supabase/database.types.ts` (the two functions)

**Interfaces:**
- Produces: the constraint `community_pins_status_tag_check`, which allows exactly the 8 tags in Global Constraints.
- Produces: the bucket `pin-photos`, with policies on `storage.objects`:
  - `pin_photos_insert_own`: for insert to authenticated, with check `bucket_id = 'pin-photos' and (storage.foldername(name))[1] = (select auth.uid())::text`;
  - `pin_photos_read_officials`: for select to authenticated, using `bucket_id = 'pin-photos' and (select private.is_operator())`.
- Produces: `public.attach_pin_photo(p_pin_id uuid, p_path text) returns void`, security definer, `search_path = ''`, executable by `authenticated` only. Its refusals, in this order:
  - `42501` `not your pin`: the caller didn't write the pin, or the pin doesn't exist;
  - `22023` `the pin is removed`;
  - `22023` `the photo is not in your folder`: the path isn't `<auth.uid()>/<name>` with no `/` and no `..` in `<name>`;
  - `22023` `no such photo`: no row in `storage.objects` with bucket `pin-photos` and that name.

  Otherwise it sets `community_pins.photo_path = p_path`.
- Produces: `public.pin_photos_to_delete() returns table (path text)`, security definer, executable by `service_role` only. It lists the `pin-photos` objects that are:
  - created more than 7 days ago; or
  - the `photo_path` of a removed pin; or
  - created more than 1 hour ago with no pin pointing to them.

- [ ] **Step 1: Write the failing database test** (before the final `rollback;` of `rls.sql`; fixture users `c7000000-0000-4000-8000-00000000000{1,2,3}`: 1 author, 2 another resident, 3 an operator with area `9900000081`; zone `tests-fixture-zone-pins`, code `9900000081`). Assert, raising `TSTFL` on any miss:
  - PT1: as the postgres role, a pin with `status_tag` `road_blocked` inserts; one with `snow` raises `check_violation`.
  - PT2: as user 1, an insert into `storage.objects (bucket_id, name, owner_id)` of `('pin-photos', '<user 1>/a.jpg', '<user 1>')` succeeds; one of `('pin-photos', '<user 2>/b.jpg', ...)` raises `insufficient_privilege` (RLS: `new row violates row-level security policy`).
  - PT3: as user 1, `select count(*) from storage.objects where bucket_id = 'pin-photos'` is 0; as user 3 (the official) it is at least 1.
  - PT4: `attach_pin_photo`:
    - As user 2, attaching to user 1's pin raises `insufficient_privilege`.
    - As user 1, attaching `'<user 2>/b.jpg'` raises `invalid_parameter_value`, and so does `'<user 1>/missing.jpg'`.
    - As user 1, attaching `'<user 1>/a.jpg'` sets `photo_path`.
    - After the pin is removed (as postgres), attaching again raises `invalid_parameter_value`.
  - PT5: as postgres, after backdating an object's `created_at` by 8 days, and with an unattached object backdated 2 hours, `pin_photos_to_delete()` returns both paths. It also returns the removed pin's photo, and does not return a fresh attached photo of a live pin.
  - PT6: `has_function_privilege('anon', 'public.attach_pin_photo(uuid,text)', 'execute')` is false; `has_function_privilege('authenticated', 'public.pin_photos_to_delete()', 'execute')` is false.

- [ ] **Step 2: Run it against the live database, rolled back, to see it fail**
Run: MCP `execute_sql` with `begin;` + the block + `rollback;`
Expected: FAIL at PT1 (`snow` accepted: no constraint yet) or on the missing bucket or function.

- [ ] **Step 3: Write and apply the migration** (MCP `apply_migration`, name `pin_types_and_photos`)
  - `alter table public.community_pins add constraint community_pins_status_tag_check check (status_tag = any (array['flooded','rising','receding','impassable','road_blocked','landslide','power_line_down','other']));`
  - `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('pin-photos', 'pin-photos', false, 512000, array['image/jpeg','image/webp']) on conflict (id) do nothing;`
  - The two policies and two functions from Interfaces. Revoke `all` on both functions from `public, anon`; grant `attach_pin_photo` to `authenticated`; revoke `pin_photos_to_delete` from `authenticated` and grant it to `service_role`.
  - Save the exact SQL under its live version.

- [ ] **Step 4: Run the block again, rolled back.** Expected: completes (end the query with `select 'PT1-PT6 completed';`). Then confirm nothing is left behind: 0 fixture users, zones, pins and objects.

- [ ] **Step 5: Add the two functions to `database.types.ts`,** as `generate_typescript_types` prints them. `attach_pin_photo`: `Args: { p_path: string; p_pin_id: string }`, `Returns: undefined`. `pin_photos_to_delete`: `Args: never`, `Returns: { path: string }[]`. Run `npm run typecheck` and expect it to pass.

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/*_pin_types_and_photos.sql supabase/tests/rls.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): pin types, and a private store for pin photos only officials can read"
```

---

### Task 2: Pin types in the app

**Files:**
- Modify:
  - `src/lib/community-pin.ts`;
  - `src/features/map/marker-icons.ts`;
  - `src/features/homepage-map/community-pin-form.tsx`;
  - `src/features/map/marker-legend.tsx`;
  - `src/app/actions/pins.ts`.
- Test: their tests, and `src/features/resident/resident-pins-list.test.tsx`.

**Interfaces:**
- Produces, in `community-pin.ts`:
  - `PinStatusTag` gains `"road_blocked" | "landslide" | "power_line_down" | "other"`.
  - `FLOOD_STATUS_TAGS: PinStatusTag[]` = the four flood values.
  - `PIN_KIND_ORDER: PinKind[]` = `["flood", "road_blocked", "landslide", "power_line_down", "other"]`, where `type PinKind = "flood" | "road_blocked" | "landslide" | "power_line_down" | "other"`.
  - `pinKindOf(tag: PinStatusTag): PinKind`.
  - `PIN_KIND_LABEL: Record<PinKind, LocalizedText>`: Flood / Baha; Road blocked / Sarado ang daan; Landslide / Pagguho ng lupa; Power line down / Bumagsak na kawad ng kuryente; Other / Iba pa.
  - `PIN_STATUS_ORDER` becomes all 8 tags.
  - `PIN_STATUS_LABEL` gains the 4 new tags, using the same text as their kind labels.
  - `PIN_STATUS_COLOR` gains `road_blocked` `#7c2d12`, `landslide` `#854d0e`, `power_line_down` `#7e22ce` and `other` `#475569`.
- Produces, in `marker-icons.ts`: `createCommunityPinMarkerIcon(statusTag, label)` draws a glyph per kind (water drop for flood, as today; a barrier for road blocked; a mountain for landslide; a lightning bolt for power line down; an info mark for other), still dashed.

- [ ] **Step 1: Write the failing tests**
  - `community-pin.test.ts`:
    - "sorts every tag into its kind": `pinKindOf("rising")` is `"flood"`, `pinKindOf("road_blocked")` is `"road_blocked"`.
    - "labels every tag in both languages": each tag in `PIN_STATUS_ORDER` has non-empty `en` and `fil` text and a colour.
  - `community-pin-form.test.tsx`:
    - "asks what's happening before the water status": the radio group "What's happening?" / "Ano ang nangyayari?" lists the five kinds.
    - "asks the water status only for a flood": picking Road blocked hides the flood status choice and submits `statusTag: "road_blocked"`. Picking Flood then Receding submits `"receding"`.
  - `marker-icons.test.ts`:
    - "draws a different glyph for each kind": the HTML differs between `flooded` and `road_blocked`, and both keep the dashed border.
  - `marker-legend.test.tsx`:
    - "lists every pin type": each kind's label appears once the legend is expanded.
  - `resident-pins-list.test.tsx`:
    - "names a pin's type": a `landslide` pin shows "Landslide".
  - `src/app/actions/pins.test.ts`:
    - "accepts the new types and refuses an unknown one": `createPin` with `road_blocked` calls insert; with `"snow"` it returns a permanent failure.

- [ ] **Step 2: Run them to see them fail**
Run: `npx vitest run src/lib/community-pin.test.ts src/features/homepage-map/community-pin-form.test.tsx src/features/map src/features/resident src/app/actions/pins.test.ts`
Expected: FAIL (the new tags, `pinKindOf` and the kind choice are missing).

- [ ] **Step 3: Implement.**
  - The form keeps its current fields.
  - It adds a "What's happening?" radio group before them. The flood status select shows only for Flood, and each other kind submits its own tag.
  - When editing, the initial kind is `pinKindOf(initialValues.statusTag)`.

- [ ] **Step 4: Run them to see them pass** (same command). Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/community-pin.ts src/lib/community-pin.test.ts src/features/map src/features/homepage-map/community-pin-form.tsx src/features/homepage-map/community-pin-form.test.tsx src/features/resident src/app/actions/pins.ts src/app/actions/pins.test.ts
git commit -m "feat: community pins say what is happening: flood, road blocked, landslide, power line down, other"
```

---

### Task 3: Adding a photo

**Files:**
- Create: `src/lib/pin-photo.ts` (+ `.test.ts`)
- Modify:
  - `src/features/homepage-map/community-pin-form.tsx` (+ test);
  - `src/features/homepage-map/use-pin-flow.ts`;
  - `src/lib/community-pins.ts`;
  - `src/app/actions/pins.ts` (+ test).

**Interfaces:**
- Consumes: `attach_pin_photo` (Task 1).
- Produces, in `pin-photo.ts`:
  - `fitWithin(width: number, height: number, max = 1280): { width: number; height: number }`.
  - `shrinkPhoto(file: Blob): Promise<Blob>`:
    - Decodes with `createImageBitmap`, draws on a canvas at `fitWithin`, and encodes JPEG, trying quality 0.8, 0.6 and 0.4 in turn.
    - Rejects with `Error("photo-unreadable")` when the image can't be decoded.
    - Rejects with `Error("photo-too-large")` when it is still over 500 KB at 0.4.
  - `uploadPinPhoto(photo: Blob): Promise<string | null>`:
    - Gets the account id from `ensureAnonymousSession()`.
    - Uploads to `pin-photos` at `<id>/<crypto.randomUUID()>.jpg` with `{ contentType: "image/jpeg", upsert: false }`.
    - Returns the path, or `null` on any failure.
  - `PIN_PHOTO_NOTICE_KEY = "weatherwell.pinPhotoNoticeSeen"`.
- Produces, in `CreatePinInput` and the `createPin` payload: `photoPath?: string`. After a confirmed insert (or a duplicate id), `createPin` calls `rpc("attach_pin_photo", { p_pin_id: input.id, p_path: input.photoPath })` when a path is set.
  - A failed attach leaves the result `{ ok: true }`: the pin is saved without its photo.
  - Ruling: the form can say so only for failures it sees before queuing (shrinking or uploading). An attach runs later from the outbox, where no form is open.

The form's photo copy (English / Filipino):
- `Add photo (only officials see it)` / `Magdagdag ng larawan (mga opisyal lang ang makakakita)`
- `Remove photo` / `Alisin ang larawan`
- `Photos need a connection — the pin will be sent without it.` / `Kailangan ng koneksyon para sa larawan — ipapadala ang pin nang wala nito.`
- `This photo couldn't be used — send the pin without it, or try another.` / `Hindi magamit ang larawang ito — ipadala ang pin nang wala nito, o sumubok ng iba.` (for both `photo-unreadable` and `photo-too-large`)
- `The photo couldn't be sent — the pin was sent without it.` / `Hindi naipadala ang larawan — ipinadala ang pin nang wala nito.`
- The notice text from Global Constraints, with `OK`.

- [ ] **Step 1: Write the failing tests**
  - `pin-photo.test.ts`:
    - "fits a photo within 1280 pixels, keeping its shape": `fitWithin(4000, 3000)` is `{ width: 1280, height: 960 }`; `fitWithin(800, 600)` is unchanged.
    - "lowers the quality until the photo is at most 500 KB, and gives up past that": stub `createImageBitmap` and the canvas's `toBlob` to return 900 KB at 0.8, 600 KB at 0.6 and 300 KB at 0.4. The result is the 300 KB blob. With 700 KB at every quality, it rejects `photo-too-large`.
    - "says a photo it can't decode is unreadable": `createImageBitmap` rejects, so the call rejects `photo-unreadable`.
    - "uploads into the resident's own folder": with a mocked browser client and `ensureAnonymousSession` giving `"u1"`, `upload` is called with a path matching `/^u1\/[0-9a-f-]{36}\.jpg$/` and `{ contentType: "image/jpeg", upsert: false }`.
  - `community-pin-form.test.tsx`:
    - "shows the notice the first time a photo is added, then not again".
    - "sends the pin with the uploaded photo's path": the mocked `uploadPinPhoto` returns `"u1/x.jpg"`, and the submitted values carry `photoPath: "u1/x.jpg"`.
    - "offline, sends the pin without the photo and says so": `navigator.onLine` is false, upload isn't called, the message shows and the pin submits without `photoPath`.
    - "keeps the pin when the photo can't be used, and says so": `shrinkPhoto` rejects `photo-unreadable`.
    - "uploads the shrunk photo, never the original": `uploadPinPhoto` is called with the Blob `shrinkPhoto` returned.
    - "lets the photo be removed before sending": after Remove photo, Send uploads nothing.
    - "uploads once when Send is pressed twice".
  - `pins.test.ts`:
    - "attaches the photo after the pin is saved": `rpc` is called with `attach_pin_photo` and the ids.
    - "keeps the pin when the attach fails": `rpc` returns an error, and the result is still `{ ok: true }`.

- [ ] **Step 2: Run them to see them fail**
Run: `npx vitest run src/lib/pin-photo.test.ts src/features/homepage-map/community-pin-form.test.tsx src/app/actions/pins.test.ts`
Expected: FAIL (module not found; no photo field).

- [ ] **Step 3: Implement.** The form owns the photo:
  - It shrinks the photo on pick and keeps the Blob.
  - On Send it uploads first when online, then submits the values with `photoPath`.
  - It disables Send while uploading.

  `usePinFlow`/`addCommunityPin` pass `photoPath` through into the `createPin` payload unchanged.

- [ ] **Step 4: Run them to see them pass** (same command). Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/pin-photo.ts src/lib/pin-photo.test.ts src/features/homepage-map/community-pin-form.tsx src/features/homepage-map/community-pin-form.test.tsx src/features/homepage-map/use-pin-flow.ts src/lib/community-pins.ts src/app/actions/pins.ts src/app/actions/pins.test.ts
git commit -m "feat: residents add a photo to a pin, shrunk on the phone, for officials only"
```

---

### Task 4: Officials see the photo

**Files:**
- Create: `src/features/admin/pin-photo-thumb.tsx` (+ `.test.tsx`)
- Modify:
  - `src/app/api/pins/route.ts` (+ test);
  - `src/lib/pins-mapper.ts`;
  - `src/lib/community-pins.ts` (the `CommunityPin` type);
  - `src/features/admin/community-pin-moderation-panel.tsx`;
  - `src/features/admin/admin-map-canvas.tsx`;
  - `src/features/homepage-map/photo-lightbox.tsx`.

**Interfaces:**
- Produces:
  - `CommunityPin.photoPath?: string`, which the feed selects as `photo_path` and the mapper passes on.
  - `PinPhotoThumb({ pin }: { pin: CommunityPin })`:
    - Renders nothing without `photoPath`.
    - Otherwise signs a link with `getBrowserClient().storage.from("pin-photos").createSignedUrl(path, 3600)`, shows a thumbnail button "View photo" / "Tingnan ang larawan", and opens `PhotoLightbox`.
  - `PhotoLightbox` gains an optional `note?: LocalizedText`, which defaults to its current note. Officials pass "Unverified photo sent by a resident. Deleted after 7 days." / "Hindi pa beripikadong larawan mula sa residente. Buburahin pagkalipas ng 7 araw."

- [ ] **Step 1: Write the failing tests**
  - `api/pins/route.test.ts`:
    - "carries a pin's photo path": the select includes `photo_path`, and the mapped pin has `photoPath`.
  - `pin-photo-thumb.test.tsx`:
    - "shows nothing for a pin without a photo".
    - "signs a one-hour link and opens the photo": `createSignedUrl` is called with `("u1/x.jpg", 3600)`, the thumbnail `img` has the signed URL, and clicking "View photo" opens the dialog with the official note.
    - "says the photo can't be shown when signing fails": the signing call errors, and the text "Photo unavailable" / "Hindi makita ang larawan" shows.
  - `community-pin-moderation-panel.test.tsx`:
    - "shows a pin's photo to officials": a pin with `photoPath` renders a "View photo" button.

- [ ] **Step 2: Run them to see them fail**
Run: `npx vitest run src/app/api/pins src/features/admin/pin-photo-thumb.test.tsx src/features/admin/community-pin-moderation-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement,** and put `PinPhotoThumb` in the moderation panel's pin row and in the Operations map's pin popup. The resident map shows no photo.

- [ ] **Step 4: Run them to see them pass** (same command). Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/app/api/pins src/lib/pins-mapper.ts src/lib/community-pins.ts src/features/admin/pin-photo-thumb.tsx src/features/admin/pin-photo-thumb.test.tsx src/features/admin/community-pin-moderation-panel.tsx src/features/admin/community-pin-moderation-panel.test.tsx src/features/admin/admin-map-canvas.tsx src/features/homepage-map/photo-lightbox.tsx
git commit -m "feat: officials see a pin's photo through a one-hour link"
```

---

### Task 5: The daily cleanup

**Files:**
- Create: `src/app/api/cleanup-pin-photos/route.ts` (+ `route.test.ts`)
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `pin_photos_to_delete` (Task 1), `isAuthorizedCronRequest` (`src/lib/cron-auth.ts`).
- Produces: `GET /api/cleanup-pin-photos`. The steps:
  1. Answer 401 without the cron secret.
  2. Create the service-role client, as `cleanup-weather` does.
  3. Call `rpc("pin_photos_to_delete")`.
  4. Call `storage.from("pin-photos").remove(paths)` in batches of 100.
  5. Run `.from("community_pins").update({ photo_path: null }).in("photo_path", paths)`.
  6. Answer `{ deleted: <count> }`, or 502 on an error.
- `vercel.json` gets `{ "path": "/api/cleanup-pin-photos", "schedule": "0 3 * * *" }`.

- [ ] **Step 1: Write the failing tests** (`route.test.ts`, mocking `server-only` and `@supabase/supabase-js` as `src/app/api/cleanup-weather/route.test.ts` does)
  - "refuses without the cron secret" gives 401, and `rpc` isn't called.
  - "deletes the listed photos and clears them from their pins": `rpc` returns 2 paths, `remove` is called with both, `update` is called with `{ photo_path: null }` filtered by those paths, and the body is `{ deleted: 2 }`.
  - "does nothing when nothing is due": an empty list means `remove` isn't called and the body is `{ deleted: 0 }`.
  - "is a 502 when the list can't be read".

- [ ] **Step 2: Run to see them fail.** Run: `npx vitest run src/app/api/cleanup-pin-photos`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add src/app/api/cleanup-pin-photos vercel.json
git commit -m "feat: a daily job deletes pin photos after 7 days, when their pin is removed, or when never attached"
```

---

### Task 6: Service worker and docs

**Files:**
- Modify: `public/sw.js`, `PRD.md`, `README.md`

- [ ] **Step 1: Bump the service worker** to `VERSION = "v22"`. Run `npx vitest run src/lib/service-worker.test.ts` and expect it to pass.

- [ ] **Step 2: Update the PRD.**
  - In the Privacy section, replace "Community pin photos are not supported…" with the rule as built:
    - one photo per pin, shrunk on the phone;
    - officials only, through one-hour links;
    - deleted after 7 days, when the pin is removed, or after an hour if never attached;
    - a one-time notice at the moment of adding one.
  - Build Status "Community pins": the five types, and photos for officials.
  - Note the new daily cron.

- [ ] **Step 3: Update the README** where it lists cron routes or the pin feature.

- [ ] **Step 4: Check the whole suite and the build**
Run: `npm test && npm run typecheck && npm run lint && npm run knip && npm run build`
Expected: all pass; lint shows only the two existing warnings in `src/app/api/historical-events/route.test.ts`.

- [ ] **Step 5: Commit**
```bash
git add public/sw.js PRD.md README.md
git commit -m "docs: pin types and officials-only pin photos"
```
