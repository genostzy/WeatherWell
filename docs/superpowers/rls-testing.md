# Running the RLS test suite

WeatherWell has no local Postgres and no Supabase service container in CI (that
work is deferred — see `supabase/tests/rls.sql`'s own header comments and
`.superpowers/sdd/2026-09-09-v0-community-stores/task-8-brief.md`). Until then,
this suite is run by hand or by an agent, directly against the live project
(`keoxneujsebuedqbmqxz`), through the Supabase MCP's `execute_sql` tool. It is
not part of `npm run` anything yet.

## What the suite is

Three files under `supabase/tests/`:

- **`helpers.sql`** — installs schema `tests` and five functions
  (`tests.as_user`, `tests.as_anon`, `tests.expect_denied`,
  `tests.expect_allowed`, `tests.expect_row_count`). Idempotent
  (`create or replace`) and safe to re-run; it is infrastructure, not a test
  run, and is meant to stay installed on the project between runs.
- **`reference-tables.sql`** — a small sanity check (tables exist, RLS is on
  everywhere in `public`) wrapped in its own `begin ... rollback`.
- **`rls.sql`** — the actual denial/allow suite, also wrapped in
  `begin ... rollback`. Every assertion in it raises on failure with SQLSTATE
  `TSTFL` and a message describing exactly what was expected.

## How to run it

1. Make sure `helpers.sql` is installed (`execute_sql` its full contents; this
   is a no-op if the functions already exist and match).
2. `execute_sql` the full contents of `reference-tables.sql`.
3. `execute_sql` the full contents of `rls.sql`.

Each file is self-contained SQL — paste the whole file as one `execute_sql`
call. Don't split `rls.sql` into pieces for a normal run: several assertions
depend on fixtures created earlier in the same transaction (a pin needs to
exist before you can test who may update it), and the file's own `begin` /
`rollback` only protects you if it runs as one transaction.

## What a pass looks like

`execute_sql` on `rls.sql` returns cleanly — the last statement it runs is
`rollback`, and the tool returns its (empty) result with no error. Every
`raise notice 'ok...'` inside the file is a passing assertion; those notices
are not surfaced by `execute_sql`'s return value, only the final result and
whether an exception propagated. If any assertion fails, `execute_sql` returns
an **error**, not a result: the failing `tests.expect_denied` /
`tests.expect_allowed` / `tests.expect_row_count` call (or a raw
`raise exception using errcode = 'TSTFL'` in one of the plain `do $$` blocks)
raises immediately, aborting the transaction, and the error message names
exactly which assertion failed and why — e.g.:

```
ERROR: TSTFL: SECURITY TEST FAILED — expected denial, statement succeeded: a resident cannot insert a pin that is already removed
```

Because the whole file is one transaction, a failing assertion aborts
everything after it too — you get the first failure, not a full report of
every failure in the file. Fix (or investigate) the first failure, then re-run
the whole file.

## Cleanup

Nothing to do, in the normal case: `rls.sql` and `reference-tables.sql` both
end in `rollback`, so every fixture row and every temporary grant they create
(including the one-assertion `grant update (author_id) on
public.community_pins to authenticated` used to exercise
`pins_update_own_or_operator`'s `WITH CHECK` directly — see the comment beside
it) is undone automatically when the transaction rolls back. A clean run
leaves the database exactly as it found it: `zones` and `evacuation_centers`
at their seeded 4 rows each, every other table touched by the suite
(`community_pins`, `pin_votes`, `water_level_reports`,
`evacuation_check_ins`, `alerts`, `profiles`, `auth.users` fixtures) back at 0
new rows, and every `evacuation_centers.current_occupancy` back to `null`.

If you ever interrupt a run partway through (killed the connection, MCP
timeout, etc.) rather than letting it hit `rollback` or an error, the
transaction should still abort on disconnect — but verify with a row count
query afterward (`select count(*) from public.community_pins`, etc. — should
all read 0 except `zones`/`evacuation_centers` at 4) rather than assuming it.

If you are deliberately testing that the suite *catches* a regression (see
below), you are working outside `rls.sql`'s own transaction — you are
altering live policies/grants/function settings directly. That is a
different, much more dangerous operation: record the exact live definition
before you touch it, change one thing at a time, restore it immediately after
confirming the suite reacts correctly, and re-read the live definition
afterward to confirm the restore matches byte for byte. Never leave two
protections disabled at once, and never do this against schema you don't
intend to put back exactly as you found it.

## `get_advisors` is not a substitute for this suite

Supabase's built-in security advisor (`get_advisors(type: "security")`) is
useful and worth running after any DDL change, but it cannot replace this
suite for one structural reason: its `auth_allow_anonymous_sign_ins` lint —
the one that would flag an RLS policy letting an anonymous user reach data or
writes they shouldn't — inspects a policy's `USING` clause. An `INSERT`
policy has no `USING` clause; it has only `WITH CHECK`. The lint has nothing
to read for an INSERT policy, so it cannot flag one that is wrong, overly
permissive, or missing entirely — its silence there is not a clean bill of
health, it is the lint simply not looking. Every write path a resident or an
anonymous caller can reach in this schema (filing a report, dropping a pin,
casting a vote, recording a check-in) is gated by an INSERT policy's
`WITH CHECK`, which is exactly the part `get_advisors` cannot see. This suite
is the only thing in the project that actually calls those INSERT paths as
the roles they're meant to gate and checks what happens. Treat a clean
`get_advisors` run as necessary, not sufficient — and treat a clean run of
`rls.sql` as the thing that actually proves the write paths are correct.
