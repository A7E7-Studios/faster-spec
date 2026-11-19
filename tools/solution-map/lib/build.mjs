// One build of the map: fetch every repository and then the backlog's branch, bring the blobs a
// clone made without them lacks, build the overview, ask each live page whether it answers, adapt
// the result into the view model, and for a launched map, say when main holds a newer map.
import path from 'node:path';
import { buildOverview } from '../../overview/overview.mjs';
import { Repo, gitAsync, lastLine } from '../../gate/lib/git.mjs';
import { fetchRepo as fetchOne, samePath } from '../../gate/lib/repos.mjs';
import { SPEC_FILE } from '../../gate/lib/spec.mjs';
import { parseItem, itemPath } from '../../backlog/lib/item.mjs';
import { fieldOf } from '../../backlog/lib/ops.mjs';
import { fetchBacklog as fetchBranch } from '../../backlog/lib/store.mjs';
import { mainMapTree, missingObjects, fetchObjects } from '../launcher/launch.mjs';
import { adapt, emptyModel, webBase, OVERVIEW_VERSION } from './adapt.mjs';
import { remoteUrl } from './sources.mjs';

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
 * @param {{ tree: string, root: string }|null} [o.launched] for a map the launcher started: the tree id
 *   of the map's code it runs and the clone it runs for; a different one on that clone's `origin/main`
 *   gives the banner `{ kind: 'map-update', tree }`
 * @param {Function} [o.mapTreeOf] `(root) => tree id | null`, the map's code on `origin/main`
 * @param {Function} [o.prefetch] `(dir, { main, trees }) => void`, see `prefetchClone`
 * @returns {Promise<{ model: object, dirs: Record<string, string>, commits: Record<string, string>, backlog: object|null }>}
 *   `backlog` is the backlog's fetch: `{ state: 'current'|'absent'|'unreachable', tip, error? }`, or null without one
 */
export async function buildMap({
  repos, pages = null, overview = buildOverview, fetchRepo = fetchOne, probe = probeUrl, webOf = async (dir) => webBase(await remoteUrl(dir)),
  fromFile = false, backlog = null, fetchBacklog = fetchBranch, launched = null, mapTreeOf = mainMapTree, prefetch = prefetchClone,
}) {
  if (fromFile) {
    // A saved overview: no repository is fetched or read; its boards are not served.
    const ov = await overview([]);
    if (ov?.version !== OVERVIEW_VERSION) return { model: emptyModel([{ kind: 'version', found: ov?.version ?? null, reads: OVERVIEW_VERSION }]), dirs: {}, commits: {}, backlog: null };
    const model = adapt(ov, { pages });
    for (const f of Object.values(model.features)) for (const l of f.looks) if (l.kind === 'board') l.unserved = true;
    return { model, dirs: {}, commits: {}, backlog: null };
  }
  // The clone a launched map runs for is fetched with the others, should the config not list it.
  const extra = launched && !repos.some((r) => samePath(r.dir, launched.root)) ? [launched.root] : [];
  const fetched = await Promise.all([...repos.map((r) => r.dir), ...extra].map((dir) => fetchRepo(dir)));
  // The backlog's branch after the repositories' own fetch, never beside it: two fetches in one
  // repository race for its refs.
  const branch = backlog ? await fetchBacklog(backlog) : null;
  const states = Object.fromEntries(repos.map((r, i) => [r.id, { ...fetched[i], dir: r.dir }]));
  await prefetchBuild({ repos, states, backlog, branch, prefetch });
  const update = launched ? await mapUpdate(launched, mapTreeOf) : [];
  const present = repos.filter((r) => states[r.id].state !== 'missing');
  const dirs = Object.fromEntries(present.map((r) => [r.id, r.dir]));
  const withUpdate = (b) => ({ ...b, model: { ...b.model, banners: [...update, ...b.model.banners] } });
  // A map with no overview: each repository's state and banner, and the banners given.
  const plain = (banners) => withUpdate({ model: emptyModel(banners, repos.map((r) => ({ id: r.id, name: r.id, commit: null, state: states[r.id].state, fetchedAt: states[r.id].fetchedAt ?? null, web: null, dir: r.dir }))), dirs, commits: {}, backlog: branch });
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
  return withUpdate({ model: adapt(ov, { ...ctx, pageAnswers }), dirs, commits, backlog: branch });
}

