# Barangay Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Officials fill in their barangay's hotlines (up to 3), evacuation instructions (English/Filipino) and evacuation centre (picked or placed on a map), residents see and can call them offline, and barangay officials reach Drill and the Operations map from their menu.

**Architecture:** A `security definer` database function writes the details into the barangay's own `zones` row and the action record. A public, CDN-cached feed lists only edited barangays; phones lay it over the static reference file, the way `/api/centres` already works, and the service worker keeps it for offline use. The officials' barangay page gets a form, and the centre card gets a map to place the centre through the existing `confirm_evacuation_center`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui, react-leaflet, Supabase (Postgres, RLS, `security definer` functions), Vitest + Testing Library, `public/sw.js`.

**Spec:** `docs/superpowers/specs/2026-09-28-barangay-details-design.md`

## Global Constraints

- Zero cost; no new accounts or services. Only the existing Supabase, Vercel and GitHub.
- Migrations hit the live database: apply with the Supabase MCP `apply_migration`, read the version from `supabase_migrations.schema_migrations`, save the same SQL as `supabase/migrations/<version>_barangay_details.sql`. Additive only: the production app must keep working against the new schema.
- Live database writes only inside a transaction that is rolled back.
- Who may save: exactly `private.manages_zone(zone)` (barangay official for their barangay, town official for the town's, admin anywhere).
- Numbers: 0–3 after trimming and dropping blanks; the first is the main number. Each is 3–20 characters of digits, spaces and `+ - ( )`, with at least 3 digits, and not all zeros. None stores the placeholder `00000000000`.
- Instructions: at least one language written; each at most 1,000 characters after trimming; a blank language gets the other's text.
- Every user-facing string is a `LocalizedText` rendered with `t(text, lang)`, with `lang={lang}` on the element.
- Every `tel:` link dials only digits and a leading `+` (`telHref`).
- One service worker version bump for this plan: `VERSION = "v21"`.
- Next.js 16: read the relevant guide in `node_modules/next/dist/docs/` before using a Next API (`next/dynamic` in Task 6).
- Keep each file's existing line endings.
- Commits are authored by Wilson <wilsondayritjrapex@gmail.com>, with no Co-Authored-By or other attribution lines.

## Review Focus

1. A number pasted with surrounding spaces or a newline, or written `+63 917 123 4567`, is accepted and dials correctly (Task 2).
2. Instructions written on several lines keep their lines on the evacuation page, the emergency card and the printable plan (Task 4).
3. A centre placed more than 5 km away is refused with a message in the official's language, and nothing is saved (Task 2's translation, Task 6's test).
4. When the feed is unreachable or answers with an error, phones keep showing the offline copy and nothing breaks (Task 3).
5. Tapping Save twice sends one request (Task 5).

---

### Task 1: Database — the details columns, the save function and the action name

**Files:**
- Create: `supabase/migrations/<version>_barangay_details.sql`
- Modify: `supabase/tests/rls.sql` (new block just before the final `rollback;`)
- Modify: `src/lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Produces: `zones.extra_hotlines text[] not null default '{}'` (constraint `zones_extra_hotlines_max_2`: `cardinality(extra_hotlines) <= 2`); `zones.details_set_at timestamptz` (index `zones_details_set_at_idx` where not null).
- Produces: `public.set_barangay_details(p_zone_id text, p_hotlines text[], p_instructions_en text, p_instructions_fil text) returns jsonb`, returning `{"id", "hotline_number", "extra_hotlines", "evacuation_route_text"}` exactly as saved.
- Produces these error messages, which Task 2 translates: `not an official for this barangay` (42501); `at most 3 hotline numbers`, `a hotline number uses 3 to 20 digits, spaces and + - ( )`, `a hotline number cannot be all zeros`, `write the instructions in English or Filipino`, `instructions must be 1,000 characters or fewer` (all 22023).
- Produces: action `barangay.details` with detail `{"hotlines": [...saved numbers], "wrote": ["en"] | ["fil"] | ["en","fil"]}`.

- [ ] **Step 1: Write the failing database test** (append before the final `rollback;` of `supabase/tests/rls.sql`, in the style of the C1–C4 block)

```sql
-- B1-B6: officials fill in their barangay's hotlines and instructions.
do $$
declare z record; n int; saved jsonb; u text; bad record;
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id) values
    ('e5000000-0000-4000-8000-000000000001'), ('e5000000-0000-4000-8000-000000000002'),
    ('e5000000-0000-4000-8000-000000000003'), ('e5000000-0000-4000-8000-000000000004'),
    ('e5000000-0000-4000-8000-000000000005');
  insert into public.zones
    (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
  values ('tests-fixture-zone-details', '9900000061', 'Test Zone Details', '{"en":"x","fil":"x"}'::jsonb,
          16.0288, 120.4366, '[]'::jsonb, '00000000000');
  insert into public.profiles (id, role, area_code, display_name) values
    ('e5000000-0000-4000-8000-000000000001', 'operator', '9900000061', 'Test Kagawad'),
    ('e5000000-0000-4000-8000-000000000003', 'operator', '9900000062', 'Test Other Kagawad'),
    ('e5000000-0000-4000-8000-000000000004', 'operator', '9900000', 'Test MDRRMO'),
    ('e5000000-0000-4000-8000-000000000005', 'admin', null, 'Test Admin')
  on conflict (id) do update set role = excluded.role, area_code = excluded.area_code, display_name = excluded.display_name;

  -- B1: a resident, and an official for another barangay, are refused.
  set local role authenticated;
  foreach u in array array['e5000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-000000000003'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    begin
      perform public.set_barangay_details('tests-fixture-zone-details', array['0917 123 4567'], 'Go', '');
      raise exception using errcode = 'TSTFL', message = format('B1: %s saved another barangay''s details', u);
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- B2: the barangay's own official saves; trimmed, blanks dropped, English copied to Filipino, logged, returned.
  perform set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  saved := public.set_barangay_details('tests-fixture-zone-details',
    array['  0917 123 4567 ', '', '(075) 522-1234'], '  Go to Nilombot Elementary School. ', '');
  reset role;
  select hotline_number, extra_hotlines, evacuation_route_text, details_set_at into z
    from public.zones where id = 'tests-fixture-zone-details';
  if z.hotline_number <> '0917 123 4567' or z.extra_hotlines <> array['(075) 522-1234']
     or z.evacuation_route_text <> '{"en":"Go to Nilombot Elementary School.","fil":"Go to Nilombot Elementary School."}'::jsonb
     or z.details_set_at is null then
    raise exception using errcode = 'TSTFL', message = format('B2: not saved as expected: %s', z);
  end if;
  if saved <> jsonb_build_object('id', 'tests-fixture-zone-details', 'hotline_number', '0917 123 4567',
       'extra_hotlines', jsonb_build_array('(075) 522-1234'), 'evacuation_route_text', z.evacuation_route_text) then
    raise exception using errcode = 'TSTFL', message = format('B2: returned %s', saved);
  end if;
  select count(*) into n from public.official_actions
   where zone_id = 'tests-fixture-zone-details' and action = 'barangay.details' and actor_name = 'Test Kagawad'
     and detail = '{"hotlines":["0917 123 4567","(075) 522-1234"],"wrote":["en"]}'::jsonb;
  if n <> 1 then raise exception using errcode = 'TSTFL', message = format('B2: logged %s times', n); end if;

  -- B3: the town's official saves (Filipino copied to English), and so does the admin.
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  perform public.set_barangay_details('tests-fixture-zone-details', array['0918 000 1111'], '', 'Pumunta sa paaralan.');
  reset role;
  select evacuation_route_text into z from public.zones where id = 'tests-fixture-zone-details';
  if z.evacuation_route_text <> '{"en":"Pumunta sa paaralan.","fil":"Pumunta sa paaralan."}'::jsonb then
    raise exception using errcode = 'TSTFL', message = format('B3: Filipino not copied: %s', z);
  end if;

  -- B4: no numbers stores the placeholder, so residents see the 911 fallback.
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  perform public.set_barangay_details('tests-fixture-zone-details', array[]::text[], 'Go to the school.', 'Pumunta sa paaralan.');
  reset role;
  select hotline_number, extra_hotlines into z from public.zones where id = 'tests-fixture-zone-details';
  if z.hotline_number <> '00000000000' or cardinality(z.extra_hotlines) <> 0 then
    raise exception using errcode = 'TSTFL', message = format('B4: no numbers stored %s', z);
  end if;

  -- B5: bad input is refused: four numbers, letters, two digits, all zeros, blank and over-long instructions.
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  for bad in select * from (values
      (array['0917 123 4567', '0918 123 4567', '0919 123 4567', '0920 123 4567'], 'Go', ''),
      (array['abc'], 'Go', ''), (array['1-2'], 'Go', ''), (array['000 000'], 'Go', ''),
      (array['0917 123 4567'], '', '   '), (array['0917 123 4567'], repeat('x', 1001), '')
    ) t(numbers, en, fil) loop
    begin
      perform public.set_barangay_details('tests-fixture-zone-details', bad.numbers, bad.en, bad.fil);
      raise exception using errcode = 'TSTFL', message = format('B5: accepted %s', bad);
    exception when invalid_parameter_value then null;
    end;
  end loop;
  reset role;

  -- B6: signed-in callers can call it (the function checks who); anon cannot.
  if has_function_privilege('anon', 'public.set_barangay_details(text,text[],text,text)', 'execute') then
    raise exception using errcode = 'TSTFL', message = 'B6: anon can save barangay details';
  end if;
  if not has_function_privilege('authenticated', 'public.set_barangay_details(text,text[],text,text)', 'execute') then
    raise exception using errcode = 'TSTFL', message = 'B6: officials cannot call it';
  end if;
  raise notice 'ok B1-B6: officials fill in their own barangay''s hotlines and instructions';
end $$;
```

- [ ] **Step 2: Run it against the live database, rolled back, to see it fail**

Run with the Supabase MCP `execute_sql`: `begin;` + the block from Step 1 + `rollback;`
Expected: FAIL with `function public.set_barangay_details(unknown, text[], unknown, unknown) does not exist` (or the missing column).

- [ ] **Step 3: Write and apply the migration** (MCP `apply_migration`, name `barangay_details`)

The DDL, exactly:

```sql
alter table public.zones
  add column extra_hotlines text[] not null default '{}',
  add column details_set_at timestamptz,
  add constraint zones_extra_hotlines_max_2 check (cardinality(extra_hotlines) <= 2);
create index zones_details_set_at_idx on public.zones (details_set_at) where details_set_at is not null;

alter table public.official_actions drop constraint official_actions_action_check;
alter table public.official_actions add constraint official_actions_action_check check (action = any (array[
  'alert.set', 'alert.cleared', 'centre.status', 'centre.occupancy', 'centre.confirmed', 'pin.removed',
  'pin.restored', 'official.appointed', 'official.removed', 'official.password_reset', 'engine.tuned',
  'barangay.details']));
```

The function: `language plpgsql security definer set search_path = ''`, in this order:
1. `v_numbers text[]` = each `p_hotlines` element trimmed, blanks dropped (null array = empty); `v_en`, `v_fil` = trimmed instructions (null = '').
2. `if not private.manages_zone(p_zone_id)` → 42501 `not an official for this barangay`.
3. More than 3 numbers → `at most 3 hotline numbers`. Each number: not `~ '^[0-9+() -]{3,20}$'` or fewer than 3 digits (`regexp_replace(n, '[^0-9]', '', 'g')`) → `a hotline number uses 3 to 20 digits, spaces and + - ( )`; digits all zeros → `a hotline number cannot be all zeros`.
4. Both blank → `write the instructions in English or Filipino`; either over 1,000 characters → `instructions must be 1,000 characters or fewer`.
5. Route = `{"en": coalesce(nullif(v_en, ''), v_fil), "fil": coalesce(nullif(v_fil, ''), v_en)}`.
6. Update the zone: `hotline_number = coalesce(v_numbers[1], '00000000000')`, `extra_hotlines = coalesce(v_numbers[2:3], '{}')`, the route, `details_set_at = now()`.
7. `perform private.record_official_action('barangay.details', p_zone_id, p_zone_id, jsonb_build_object('hotlines', to_jsonb(v_numbers), 'wrote', <'en' and/or 'fil', for the languages written>))`.
8. Return the saved `id`, `hotline_number`, `extra_hotlines` (as a JSON array) and `evacuation_route_text`.

Then `revoke all on function public.set_barangay_details(text, text[], text, text) from public, anon;` and `grant execute ... to authenticated;`.

Read the version: `select version from supabase_migrations.schema_migrations where name = 'barangay_details';` and save the exact SQL as `supabase/migrations/<version>_barangay_details.sql`.

- [ ] **Step 4: Run the block again, rolled back**

Run: MCP `execute_sql` with `begin;` + the block + `rollback;`
Expected: completes with notice `ok B1-B6: officials fill in their own barangay's hotlines and instructions`.

- [ ] **Step 5: Regenerate the database types**

Run the Supabase MCP `generate_typescript_types`, and replace everything below the header comment of `src/lib/supabase/database.types.ts`. Then `npm run typecheck`.
Expected: `zones` rows have `extra_hotlines: string[]` and `details_set_at: string | null`; `Functions` has `set_barangay_details`; typecheck passes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_barangay_details.sql supabase/tests/rls.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): officials save their barangay's hotlines and instructions"
```

---

### Task 2: The rules and wording

**Files:**
- Create: `src/lib/barangay-details.ts`, `src/lib/barangay-details.test.ts`
- Modify: `src/lib/types.ts` (`Zone`), `src/lib/zone-data-quality.ts` (+ `.test.ts`), `src/lib/official-actions-copy.ts` (+ `.test.ts`), `src/lib/friendly-error.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: Task 1's error messages.
- Produces: `Zone.extraHotlines?: string[]` (more numbers after `hotlineNumber`; absent means none).
- Produces, in `src/lib/barangay-details.ts`: `MAX_HOTLINES = 3`; `MAX_INSTRUCTIONS = 1000`; `hotlineProblem(number: string): LocalizedText | null` (trims first; null means fine); `instructionsProblem(instructions: { en: string; fil: string }): LocalizedText | null`; `telHref(number: string): string`; and the exported `LocalizedText` messages below, which `friendlyError` reuses so each message exists once.
- Produces, in `src/lib/zone-data-quality.ts`: `hotlinesOf(zone: Pick<Zone, "hotlineNumber" | "extraHotlines">): string[]` — `[]` when `hasRealHotline` is false, else the main number then the extras.

The messages (English / Filipino), each matched in `friendlyError` by its database message:

| Database message | English | Filipino |
|---|---|---|
| `not an official for this barangay` | You don't manage this barangay. | Hindi mo pinamamahalaan ang barangay na ito. |
| `at most 3 hotline numbers` | Enter at most 3 hotline numbers. | Hanggang 3 hotline number lang. |
| `a hotline number uses 3 to 20 digits, spaces and + - ( )` | A hotline number uses 3 to 20 digits, spaces and + - ( ). | Ang hotline number ay 3 hanggang 20 digit, espasyo at + - ( ). |
| `a hotline number cannot be all zeros` | A hotline number can't be all zeros. | Hindi puwedeng puro zero ang hotline number. |
| `write the instructions in English or Filipino` | Write the instructions in English or Filipino. | Isulat ang mga tagubilin sa English o Filipino. |
| `instructions must be 1,000 characters or fewer` | Keep the instructions to 1,000 characters. | Hanggang 1,000 titik lang ang mga tagubilin. |
| `centre must be within 5 km of the barangay` (existing) | The centre must be within 5 km of the barangay. | Dapat nasa loob ng 5 km mula sa barangay ang center. |

- [ ] **Step 1: Write the failing tests**

```ts
// barangay-details.test.ts
it("dials only the digits and a leading plus", () => {
  expect(telHref("(075) 522-1234")).toBe("tel:0755221234");
  expect(telHref("+63 917 123 4567")).toBe("tel:+639171234567");
});
it("accepts a pasted number with spaces or a newline around it, and the +63 form", () => {
  expect(hotlineProblem(" 0917 123 4567\n")).toBeNull();
  expect(hotlineProblem("+63 917 123 4567")).toBeNull();
});
it("refuses letters, fewer than 3 digits, all zeros and over 20 characters", () => {
  for (const bad of ["abc", "1-2", "000 000", "1".repeat(21)]) expect(hotlineProblem(bad)).not.toBeNull();
});
it("needs instructions in one language, at most 1,000 characters", () => {
  expect(instructionsProblem({ en: "Go to the school.", fil: "" })).toBeNull();
  expect(instructionsProblem({ en: "", fil: "  " })).not.toBeNull();
  expect(instructionsProblem({ en: "x".repeat(1001), fil: "" })).not.toBeNull();
});

// zone-data-quality.test.ts
it("lists a barangay's real numbers, main first, and none for the placeholder", () => {
  expect(hotlinesOf({ hotlineNumber: "00000000000" })).toEqual([]);
  expect(hotlinesOf({ hotlineNumber: "0917 123 4567", extraHotlines: ["(075) 522-1234"] }))
    .toEqual(["0917 123 4567", "(075) 522-1234"]);
});

// official-actions-copy.test.ts (action shaped like the file's other cases)
it("describes an official's barangay details", () => {
  const three = { hotlines: ["0917 123 4567", "0918 765 4321", "(075) 522-1234"], wrote: ["en"] };
  expect(describeAction(action("barangay.details", three), "en")).toBe("Barangay details updated: hotline 0917 123 4567 (+2 more)");
  expect(describeAction(action("barangay.details", three), "fil")).toBe("Na-update ang detalye ng barangay: hotline 0917 123 4567 (+2 pa)");
  expect(describeAction(action("barangay.details", { hotlines: [], wrote: ["fil"] }), "en")).toBe("Barangay details updated: no hotline");
  expect(describeAction(action("barangay.details", { hotlines: [], wrote: ["fil"] }), "fil")).toBe("Na-update ang detalye ng barangay: walang hotline");
});

// friendly-error.test.ts
it("translates the barangay-details and centre refusals", () => {
  expect(friendlyError("at most 3 hotline numbers", "fil")).toBe("Hanggang 3 hotline number lang.");
  expect(friendlyError("centre must be within 5 km of the barangay", "fil")).toBe("Dapat nasa loob ng 5 km mula sa barangay ang center.");
  expect(friendlyError("not an official for this barangay", "en")).toBe("You don't manage this barangay.");
});
```

(With one line per description, "+1 more" / "+1 pa" follows the same pattern.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/barangay-details.test.ts src/lib/zone-data-quality.test.ts src/lib/official-actions-copy.test.ts src/lib/friendly-error.test.ts`
Expected: FAIL (module not found; `hotlinesOf` not exported; the generic "Action recorded: barangay.details"; untranslated messages).

- [ ] **Step 3: Implement** the Interfaces above. `describeAction` gains a `barangay.details` case; `friendlyError`'s `KNOWN` gains one entry per table row.

- [ ] **Step 4: Run them to see them pass** (same command). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/barangay-details.ts src/lib/barangay-details.test.ts src/lib/types.ts src/lib/zone-data-quality.ts src/lib/zone-data-quality.test.ts src/lib/official-actions-copy.ts src/lib/official-actions-copy.test.ts src/lib/friendly-error.ts src/lib/friendly-error.test.ts
git commit -m "feat: the rules and wording for a barangay's hotlines and instructions"
```

---

### Task 3: The feed, the overlay, the save and offline

**Files:**
- Create: `src/app/api/barangay-details/route.ts` (+ `route.test.ts`), `src/app/actions/set-barangay-details.ts` (+ `.test.ts`)
- Modify: `src/lib/reference-data/types.ts` (+ `types.test.ts`), `src/lib/reference-data/provider.tsx` (+ `provider.test.tsx`), `src/lib/reference-data/use-reference-data.ts`, `src/test-utils/render-with-data.tsx`, `public/sw.js`, `src/lib/service-worker.test.ts`

**Interfaces:**
- Consumes: Task 1's function and columns; Task 2's `Zone.extraHotlines`.
- Produces, in `types.ts`: `interface DetailsOverlayRow { id: string; hotline_number: string; extra_hotlines: string[]; evacuation_route_text: Zone["evacuationRouteText"] }` and `applyDetailsOverlay(zones: Zone[], rows: DetailsOverlayRow[]): Zone[]` (sets `hotlineNumber`, `evacuationRouteText`, and `extraHotlines` — omitted when empty; unlisted zones stay the same object).
- Produces, in `set-barangay-details.ts` (`"use server"`, shaped like `confirm-evacuation-center.ts`): `interface SetBarangayDetailsInput { zoneId: string; hotlines: string[]; instructions: { en: string; fil: string } }`, `type SetBarangayDetailsResult = { ok: true; saved: DetailsOverlayRow } | Extract<ActionResult, { ok: false }>`, `setBarangayDetails(input): Promise<SetBarangayDetailsResult>`. It calls `rpc("set_barangay_details", { p_zone_id, p_hotlines, p_instructions_en, p_instructions_fil })`; without a session it returns `{ ok: false, permanent: true, error: "No session — sign in and try again." }`; a database error returns `{ ok: false, permanent: true, error: error.message }`.
- Produces, in `provider.tsx`: `SetBarangayDetailsContext = createContext<((row: DetailsOverlayRow) => void) | null>(null)`, whose value applies `applyDetailsOverlay(zones, [row])` to the provider's state. The provider fetches `/api/barangay-details` after the gate opens, next to `/api/centres` and the same way.
- Produces, in `use-reference-data.ts`: `useSetBarangayDetails(): (input: SetBarangayDetailsInput) => Promise<SetBarangayDetailsResult>` — dynamic-imports the action (as `useSetCenterStatus` does), applies `result.saved` on success, and throws without the context. `renderWithData` provides a no-op for the context.

- [ ] **Step 1: Write the failing tests**

- `route.test.ts` (mock `createSupabaseServerClient` as `src/app/api/centres/route.test.ts` does):
  - "lists only barangays an official has filled in": select `"id, hotline_number, extra_hotlines, evacuation_route_text"` with `not("details_set_at", "is", null)`, ordered by `id`; the JSON body equals the rows; `Cache-Control` is `public, s-maxage=30`.
  - "reads past 1,000 rows": pages answer 1,000 rows then 1 → the body has 1,001.
  - "is a 502, not an empty list, when the database fails".
- `types.test.ts`:
  - "lays an official's numbers and instructions over the static barangay" → `hotlineNumber` "0917 123 4567", `extraHotlines` ["(075) 522-1234"], `evacuationRouteText` from the row.
  - "leaves every other barangay as the same object, and an empty feed changes nothing" → `toBe` identity, and `applyDetailsOverlay(zones, [])` returns `zones`.
- `provider.test.tsx` (mirror the `/api/centres` overlay tests):
  - "lays officials' barangay details over the static file" → a child reading `useZones()` shows the row's hotline.
  - "keeps the static details when the feed fails": the feed answers `{ ok: false }`, and in a second case a JSON `{ error: "down" }` → the placeholder hotline still shows and no error card appears.
- `set-barangay-details.test.ts` (mock as `confirm-evacuation-center.test.ts` does):
  - "calls the database function and returns what it saved" → `rpc` called with `{ p_zone_id: "zone-1", p_hotlines: ["0917 123 4567"], p_instructions_en: "Go", p_instructions_fil: "" }`, result `{ ok: true, saved: row }`.
  - "refuses without a session" and "passes a database refusal through" → `{ ok: false, permanent: true, error: "at most 3 hotline numbers" }`.
- `service-worker.test.ts`:
  - "caches /api/barangay-details, so an offline resident keeps their barangay's hotline" (as the `/api/centres` test).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/app/api/barangay-details src/app/actions/set-barangay-details.test.ts src/lib/reference-data src/lib/service-worker.test.ts`
Expected: FAIL (missing modules and exports; the service worker does not cache the path).

- [ ] **Step 3: Implement** the Interfaces above. The route pages with `PAGE = 1000` as `src/app/api/alert-bars/route.ts` does. In `public/sw.js`, add `/api/barangay-details` to `PUBLIC_API_PATHS` (with a line in its comment: public, no per-user variation) and set `VERSION = "v21"`.

- [ ] **Step 4: Run them to see them pass** (same command). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/barangay-details src/app/actions/set-barangay-details.ts src/app/actions/set-barangay-details.test.ts src/lib/reference-data src/test-utils/render-with-data.tsx public/sw.js src/lib/service-worker.test.ts
git commit -m "feat: officials' barangay details reach every phone, offline too"
```

---

### Task 4: Residents see and can call every number

**Files:**
- Modify: `src/features/evacuation/evacuation-instructions.tsx`, `src/features/evacuation/emergency-card.tsx`, `src/features/evacuation/flood-plan.tsx`, `src/app/admin/zone/[zoneId]/page.tsx` — with their tests
- Modify (call links only): `src/components/emergency-hotline-button.tsx`, `src/features/homepage-map/flood-mode-actions.tsx`, `src/features/admin/evacuation-management-panel.tsx`, `src/app/a/shared-alert-view.tsx`

**Interfaces:**
- Consumes: `hotlinesOf`, `telHref` (Task 2).

- [ ] **Step 1: Write the failing tests**

- `evacuation-instructions.test.tsx`:
  - "gives a call button for each of the barangay's numbers" → with `hotlineNumber: "0917 123 4567"` and `extraHotlines: ["(075) 522-1234"]`, links named `/call 0917 123 4567/i` (`href` `tel:09171234567`) and `/call \(075\) 522-1234/i` (`href` `tel:0755221234`).
  - "keeps the official's line breaks" → the element showing the route text has class `whitespace-pre-line`.
- `emergency-card.test.tsx` and `flood-plan.test.tsx`:
  - "lists every hotline number" → both numbers shown.
  - "keeps the official's line breaks" → as above.
- `src/app/admin/zone/[zoneId]/page.test.tsx`:
  - "lists every hotline number as a call link".
- The existing test of `EmergencyHotlineButton`:
  - "dials the digits of a formatted number" → `(075) 522-1234` gives `href` `tel:0755221234`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/evacuation "src/app/admin/zone" src/components`
Expected: FAIL (one link only; no pre-line; raw `tel:` hrefs).

- [ ] **Step 3: Implement.**
  - Evacuation instructions: one link per `hotlinesOf(zone)` number, or the existing 911 link when none. The read-aloud text names every number.
  - The card, the plan and the barangay page list every number.
  - All six `tel:` links use `telHref`. The three single-number buttons keep the main number.
  - The route text gets `whitespace-pre-line` in all three resident views.

- [ ] **Step 4: Run them to see them pass** (same command). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/evacuation src/app/admin/zone src/components/emergency-hotline-button.tsx src/components/emergency-hotline-button.test.tsx src/features/homepage-map/flood-mode-actions.tsx src/features/admin/evacuation-management-panel.tsx src/app/a/shared-alert-view.tsx
git commit -m "feat: residents see and can call every hotline number their barangay lists"
```

---

### Task 5: The officials' details form

**Files:**
- Create: `src/features/admin/barangay-details-form.tsx` (+ `.test.tsx`)
- Modify: `src/app/admin/zone/[zoneId]/page.tsx` (+ `page.test.tsx`)

**Interfaces:**
- Consumes: `useSetBarangayDetails` (Task 3), `hotlineProblem`, `instructionsProblem`, `MAX_INSTRUCTIONS` (Task 2), `hotlinesOf`, `friendlyError`.
- Produces: `BarangayDetailsForm({ zone, onClose }: { zone: Zone; onClose: () => void })`.

The form, and its copy (English / Filipino):
- Three `type="tel"` inputs labelled `Hotline 1` / `Hotline 2` / `Hotline 3`, prefilled from `hotlinesOf(zone)`.
- Two textareas (`maxLength` 1000), prefilled from `zone.evacuationRouteText`:
  - `Evacuation instructions (English)` / `Mga tagubilin sa paglikas (English)`
  - `Evacuation instructions (Filipino)` / `Mga tagubilin sa paglikas (Filipino)`
- Hint: `Leave a language blank to show the other one in its place.` / `Iwanang blangko ang isang wika para ang isa ang ipakita.`
- Save: `Save` / `I-save`. It is disabled and loading while a save is running.
- Close: `Close` / `Isara`. It calls `onClose`.
- Saved (`role="status"`): `Saved — residents see it the next time their app opens.` / `Na-save — makikita ito ng mga residente sa susunod na buksan nila ang app.`
- A problem (`role="alert"`): the first `hotlineProblem` for a filled field, else `instructionsProblem`, else the action's `friendlyError`. A problem found on the phone sends nothing.
- It sends trimmed, non-blank numbers in order, and the two instruction texts as typed.

On the barangay page, the Evacuation centre card shows `Edit barangay details` / `I-edit ang detalye ng barangay` only when `canManage`; the button opens the form and `onClose` hides it.

- [ ] **Step 1: Write the failing tests** (mock `@/app/actions/set-barangay-details` as the page test mocks `set-center`)

- `barangay-details-form.test.tsx`:
  - "starts from what residents see now" → Hotline 1 holds the zone's number; the English box holds its instructions.
  - "saves trimmed numbers, dropping blank ones" → the fields are `" 0917 123 4567 "`, `""` and `"(075) 522-1234"`, English "Go to the school.", Filipino blank. The action is called with `{ zoneId, hotlines: ["0917 123 4567", "(075) 522-1234"], instructions: { en: "Go to the school.", fil: "" } }`, and the saved message shows.
  - "refuses a bad number in the official's language, without sending" → `lang: "fil"`, "abc" gives "Ang hotline number ay 3 hanggang 20 digit, espasyo at + - ( )." and no call.
  - "refuses blank instructions" → both boxes empty gives "Write the instructions in English or Filipino." and no call.
  - "sends once when Save is tapped twice" → two quick clicks while the action is pending give one call.
- `page.test.tsx`:
  - "shows Edit barangay details only to an official who manages the barangay" → reuse the file's area-scoping setup.
  - "shows the new numbers on the card as soon as the save is confirmed" → the R1 describe block's real `ReferenceDataProvider` setup; the mocked action returns `{ ok: true, saved: { id: zone.id, hotline_number: "0917 123 4567", extra_hotlines: [], evacuation_route_text: zone.evacuationRouteText } }`; after Save, the card has a link `tel:09171234567`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/admin/barangay-details-form.test.tsx "src/app/admin/zone"`
Expected: FAIL (module not found; no Edit button).

- [ ] **Step 3: Implement** the form and the button as described.

- [ ] **Step 4: Run them to see them pass** (same command). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/barangay-details-form.tsx src/features/admin/barangay-details-form.test.tsx src/app/admin/zone
git commit -m "feat: officials edit their barangay's hotlines and evacuation instructions"
```

---

### Task 6: Placing the centre on the map

**Files:**
- Create: `src/features/evacuation/place-centre-on-map.tsx` (+ `.test.tsx`)
- Modify: `src/features/evacuation/candidate-sites.tsx` (+ `candidate-sites.test.tsx`)

**Interfaces:**
- Consumes: `confirmEvacuationCenter` (existing), `MapShell`, `MapCentrePlacer` (existing), `friendlyError` (Task 2 added the 5 km translation).
- Produces: `PlaceCentreOnMap({ zone }: { zone: Zone })`.

Behaviour and copy:
- `MapShell` is centred on `[zone.evacuationCenterLat, zone.evacuationCenterLng]` (the barangay's point when the centre is a placeholder), with the aria label `Map for placing the evacuation centre` / `Mapa para ilagay ang evacuation center`.
- A tap (`useMapEvents` click, as `OfficialPinPlacer` in `admin-map-canvas.tsx`) or `MapCentrePlacer` (label `Place at the map's centre` / `Ilagay sa gitna ng mapa`) sets the point, which shows as a marker.
- Fields:
  - `Centre name` / `Pangalan ng center` (`maxLength` 120), prefilled when the centre is real.
  - The existing `Capacity (people)` copy.
- `Save centre` / `I-save ang center` is disabled until there is a point and a name. It calls `confirmEvacuationCenter({ zoneId, name, lat, lng, capacity: Number(capacity || 0) })`.
- Success shows the existing `SAVED` copy (`role="status"`); an error shows `friendlyError(error, lang)` (`role="alert"`).
- `ConfirmCentrePanel` no longer returns null without suggestions.
  - It lists suggestions when there are any.
  - It offers `Place it on the map` / `Ilagay sa mapa`, which shows `PlaceCentreOnMap` loaded with `next/dynamic` and `ssr: false`, as `homepage-map.tsx` loads `MapCanvas`.
  - Its hint becomes `Pick a nearby school or hall from OpenStreetMap, or place your centre on the map. Residents see it instead of the placeholder.` / `Pumili ng kalapit na paaralan o hall mula sa OpenStreetMap, o ilagay ang center sa mapa. Ito na ang makikita ng mga residente.`

- [ ] **Step 1: Write the failing tests** (mock `@/app/actions/confirm-evacuation-center`)

- `place-centre-on-map.test.tsx`:
  - "saves the spot placed at the map's centre, with a name and capacity" → click `Place at the map's centre`, type the name "Nilombot Covered Court" and capacity "250", click Save centre. The action is called with `{ zoneId: zone.id, name: "Nilombot Covered Court", lat: zone.evacuationCenterLat, lng: zone.evacuationCenterLng, capacity: 250 }`.
  - "keeps Save off until a spot and a name are set".
  - "tells the official in their language when the spot is over 5 km away" → the action returns `{ ok: false, permanent: true, error: "centre must be within 5 km of the barangay" }` with `lang: "fil"`, and "Dapat nasa loob ng 5 km mula sa barangay ang center." shows.
- `candidate-sites.test.tsx`:
  - "offers placing the centre on the map even with no suggestions" → the candidates fetch answers `[]`, and the `Place it on the map` button shows.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/evacuation/place-centre-on-map.test.tsx src/features/evacuation/candidate-sites.test.tsx`
Expected: FAIL (module not found; the panel renders nothing without suggestions).

- [ ] **Step 3: Implement** as described (read `node_modules/next/dist/docs/` on `next/dynamic` first).

- [ ] **Step 4: Run them to see them pass** (same command). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/evacuation/place-centre-on-map.tsx src/features/evacuation/place-centre-on-map.test.tsx src/features/evacuation/candidate-sites.tsx src/features/evacuation/candidate-sites.test.tsx
git commit -m "feat: officials place their evacuation centre on a map"
```

---

### Task 7: Menus

**Files:**
- Modify: `src/features/admin/admin-header.tsx`, `src/features/admin/admin-header.test.tsx`

**Interfaces:**
- Produces: a shared `DRILL: NavItem` (`/admin/simulation`, `Drill` / `Pagsasanay`, `PlayCircle`) used by all three menus.
  - Barangay menu: My barangay, Operations map, History, Drill, Resident view.
  - Town menu: its dashboard, Operations map, Barangay officials, History, Drill, Resident view.
  - Admin menu: unchanged.

- [ ] **Step 1: Update the two existing tests to the new menus (they fail)**
  - The town test becomes "gives a municipal official their town dashboard, the map, their barangay officials and the drill" → expects a `drill` link to `/admin/simulation`.
  - The barangay test becomes "gives a barangay official their barangay, the map, History and the drill" → expects `operations map` to `/admin/map` and `drill` to `/admin/simulation`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/features/admin/admin-header.test.tsx`
Expected: FAIL (no drill link for these roles; no map link for barangay officials).

- [ ] **Step 3: Implement** the menus above.

- [ ] **Step 4: Run to see them pass** (same command). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/admin-header.tsx src/features/admin/admin-header.test.tsx
git commit -m "feat: barangay officials reach the Operations map and Drill from their menu"
```

---

### Task 8: Docs

**Files:**
- Modify: `PRD.md`, `README.md`

- [ ] **Step 1: Update the PRD**
  - Build Status date → 28 September 2026.
  - "Coverage labels": officials now enter the hotline and centre in the app; a barangay stays *Alerts only* until they do.
  - "Evacuation guidance": instructions come from the barangay's official, with the placeholder until then.
  - Officials table, new row **Barangay details** (**Built**): up to 3 hotline numbers, instructions in English and/or Filipino, and a centre picked from OpenStreetMap or placed on a map. Saved by `set_barangay_details` (area-checked, recorded as `barangay.details`), and reaching phones through `/api/barangay-details`, which is kept offline.
  - "Drill mode": now in every official's menu.
  - Who It Serves: replace the system-owner row's "No admin screen, no in-app role" with the admin role as it is — appoints and removes officials at `/admin/officials` and sees every area; admins themselves are created only by hand in Supabase.

- [ ] **Step 2: Update the README's Screens** entry for `/admin/zone/[zoneId]`: officials edit the barangay's hotlines, instructions and centre there.

- [ ] **Step 3: Check the whole suite and the build**

Run: `npm test && npm run typecheck && npm run lint && npm run knip && npm run build`
Expected: all pass; lint shows only the two existing warnings in `src/app/api/historical-events/route.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add PRD.md README.md
git commit -m "docs: officials fill in their barangay's hotline, instructions and centre"
```
