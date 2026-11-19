// The small pieces both view modules use: escaping, the inline Markdown a spec or a request keeps,
// and the icons. Pure; touches no DOM.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Inline Markdown a spec keeps (`code`, **bold**, *emphasis*), escaped. */
export const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');

const svg = (body) => `<svg viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
const RING = '<circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.8"/>';

/** A feature's review state, and a request's state: each a word and an icon, never colour alone. */
export const ICON = {
  unreviewed: svg(`${RING}<circle cx="8" cy="8" r="3" fill="currentColor"/>`),
  approved: svg('<circle cx="8" cy="8" r="7.5" fill="currentColor"/><path d="M4.8 8.3l2.2 2.2 4.2-4.6" stroke="var(--sheet)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  'changes-requested': svg('<path d="M8 .8l7.2 13.4H.8z" fill="currentColor"/><path d="M8 5.6v4" stroke="var(--sheet)" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="12" r="1" fill="var(--sheet)"/>'),
  new: svg(`${RING}<path d="M8 4.8v6.4M4.8 8h6.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`),
  discussing: svg('<path d="M2 3h12v8H8l-3.4 2.6V11H2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
  ready: svg(`${RING}<path d="M5 8.2l2 2 4-4.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  'in-progress': svg(`${RING}<path d="M8 1.4a6.6 6.6 0 0 1 0 13.2z" fill="currentColor"/>`),
  parked: svg(`${RING}<path d="M6.4 5.4v5.2M9.6 5.4v5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`),
};
// To review waits as a feature in review does; Done is approved's check.
ICON['to-review'] = ICON.unreviewed;
ICON.done = ICON.approved;

/** One banner line: what is wrong or new, in a sentence, and what to press. `tone` 'req' for a problem. */
export const banner = (text, act = '', tone = '') => `<div class="banner ${tone}" role="status"><span class="bt">${text}</span>${act}</div>`;
