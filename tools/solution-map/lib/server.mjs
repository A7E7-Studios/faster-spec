// The map's HTTP server, on 127.0.0.1 only: the page, its data, Refresh, the design boards, and the
// backlog: its view, the drafts and Submit, the only writes the map makes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAt } from './sources.mjs';
import { heldBy } from './build.mjs';
import { backlogView } from './backlog-view.mjs';
import { backlogTip, readBacklog, gitIdentity } from '../../backlog/lib/store.mjs';
import { withShownStates } from '../../backlog/lib/state.mjs';
import { readDrafts, saveDraft, dropDraft, submitDrafts } from '../../backlog/lib/drafts.mjs';

export const PAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'page');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const JSON_TYPE = 'application/json; charset=utf-8';
const VIEW = /^\/(?:$|waiting(?:\/|$)|explore(?:\/|$)|search(?:\/|$)|backlog(?:\/|$))/;
/** The largest body a write takes, in bytes. */
export const MAX_BODY = 256 * 1024;
const BOARD = /^\/board\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(specs\/[a-z0-9/-]+\/looks\/[a-z0-9-]+\.html)$/;

/**
 * A board showing only its `<section id="<id>">`, or the whole board when no id is given; null when
 * the board holds no such section. Hidden is every section that is not the chosen one, not inside
 * it and not holding it, so a section's own nested sections still show.
 */
export function withSection(html, id) {
  if (!id) return html;
  if (!/^[A-Za-z][\w-]*$/.test(id) || !new RegExp(`<section\\b[^>]*\\sid=["']${id}["']`).test(html)) return null;
  const style = `<style>section:not(#${id}):not(#${id} section):not(:has(#${id})){display:none!important}</style>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${style}</head>`) : style + html;
}

/**
 * Whether a request's `Host` names this server: `127.0.0.1:<port>` or `localhost:<port>`. Another
 * name pointed at 127.0.0.1 (DNS rebinding) would otherwise make another site's page same-origin.
 */
export function hostAllowed(host, port) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/**
 * Whether a request's `Origin`, when it carries one, is this server's own page. A browser names the
 * page a write comes from; a program that names none is not a page.
 */
export function originAllowed(origin, port) {
  return origin === undefined || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
  res.end(body);
}

/** A request refused: its status, and the reason the page shows, sent as `{ ok: false, error }`. */
class Refused extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** A write's body as a JSON object, `{}` when empty; anything but JSON of at most MAX_BODY bytes is refused. */
function readJson(req) {
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return Promise.reject(new Refused(415, 'a write is JSON, sent as application/json'));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (size > MAX_BODY) return reject(new Refused(413, `a write is at most ${MAX_BODY / 1024} KiB`));
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve({});
      let v;
      try {
        v = JSON.parse(text);
      } catch (e) {
        return reject(new Refused(400, `the body is not JSON: ${e.message}`));
      }
      if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(new Refused(400, 'the body is a JSON object'));
      return resolve(v);
    });
  });
}

const fieldOf = (d) => (d.op === 'move' ? 'state' : d.field);

/**
 * @param {object} o
 * @param {() => Promise<{ model, dirs, commits, backlog? }>} o.build one build of the map; its
 *   `backlog` is the backlog's fetch (`buildMap`)
 * @param {string|null} [o.themeFile] the project's `kit-pages/theme.css`, served as `/theme.css` when it exists
 * @param {() => Promise<{ ok: boolean, error?: string }>} [o.review] opens CueReview
 * @param {{ where?: { dir: string, branch: string, repo: string|null }, repos?: { dir: string }[], error?: string }|null} [o.backlog]
 *   where the backlog lives (`locateBacklog`) and the solution's repositories, or why there is none
 * @returns {{ server: http.Server, refresh: () => Promise<object>, listen: (port: number) => Promise<number> }}
 */
