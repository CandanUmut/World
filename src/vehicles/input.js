/**
 * Keyboard input for vehicles. Tracks held keys and exposes simple axes.
 * Ignores input while the user is typing in a text field, and only swallows
 * browser defaults (arrow scroll, space) while a vehicle is active.
 */
const keys = new Set();
let active = false;

const PREVENT = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

window.addEventListener('keydown', (e) => {
  if (isTyping()) return;
  keys.add(e.code);
  if (active && PREVENT.has(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

export const input = {
  setActive(v) {
    active = v;
    if (!v) keys.clear();
  },
  isDown: (code) => keys.has(code),
  /** Returns -1, 0 or +1 from a pair of keys. */
  axis(negCode, posCode) {
    return (keys.has(posCode) ? 1 : 0) - (keys.has(negCode) ? 1 : 0);
  },
  /** True if any of the given codes is held. */
  any: (...codes) => codes.some((c) => keys.has(c)),
};
