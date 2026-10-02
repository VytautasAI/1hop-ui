/**
 * <hop-app>: the 1Hop "Create a Hop" UI as one self-contained web component
 * (Wix Custom Element, source: Velo file, tag name "hop-app").
 *
 * Views (config.view): create | hop | browse | widget | admin.
 * The element can't call Velo APIs. It dispatches `hop-request` events ({ id, method, args })
 * and public/hopBridge.js answers through the `response` attribute ({ id, result }).
 * All wording comes from getUiConfig() → backend/hop/labels.js. Scoped styles (shadow DOM), no external resources.
 * Design: docs/design/*.png + Day 2 brief (docs/HOP_SPEC.md §0, §10).
 */

// TEMP diagnostics (remove on Day 3): where Wix loaded this file, and whether <hop-app> is in this document.
console.info('[hops] hop-app.js loaded', {
  topFrame: window === window.top,
  href: String(location.href).slice(0, 120),
  hopAppTagsInThisDocument: document.querySelectorAll('hop-app').length,
  alreadyDefined: Boolean(window.customElements && customElements.get('hop-app')),
});
[2000, 8000].forEach((ms) => setTimeout(() => console.info(`[hops] after ${ms / 1000}s: <hop-app> tags =`, document.querySelectorAll('hop-app').length,
  '| body children:', Array.from((document.body && document.body.children) || []).map((n) => n.tagName.toLowerCase()).join(',')), ms));
