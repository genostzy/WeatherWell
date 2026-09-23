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
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve(result),
      then: (resolve: (value: FakeQueryResult) => void) => resolve(result),
    };
    return chain;
  });
  return { from };
}

/**
 * The `.rpc(fn)` counterpart of fakeSupabaseFrom: `order`/`limit` return the
 * chain, and awaiting it resolves to the result configured for that
 * function. An unconfigured function resolves to an error, so a page calling
 * the wrong one fails loudly.
 */
export function fakeSupabaseRpc(resultsByFunction: Record<string, FakeQueryResult>) {
  const rpc = vi.fn((fn: string) => {
    const result: FakeQueryResult = resultsByFunction[fn] ?? {
      data: null,
      error: { message: `unexpected rpc ${fn}` },
    };
    const chain: Record<string, unknown> = {
      order: () => chain,
      limit: () => chain,
      then: (resolve: (value: FakeQueryResult) => void) => resolve(result),
    };
    return chain;
  });
  return { rpc };
}
