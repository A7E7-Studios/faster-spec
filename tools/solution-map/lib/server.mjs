// The map's HTTP server, on 127.0.0.1 only: the page, its data, Refresh, the design boards, Restart
// to update for a launched map, and the backlog: its view, the drafts and Submit, the only writes
// the map makes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAt } from './sources.mjs';
import { heldBy } from './build.mjs';
import { backlogView } from './backlog-view.mjs';
import { backlogTip, readBacklog, gitIdentity } from '../../backlog/lib/store.mjs';
import { fieldOf } from '../../backlog/lib/ops.mjs';
import { withShownStates } from '../../backlog/lib/state.mjs';
import { readDrafts, saveDraft, dropDraft, submitDrafts, DRAFTS_BUSY } from '../../backlog/lib/drafts.mjs';

export const PAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'page');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const JSON_TYPE = 'application/json; charset=utf-8';
const VIEW = /^\/(?:$|waiting(?:\/|$)|explore(?:\/|$)|search(?:\/|$)|backlog(?:\/|$))/;
/** The largest body a write takes, in bytes. */
export const MAX_BODY = 256 * 1024;
/** How long a restart waits for the answers under way to be written before it hands over, in ms. */
export const RESTART_WAIT = 10000;
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

/** Why a draft is not changed while a Submit is out: the drafts it sends stay as it sends them. */
export const SENDING = 'Submit is sending your drafts; try again once it is done.';

/**
 * @param {object} o
 * @param {() => Promise<{ model, dirs, commits, backlog? }>} o.build one build of the map; its
 *   `backlog` is the backlog's fetch (`buildMap`)
 * @param {() => Promise<string|Buffer|null>} [o.theme] the project's `kit-pages/theme.css`, served as `/theme.css`; null when it has none
 * @param {() => Promise<{ ok: boolean, error?: string }>} [o.review] opens CueReview
 * @param {{ where?: { dir: string, branch: string, repo: string|null }, repos?: { dir: string }[], net?: Function, error?: string }|null} [o.backlog]
 *   where the backlog lives (`locateBacklog`) and the solution's repositories, or why there is none;
 *   `net`, the runner for Submit's fetches and push (`submitDrafts`), git by default
 * @param {(() => Promise<{ ok: true, handOver: () => void } | { ok: false, error: string }>)|null} [o.restart]
 *   Restart to update, for a map the launcher started: whether it can, and `handOver`, run once the
 *   answer is sent, the fetches and Submits before it are done, and the server has stopped with
 *   every answer under way written
 * @returns {{ server: http.Server, refresh: () => Promise<object>, listen: (port: number, o?: { wait?: number }) => Promise<number> }}
 */
