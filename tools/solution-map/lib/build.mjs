// One build of the map: fetch every repository and then the backlog's branch, build the overview,
// ask each live page whether it answers, and adapt the result into the view model.
import fs from 'node:fs';
import { buildOverview } from '../../overview/overview.mjs';
import { Repo } from '../../gate/lib/git.mjs';
import { parseItem, itemPath } from '../../backlog/lib/item.mjs';
import { fetchBacklog as fetchBranch } from '../../backlog/lib/store.mjs';
import { adapt, emptyModel, webBase, OVERVIEW_VERSION } from './adapt.mjs';
import { fetchRepo as fetchOne, remoteUrl } from './sources.mjs';

/** Whether anything answers at an address within 2 s. */
export async function probeUrl(url) {
  try {
    await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {object} o
 * @param {{ id: string, dir: string }[]} o.repos
 * @param {string|null} [o.pages] the base address of the project's pages
 * @param {Function} [o.overview] `(repos) => overview JSON`; the kit's overview by default
 * @param {Function} [o.fetchRepo] `(dir) => { state, fetchedAt }`
 * @param {Function} [o.probe] `(url) => boolean`
 * @param {Function} [o.webOf] `(dir) => GitHub web base | null`
 * @param {{ dir: string, branch: string }|null} [o.backlog] where the backlog lives, as `locateBacklog` gives it
 * @param {Function} [o.fetchBacklog] `(where) => { state, tip, error? }`
 * @returns {Promise<{ model: object, dirs: Record<string, string>, commits: Record<string, string>, backlog: object|null }>}
 *   `backlog` is the backlog's fetch: `{ state: 'current'|'absent'|'unreachable', tip, error? }`, or null without one
 */
export async function buildMap({ repos, pages = null, overview = buildOverview, fetchRepo = fetchOne, probe = probeUrl, webOf = async (dir) => webBase(await remoteUrl(dir)), fromFile = false, backlog = null, fetchBacklog = fetchBacklogIn }) {
  if (fromFile) {
    // A saved overview: no repository is fetched or read; its boards are not served.
    const ov = await overview([]);
    if (ov?.version !== OVERVIEW_VERSION) return { model: emptyModel([{ kind: 'version', found: ov?.version ?? null, reads: OVERVIEW_VERSION }]), dirs: {}, commits: {}, backlog: null };
    const model = adapt(ov, { pages });
    for (const f of Object.values(model.features)) for (const l of f.looks) if (l.kind === 'board') l.unserved = true;
    return { model, dirs: {}, commits: {}, backlog: null };
  }
  const fetched = await Promise.all(repos.map((r) => fetchRepo(r.dir)));
  // The backlog's branch after the repositories' own fetch, never beside it: two fetches in one
  // repository race for its refs.
  const branch = backlog ? await fetchBacklog(backlog) : null;
  const states = Object.fromEntries(repos.map((r, i) => [r.id, { ...fetched[i], dir: r.dir }]));
  const present = repos.filter((r) => states[r.id].state !== 'missing');
  const dirs = Object.fromEntries(present.map((r) => [r.id, r.dir]));
  // A map with no overview: each repository's state and banner, and the banners given.
  const plain = (banners) => ({ model: emptyModel(banners, repos.map((r) => ({ id: r.id, name: r.id, commit: null, state: states[r.id].state, fetchedAt: states[r.id].fetchedAt ?? null, web: null, dir: r.dir }))), dirs, commits: {}, backlog: branch });
  if (!present.length) return plain([]);
  let ov;
  try {
    ov = await overview(present.map((r) => ({ id: r.id, dir: r.dir, ref: 'origin/main' })));
  } catch (e) {
    return plain([{ kind: 'overview-error', message: String(e.message || e) }]);
  }
  if (ov?.version !== OVERVIEW_VERSION) return plain([{ kind: 'version', found: ov?.version ?? null, reads: OVERVIEW_VERSION }]);
  const webs = Object.fromEntries(await Promise.all(present.map(async (r) => [r.id, await webOf(r.dir)])));
  const commits = Object.fromEntries((ov.repos || []).map((r) => [r.id, r.commit]));
  const ctx = { repoStates: states, webs, pages };
  const urls = [...new Set(Object.values(adapt(ov, ctx).features).flatMap((f) => f.looks).filter((l) => l.kind === 'page' && l.url).map((l) => l.url))];
  const answered = await Promise.all(urls.map((u) => probe(u)));
  const pageAnswers = Object.fromEntries(urls.map((u, i) => [u, answered[i]]));
  return { model: adapt(ov, { ...ctx, pageAnswers }), dirs, commits, backlog: branch };
}

/** `fetchBacklog`, which says `unreachable` for a folder that is not there instead of throwing. */
async function fetchBacklogIn(where) {
  if (!fs.existsSync(where.dir)) return { state: 'unreachable', tip: null, error: `no repository at ${where.dir}` };
  return fetchBranch(where);
}

/**
 * Who gave each held draft's field the value it holds on the backlog's branch: per draft key, the
 * git name of the newest commit at `tip` that changed that field of the request, or null.
 * @param {{ dir: string }} where
 * @param {string|null} tip the branch's commit read
 * @param {object[]} drafts as `readDrafts` gives them
 * @returns {Record<string, string|null>}
 */
export function heldBy(where, tip, drafts) {
  const out = {};
  const held = drafts.filter((d) => d.held && d.id !== undefined);
  if (!tip || !held.length) return out;
  const repo = new Repo(where.dir);
  for (const d of held) {
    const field = d.op === 'move' ? 'state' : d.field;
    const p = itemPath(d.id);
    const log = repo.git(['log', '--format=%H%x00%an', tip, '--', p], { allowFail: true });
    const versions = log.status === 0 ? String(log.stdout).split('\n').filter(Boolean).map((l) => l.split('\0')) : [];
    const value = (sha) => {
      const text = repo.text(sha, p);
      return text === null ? undefined : JSON.stringify(parseItem(text, { id: d.id })[field]);
    };
    // Newest first: the first version whose field differs from the one before it set the value.
    const i = versions.findIndex(([sha], n) => !versions[n + 1] || value(sha) !== value(versions[n + 1][0]));
    out[d.key] = i < 0 ? null : versions[i][1];
  }
  return out;
}