/** `[{ kind: 'map-update', tree }]` when the launched map's clone holds another map on `origin/main`, else `[]`. */
async function mapUpdate(launched, mapTreeOf) {
  try {
    const tree = await mapTreeOf(launched.root);
    return tree && tree !== launched.tree ? [{ kind: 'map-update', tree }] : [];
  } catch {
    return []; // the map runs on; the next build asks again
  }
}

/** A clone's git directory shared by its worktrees, or null. */
async function commonDir(dir) {
  const r = await gitAsync(dir, ['rev-parse', '--git-common-dir']);
  return r.ok ? path.resolve(dir, String(r.out).trim()) : null;
}

/**
 * Brings the blobs this build reads, one request per clone made without them: main's files in each
 * repository fetched now, and the backlog's items with the clone it lives in (its own request when
 * it lives in none of them).
 */
async function prefetchBuild({ repos, states, backlog, branch, prefetch }) {
  const clones = repos.filter((r) => states[r.id].state === 'current').map((r) => ({ dir: r.dir, main: true, trees: [] }));
  if (backlog && branch?.state === 'current' && branch.tip) {
    const home = await commonDir(backlog.dir);
    const commons = await Promise.all(clones.map((c) => commonDir(c.dir)));
    const at = clones.find((c, i) => home && commons[i] && samePath(home, commons[i]));
    const tree = `${branch.tip}^{tree}`;
    if (at) at.trees.push(tree);
    else clones.push({ dir: backlog.dir, main: false, trees: [tree] });
  }
  await Promise.all(clones.map((c) => prefetch(c.dir, c)));
}

/** How long the one request for a clone's missing blobs may take, in ms. */
export const PREFETCH_TIMEOUT = 10 * 60 * 1000;

/** Whether a clone was made without blobs from origin: origin is its promisor remote (`extensions.partialClone` in older clones). */
async function fetchesBlobsFromOrigin(dir) {
  const r = await gitAsync(dir, ['config', '--get-regexp', '^(remote\\.origin\\.promisor|extensions\\.partialclone)$']);
  if (!r.ok) return false;
  return String(r.out).split('\n').some((l) => {
    const [key, value = ''] = l.trim().split(/\s+/);
    return key === 'extensions.partialclone' ? value === 'origin' : /^(true|yes|on|1)$/i.test(value);
  });
}

/**
 * In a clone made without blobs (a partial clone, as the launcher's setup makes), fetches in one
 * request the blobs a build reads that it lacks: with `main`, every file of `origin/main` (the
 * overview lists the tree with each file's size, which git answers by fetching the file) and every
 * version of each spec on main's first-parent history (the review stamp searches their diffs);
 * every file of each tree in `trees` (the backlog's tip). Git would otherwise fetch each blob, or
 * each commit's, in a request of its own. A full clone, or a failed fetch, changes nothing: what is
 * still missing comes as git asks for it. The first build of a clone brings main's whole tree, so
 * the request may take PREFETCH_TIMEOUT.
 * @param {string} dir
 * @param {{ main?: boolean, trees?: string[] }} [o]
 * @returns {Promise<{ fetched: number, error?: string }>}
 */
export async function prefetchClone(dir, { main = true, trees = [] } = {}) {
  if (!(await fetchesBlobsFromOrigin(dir))) return { fetched: 0 };
  const tips = [...trees];
  let history = null;
  if (main) {
    const c = await gitAsync(dir, ['rev-parse', '--verify', '--quiet', 'origin/main^{commit}']);
    if (c.ok) {
      const commit = String(c.out).trim();
      tips.push(`${commit}^{tree}`);
      const ls = await gitAsync(dir, ['ls-tree', '-r', '-z', '--name-only', '--full-tree', commit, '--', 'specs']);
      const specs = ls.ok ? String(ls.out).split('\0').filter((p) => SPEC_FILE.test(p)) : [];
      if (specs.length) history = `${commit}\n--\n${specs.join('\n')}\n`;
    }
  }
  try {
    const missing = new Set(tips.length ? await missingObjects(dir, [], tips.join('\n') + '\n') : []);
    if (history) for (const oid of await missingObjects(dir, ['--first-parent'], history)) missing.add(oid);
    const f = await fetchObjects(dir, [...missing], { timeout: PREFETCH_TIMEOUT });
    return f.ok ? { fetched: missing.size } : { fetched: 0, error: lastLine(f.err, 'the fetch failed') };
  } catch (e) {
    return { fetched: 0, error: e.message };
  }
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
    const field = fieldOf(d);
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
