/** Small timing helpers used across UI and data-fetching code. */

/** Trailing debounce: calls fn after `wait` ms of silence. */
export function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Leading throttle: at most one call per `wait` ms. */
export function throttle(fn, wait) {
  let last = 0;
  let timer;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer);
      timer = undefined;
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = undefined;
        fn(...args);
      }, remaining);
    }
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
