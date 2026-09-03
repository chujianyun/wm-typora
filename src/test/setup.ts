import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

// jsdom has no layout engine, while ProseMirror's virtual cursor asks Range for
// geometry after controlled document updates. Empty geometry makes it take its
// own non-layout fallback without changing production behavior.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

Object.defineProperty(SVGElement.prototype, "getBBox", {
  configurable: true,
  value: () => ({
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    top: 0,
    right: 120,
    bottom: 40,
    left: 0,
    toJSON: () => ({}),
  }),
});

Object.defineProperty(SVGElement.prototype, "getComputedTextLength", {
  configurable: true,
  value(this: SVGElement) {
    return (this.textContent?.length ?? 0) * 8;
  },
});

class VisibleIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
  observe(target: Element) {
    this.callback(
      [{
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRatio: 1,
        intersectionRect: target.getBoundingClientRect(),
        isIntersecting: true,
        rootBounds: null,
        target,
        time: 0,
      }],
      this,
    );
  }
}

globalThis.IntersectionObserver = VisibleIntersectionObserver;
