import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

/**
 * jsdom ships no ResizeObserver, which Radix's positioning code constructs
 * eagerly. Implemented against the real interface (rather than cast through
 * `any`) so the mock stays honest if the DOM lib's shape ever changes.
 */
class ResizeObserverMock implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

global.ResizeObserver = ResizeObserverMock;

/**
 * jsdom also has no Pointer Capture implementation, which Radix's Select
 * (and other Radix primitives) call directly on the event target during
 * open/close and option-selection handling. Without these, any test that
 * actually opens a Select and picks an option throws
 * "target.hasPointerCapture is not a function" — this had gone unnoticed
 * because no prior test drove a Select through a real interaction.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

/**
 * Supabase env for the browser client.
 *
 * `readSupabaseEnv` throws when either variable is missing, by design — a
 * build that silently ships without a backend is worse than one that fails.
 * Vitest does not load `.env.local`, so every component that reaches
 * `getBrowserClient()` (any map, via `useSessionUserId`) would throw on mount
 * for want of configuration rather than for any reason a test is about.
 *
 * Obviously-fake values: nothing here may reach a real project. Tests that
 * exercise the write path still mock `@/lib/auth/anonymous-session` — this
 * only makes constructing the client possible, it does not make signing in
 * something a test should do.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://vitest.supabase.invalid";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "sb_publishable_vitest_not_a_real_key";
