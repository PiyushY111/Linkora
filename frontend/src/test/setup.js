// Shared by every vitest file. jest-dom only adds matchers, so it is safe in
// the node environment too; component tests opt into jsdom per file with
// `// @vitest-environment jsdom`.
import '@testing-library/jest-dom/vitest';

// Node 25 ships its own global localStorage, which shadows jsdom's and throws
// without a --localstorage-file flag. Point the globals at jsdom's storage
// (vitest exposes the JSDOM instance as `jsdom` in the jsdom environment).
if (typeof jsdom !== 'undefined') {
  for (const name of ['localStorage', 'sessionStorage']) {
    // eslint-disable-next-line no-undef
    Object.defineProperty(globalThis, name, { value: jsdom.window[name], configurable: true, writable: true });
  }
}

// jsdom has no matchMedia; react-hot-toast and framer-motion query it for
// prefers-reduced-motion. Report "no match" for every query.
if (typeof window !== 'undefined' && typeof jsdom !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
}

// jsdom does not implement scrolling; some pages scroll to top on mount.
if (typeof jsdom !== 'undefined') {
  window.scrollTo = () => {};
}