export function createMapServer({ build, theme = async () => null, review = async () => ({ ok: false, error: 'Start review is not set up here.' }), backlog = null, restart = null }) {
  let current = null;
  let pending = null;
  let fetched = null; // the backlog's last fetch, or Submit's: { state, error? }
  let restarting = false; // a restart was answered: no fetch or Submit starts any more
  let closing = false; // the server is stopping for the hand-over
  const open = new Set(); // the answers not yet written
  // Fetches and pushes take turns: two at once in one repository race for its refs.
  let turn = Promise.resolve();
  const inTurn = (fn) => {
    const run = turn.then(() => fn());
    turn = run.catch(() => {});
    return run;
  };
  const refresh = () => {
    // A build asked for once the restart is under way would wait behind the hand-over for ever.
    if (!pending && restarting) return Promise.reject(new Refused(409, 'the map is restarting'));
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
  // A move or an edit of a sent request keeps the value it was made over: for a held draft changed
  // again, the other person's value it was held over, which the page shows; for another changed
  // draft, its own; else the branch's as last read. Submit then holds it when someone changed the
  // field meanwhile, instead of writing over theirs.
  const withFrom = (save, b) => {
    if ((save.op !== 'move' && save.op !== 'edit') || save.from !== undefined || save.id === undefined) return save;
    const prev = save.key === undefined ? null : readDrafts(where.dir).find((d) => d.key === save.key);
    if (prev && prev.id === save.id && prev.op === save.op && fieldOf(prev) === fieldOf(save)) {
      if (prev.held) return { ...save, from: prev.held.theirs };
      if (prev.from !== undefined) return { ...save, from: prev.from };
    }
    const item = readBranch(b).items.find((i) => i.id === save.id);
    return item && !item.problems.length ? { ...save, from: item[fieldOf(save)] } : save;
  };
  // How many Submits this map has out: a draft change waits for none of them, it is refused at once.
  // The drafts lock (drafts.mjs) keeps it from one another map on the clone has out.
  let sending = 0;
  /** POST /api/drafts: `{ save }` adds a draft, or changes the one its `key` names; `{ drop }` drops one; `{ apply }` applies a held one again over the other person's value. */
  const changeDrafts = async (req) => {
    const body = await readJson(req);
    const off = noBacklog();
    if (off) throw new Refused(409, off);
    const b = await latest();
    // From here the drafts lock is tried before anything waits, so no Submit of this map starts in between.
    if (sending) throw new Refused(409, SENDING);
    let draft = null;
    try {
      if (typeof body.drop === 'string') await dropDraft(where.dir, body.drop);
      else if (typeof body.apply === 'string') {
        const d = readDrafts(where.dir).find((x) => x.key === body.apply);
        if (!d?.held) throw new Error(`no held draft "${body.apply}"`);
        draft = (await saveDraft(where.dir, { ...d, from: d.held.theirs })).draft;
      } else if (body.save && typeof body.save === 'object' && !Array.isArray(body.save)) draft = (await saveDraft(where.dir, withFrom(body.save, b))).draft;
      else throw new Error('send { "save": <draft> }, { "drop": "<key>" } or { "apply": "<key>" }');
    } catch (e) {
      // The drafts are held: by this map's own Submit, begun while the change waited, its refusal;
      // else another map on this computer holds them, the same refusal shape.
      if (e.code === DRAFTS_BUSY) throw new Refused(409, sending ? SENDING : e.message);
      throw new Refused(400, e.message);
    }
    return { ok: true, draft, backlog: await backlogModel() };
  };
  /** POST /api/submit: every draft as one commit, in turn with the fetches. */
  const submit = async (req) => {
    await readJson(req);
    const off = noBacklog();
    if (off) throw new Refused(409, off);
    if (restarting) throw new Refused(409, 'the map is restarting');
    sending++;
    let s;
    try {
      s = await inTurn(() => submitDrafts(where, { net: backlog.net }));
    } finally {
      sending--;
    }
    // Another map on this computer is sending these drafts: nothing was sent from here.
    if (s.busy) throw new Refused(409, s.error);
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

  /**
   * Stops the server for the hand-over: it takes no new connection, each connection closes once its
   * answer is out, and it resolves when every answer under way is written (RESTART_WAIT at most),
   * the last connections closed. A request that comes meanwhile is answered 503.
   */
  const drain = async () => {
    closing = true;
    server.close();
    for (const r of open) r.shouldKeepAlive = false;
    server.closeIdleConnections();
    let timer;
    const written = Promise.all([...open].map((r) => new Promise((done) => r.once('close', done))));
    await Promise.race([written, new Promise((done) => { timer = setTimeout(done, RESTART_WAIT); })]);
    clearTimeout(timer);
    server.closeAllConnections();
  };
  /**
   * POST /api/restart: answers `{ ok: true }`, then hands over to the launcher (`restart().handOver`)
   * in turn with the fetches and Submits: one out finishes first, so the map never exits between a
   * push and the drafts it sent being cleared, and its answer is written before the server stops
   * (`drain`). Nothing in turn after it runs.
   */
  const restartMap = async (req, res) => {
    await readJson(req);
    if (!restart) throw new Refused(409, 'only a map its shortcut opened restarts; start this one again from its checkout');
    if (restarting) throw new Refused(409, 'the map is restarting');
    const r = await restart();
    if (!r?.ok) throw new Refused(409, r?.error || 'the map cannot restart');
    restarting = true;
    // Only once the page has the answer; a page gone before it can ask again.
    res.once('close', () => {
      if (!res.writableFinished) { restarting = false; return; }
      inTurn(() => new Promise((_, failed) => { drain().then(() => r.handOver()).catch(failed); })).catch(() => { restarting = false; });
    });
    return send(res, 200, JSON_TYPE, JSON.stringify({ ok: true }));
  };

  const server = http.createServer(async (req, res) => {
    if (closing) {
      res.shouldKeepAlive = false;
      return send(res, 503, 'text/plain', 'the map is restarting');
    }
    open.add(res);
    res.once('close', () => open.delete(res));
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
        if (p === '/api/restart') return await restartMap(req, res);
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
      if (p === '/theme.css') return send(res, 200, TYPES['.css'], (await theme()) ?? '');
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

  /**
   * Listens on 127.0.0.1 at `port`, or the next free port of the 20 after it; resolves the port.
   * With `wait` (ms), a taken `port` is tried again for that long first: the map a restart replaces
   * may still be closing it.
   */
  const listen = (port, { wait = 0 } = {}) => new Promise((resolve, reject) => {
    const until = Date.now() + wait;
    let tries = 0;
    const attempt = (p) => {
      const onError = (e) => {
        server.off('listening', onListening);
        if (e.code !== 'EADDRINUSE' || p === 0) reject(e);
        else if (p === port && Date.now() < until) setTimeout(() => attempt(p), 250);
        else if (++tries <= 20) attempt(p + 1);
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