export function createMapServer({ build, themeFile = null, review = async () => ({ ok: false, error: 'Start review is not set up here.' }), backlog = null }) {
  let current = null;
  let pending = null;
  let fetched = null; // the backlog's last fetch, or Submit's: { state, error? }
  // Fetches and pushes take turns: two at once in one repository race for its refs.
  let turn = Promise.resolve();
  const inTurn = (fn) => {
    const run = turn.then(() => fn());
    turn = run.catch(() => {});
    return run;
  };
  const refresh = () => {
    pending ??= inTurn(build).then((b) => { current = b; fetched = b.backlog ?? null; return b; }).finally(() => { pending = null; });
    return pending;
  };
  const latest = async () => current || refresh();

  const where = backlog?.where ?? null;
  const noBacklog = () => {
    if (!where) return `this map has no backlog${backlog?.error ? `: ${backlog.error}` : ''}`;
    return fs.existsSync(where.dir) ? null : `no repository at ${where.dir}`;
  };
  let read = null; // the branch as last read: { tip, build, items, problems }
  /** The branch as this clone last fetched it, each item with the state it shows; read again when the tip or main moved. */
  const readBranch = (b) => {
    const tip = backlogTip(where);
    if (!read || read.tip !== tip || read.build !== b) {
      const r = readBacklog(where, { tip });
      read = { tip, build: b, items: withShownStates(r.items, backlog.repos ?? []), problems: r.problems };
    }
    return read;
  };
  /** The backlog's view model: the branch as last fetched, with this clone's drafts on it. */
  const backlogModel = async (submit = null) => {
    const b = await latest();
    const features = b.model?.features ?? {};
    const off = noBacklog();
    if (off) return backlogView({ status: { state: 'unavailable', error: where || backlog?.error ? off : null }, features, where, submit });
    const { tip, items, problems } = readBranch(b);
    let drafts = [];
    let draftsError = null;
    try {
      drafts = readDrafts(where.dir);
    } catch (e) {
      draftsError = e.message;
    }
    const status = fetched ?? { state: tip ? 'current' : 'absent' };
    return backlogView({ items, drafts, features, me: gitIdentity(where.dir)?.name ?? null, status, problems, heldBy: heldBy(where, tip, drafts), where, submit, draftsError });
  };
  // A move or an edit of a sent request keeps the value it was made over: the draft's own when it
  // is changed, else the branch's as last read. Submit then holds it when someone changed the field
  // meanwhile, instead of writing over theirs.
  const withFrom = (save, b) => {
    if ((save.op !== 'move' && save.op !== 'edit') || save.from !== undefined || save.id === undefined) return save;
    const prev = save.key === undefined ? null : readDrafts(where.dir).find((d) => d.key === save.key);
    if (prev && prev.from !== undefined && prev.id === save.id && prev.op === save.op && fieldOf(prev) === fieldOf(save)) return { ...save, from: prev.from };
    const item = readBranch(b).items.find((i) => i.id === save.id);
    return item && !item.problems.length ? { ...save, from: item[fieldOf(save)] } : save;
  };
  /** POST /api/drafts: `{ save }` adds a draft, or changes the one its `key` names; `{ drop }` drops one; `{ apply }` applies a held one again over the other person's value. */
  const changeDrafts = async (req) => {
    const body = await readJson(req);
    const off = noBacklog();
    if (off) throw new Refused(409, off);
    const b = await latest();
    let draft = null;
    try {
      if (typeof body.drop === 'string') dropDraft(where.dir, body.drop);
      else if (typeof body.apply === 'string') {
        const d = readDrafts(where.dir).find((x) => x.key === body.apply);
        if (!d?.held) throw new Error(`no held draft "${body.apply}"`);
        draft = saveDraft(where.dir, { ...d, from: d.held.theirs }).draft;
      } else if (body.save && typeof body.save === 'object' && !Array.isArray(body.save)) draft = saveDraft(where.dir, withFrom(body.save, b)).draft;
      else throw new Error('send { "save": <draft> }, { "drop": "<key>" } or { "apply": "<key>" }');
    } catch (e) {
      throw new Refused(400, e.message);
    }
    return { ok: true, draft, backlog: await backlogModel() };
  };
  /** POST /api/submit: every draft as one commit, in turn with the fetches. */
  const submit = async (req) => {
    await readJson(req);
    const off = noBacklog();
    if (off) throw new Refused(409, off);
    const s = await inTurn(() => submitDrafts(where));
    if (s.ok) fetched = { state: 'current', tip: backlogTip(where) };
    return {
      ok: s.ok,
      unreachable: !!s.unreachable,
      error: s.error ?? null,
      commit: s.commit ?? null,
      sent: s.sent.map((d) => ({ key: d.key, op: d.op, id: d.id ?? null })),
      held: s.held.map((d) => ({ key: d.key, op: d.op, id: d.id ?? null, field: fieldOf(d), theirs: d.held.theirs, yours: d.to })),
      refused: s.refused.map((d) => ({ key: d.key, op: d.op, reason: d.refused })),
      backlog: await backlogModel(s),
    };
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (!hostAllowed(req.headers.host, server.address()?.port)) return send(res, 403, 'text/plain', 'this server answers only to 127.0.0.1 and localhost');
      const url = new URL(req.url, 'http://127.0.0.1');
      const p = decodeURIComponent(url.pathname);
      if (req.method === 'GET' && p === '/api/map') return send(res, 200, JSON_TYPE, JSON.stringify((await latest()).model));
      if (req.method === 'GET' && p === '/api/backlog') return send(res, 200, JSON_TYPE, JSON.stringify(await backlogModel()));
      if (req.method === 'POST') {
        // Only the map's own page sends this header; a page of another site cannot without the
        // browser asking this server first, which it never allows. A browser names the page a
        // request comes from in Origin, and it must be this one.
        if (req.headers['x-solution-map'] !== '1' || !originAllowed(req.headers.origin, server.address()?.port)) return send(res, 403, 'text/plain', 'only the map’s page may ask this');
        if (p === '/api/refresh') return send(res, 200, JSON_TYPE, JSON.stringify((await refresh()).model));
        if (p === '/api/review') return send(res, 200, JSON_TYPE, JSON.stringify(await review()));
        if (p === '/api/drafts') return send(res, 200, JSON_TYPE, JSON.stringify(await changeDrafts(req)));
        if (p === '/api/submit') return send(res, 200, JSON_TYPE, JSON.stringify(await submit(req)));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'method not allowed');
      const b = BOARD.exec(p);
      if (b) {
        const { dirs, commits } = await latest();
        const body = dirs[b[1]] && commits[b[1]] ? await readAt(dirs[b[1]], commits[b[1]], b[2]) : null;
        if (!body) return send(res, 404, 'text/plain', 'no such board at the commit read');
        const html = withSection(String(body), url.searchParams.get('section'));
        if (html === null) return send(res, 404, 'text/plain', 'the board has no such section');
        return send(res, 200, TYPES['.html'], html, { 'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:" });
      }
      if (p === '/theme.css') {
        const css = themeFile && fs.existsSync(themeFile) ? fs.readFileSync(themeFile) : '';
        return send(res, 200, TYPES['.css'], css);
      }
      if (p.startsWith('/page/')) {
        const name = p.slice('/page/'.length);
        if (!/^[a-z-]+\.(css|mjs|svg)$/.test(name)) return send(res, 404, 'text/plain', 'not found');
        const file = path.join(PAGE_DIR, name);
        if (!fs.existsSync(file)) return send(res, 404, 'text/plain', 'not found');
        return send(res, 200, TYPES[path.extname(name)], fs.readFileSync(file));
      }
      if (VIEW.test(p)) return send(res, 200, TYPES['.html'], fs.readFileSync(path.join(PAGE_DIR, 'index.html')));
      return send(res, 404, 'text/plain', 'not found');
    } catch (e) {
      if (e instanceof Refused) return send(res, e.status, JSON_TYPE, JSON.stringify({ ok: false, error: e.message }));
      return send(res, 500, 'text/plain', String(e.message || e));
    }
  });

  /** Listens on 127.0.0.1 at `port`, or the next free port of the 20 after it; resolves the port. */
  const listen = (port) => new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = (p) => {
      const onError = (e) => {
        server.off('listening', onListening);
        if (e.code === 'EADDRINUSE' && p !== 0 && ++tries <= 20) attempt(p + 1);
        else reject(e);
      };
      const onListening = () => { server.off('error', onError); resolve(server.address().port); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(p, '127.0.0.1');
    };
    attempt(port);
  });

  return { server, refresh, listen };
}
