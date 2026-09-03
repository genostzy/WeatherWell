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
