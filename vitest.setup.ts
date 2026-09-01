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
