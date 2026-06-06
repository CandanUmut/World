/** Lightweight transient notifications (rate-limit warnings, errors, info). */

let container;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.id = 'toastContainer';
  document.body.appendChild(container);
  return container;
}

/**
 * Show a toast.
 * @param {string} message
 * @param {{type?: 'info'|'warn'|'error', duration?: number}} [opts]
 */
export function toast(message, opts = {}) {
  const { type = 'info', duration = 3200 } = opts;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  ensureContainer().appendChild(el);
  // Force reflow so the entrance transition runs.
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, duration);
  return el;
}
