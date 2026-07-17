import '@testing-library/jest-dom'

// jsdom has no IntersectionObserver; TemplateThumbnail lazy-loads on it. The
// default stub never intersects — tests that need intersection install their
// own triggering stub.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class NoopIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  globalThis.IntersectionObserver = NoopIntersectionObserver as unknown as typeof IntersectionObserver
}
