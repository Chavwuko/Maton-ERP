import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Without vitest's `globals: true`, testing-library can't find a global
// `afterEach` to auto-register its cleanup, so each render() would leave
// its tree mounted for the next test in the file.
afterEach(() => {
  cleanup();
});

// Node 22+ ships an experimental native `localStorage` global that, without
// a --localstorage-file flag, shadows jsdom's own working implementation
// and makes every call throw. Rather than depend on a Node-version-specific
// CLI flag (which would need to differ between local dev and CI runners),
// detect a broken localStorage and swap in a minimal in-memory polyfill —
// this works identically everywhere regardless of Node version.
(() => {
  try {
    globalThis.localStorage.setItem('__probe__', '1');
    globalThis.localStorage.removeItem('__probe__');
    return;
  } catch {
    // fall through and install the polyfill below
  }

  const store = new Map<string, string>();
  const polyfill: Storage = {
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: polyfill,
    configurable: true,
    writable: true,
  });
})();

// jsdom doesn't implement matchMedia; Mantine's color-scheme detection
// (MantineProvider) needs it to exist even though nothing here asserts on
// theme behavior.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom doesn't implement ResizeObserver either; Mantine's ScrollArea
// (used inside Select's dropdown, among others) needs it to exist.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Nor scrollIntoView — Mantine's Combobox (Select's dropdown) calls it on a
// delayed timer to auto-scroll the active option, which otherwise throws
// an unhandled "not a function" after the test that opened it has already
// finished and torn down.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
