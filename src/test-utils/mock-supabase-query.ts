import { vi } from "vitest";

export type FakeQueryResult = { data: unknown; error: unknown; count?: number | null };

/**
 * A minimal stand-in for supabase-js's PostgREST query builder, for testing
 * async Server Components that call `.from(table).select(...).eq(...)...`
 * directly (see the /resident pages). `.from(table)` returns a chain whose
 * `select`/`eq`/`order`/`limit` calls all return itself, and which resolves
 * — whether the caller awaits the chain directly (a list or a `head: true`
 * count) or calls `.maybeSingle()` — to the one result configured for that
 * table. That covers every shape these pages issue; it is not a general
 * PostgrestFilterBuilder mock.
 */
export function fakeSupabaseFrom(resultsByTable: Record<string, FakeQueryResult>) {
  const from = vi.fn((table: string) => {
    const result: FakeQueryResult = resultsByTable[table] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve(result),
      then: (resolve: (value: FakeQueryResult) => void) => resolve(result),
    };
    return chain;
  });
  return { from };
}