try {
  let seen = 0;
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => {
    if (n.nodeType === 1 && seen++ < 15) console.info('[hops] element added:', n.tagName.toLowerCase());
  }))).observe(document, { childList: true, subtree: true });
  let msgs = 0;
  window.addEventListener('message', (e) => {
    if (msgs++ >= 10) return;
    let summary;
    try {
      summary = typeof e.data === 'string' ? e.data.slice(0, 160) : JSON.stringify(e.data).slice(0, 160);
    } catch (err) {
      summary = String(e.data);
    }
    console.info('[hops] message to iframe:', summary);
  });
} catch (err) {
  console.error('[hops] diagnostics failed', err);
}

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const CONTACT_FIELDS = ['name', 'email', 'phone'];
const ADMIN_FILTERS = ['PENDING_REVIEW', 'GATHERING_INTEREST', 'LOOKING_PROMISING', 'CHECKING_OPTIONS', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'];
const ADMIN_TARGETS = [
  ['CHECKING_OPTIONS', 'Checking options'],
  ['CONFIRMED', 'Confirmed'],
  ['CANCELLED', 'Cancelled'],
  ['GATHERING_INTEREST', 'Re-open (gathering interest)'],
];
const REQUEST_TIMEOUT_MS = 30000;

/**
 * HTML-escapes a value for text and attribute contexts.
 * @param {*} value
 * @returns {string}
 */
function esc(value) {
  return String(value === undefined || value === null ? '' : value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/**
 * Fills "{key}" placeholders.
 * @param {string} template
 * @param {Object<string, *>} values
 * @returns {string}
 */
function fill(template, values) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

/**
 * Formats whole pounds, e.g. "£720".
 * @param {number} amount
 * @returns {string}
 */
function money(amount) {
  return amount === null || amount === undefined || amount === '' ? '' : GBP.format(Number(amount));
}

/**
 * "Fri 16 Oct" from "YYYY-MM-DD".
 * @param {string} date
 * @returns {string}
 */
function shortDate(date) {
  const [y, m, d] = String(date || '').split('-').map(Number);
  return y && m && d ? SHORT_DATE.format(new Date(Date.UTC(y, m - 1, d))) : '';
}

/**
 * <option> list.
 * @param {Array<[string|number, string]>} pairs [value, label]
 * @param {string} selected
 * @returns {string}
 */
function options(pairs, selected) {
  return pairs
    .map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(l)}</option>`)
    .join('');
}

const STYLE = `
:host { display:block; font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; color:#33475b;
  --primary:#1f7aa6; --primary-dark:#175f82; --ink:#1c2b3a; --muted:#566879; --line:#d5e1e9; --soft:#f2f6f8;
  --panel:#e6f1f6; --blue:#1f7aa6; --amber:#8c600c; --green:#257a4c; --grey:#5b6b7a; --red:#ad3a31; }
*, *::before, *::after { box-sizing:border-box; }
.app { font-size:16px; line-height:1.45; -webkit-font-smoothing:antialiased; }
[hidden] { display:none !important; }
.sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
.hp { position:absolute; left:-10000px; width:1px; height:1px; opacity:0; }
h1, h2, h3, p { margin:0; }
.h1 { font-size:30px; line-height:1.15; font-weight:700; color:var(--ink); letter-spacing:-0.01em; }
.h2 { font-size:22px; line-height:1.2; font-weight:700; color:var(--ink); }
.lead { color:var(--muted); margin-top:8px; }
.muted { color:var(--muted); }
.fine { font-size:14px; color:var(--muted); text-align:center; margin-top:12px; }
.center { text-align:center; }
.panel { background:#fff; border:1px solid var(--line); border-radius:20px; padding:24px 18px; }
/* Form controls */
form { display:block; }
.grid2 { display:grid; grid-template-columns:1fr; gap:16px 20px; margin-top:20px; }
.field { display:flex; flex-direction:column; gap:8px; margin:0; min-width:0; }
.field + .field, .stack > * + * { margin-top:16px; }
.grid2 .field + .field { margin-top:0; }
label, legend { font-weight:700; color:var(--ink); font-size:16px; }
fieldset { border:0; padding:0; margin:16px 0 0; }
input[type=text], input[type=email], input[type=tel], input[type=number], input[type=date], input[type=time], select, textarea, .static {
  width:100%; min-height:52px; border:1px solid #c9d7e1; border-radius:10px; background:#fff; padding:0 14px;
  font:inherit; font-weight:600; color:var(--ink); }
textarea { padding:12px 14px; min-height:88px; font-weight:400; }
select { appearance:none; -webkit-appearance:none; padding-right:40px; cursor:pointer;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9' viewBox='0 0 14 9'%3E%3Cpath d='M1 1l6 6 6-6' fill='none' stroke='%231c2b3a' stroke-width='2'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 14px center; }
.static { display:flex; align-items:center; color:var(--muted); background:var(--soft); }
.invalid input, .invalid select { border-color:var(--red); }
.error { color:var(--red); font-size:14px; font-weight:600; }
.form-error { color:var(--red); font-weight:600; margin-top:12px; }
.check { display:flex; align-items:center; gap:10px; min-height:44px; margin-top:12px; cursor:pointer; }
.check input { width:22px; height:22px; accent-color:var(--primary); }
.seg { display:inline-flex; border:1px solid #c9d7e1; border-radius:10px; overflow:hidden; margin-top:8px; }
.seg label { display:flex; align-items:center; justify-content:center; min-width:76px; min-height:46px; font-weight:700; cursor:pointer; position:relative; }
.seg input { position:absolute; opacity:0; inset:0; margin:0; cursor:pointer; }
.seg label + label { border-left:1px solid #c9d7e1; }
.seg input:checked + span { color:#fff; }
.seg label:has(input:checked) { background:var(--primary); color:#fff; }
.seg label:has(input:focus-visible) { outline:3px solid var(--primary-dark); outline-offset:-3px; }
/* Buttons */
.btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:48px; padding:0 20px; border-radius:10px;
  font:inherit; font-weight:700; font-size:17px; cursor:pointer; text-decoration:none; border:1px solid transparent; }
.btn.block { width:100%; }
.btn.lg { min-height:58px; font-size:20px; }
.btn.primary { background:var(--primary); color:#fff; }
.btn.primary:hover { background:var(--primary-dark); }
.btn.secondary { background:#fff; color:var(--ink); border-color:#c9d7e1; }
.btn.outline { background:#fff; color:var(--primary); border-color:var(--primary); }
.btn.whatsapp { background:#1b7f4a; color:#fff; }
.btn.ghost { background:transparent; color:var(--muted); }
.btn[disabled] { opacity:.6; cursor:not-allowed; }
.link { background:none; border:0; padding:8px 4px; min-height:44px; font:inherit; font-weight:700; color:var(--primary); cursor:pointer; text-decoration:underline; text-underline-offset:3px; }
:focus-visible { outline:3px solid var(--primary-dark); outline-offset:2px; }
.btn-row { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
.btn-row .btn { flex:1 1 180px; }
/* Status */
.label { font-size:13px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
.tone-blue { color:var(--blue); } .tone-amber { color:var(--amber); } .tone-green { color:var(--green); }
.tone-grey { color:var(--grey); } .tone-red { color:var(--red); }
.badge { display:inline-block; padding:6px 10px; border-radius:999px; background:var(--soft); }
/* Create */
.create { display:grid; grid-template-columns:1fr; gap:24px; }
.next { padding:4px 4px 0; }
.next-title { font-size:15px; font-weight:800; letter-spacing:.2em; color:var(--primary); }
.next ol { list-style:none; margin:12px 0 0; padding:0; }
.next li { display:grid; grid-template-columns:36px 1fr; gap:4px 14px; padding:16px 0; border-bottom:1px solid var(--line); }
.next .num { grid-row:span 2; width:32px; height:32px; border-radius:50%; background:var(--panel); color:var(--primary); font-weight:800; display:flex; align-items:center; justify-content:center; }
.next strong { color:var(--ink); font-size:19px; }
.next span.text { color:var(--muted); font-size:15px; }
.notice, .preview { background:var(--panel); border-radius:14px; padding:16px 18px; margin-top:20px; }
.notice-title, .preview-title { font-weight:800; color:var(--ink); }
.notice .link { display:block; margin:6px auto 0; text-decoration:none; }
.preview ul { list-style:none; margin:8px 0 0; padding:0; }
.preview li { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-top:1px solid #cfdee8; flex-wrap:wrap; }
.preview li:first-child { border-top:0; }
.summary { margin-top:8px; color:var(--muted); }
/* Cards */
.toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin-bottom:20px; }
.chips { display:flex; flex-wrap:wrap; gap:10px; }
.chip select { min-height:44px; width:auto; border-color:var(--line); font-size:15px; font-weight:700; padding:0 36px 0 14px; background-position:right 12px center; }
.grid { display:grid; grid-template-columns:1fr; gap:20px; }
.card { background:#fff; border:1px solid var(--line); border-radius:22px; padding:24px 22px; display:flex; flex-direction:column; gap:10px; }
.codes { font-size:30px; font-weight:700; color:var(--ink); letter-spacing:.01em; margin-top:6px; }
.codes .arrow { font-weight:400; color:var(--primary); margin:0 6px; }
.route-title { font-size:21px; font-weight:700; color:var(--ink); }
.when { font-size:18px; color:var(--text); }
.tiles { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-top:4px; }
.tile { background:var(--soft); border-radius:10px; padding:10px 12px; }
.tile strong { display:block; font-size:19px; color:var(--ink); }
.tile span { font-size:12px; color:var(--muted); }
.price { background:var(--panel); border-radius:16px; padding:16px 18px; margin-top:4px; }
.price-title { font-size:14px; color:var(--muted); }
.price-total { font-size:30px; font-weight:700; color:var(--ink); margin:2px 0 6px; }
.price-row { display:flex; justify-content:space-between; padding:9px 0; border-top:1px solid #c8d9e4; font-size:15px; }
.price-row.hi { color:var(--primary); font-weight:800; }
.msg { background:var(--soft); border-radius:14px; padding:16px 18px; }
.card .btn { width:100%; }
.empty, .state { text-align:center; padding:32px 16px; }
.empty p, .state p { margin-bottom:14px; }
.skeleton { background:linear-gradient(90deg, #eef3f6 25%, #f6f9fb 50%, #eef3f6 75%); background-size:200% 100%; animation:sh 1.2s infinite; border-radius:22px; min-height:280px; }
@keyframes sh { to { background-position:-200% 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation:none; } }
/* Hop page */
.hop { max-width:720px; margin:0 auto; }
.banner, .success { background:#e3f4ea; color:#1d5a37; border-radius:14px; padding:14px 16px; margin-bottom:16px; display:flex; gap:10px; align-items:flex-start; justify-content:space-between; }
.success { display:block; margin:16px 0 0; }
.success-title { font-weight:800; font-size:19px; }
.route { margin-top:10px; }
.facts { list-style:none; padding:0; margin:14px 0 0; display:grid; gap:6px; font-size:17px; }
.status-msg { margin-top:14px; background:var(--soft); border-radius:12px; padding:12px 14px; }
.headline { margin-top:18px; font-size:20px; font-weight:700; color:var(--ink); }
.modes { display:grid; gap:12px; margin-top:12px; }
.mode-card { border:1px solid var(--line); border-radius:16px; padding:16px; }
.mode-head { display:flex; justify-content:space-between; align-items:center; gap:10px; }
.mode-name { font-weight:800; color:var(--ink); font-size:17px; }
.tag { background:#fbe9e7; color:var(--red); font-weight:800; font-size:13px; padding:4px 10px; border-radius:999px; }
.mode-price { margin-top:6px; }
.mode-price strong { font-size:22px; color:var(--ink); margin-right:6px; }
.bar { height:10px; background:var(--soft); border-radius:999px; overflow:hidden; margin-top:10px; }
.bar span { display:block; height:100%; background:var(--primary); border-radius:999px; }
.bar.done span { background:var(--green); }
.mode-status { margin-top:6px; font-size:15px; font-weight:700; color:var(--muted); }
details { margin-top:8px; }
summary { cursor:pointer; color:var(--primary); font-weight:700; min-height:44px; display:flex; align-items:center; }
.ladder { list-style:none; padding:0; margin:4px 0 0; }
.ladder li { display:flex; justify-content:space-between; padding:8px 0; border-top:1px solid var(--line); }
.ladder li.now { font-weight:800; color:var(--primary); }
.join { margin-top:20px; border-top:1px solid var(--line); padding-top:20px; }
.in { display:flex; align-items:center; justify-content:center; min-height:48px; border-radius:10px; background:#e3f4ea; color:#1d5a37; font-weight:800; flex:1 1 180px; }
.share { display:flex; flex-wrap:wrap; gap:10px; margin-top:12px; }
.share .btn { flex:1 1 140px; }
.share input { margin-top:8px; }
/* Widget */
.widget-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
.mini { background:#fff; border:1px solid var(--line); border-radius:18px; padding:18px; display:flex; flex-direction:column; gap:6px; }
.mini-route strong { font-size:20px; color:var(--ink); margin-right:8px; }
.mini-price { font-weight:800; color:var(--ink); }
.mini .btn { margin-top:8px; }
/* Admin */
.admin-item { background:#fff; border:1px solid var(--line); border-radius:14px; padding:16px; margin-top:12px; }
.admin-item p { margin-top:4px; }
.admin-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; align-items:center; }
.admin-actions select { width:auto; min-height:44px; }
.admin-item table { width:100%; border-collapse:collapse; margin-top:10px; font-size:14px; }
.admin-item th, .admin-item td { text-align:left; padding:6px; border-top:1px solid var(--line); vertical-align:top; }
.toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); background:var(--ink); color:#fff; padding:12px 18px; border-radius:10px; font-weight:700; z-index:10; }
.toast:empty { display:none; }
@media (min-width:640px) {
  .grid2 { grid-template-columns:1fr 1fr; }
  .grid { grid-template-columns:1fr 1fr; }
  .panel { padding:32px; }
  .h1 { font-size:36px; }
}
@media (min-width:960px) {
  .create { grid-template-columns:minmax(0, 1fr) 340px; gap:40px; }
  .grid { grid-template-columns:repeat(3, 1fr); }
  .wgrid { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; }
}
.wgrid { display:grid; gap:14px; }
@media (min-width:640px) and (max-width:959px) { .wgrid { grid-template-columns:1fr 1fr; } }
`;

class HopApp extends HTMLElement {
  static get observedAttributes() {
    return ['config', 'response'];
  }

  constructor() {
    super();
    console.info('[hops] <hop-app> created'); // TEMP diagnostics
    try {
      this.root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    } catch (err) {
      console.error('[hops] attachShadow failed, rendering without shadow DOM', err);
      this.root = this.appendChild(document.createElement('div'));
      this.root.getElementById = (id) => this.root.querySelector(`#${CSS.escape(id)}`);
      Object.defineProperty(this.root, 'activeElement', { get: () => (this.root.contains(document.activeElement) ? document.activeElement : null) });
    }
    this.pending = new Map();
    this.seq = 0;
    this.config = null;
    this.ui = null;
    this.copy = null;
    this.started = false;
    this.s = {};
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
    this.root.addEventListener('submit', (e) => {
      e.preventDefault();
      this.onSubmit(e);
    });
  }

  connectedCallback() {
    console.info('[hops] <hop-app> on page'); // TEMP diagnostics
    if (!this.started) this.paint(this.loadingHtml());
    this.start();
  }

  attributeChangedCallback(name, _old, value) {
    if (name === 'response' && value) {
      let msg;
      try {
        msg = JSON.parse(value);
      } catch (err) {
        return;
      }
      const waiting = this.pending.get(msg.id);
      if (waiting) {
        this.pending.delete(msg.id);
        clearTimeout(waiting.timer);
        waiting.resolve(msg.result || { ok: false, code: 'INTERNAL', message: 'Something went wrong.' });
      }
    }
    if (name === 'config' && value) {
      try {
        this.config = JSON.parse(value);
      } catch (err) {
        this.config = null;
      }
      console.info('[hops] <hop-app> got config', this.config && this.config.view); // TEMP diagnostics
      this.start();
    }
  }

  // ---------- plumbing ----------

  /**
   * Calls a backend method through the page bridge.
   * @param {string} method
   * @param {...*} args
   * @returns {Promise<object>} Envelope.
   */
  call(method, ...args) {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${++this.seq}`;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, code: 'TIMEOUT', message: 'This is taking longer than expected. Please try again.' });
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer });
      this.dispatchEvent(new CustomEvent('hop-request', { detail: { id, method, args } }));
    });
  }

  async start() {
    if (this.started || !this.config || !this.isConnected) return;
    this.started = true;
    this.paint(this.loadingHtml());
    const res = await this.call('getUiConfig');
    if (!res.ok) {
      this.started = false;
      this.paint(this.stateHtml(res.message, 'retry-start'));
      return;
    }
    this.ui = res.data;
    this.copy = res.data.copy;
    const init = {
      create: () => this.initCreate(),
      hop: () => this.initHop(),
      browse: () => this.initList('browse'),
      widget: () => this.initList('widget'),
      admin: () => this.initAdmin(),
    }[this.config.view];
    if (!init) {
      this.paint(this.stateHtml(`Unknown view "${this.config.view}".`));
      return;
    }
    await init();
  }

  render() {
    const view = {
      create: () => this.createHtml(),
      hop: () => this.hopHtml(),
      browse: () => this.listHtml(),
      widget: () => this.listHtml(),
      admin: () => this.adminHtml(),
    }[this.config.view];
    this.paint(view());
  }

  /** Replaces the shadow content, keeping focus (and caret) on the same control. */
  paint(html) {
    const active = this.root.activeElement;
    const id = active && active.id;
    let sel = null;
    try {
      if (active && typeof active.selectionStart === 'number') sel = [active.selectionStart, active.selectionEnd];
    } catch (err) {
      sel = null;
    }
    const toast = this.root.getElementById('toast');
    const toastText = toast ? toast.textContent : '';
    this.root.innerHTML = `<style>${STYLE}</style><div class="app">${html}</div><div class="toast" id="toast" role="status" aria-live="polite">${esc(toastText)}</div>`;
    if (id) this.focus(id, sel);
  }

  focus(id, sel) {
    const el = this.root.getElementById(id);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (sel) {
      try {
        el.setSelectionRange(sel[0], sel[1]);
      } catch (err) {
        /* not a text input */
      }
    }
  }

  toast(text) {
    const el = this.root.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      const t = this.root.getElementById('toast');
      if (t) t.textContent = '';
    }, 2600);
  }

  go(path) {
    return this.call('navigate', path);
  }

  hopPath(slug, query) {
    return `${this.config.pages.hopPrefix}${slug}${query ? `?${query}` : ''}`;
  }

  hopUrl(slug) {
    return `${String(this.config.baseUrl || '').replace(/\/$/, '')}${this.config.pages.hopPrefix}${slug}`;
  }

  async loadMine(slug) {
    const res = await this.call('storageGet', `hop:${slug}`);
    try {
      return res.ok && res.data ? JSON.parse(res.data) : null;
    } catch (err) {
      return null;
    }
  }

  saveMine(slug, value) {
    return this.call('storageSet', `hop:${slug}`, value ? JSON.stringify(value) : null);
  }

  loadingHtml() {
    return '<div class="state" aria-busy="true"><p class="muted">Loading…</p></div>';
  }

  stateHtml(message, retryAction) {
    return `<div class="state" role="alert"><p>${esc(message || 'Something went wrong.')}</p>${
      retryAction ? `<button type="button" class="btn secondary" data-action="${retryAction}">Try again</button>` : ''
    }</div>`;
  }

  // ---------- shared form pieces ----------

  field(id, label, control, error) {
    return `<div class="field${error ? ' invalid' : ''}"><label for="${id}">${esc(label)}</label>${control}${
      error ? `<p class="error" id="${id}-err">${esc(error)}</p>` : ''
    }</div>`;
  }

  aria(id, error) {
    return error ? ` aria-invalid="true" aria-describedby="${id}-err"` : '';
  }

  travellerFields(prefix, f, errors) {
    const c = this.copy.create.fields;
    const max = this.ui.travellers.max;
    const exact = f.travellers === '4+'
      ? this.field(`${prefix}-exact`, c.travellersExact,
        `<select id="${prefix}-exact" name="travellersExact">${options(
          Array.from({ length: max - 3 }, (_, i) => [i + 4, String(i + 4)]), f.travellersExact)}</select>`)
      : '';
    return this.field(`${prefix}-travellers`, c.travellers,
      `<select id="${prefix}-travellers" name="travellers"${this.aria(`${prefix}-travellers`, errors.partySize)}>${options(
        [['1', '1'], ['2', '2'], ['3', '3'], ['4+', c.travellersMore]], f.travellers)}</select>`, errors.partySize) + exact;
  }

  flexField(prefix, f, errors) {
    return this.field(`${prefix}-flex`, this.copy.create.fields.flexibility,
      `<select id="${prefix}-flex" name="timeFlex"${this.aria(`${prefix}-flex`, errors.timeFlex)}>${options(
        this.ui.flexOptions.map((o) => [o.value, o.label]), f.timeFlex)}</select>`, errors.timeFlex);
  }

  returnField(prefix, f) {
    const c = this.copy.create.fields;
    return `<fieldset><legend>${esc(c.returnNeeded)}</legend><div class="seg">${[['yes', c.yes], ['no', c.no]]
      .map(([v, l]) => `<label><input type="radio" id="${prefix}-ret-${v}" name="returnNeeded" value="${v}"${f.returnNeeded === v ? ' checked' : ''}><span>${esc(l)}</span></label>`)
      .join('')}</div></fieldset>`;
  }

  petFields(prefix, f, errors) {
    const c = this.copy.create.fields;
    const count = f.hasPet
      ? this.field(`${prefix}-pets`, c.pets, `<select id="${prefix}-pets" name="pets"${this.aria(`${prefix}-pets`, errors.pets)}>${options(
        Array.from({ length: this.ui.petsMax }, (_, i) => [i + 1, String(i + 1)]), f.pets)}</select>`, errors.pets)
      : '';
    return `<label class="check" for="${prefix}-haspet"><input type="checkbox" id="${prefix}-haspet" name="hasPet"${f.hasPet ? ' checked' : ''}> ${esc(c.pet)}</label>${count}`;
  }

  maxPriceFields(prefix, f, errors) {
    const c = this.copy.create.fields;
    const pairs = [['', c.maxPriceNone], ...this.ui.maxPriceOptions.map((v) => [String(v), money(v)]), ['other', c.maxPriceOther]];
    const other = f.maxPrice === 'other'
      ? this.field(`${prefix}-maxother`, c.maxPriceOtherAmount,
        `<input type="number" inputmode="numeric" min="0" step="1" id="${prefix}-maxother" name="maxPriceOther" value="${esc(f.maxPriceOther)}"${this.aria(`${prefix}-maxother`, errors.maxPrice)}>`, errors.maxPrice)
      : '';
    return this.field(`${prefix}-max`, c.maxPrice, `<select id="${prefix}-max" name="maxPrice">${options(pairs, f.maxPrice)}</select>`, f.maxPrice === 'other' ? '' : errors.maxPrice) + other;
  }

  contactFieldsHtml(prefix, f, errors) {
    const c = this.copy.contact;
    return `<div class="grid2">${this.field(`${prefix}-name`, c.name,
      `<input type="text" id="${prefix}-name" name="name" autocomplete="name" value="${esc(f.name)}"${this.aria(`${prefix}-name`, errors.name)}>`, errors.name)}${this.field(`${prefix}-email`, c.email,
      `<input type="email" id="${prefix}-email" name="email" autocomplete="email" inputmode="email" value="${esc(f.email)}"${this.aria(`${prefix}-email`, errors.email)}>`, errors.email)}${this.field(`${prefix}-phone`, c.phone,
      `<input type="tel" id="${prefix}-phone" name="phone" autocomplete="tel" value="${esc(f.phone)}"${this.aria(`${prefix}-phone`, errors.phone)}>`, errors.phone)}</div>
      <label class="hp" aria-hidden="true">Website<input type="text" name="website" tabindex="-1" autocomplete="off" value="${esc(f.website)}"></label>`;
  }

  partySize(f) {
    return f.travellers === '4+' ? Number(f.travellersExact) : Number(f.travellers);
  }

  petsValue(f) {
    return f.hasPet ? Number(f.pets) : 0;
  }

  maxPriceValue(f) {
    if (f.maxPrice === 'other') return f.maxPriceOther === '' ? null : f.maxPriceOther;
    return f.maxPrice === '' ? null : Number(f.maxPrice);
  }

  needsTime(flex) {
    const o = this.ui.flexOptions.find((x) => x.value === flex);
    return Boolean(o && o.needsTime);
  }

  // ---------- CREATE ----------

  async initCreate() {
    this.s = {
      step: 'form',
      busy: false,
      errors: {},
      formError: '',
      form: {
        fromId: '', toId: '', departureDate: '', approxTime: '', timeFlex: '1h', travellers: '1', travellersExact: '4',
        returnNeeded: 'no', hasPet: false, pets: '1', maxPrice: '', maxPriceOther: '', name: '', email: '', phone: '', website: '',
      },
      locations: [],
      routes: [],
      preview: null,
      previewKey: '',
      previewLoading: false,
      previewError: '',
      matches: [],
      loadError: '',
    };
    const [locs, routes] = await Promise.all([this.call('getLocations'), this.call('getRoutes')]);
    if (!locs.ok || !routes.ok) this.s.loadError = (locs.ok ? routes : locs).message;
    else {
      this.s.locations = locs.data;
      this.s.routes = routes.data;
    }
    this.render();
  }

  locationById(id) {
    return (this.s.locations || []).find((l) => l.id === id) || null;
  }

  fromChoices() {
    const ids = new Set(this.s.routes.map((r) => r.fromId));
    return this.s.locations.filter((l) => ids.has(l.id));
  }

  toChoices() {
    const { fromId } = this.s.form;
    const ids = new Set(this.s.routes.filter((r) => !fromId || r.fromId === fromId).map((r) => r.toId));
    return this.s.locations.filter((l) => ids.has(l.id) && l.id !== fromId);
  }

  createHtml() {
    if (this.s.loadError) return this.stateHtml(this.s.loadError, 'retry-start');
    const c = this.copy.create;
    const next = c.whatHappensNext
      .map((step, i) => `<li><span class="num" aria-hidden="true">${i + 1}</span><strong>${esc(step.title)}</strong><span class="text">${esc(step.text)}</span></li>`)
      .join('');
    return `<div class="create"><section class="panel">${this.s.step === 'contact' ? this.contactStepHtml() : this.createFormHtml()}</section>
      <aside class="next" aria-labelledby="next-title"><p class="next-title" id="next-title">${esc(c.whatHappensNextTitle)}</p><ol>${next}</ol></aside></div>`;
  }

  createFormHtml() {
    const c = this.copy.create;
    const fl = c.fields;
    const f = this.s.form;
    const e = this.s.errors;
    const choose = [['', fl.choose]];
    const timeControl = this.needsTime(f.timeFlex)
      ? `<input type="time" id="c-time" name="approxTime" step="300" value="${esc(f.approxTime)}"${this.aria('c-time', e.approxTime)}>`
      : `<div class="static" id="c-time">${esc((this.ui.flexOptions.find((o) => o.value === f.timeFlex) || {}).label || '')}</div>`;
    return `<form id="create-form" novalidate>
      <h1 class="h1">${esc(c.heading)}</h1>
      <p class="lead">${esc(c.subtext)}</p>
      <div class="grid2">
        ${this.field('c-from', fl.from, `<select id="c-from" name="fromId"${this.aria('c-from', e.fromId)}>${options(choose.concat(this.fromChoices().map((l) => [l.id, l.title])), f.fromId)}</select>`, e.fromId)}
        ${this.field('c-to', fl.to, `<select id="c-to" name="toId"${this.aria('c-to', e.toId)}>${options(choose.concat(this.toChoices().map((l) => [l.id, l.title])), f.toId)}</select>`, e.toId)}
        ${this.field('c-date', fl.date, `<input type="date" id="c-date" name="departureDate" min="${esc(this.ui.today)}" value="${esc(f.departureDate)}"${this.aria('c-date', e.departureDate)}>`, e.departureDate)}
        ${this.field('c-time', fl.time, timeControl, e.approxTime)}
        ${this.flexField('c', f, e)}
        <div class="stack">${this.travellerFields('c', f, e)}</div>
      </div>
      ${this.returnField('c', f)}
      ${this.petFields('c', f, e)}
      <div class="stack" style="margin-top:16px">${this.maxPriceFields('c', f, e)}</div>
      <div id="preview" aria-live="polite">${this.previewHtml()}</div>
      <div id="similar" aria-live="polite">${this.similarHtml()}</div>
      ${this.s.formError ? `<p class="form-error" role="alert">${esc(this.s.formError)}</p>` : ''}
      <button type="submit" class="btn primary block lg" style="margin-top:24px">${esc(c.button)}</button>
      <p class="fine">${esc(c.footer)}</p>
    </form>`;
  }

  contactStepHtml() {
    const c = this.copy.contact;
    const f = this.s.form;
    const from = this.locationById(f.fromId);
    const to = this.locationById(f.toId);
    const time = this.needsTime(f.timeFlex) ? f.approxTime : (this.ui.flexOptions.find((o) => o.value === f.timeFlex) || {}).label;
    const n = this.partySize(f);
    const summary = [from && to ? `${from.title} → ${to.title}` : '', shortDate(f.departureDate), time, `${n} ${n === 1 ? 'traveller' : 'travellers'}`]
      .filter(Boolean).join(' · ');
    return `<form id="contact-form" novalidate>
      <button type="button" class="link" data-action="back">${esc(c.back)}</button>
      <h2 class="h2" style="margin-top:8px">${esc(c.heading)}</h2>
      <p class="summary">${esc(summary)}</p>
      ${this.contactFieldsHtml('k', f, this.s.errors)}
      <p class="fine" style="text-align:left">${esc(c.privacy)}</p>
      ${this.s.formError ? `<p class="form-error" role="alert">${esc(this.s.formError)}</p>` : ''}
      <button type="submit" class="btn primary block lg" style="margin-top:20px"${this.s.busy ? ' disabled' : ''}>${esc(this.s.busy ? c.saving : this.copy.create.button)}</button>
      <p class="fine">${esc(this.copy.create.footer)}</p>
    </form>`;
  }

  previewHtml() {
    const f = this.s.form;
    const p = this.copy.create.preview;
    if (!(f.fromId && f.toId && f.departureDate)) return '';
    if (this.s.previewLoading) return `<div class="preview"><p class="muted">${esc(p.loading)}</p></div>`;
    if (this.s.previewError) return `<div class="preview"><p>${esc(this.s.previewError)}</p></div>`;
    const data = this.s.preview;
    if (!data) return '';
    const rows = data.modes
      .map((m) => `<li><span><span aria-hidden="true">${esc(m.icon)}</span> ${esc(m.label)}</span><span>${esc(fill(p.from, { price: money(m.fromPrice), seats: m.maxSeats }))}</span></li>`)
      .join('');
    return `<div class="preview"><p class="preview-title">${esc(p.title)}</p>${rows ? `<ul>${rows}</ul>` : `<p>${esc(p.none)}</p>`}${
      data.excludedForPets && data.excludedForPets.length && rows ? `<p class="muted" style="margin-top:6px">${esc(fill(p.noPets, { modes: data.excludedForPets.join(', ') }))}</p>` : ''
    }</div>`;
  }

  similarHtml() {
    const m = this.s.matches && this.s.matches[0];
    if (!m) return '';
    const s = this.copy.create.similar;
    const line = [`${m.from.title} → ${m.to.title}`, m.dateShort, m.timeText, fill(s.interested, { count: m.committedSeats })].filter(Boolean).join(' · ');
    return `<div class="notice" role="note"><p class="notice-title">${esc(s.title)}</p><p>${esc(line)}</p>
      <button type="button" class="link" data-action="open-hop" data-slug="${esc(m.slug)}">${esc(s.link)}</button></div>`;
  }

  scheduleLookups() {
    clearTimeout(this.lookupTimer);
    this.lookupTimer = setTimeout(() => this.runLookups(), 250);
  }

  async runLookups() {
    const f = this.s.form;
    if (!(f.fromId && f.toId && f.departureDate)) {
      this.s.preview = null;
      this.s.matches = [];
      this.s.previewKey = '';
      this.updateCreateRegions();
      return;
    }
    const pets = this.petsValue(f);
    const previewKey = [f.fromId, f.toId, pets].join('|');
    const matchKey = [f.fromId, f.toId, f.departureDate, f.approxTime, f.timeFlex].join('|');
    this.s.matchKey = matchKey;
    const tasks = [];
    if (previewKey !== this.s.previewKey || this.s.previewError) {
      this.s.previewKey = previewKey;
      this.s.previewLoading = true;
      this.s.previewError = '';
      this.updateCreateRegions();
      tasks.push(this.call('getRatesForRoute', f.fromId, f.toId, pets).then((r) => {
        if (this.s.previewKey !== previewKey) return;
        this.s.previewLoading = false;
        this.s.preview = r.ok ? r.data : null;
        this.s.previewError = r.ok ? '' : r.message;
      }));
    }
    const time = this.needsTime(f.timeFlex) ? f.approxTime : '';
    tasks.push(this.call('findMatchingHops', { fromId: f.fromId, toId: f.toId, date: f.departureDate, approxTime: time, timeFlex: f.timeFlex }).then((r) => {
      if (this.s.matchKey === matchKey) this.s.matches = r.ok ? r.data : [];
    }));
    await Promise.all(tasks);
    this.updateCreateRegions();
  }

  updateCreateRegions() {
    const p = this.root.getElementById('preview');
    if (p) p.innerHTML = this.previewHtml();
    const s = this.root.getElementById('similar');
    if (s) s.innerHTML = this.similarHtml();
  }

  validateCreateLocally() {
    const f = this.s.form;
    const e = {};
    if (!f.fromId) e.fromId = 'Please choose where you are leaving from.';
    if (!f.toId) e.toId = 'Please choose where you are going.';
    if (!f.departureDate) e.departureDate = 'Please choose a date.';
    else if (f.departureDate < this.ui.today) e.departureDate = 'Please choose today or a later date.';
    if (this.needsTime(f.timeFlex) && !/^\d{2}:\d{2}$/.test(f.approxTime)) e.approxTime = 'Please enter an approximate time like 17:30.';
    if (f.maxPrice === 'other' && (f.maxPriceOther === '' || Number(f.maxPriceOther) < 0)) e.maxPrice = 'Please enter an amount, or choose "No maximum".';
    return e;
  }

  async submitCreate() {
    const f = this.s.form;
    this.s.busy = true;
    this.s.errors = {};
    this.s.formError = '';
    this.render();
    const res = await this.call('createHop', {
      fromId: f.fromId,
      toId: f.toId,
      departureDate: f.departureDate,
      approxTime: this.needsTime(f.timeFlex) ? f.approxTime : '',
      timeFlex: f.timeFlex,
      partySize: this.partySize(f),
      pets: this.petsValue(f),
      returnNeeded: f.returnNeeded === 'yes',
      maxPrice: this.maxPriceValue(f),
      name: f.name,
      email: f.email,
      phone: f.phone,
      website: f.website,
    });
    if (res.ok) {
      await this.saveMine(res.data.slug, { email: f.email.trim().toLowerCase(), token: res.data.manageToken });
      await this.go(this.hopPath(res.data.slug, 'created=1'));
      return; // stay "busy" while the page changes
    }
    this.s.busy = false;
    this.s.errors = res.fields || {};
    this.s.formError = res.fields ? '' : res.message;
    const formFieldError = Object.keys(this.s.errors).find((k) => !CONTACT_FIELDS.includes(k));
    if (formFieldError) {
      this.s.step = 'form';
      this.s.formError = res.message;
    }
    this.render();
  }

  // ---------- HOP ----------

  async initHop() {
    const cfg = this.config;
    const hop = cfg.hop || null;
    this.s = {
      slug: cfg.slug,
      hop,
      notFound: Boolean(cfg.notFound),
      loadError: '',
      mine: null,
      step: 'view',
      busy: false,
      errors: {},
      formError: '',
      banner: cfg.query && cfg.query.created === '1',
      result: '',
      shareOpen: cfg.query && cfg.query.created === '1',
      copied: false,
      shareFallback: false,
      form: null,
    };
    if (!this.s.slug) this.s.notFound = true;
    if (!this.s.notFound && !this.s.hop) {
      const res = await this.call('getHop', this.s.slug);
      if (res.ok) this.s.hop = res.data;
      else if (res.code === 'NOT_FOUND') this.s.notFound = true;
      else this.s.loadError = res.message;
    }
    if (this.s.hop) {
      this.s.mine = await this.loadMine(this.s.slug);
      this.resetJoinForm();
      if (cfg.query && cfg.query.join === '1' && this.s.hop.joinable && !this.s.mine) this.s.step = 'join';
    }
    this.render();
  }

  resetJoinForm() {
    const h = this.s.hop;
    this.s.form = {
      travellers: '1', travellersExact: '4', timeFlex: h.timeFlex || 'anyday', returnNeeded: h.returnNeeded ? 'yes' : 'no',
      hasPet: false, pets: '1', maxPrice: '', maxPriceOther: '', name: '', email: '', phone: '', website: '',
    };
  }

  currentPrice(hop) {
    const prices = (hop.modes || []).map((m) => m.currentPerPerson).filter((n) => Number.isFinite(n));
    return prices.length ? Math.min(...prices) : hop.fromPrice;
  }

  shareText(hop) {
    const c = this.copy.hop;
    const values = {
      route: `${hop.from.title} → ${hop.to.title}`,
      date: hop.dateMedium,
      more: hop.seatsToViable,
      price: money(this.currentPrice(hop)),
      url: this.hopUrl(hop.slug),
    };
    return fill(hop.seatsToViable > 0 ? c.whatsappText : c.whatsappTextViable, values);
  }

  hopHtml() {
    const c = this.copy.hop;
    if (this.s.loadError) return this.stateHtml(this.s.loadError, 'retry-start');
    if (this.s.notFound) {
      return `<div class="hop"><section class="panel center"><h1 class="h1">${esc(c.notFoundTitle)}</h1><p class="lead">${esc(c.notFound)}</p>
        <div class="btn-row"><button type="button" class="btn primary" data-action="go-create">${esc(c.createCta)}</button>
        <button type="button" class="btn secondary" data-action="go-browse">${esc(c.browse)}</button></div></section></div>`;
    }
    const h = this.s.hop;
    const d = h.display;
    const pending = h.status === 'PENDING_REVIEW';
    const people = h.committedSeats === 1 ? c.person : fill(c.people, { count: h.committedSeats });
    const pets = h.petCount ? ` · ${h.petCount === 1 ? c.pet : fill(c.pets, { count: h.petCount })}` : '';
    let headline = '';
    if (h.seatsToViable > 0) headline = h.seatsToViable === 1 ? c.oneMoreToViable : fill(c.moreToViable, { count: h.seatsToViable });
    else if (h.seatsToViable === 0) headline = c.viable;
    else headline = c.noModes;
    const closed = ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(h.status);
    const confirmedFull = h.status === 'CONFIRMED' && h.atCapacity;
    return `<div class="hop">
      ${this.s.banner ? `<div class="banner" role="status"><span>${esc(pending ? c.createdBannerPending : c.createdBanner)}</span>
        <button type="button" class="link" data-action="dismiss-banner" aria-label="Dismiss" style="min-height:24px;padding:0 4px">×</button></div>` : ''}
      <article class="panel">
        <p class="label badge tone-${esc(d.tone)}">${esc(d.label)}</p>
        <h1 class="h1 route">${esc(h.from.title)} <span aria-hidden="true">→</span><span class="sr"> to </span> ${esc(h.to.title)}</h1>
        <p class="when" style="margin-top:6px">${esc([h.dateLabel, h.timeText].filter(Boolean).join(' · '))}</p>
        <ul class="facts">
          ${h.creatorFirstName ? `<li>${esc(fill(c.creator, { name: h.creatorFirstName }))}</li>` : ''}
          <li>${esc(people + pets)}</li>
          ${h.flexTile ? `<li>⏱ ${esc(h.flexTile)} ${esc(this.copy.browse.tiles.flexibility)}</li>` : ''}
        </ul>
        ${d.message ? `<p class="status-msg">${esc(d.message)}</p>` : ''}
        ${closed ? '' : `<p class="headline">${esc(confirmedFull ? c.confirmedFull : headline)}</p>`}
        ${closed ? '' : `<div class="modes">${(h.modes || []).map((m) => this.modeCardHtml(m, h)).join('')}</div>`}
        ${this.s.result ? `<div class="success" role="status"><p class="success-title">${esc(this.s.result)}</p>${
          this.s.resultJoined ? `<p>${esc(c.bringMore)}</p>` : ''}</div>` : ''}
        ${this.s.step === 'join' ? this.joinFormHtml() : this.hopActionsHtml(closed)}
        ${this.s.shareOpen && !closed && this.s.step !== 'join' ? this.shareHtml(h) : ''}
        ${d.footnote && !closed ? `<p class="fine">${esc(d.footnote)}</p>` : ''}
      </article>
      <p class="center" style="margin-top:12px"><button type="button" class="link" data-action="go-browse">${esc(c.browse)}</button></p>
    </div>`;
  }

  modeCardHtml(m, hop) {
    const c = this.copy.hop;
    const pct = Math.min(100, Math.round((Math.min(hop.committedSeats, m.minSeats) / m.minSeats) * 100));
    const ladder = (m.fullLadder || [])
      .map((r) => `<li class="${r.isCurrent ? 'now' : ''}"><span>${esc(r.seats === 1 ? c.ladderPerson : fill(c.ladderPeople, { seats: r.seats }))}</span><span>${esc(money(r.perPerson))}</span></li>`)
      .join('');
    return `<section class="mode-card" aria-label="${esc(m.label)}">
      <div class="mode-head"><span class="mode-name"><span aria-hidden="true">${esc(m.icon)}</span> ${esc(m.label)}</span>${m.full ? `<span class="tag">${esc(c.full)}</span>` : ''}</div>
      <p class="mode-price"><strong>${esc(fill(c.modeEach, { price: money(m.currentPerPerson) }))}</strong><span class="muted">${esc(fill(c.modeFrom, { price: money(m.fromPrice), seats: m.maxSeats }))}</span></p>
      <div class="bar${m.viable ? ' done' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${m.minSeats}" aria-valuenow="${Math.min(hop.committedSeats, m.minSeats)}" aria-label="${esc(`${Math.min(hop.committedSeats, m.minSeats)} of ${m.minSeats} people needed`)}"><span style="width:${pct}%"></span></div>
      <p class="mode-status">${esc(m.viable ? c.modeViable : fill(c.modeMore, { count: m.seatsToViable }))}</p>
      ${ladder ? `<details><summary>${esc(c.ladderToggle)}</summary><ol class="ladder">${ladder}</ol></details>` : ''}
    </section>`;
  }

  hopActionsHtml(closed) {
    const c = this.copy.hop;
    const h = this.s.hop;
    const mine = this.s.mine;
    const parts = [];
    if (mine) parts.push(`<p class="in" role="status">${esc(c.youreIn)}</p>`);
    else if (h.joinable) parts.push(`<button type="button" class="btn primary lg" data-action="open-join">${esc(c.imIn)}</button>`);
    if (!closed) parts.push(`<button type="button" class="btn secondary lg" data-action="toggle-share" aria-expanded="${this.s.shareOpen ? 'true' : 'false'}">${esc(c.share)}</button>`);
    const leave = mine && mine.token
      ? `<p class="center"><button type="button" class="link" data-action="leave"${this.s.busy ? ' disabled' : ''}>${esc(this.s.busy ? c.leaving : c.leave)}</button></p>`
      : '';
    return `<div class="btn-row">${parts.join('')}</div>${leave}`;
  }

  shareHtml(h) {
    const c = this.copy.hop;
    const url = this.hopUrl(h.slug);
    const wa = `https://wa.me/?text=${encodeURIComponent(this.shareText(h))}`;
    const native = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    return `<div class="share" id="share-panel">
      <button type="button" class="btn secondary" data-action="copy-link">${esc(this.s.copied ? c.copied : c.copy)}</button>
      <a class="btn whatsapp" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${esc(c.whatsapp)}</a>
      ${native ? `<button type="button" class="btn secondary" data-action="native-share">${esc(c.moreShare)}</button>` : ''}
      ${this.s.shareFallback ? `<label class="field" style="flex-basis:100%">${esc(c.copyLink)}<input type="text" id="share-url" readonly value="${esc(url)}"></label>` : ''}
    </div>`;
  }

  joinFormHtml() {
    const c = this.copy.hop;
    const f = this.s.form;
    const e = this.s.errors;
    return `<form id="join-form" class="join" novalidate>
      <h2 class="h2">${esc(c.joinTitle)}</h2>
      <p class="lead">${esc(c.joinIntro)}</p>
      <div class="grid2"><div class="stack">${this.travellerFields('j', f, e)}</div>${this.flexField('j', f, e)}</div>
      ${this.returnField('j', f)}
      ${this.petFields('j', f, e)}
      <div class="stack" style="margin-top:16px">${this.maxPriceFields('j', f, e)}</div>
      ${this.contactFieldsHtml('j', f, e)}
      ${this.s.formError ? `<p class="form-error" role="alert">${esc(this.s.formError)}</p>` : ''}
      <div class="btn-row"><button type="submit" class="btn primary lg"${this.s.busy ? ' disabled' : ''}>${esc(this.s.busy ? c.joining : c.imIn)}</button>
        <button type="button" class="btn ghost" data-action="cancel-join">${esc(c.cancel)}</button></div>
      <p class="fine">${esc(this.copy.contact.privacy)}</p>
    </form>`;
  }

  async submitJoin() {
    const f = this.s.form;
    if (f.maxPrice === 'other' && (f.maxPriceOther === '' || Number(f.maxPriceOther) < 0)) {
      this.s.errors = { maxPrice: 'Please enter an amount, or choose "No maximum".' };
      this.render();
      return;
    }
    this.s.busy = true;
    this.s.errors = {};
    this.s.formError = '';
    this.render();
    const email = f.email.trim().toLowerCase();
    const res = await this.call('joinHop', this.s.slug, {
      partySize: this.partySize(f),
      pets: this.petsValue(f),
      timeFlex: f.timeFlex,
      returnNeeded: f.returnNeeded === 'yes',
      maxPrice: this.maxPriceValue(f),
      name: f.name,
      email: f.email,
      phone: f.phone,
      website: f.website,
      manageToken: this.s.mine && this.s.mine.email === email ? this.s.mine.token : undefined,
    });
    this.s.busy = false;
    if (!res.ok) {
      this.s.errors = res.fields || {};
      this.s.formError = res.fields ? '' : res.message;
      this.render();
      return;
    }
    const c = this.copy.hop;
    this.s.hop = res.data.hop;
    if (res.data.manageToken) this.s.mine = { email, token: res.data.manageToken };
    else if (!this.s.mine) this.s.mine = { email, token: null };
    await this.saveMine(this.s.slug, this.s.mine);
    this.s.result = res.data.alreadyJoined && !res.data.manageToken ? c.alreadyIn : fill(c.joinedTitle, { price: money(this.currentPrice(res.data.hop)) });
    this.s.resultJoined = true;
    this.s.step = 'view';
    this.s.shareOpen = true;
    this.resetJoinForm();
    this.render();
  }

  async leave() {
    const mine = this.s.mine;
    if (!mine || !mine.token || this.s.busy) return;
    this.s.busy = true;
    this.render();
    const res = await this.call('leaveHop', this.s.slug, mine.email, mine.token);
    this.s.busy = false;
    if (res.ok) {
      this.s.hop = res.data.hop;
      this.s.mine = null;
      await this.saveMine(this.s.slug, null);
      this.s.result = this.copy.hop.left;
      this.s.resultJoined = false;
    } else {
      this.toast(res.message);
    }
    this.render();
  }

  async copyLink(url) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch (err) {
      copied = false;
    }
    if (copied) {
      this.s.copied = true;
      this.s.shareFallback = false;
      this.render();
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => {
        this.s.copied = false;
        this.render();
      }, 2000);
    } else {
      // Clipboard blocked (e.g. Editor preview iframe): show the link to copy by hand.
      this.s.shareFallback = true;
      this.render();
      const input = this.root.getElementById('share-url');
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  async nativeShare(hop) {
    try {
      await navigator.share({ title: `${hop.from.title} → ${hop.to.title} · ${hop.dateMedium}`, text: this.shareText(hop), url: this.hopUrl(hop.slug) });
    } catch (err) {
      /* cancelled */
    }
  }

  // ---------- BROWSE + WIDGET ----------

  async initList(mode) {
    this.s = {
      mode,
      filters: { fromId: '', toId: '', days: mode === 'widget' ? 90 : this.ui.browseDefaultDays },
      locations: [],
      cards: null,
      loading: true,
      error: '',
    };
    const locs = await this.call('getLocations');
    if (locs.ok) this.s.locations = locs.data;
    this.render();
    await this.loadCards();
  }

  async loadCards() {
    this.s.loading = true;
    this.s.error = '';
    this.updateList();
    const widget = this.s.mode === 'widget';
    const res = await this.call('listOpenHops', {
      ...this.s.filters,
      sort: widget ? 'viability' : 'date',
      limit: widget ? 6 : 30,
    });
    this.s.loading = false;
    this.s.cards = res.ok ? res.data : [];
    this.s.error = res.ok ? '' : res.message;
    this.updateList();
  }

  updateList() {
    const list = this.root.getElementById('list');
    if (!list) return;
    list.setAttribute('aria-busy', this.s.loading ? 'true' : 'false');
    list.innerHTML = this.cardsHtml();
  }

  filterSelect(key, firstLabel) {
    return `<label class="chip"><span class="sr">${esc(firstLabel)}</span><select id="filter-${key}" data-filter="${key}">${options(
      [['', firstLabel]].concat(this.s.locations.map((l) => [l.id, l.title])), this.s.filters[key])}</select></label>`;
  }

  listHtml() {
    const b = this.copy.browse;
    if (this.s.mode === 'widget') {
      const w = this.copy.widget;
      return `<section class="widget" aria-labelledby="w-title">
        <div class="widget-head"><h2 class="h2" id="w-title">${esc(w.title)}</h2>
          <button type="button" class="link" data-action="go-browse">${esc(w.all)}</button></div>
        <div class="chips" style="margin-bottom:14px">${this.filterSelect('fromId', b.anyIsland)}${this.filterSelect('toId', b.anywhere)}</div>
        <div class="wgrid" id="list" aria-live="polite">${this.cardsHtml()}</div>
      </section>`;
    }
    const days = this.ui.browseWindows.map((d) => [d, fill(b.nextDays, { days: d })]);
    return `<div class="browse">
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Filter Hops">${this.filterSelect('fromId', b.anyIsland)}${this.filterSelect('toId', b.anywhere)}
          <label class="chip"><span class="sr">Dates</span><select id="filter-days" data-filter="days">${options(days, this.s.filters.days)}</select></label></div>
        <button type="button" class="btn primary" data-action="go-create">${esc(b.createButton)}</button>
      </div>
      <div class="grid" id="list" aria-live="polite">${this.cardsHtml()}</div>
    </div>`;
  }

  cardsHtml() {
    const widget = this.s.mode === 'widget';
    if (this.s.loading && !this.s.cards) return '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    if (this.s.error) return `<div class="state" role="alert" style="grid-column:1/-1"><p>${esc(this.s.error)}</p><button type="button" class="btn secondary" data-action="retry-list">Try again</button></div>`;
    if (!this.s.cards || this.s.cards.length === 0) {
      const w = this.copy.widget;
      return `<div class="empty" style="grid-column:1/-1"><p>${esc(widget ? w.emptyTitle : this.copy.browse.empty)}</p>
        <button type="button" class="btn primary" data-action="go-create">${esc(widget ? w.empty : this.copy.browse.createButton)}</button></div>`;
    }
    return this.s.cards.map((card) => (widget ? this.miniCardHtml(card) : this.cardHtml(card))).join('');
  }

  cardHtml(card) {
    const b = this.copy.browse;
    const d = card.display;
    const tiles = [
      [card.committedSeats, b.tiles.travellers],
      [card.petCount, card.petCount === 1 ? b.tiles.pet : b.tiles.pets],
      [card.flexTile, b.tiles.flexibility],
    ].map(([v, l]) => `<div class="tile"><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join('');
    let block = '';
    if (d.showPrice && card.price) {
      const rows = card.price.ladder
        .map((r) => `<div class="price-row${r.highlight ? ' hi' : ''}"><span>${esc(fill(b.ladderRow, { seats: r.seats }))}</span><span>${esc(`${money(r.perPerson)}pp`)}</span></div>`)
        .join('');
      block = `<div class="price"><p class="price-title">${esc(b.priceTitle)}</p><p class="price-total">${esc(money(card.price.totalCost))}</p>${rows}</div>`;
    } else if (d.message) {
      block = `<div class="msg">${esc(d.message)}</div>`;
    }
    const title = `${card.from.title} → ${card.to.title} · ${card.dateMedium}`;
    let actions = '';
    if (d.cta === 'join' && card.joinable) {
      actions = `<button type="button" class="btn primary lg" data-action="join-hop" data-slug="${esc(card.slug)}">${esc(b.join)}</button>
        <button type="button" class="btn secondary lg" data-action="card-share" data-slug="${esc(card.slug)}" data-title="${esc(title)}">${esc(b.share)}</button>
        ${d.footnote ? `<p class="fine">${esc(d.footnote)}</p>` : ''}`;
    } else {
      actions = `<button type="button" class="btn outline lg" data-action="open-hop" data-slug="${esc(card.slug)}">${esc(b.view)}</button>`;
    }
    return `<article class="card" aria-label="${esc(title)}">
      <p class="label tone-${esc(d.tone)}">${esc(d.label)}</p>
      <h2 class="codes">${esc(card.from.code)}<span class="arrow" aria-hidden="true">→</span><span class="sr"> to </span>${esc(card.to.code)}</h2>
      <p class="route-title">${esc(fill(b.routeTitle, { from: card.from.title, to: card.to.title }))}</p>
      <p class="when">${esc([card.dateLabel, card.timeText].filter(Boolean).join(' · '))}</p>
      <div class="tiles">${tiles}</div>
      ${block}
      ${actions}
    </article>`;
  }

  miniCardHtml(card) {
    const w = this.copy.widget;
    const people = card.committedSeats === 1 ? w.person : fill(w.people, { count: card.committedSeats });
    const more = card.seatsToViable === 0 ? w.viable : card.seatsToViable > 0 ? fill(w.more, { count: card.seatsToViable }) : '';
    return `<article class="mini">
      <p class="label tone-${esc(card.display.tone)}">${esc(card.display.label)}</p>
      <p class="mini-route"><strong>${esc(card.from.code)} → ${esc(card.to.code)}</strong>${esc(fill(this.copy.browse.routeTitle, { from: card.from.title, to: card.to.title }))}</p>
      <p class="muted">${esc([card.dateMedium, card.timeText].filter(Boolean).join(' · '))}</p>
      <p>${esc([people, more].filter(Boolean).join(' · '))}</p>
      ${card.fromPrice ? `<p class="mini-price">${esc(fill(w.from, { price: money(card.fromPrice) }))}</p>` : ''}
      <button type="button" class="btn outline" data-action="open-hop" data-slug="${esc(card.slug)}">${esc(w.view)}</button>
    </article>`;
  }

  async shareCard(slug, title) {
    const url = this.hopUrl(slug);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      this.toast(this.copy.hop.linkCopied);
    } catch (err) {
      this.toast(url);
    }
  }

  // ---------- ADMIN ----------

  async initAdmin() {
    this.s = { filter: 'PENDING_REVIEW', items: null, loading: true, error: '', details: {}, rejecting: null, reason: '', busySlug: null };
    this.render();
    await this.loadAdmin();
  }

  async loadAdmin() {
    this.s.loading = true;
    this.render();
    const res = await this.call('listHopsForAdmin', { statuses: [this.s.filter] });
    this.s.loading = false;
    this.s.items = res.ok ? res.data : [];
    this.s.error = res.ok ? '' : res.message;
    this.render();
  }

  adminHtml() {
    const sd = this.ui.statusDisplay;
    const filter = `<label class="field" for="admin-filter" style="max-width:320px">Show<select id="admin-filter" data-admin="filter">${options(
      ADMIN_FILTERS.map((s) => [s, `${(sd[s] || {}).label || s} (${s})`]), this.s.filter)}</select></label>`;
    let body;
    if (this.s.loading && !this.s.items) body = '<div class="state"><p class="muted">Loading…</p></div>';
    else if (this.s.error) body = this.stateHtml(this.s.error, 'admin-reload');
    else if (!this.s.items.length) body = '<div class="empty"><p>Nothing here.</p></div>';
    else body = this.s.items.map((h) => this.adminItemHtml(h)).join('');
    return `<section><h1 class="h1">Hop review</h1><p class="lead">Approve new Hops before they appear publicly.</p>
      <div style="margin-top:16px">${filter}</div><div aria-live="polite">${body}</div></section>`;
  }

  adminItemHtml(h) {
    const busy = this.s.busySlug === h.slug;
    const sd = this.ui.statusDisplay[h.status] || {};
    const time = h.approxTime ? `around ${h.approxTime}` : (this.ui.flexOptions.find((o) => o.value === h.timeFlex) || {}).label || '';
    const canApprove = ['PENDING_REVIEW', 'REJECTED'].includes(h.status);
    const canReject = !['CONFIRMED', 'EXPIRED', 'REJECTED'].includes(h.status);
    const canSet = !['PENDING_REVIEW', 'REJECTED'].includes(h.status);
    const detail = this.s.details[h.slug];
    const people = detail && detail.participants
      ? `<table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Seats</th><th>Pets</th><th>Max £</th><th>Status</th></tr></thead><tbody>${detail.participants
        .map((p) => `<tr><td>${esc(p.name)}${p.isCreator ? ' (creator)' : ''}</td><td>${esc(p.email)}</td><td>${esc(p.phone)}</td><td>${esc(p.partySize)}</td><td>${esc(p.pets)}</td><td>${esc(p.maxPrice === null ? '' : p.maxPrice)}</td><td>${esc(p.status)}</td></tr>`)
        .join('')}</tbody></table>`
      : '';
    return `<article class="admin-item">
      <p class="label tone-${esc(sd.tone || 'grey')}">${esc(sd.label || h.status)}</p>
      <p><strong>${esc(h.from ? h.from.code : '?')} → ${esc(h.to ? h.to.code : '?')}</strong> · ${esc(shortDate(h.departureDate))} · ${esc(time)}
        · <a href="${esc(this.hopUrl(h.slug))}" target="_blank" rel="noopener">/hop/${esc(h.slug)}</a></p>
      <p>Creator: ${esc(h.creatorName)} · <a href="mailto:${esc(h.creatorEmail)}">${esc(h.creatorEmail)}</a></p>
      <p>${esc(h.committedSeats)} travellers · ${esc(h.participantCount)} sign-ups · ${esc(h.petCount)} pets · seats to viable: ${esc(h.seatsToViable === null ? 'n/a' : h.seatsToViable)}</p>
      ${h.notes ? `<p>Notes: ${esc(h.notes)}</p>` : ''}
      ${h.petExcludedModes ? `<p class="tone-amber">${esc(h.petExcludedModes)}</p>` : ''}
      ${h.rejectionReason ? `<p class="tone-red">Rejected: ${esc(h.rejectionReason)}</p>` : ''}
      <div class="admin-actions">
        ${canApprove ? `<button type="button" class="btn primary" data-action="admin-approve" data-slug="${esc(h.slug)}"${busy ? ' disabled' : ''}>Approve</button>` : ''}
        ${canReject ? `<button type="button" class="btn secondary" data-action="admin-reject-open" data-slug="${esc(h.slug)}"${busy ? ' disabled' : ''}>Reject…</button>` : ''}
        ${canSet ? `<label class="sr" for="set-${esc(h.slug)}">Set status</label><select id="set-${esc(h.slug)}">${options(ADMIN_TARGETS, '')}</select>
          <button type="button" class="btn secondary" data-action="admin-set" data-slug="${esc(h.slug)}"${busy ? ' disabled' : ''}>Set status</button>` : ''}
        <button type="button" class="link" data-action="admin-details" data-slug="${esc(h.slug)}">${detail ? 'Hide' : 'Participants'}</button>
      </div>
      ${this.s.rejecting === h.slug ? `<div class="field" style="margin-top:12px"><label for="reason-${esc(h.slug)}">Reason (optional, private)</label>
        <textarea id="reason-${esc(h.slug)}" data-admin="reason">${esc(this.s.reason)}</textarea>
        <div class="admin-actions"><button type="button" class="btn primary" data-action="admin-reject" data-slug="${esc(h.slug)}"${busy ? ' disabled' : ''}>Confirm reject</button>
        <button type="button" class="btn ghost" data-action="admin-reject-cancel">Cancel</button></div></div>` : ''}
      ${people}
    </article>`;
  }

  async adminAction(slug, method, ...args) {
    this.s.busySlug = slug;
    this.render();
    const res = await this.call(method, slug, ...args);
    this.s.busySlug = null;
    if (res.ok) {
      this.toast(`${slug}: ${res.data.previousStatus} → ${res.data.newStatus}`);
      this.s.rejecting = null;
      this.s.reason = '';
      delete this.s.details[slug];
      await this.loadAdmin();
    } else {
      this.toast(res.message);
      this.render();
    }
  }

  // ---------- events ----------

  onInput(e) {
    const t = e.target;
    if (t.dataset && t.dataset.admin === 'reason') {
      this.s.reason = t.value;
      return;
    }
    if (this.s.form && t.name && t.name in this.s.form && t.type !== 'checkbox' && t.type !== 'radio') {
      this.s.form[t.name] = t.value;
    }
  }

  onChange(e) {
    const t = e.target;
    if (t.dataset && t.dataset.filter) {
      this.s.filters[t.dataset.filter] = t.dataset.filter === 'days' ? Number(t.value) : t.value;
      this.loadCards();
      return;
    }
    if (t.dataset && t.dataset.admin === 'filter') {
      this.s.filter = t.value;
      this.s.details = {};
      this.loadAdmin();
      return;
    }
    if (!this.s.form || !t.name || !(t.name in this.s.form)) return;
    this.s.form[t.name] = t.type === 'checkbox' ? t.checked : t.value;
    const errorKey = { travellers: 'partySize', travellersExact: 'partySize', maxPriceOther: 'maxPrice', hasPet: 'pets' }[t.name] || t.name;
    const hadError = Boolean(this.s.errors[errorKey]);
    delete this.s.errors[errorKey];
    if (this.config.view === 'create') {
      if (t.name === 'fromId' && !this.toChoices().some((l) => l.id === this.s.form.toId)) this.s.form.toId = '';
      if (['fromId', 'toId', 'departureDate', 'approxTime', 'timeFlex', 'hasPet', 'pets'].includes(t.name)) this.scheduleLookups();
    }
    // Text fields re-render only to clear an error; selects/checkboxes may change the layout.
    if (['text', 'email', 'tel', 'number'].includes(t.type) && !hadError) return;
    this.render();
  }

  onSubmit(e) {
    const id = e.target.id;
    if (id === 'create-form') {
      const errors = this.validateCreateLocally();
      this.s.errors = errors;
      this.s.formError = '';
      if (Object.keys(errors).length) {
        this.render();
        const first = { fromId: 'c-from', toId: 'c-to', departureDate: 'c-date', approxTime: 'c-time', maxPrice: 'c-maxother' }[Object.keys(errors)[0]];
        if (first) this.focus(first);
        return;
      }
      this.s.step = 'contact';
      this.render();
      this.focus('k-name');
    } else if (id === 'contact-form') {
      if (!this.s.busy) this.submitCreate();
    } else if (id === 'join-form') {
      if (!this.s.busy) this.submitJoin();
    }
  }

  onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const { action, slug, title } = el.dataset;
    const actions = {
      'retry-start': () => {
        this.started = false;
        this.start();
      },
      'go-create': () => this.go(this.config.pages.create),
      'go-browse': () => this.go(this.config.pages.browse),
      'open-hop': () => this.go(this.hopPath(slug)),
      'join-hop': () => this.go(this.hopPath(slug, 'join=1')),
      back: () => {
        this.s.step = 'form';
        this.s.formError = '';
        this.render();
      },
      'open-join': () => {
        this.s.step = 'join';
        this.s.result = '';
        this.render();
        this.focus('j-travellers');
      },
      'cancel-join': () => {
        this.s.step = 'view';
        this.s.errors = {};
        this.s.formError = '';
        this.render();
      },
      'toggle-share': () => {
        this.s.shareOpen = !this.s.shareOpen;
        this.render();
      },
      'copy-link': () => this.copyLink(this.hopUrl(this.s.hop.slug)),
      'native-share': () => this.nativeShare(this.s.hop),
      'card-share': () => this.shareCard(slug, title),
      leave: () => this.leave(),
      'dismiss-banner': () => {
        this.s.banner = false;
        this.render();
      },
      'retry-list': () => this.loadCards(),
      'admin-reload': () => this.loadAdmin(),
      'admin-approve': () => this.adminAction(slug, 'approveHop'),
      'admin-reject-open': () => {
        this.s.rejecting = slug;
        this.s.reason = '';
        this.render();
        this.focus(`reason-${slug}`);
      },
      'admin-reject-cancel': () => {
        this.s.rejecting = null;
        this.render();
      },
      'admin-reject': () => this.adminAction(slug, 'rejectHop', this.s.reason),
      'admin-set': () => {
        const select = this.root.getElementById(`set-${slug}`);
        if (select) this.adminAction(slug, 'setHopStatus', select.value);
      },
      'admin-details': async () => {
        if (this.s.details[slug]) {
          delete this.s.details[slug];
          this.render();
          return;
        }
        const res = await this.call('getHopForAdmin', slug);
        if (res.ok) this.s.details[slug] = res.data;
        else this.toast(res.message);
        this.render();
      },
    };
    if (actions[action]) actions[action]();
  }
}

try {
  if (customElements.get('hop-app')) {
    console.warn('[hops] "hop-app" was already defined by another script; ours was not registered'); // TEMP diagnostics
  } else {
    customElements.define('hop-app', HopApp);
    console.info('[hops] <hop-app> defined'); // TEMP diagnostics
  }
} catch (err) {
  console.error('[hops] customElements.define failed', err);
}
