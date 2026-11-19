#!/usr/bin/env node
// The Solution map's command line: name the repositories, build the map, serve it on 127.0.0.1
// and open it in the browser.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gitAsync } from '../gate/lib/git.mjs';
import { resolveRepos, readConfig } from '../gate/lib/repos.mjs';
import { readAt } from './lib/sources.mjs';
import { buildMap } from './lib/build.mjs';
import { createMapServer } from './lib/server.mjs';
import { reviewCommand, startReview } from './lib/review.mjs';
import { locateBacklog } from '../backlog/lib/store.mjs';
import { TREE_ID, RESTART_CODE } from './launcher/launch.mjs';

export const DEFAULT_PORT = 7317;
/** How long a launched map waits for its port: the map a restart replaces may still be closing it. */
export const PORT_WAIT = 10000;
const THEME = 'kit-pages/theme.css';
const USAGE = `usage: node tools/solution-map/solution-map.mjs [--repo <id>=<folder>]... [--port <n>] [--pages <address>] [--no-open]
       node tools/solution-map/solution-map.mjs --from <overview.json> [--port <n>] [--no-open]
  without --repo, the repositories are tools/gate/config.json's solutionMap.repos;
  --from serves a saved overview instead of fetching and building one;
  the launcher adds --launched <tree id> --root <folder>`;

/**
 * The parsed command line: `{ repoArgs, port, pages, open, help, from }`, and `launched: { tree,
 * root }` when the launcher started the map; throws on a bad argument.
 */
export function parseArgs(argv) {
  const o = { repoArgs: [], port: DEFAULT_PORT, pages: null, open: true, help: false, from: null };
  const launch = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--repo') o.repoArgs.push(val());
    else if (a === '--port') {
      o.port = Number(val());
      if (!Number.isInteger(o.port) || o.port < 0 || o.port > 65535) throw new Error('--port takes a port number');
    } else if (a === '--pages') o.pages = val();
    else if (a === '--from') o.from = val();
    else if (a === '--no-open') o.open = false;
    else if (a === '--launched') {
      launch.tree = val();
      if (!TREE_ID.test(launch.tree)) throw new Error('--launched takes the tree id of the map\'s code');
    } else if (a === '--root') launch.root = path.resolve(val());
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (Object.keys(launch).length) {
    if (!launch.tree || !launch.root) throw new Error('--launched and --root go together; the launcher gives them');
    if (o.from) throw new Error('--from and --launched do not go together');
    o.launched = launch;
  }
  return o;
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  execFile(cmd, args, { windowsHide: true }, () => {});
}

export async function main(argv) {
  let o, repos, root;
  try {
    o = parseArgs(argv);
    if (o.help) { console.log(USAGE); return 0; }
    const top = await gitAsync(process.cwd(), ['rev-parse', '--show-toplevel']);
    root = top.ok ? String(top.out).trim() : process.cwd();
    const config = readConfig(root);
    o.config = config;
    o.pages ??= config?.solutionMap?.pages ?? null;
    if (o.from) {
      if (o.repoArgs.length) throw new Error('--from and --repo do not go together');
      const file = path.resolve(o.from);
      JSON.parse(fs.readFileSync(file, 'utf8'));
      repos = [];
      o.build = () => buildMap({ repos: [], pages: o.pages, overview: () => JSON.parse(fs.readFileSync(file, 'utf8')), fromFile: true });
    } else {
      repos = resolveRepos({ args: o.repoArgs, config, root });
      // A backlog the config names wrongly leaves the map without one, said in a banner.
      try {
        o.backlog = { where: locateBacklog({ config, repos, root }), repos };
      } catch (e) {
        o.backlog = { error: e.message };
      }
    }
  } catch (e) {
    console.error(`solution-map: ${e.message}\n${USAGE}`);
    return 2;
  }
  const launched = o.launched ?? null;
  // The launcher waits on its map through an IPC channel; should it go, its map goes with it.
  if (launched && process.connected) process.once('disconnect', () => process.exit(0));
  const reviewCmd = reviewCommand({ config: o.config });
  let port;
  const { server, listen, refresh } = createMapServer({
    build: o.build || (() => buildMap({ repos, pages: o.pages, backlog: o.backlog?.where ?? null, launched })),
    // A launched map runs from a folder of main's map code alone: the theme is main's, read from git.
    theme: launched
      ? () => readAt(launched.root, 'origin/main', THEME)
      : async () => { const f = path.join(root, THEME); return fs.existsSync(f) ? fs.readFileSync(f) : null; },
    review: () => startReview(reviewCmd),
    backlog: o.backlog ?? null,
    restart: launched ? async () => restartWith({ server, port: () => port }) : null,
  });
  try {
    port = await listen(o.port, { wait: launched ? PORT_WAIT : 0 });
  } catch (e) {
    console.error(`solution-map: cannot listen on 127.0.0.1: ${e.message}`);
    return 2;
  }
  const url = `http://127.0.0.1:${port}/`;
  console.log(`solution-map: ${o.from ? `from ${o.from}` : repos.map((r) => `${r.id}=${r.dir}`).join(', ')}\nsolution-map: ${url}  (Ctrl+C stops it)`);
  refresh().catch((e) => console.error(`solution-map: ${e.message}`));
  if (o.open) openBrowser(url);
  return null;
}

/**
 * Restart to update: whether the launcher that started this map waits on it (its IPC channel), and
 * `handOver`, run once the page has its answer: stop listening, tell the launcher this map's port,
 * and exit with RESTART_CODE. The launcher then runs main's newest map, in the same window, on
 * that port.
 */
function restartWith({ server, port }) {
  if (!process.connected) return { ok: false, error: 'the launcher that started this map no longer waits on it; open the map from its shortcut again' };
  return {
    ok: true,
    handOver: () => {
      server.close();
      server.closeAllConnections();
      console.log('solution-map: restarting with main\'s newest map');
      process.send({ restart: { port: port() } }, () => process.exit(RESTART_CODE));
    },
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).then((code) => { if (code !== null) process.exitCode = code; });
}
