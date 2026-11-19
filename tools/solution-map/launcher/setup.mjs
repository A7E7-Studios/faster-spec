// Sets a computer up to open the Solution map with a double-click, for people who are not
// developers. Run once; running it again keeps what is there and writes the shortcut again.
//
//   node tools/solution-map/launcher/setup.mjs [--root <repository folder>]
//   node tools/solution-map/launcher/setup.mjs --print-command
//
// 1. Checks for Git 2.29 and Node 22 or later (GIT_MIN, NODE_MAJOR); when one is missing or older,
//    names it and its download page and stops without changing anything. It never installs anything.
// 2. Asks for git's `user.name` and `user.email` when none is set, and sets them (`--global`).
// 3. Clones each `solutionMap.repos` entry of `origin/main:tools/gate/config.json` that carries a
//    `url`, at its `path` relative to --root, with `--filter=blob:none --no-checkout`: history, no
//    working files. A folder that already holds a clone is kept as it is.
// 4. Copies launch.mjs, beside this file, into `<git common dir>/faster-spec/launcher/` of the
//    backlog's repository (config `backlog.repo`, a `solutionMap.repos` id; default --root).
// 5. Writes the shortcut for this system and prints its path: Windows `<Desktop>\<name> map.cmd`,
//    macOS `~/Desktop/<name> map.command`, Linux `~/.local/share/applications/<name>-map.desktop`
//    and a copy on the desktop `xdg-user-dir DESKTOP` names. `<name>` is the last part of
//    --root's origin address, `.git` dropped.
//
// `--print-command` prints the command a person pastes instead: one for PowerShell 5.1 and one for
// POSIX sh. It checks for git and node, clones the backlog's repository into
// `~/<name>-map/<name>` the same way, takes SETUP_PATHS from its `origin/main` into the clone's
// `.git/faster-spec/setup/` (`git restore`, which writes no index and no working files) and runs
// setup from there. This file may therefore import, beyond Node, only what SETUP_PATHS holds.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gitAsync, lastLine } from '../../gate/lib/git.mjs';
import { resolveRepos, hasRef, samePath } from '../../gate/lib/repos.mjs';
import { readAt, remoteUrl } from '../lib/sources.mjs';

export const GIT_PAGE = 'https://git-scm.com/downloads';
export const NODE_PAGE = 'https://nodejs.org/en/download';
export const NODE_MAJOR = 22;
/**
 * The oldest Git the map, its launcher and the backlog run on: 2.29 brought `fetch --stdin` and the
 * `noop` negotiation (`fetch.negotiationAlgorithm`) the launcher fetches missing blobs with, and
 * `fetch --no-write-fetch-head`, which the backlog fetches its branch with.
 */
export const GIT_MIN = '2.29';
/**
 * What the setup command takes from git to run this file: its folder, the map's module it imports
 * and the gate's library, whose modules import each other.
 */
export const SETUP_PATHS = ['tools/solution-map/launcher', 'tools/solution-map/lib/sources.mjs', 'tools/gate/lib'];
const SETUP_SCRIPT = 'tools/solution-map/launcher/setup.mjs';
const CONFIG = 'tools/gate/config.json';
const LAUNCH_SOURCE = fileURLToPath(new URL('./launch.mjs', import.meta.url));
const USAGE = `usage: node tools/solution-map/launcher/setup.mjs [--root <repository folder>]
       node tools/solution-map/launcher/setup.mjs --print-command
  sets this computer up to open the Solution map from a shortcut; --root defaults to the
  repository holding the current folder; --print-command prints the setup command per system`;

/** The version `git --version` answers with, `2.39.2` from `git version 2.39.2.windows.1`; null when it names none. */
export function gitVersionOf(answer) {
  return /\d+\.\d+(?:\.\d+)?/.exec(String(answer ?? ''))?.[0] ?? null;
}

/** Whether a Git version, `<major>.<minor>[.<patch>]`, is older than GIT_MIN. */
export function gitTooOld(version) {
  const [a, b] = version.split('.').map(Number);
  const [x, y] = GIT_MIN.split('.').map(Number);
  return a < x || (a === x && b < y);
}

/** A short name from a repository's address: `notes-app` from `.../notes-app.git`; '' when none. */
export function repoName(address) {
  const last = String(address ?? '').trim().replace(/[\\/]+$/, '').split(/[\\/:]/).pop().replace(/\.git$/i, '');
  return last.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
}

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const shQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/** The setup command for each system, `{ powershell, sh }`, cloning `url` into `~/<name>-map/<name>`. */
export function setupCommands({ url, name }) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`"${name}" is not a folder name`);
  const nodeLine = `Install Node.js ${NODE_MAJOR} or later first: ${NODE_PAGE}`;
  const gitLine = `Install Git ${GIT_MIN} or later first: ${GIT_PAGE}`;
  const take = `restore --source=origin/main -- ${SETUP_PATHS.join(' ')}`;
  const clone = (q, dest) => `git clone -q --filter=blob:none --no-checkout ${q(url)} ${dest}`;
  const powershell = [
    `if (-not (Get-Command git -ErrorAction SilentlyContinue)) { '${gitLine}' }`,
    `elseif (-not (Get-Command node -ErrorAction SilentlyContinue)) { '${nodeLine}' }`,
    `else { $d = Join-Path $env:USERPROFILE '${name}-map\\${name}'; $s = Join-Path $d '.git\\faster-spec\\setup';`,
    `if (Test-Path (Join-Path $d '.git')) { git -C $d fetch -q origin } else { ${clone(psQuote, '$d')} };`,
    `if (Test-Path (Join-Path $d '.git')) { New-Item -ItemType Directory -Force -Path $s | Out-Null; git -C $d --work-tree $s ${take};`,
    `if ($LASTEXITCODE -eq 0) { node (Join-Path $s '${SETUP_SCRIPT.replace(/\//g, '\\')}') --root $d } } }`,
  ].join(' ');
  const sh = [
    `if ! command -v git >/dev/null 2>&1; then echo '${gitLine}'`,
    `elif ! command -v node >/dev/null 2>&1; then echo '${nodeLine}'`,
    `else d="$HOME/${name}-map/${name}"; s="$d/.git/faster-spec/setup"`,
    `if [ -d "$d/.git" ]; then git -C "$d" fetch -q origin; else ${clone(shQuote, '"$d"')}; fi`,
    `[ -d "$d/.git" ] && mkdir -p "$s" && git -C "$d" --work-tree "$s" ${take} && node "$s/${SETUP_SCRIPT}" --root "$d"`,
    'fi',
  ].join('; ');
  return { powershell, sh };
}

/**
 * The shortcut files for a system, `[{ file, text, executable }]`, each running
 * `<node> <launch> --root <root>`. `desktop` is Windows' Desktop folder, or Linux's (null: none).
 */
export function shortcutFiles({ platform, home, desktop, name, node, launch, root }) {
  if (platform === 'win32') {
    // cmd reads a batch file in the console's code page, line by line: chcp 65001 first makes the
    // lines after it UTF-8, so a folder named in any language reaches node intact.
    const q = (s) => `"${s.replace(/%/g, '%%')}"`;
    const text = ['@echo off', 'chcp 65001 >nul', `title ${name} map`, `${q(node)} ${q(launch)} --root ${q(root)}`, 'if errorlevel 1 pause', ''].join('\r\n');
    return [{ file: path.join(desktop, `${name} map.cmd`), text, executable: false }];
  }
  if (platform === 'darwin') {
    const text = `#!/bin/sh\nexec ${shQuote(node)} ${shQuote(launch)} --root ${shQuote(root)}\n`;
    return [{ file: path.join(home, 'Desktop', `${name} map.command`), text, executable: true }];
  }
  // Desktop Entry Specification: an argument in double quotes escapes " ` $ \ with a backslash,
  // then the value as a whole escapes each backslash again, and % is written %%.
  const arg = (s) => `"${s.replace(/[\\"`$]/g, '\\$&')}"`;
  const exec = `${arg(node)} ${arg(launch)} --root ${arg(root)}`.replace(/\\/g, '\\\\').replace(/%/g, '%%');
  const text = ['[Desktop Entry]', 'Type=Application', `Name=${name} map`, 'Comment=Opens the Solution map', `Exec=${exec}`, 'Terminal=true', ''].join('\n');
  const files = [{ file: path.join(home, '.local', 'share', 'applications', `${name}-map.desktop`), text, executable: true }];
  if (desktop) files.push({ file: path.join(desktop, `${name}-map.desktop`), text, executable: true });
  return files;
}

/** A program's trimmed output, or null when it fails or is not there. */
function output(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 20000, windowsHide: true }, (e, out) => resolve(e ? null : String(out).trim() || null));
  });
}

/** Where this system says the desktop is: Windows asks .NET (it may be redirected), Linux `xdg-user-dir`. */
async function systemDesktop(platform, home) {
  if (platform === 'win32') {
    return (await output('powershell', ['-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetFolderPath('Desktop')"])) || path.join(home, 'Desktop');
  }
  const dir = await output('xdg-user-dir', ['DESKTOP']);
  return dir && !samePath(dir, home) && fs.existsSync(dir) ? dir : null;
}

/** Asks one question on the terminal; resolves the answer, or null when input ends. */
function askLine(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.on('close', () => { if (!answered) resolve(null); });
    rl.question(question, (answer) => { answered = true; rl.close(); resolve(answer); });
  });
}

async function gitVersionOnPath() {
  const r = await gitAsync(process.cwd(), ['--version']);
  return r.ok ? String(r.out).trim() : null;
}

/**
 * The project as main has it: its config, its repositories (`[{ id, dir, url }]`) and the backlog's
 * repository among them (`{ id, dir }`, --root when `backlog.repo` is not set). Throws with a reason.
 */
async function readProject(root) {
  if (!(await hasRef(root))) throw new Error(`${root} has no origin/main; run setup in a clone of the project`);
  const raw = await readAt(root, 'origin/main', CONFIG);
  if (!raw) throw new Error(`origin/main has no ${CONFIG}`);
  let config;
  try { config = JSON.parse(String(raw).replace(/^\uFEFF/, '')); } catch (e) { throw new Error(`origin/main:${CONFIG} is not JSON: ${e.message}`); }
  const repos = resolveRepos({ config, root }).map((r, i) => ({ ...r, url: config.solutionMap.repos[i].url }));
  const id = config.backlog?.repo;
  let store = { id: repos.find((r) => samePath(r.dir, root))?.id ?? null, dir: root };
  if (id !== undefined && id !== null) {
    store = repos.find((r) => r.id === id);
    if (!store) throw new Error(`backlog.repo names "${id}", which solutionMap.repos does not hold`);
  }
  return { config, repos, store };
}

async function toplevel(dir) {
  const r = await gitAsync(dir, ['rev-parse', '--show-toplevel']);
  return r.ok ? path.resolve(String(r.out).trim()) : null;
}

/** Prints the setup command for each system. Resolves the exit code. */
export async function printCommand({ root, log = console.log, warn = console.error } = {}) {
  root ??= await toplevel(process.cwd());
  if (!root) { warn('setup: run --print-command inside a clone of the project'); return 1; }
  let project;
  try { project = await readProject(root); } catch (e) { warn(`setup: ${e.message}`); return 1; }
  const { store, repos } = project;
  const url = repos.find((r) => r.id === store.id)?.url || (samePath(store.dir, root) ? await remoteUrl(root) : null);
  if (!url) { warn(`setup: give the "${store.id}" entry of solutionMap.repos a url, the address people clone it from`); return 1; }
  if (/^ssh:\/\//i.test(url) || /^[^/\\@]+@[^/\\:]+:/.test(url)) {
    warn(`setup: ${url} is an SSH address, which needs a key on the other computer; a url in solutionMap.repos can give an https one`);
  }
  const { powershell, sh } = setupCommands({ url, name: repoName(url) || 'project' });
  log(['Paste one of these on the computer that will open the map.', '', 'Windows (PowerShell):', powershell, '', 'macOS or Linux (Terminal):', sh].join('\n'));
  return 0;
}

/**
 * Sets this computer up. Every piece that reaches the machine can be given instead: the system,
 * the home and desktop folders, the node the shortcut runs, the git and Node checks and the prompt.
 * Resolves the exit code: 0 done, 1 something missing or failed.
 */
export async function setup({
  root = null, platform = process.platform, home = os.homedir(), desktop = null, node = process.execPath,
  nodeVersion = process.versions.node, gitVersion = gitVersionOnPath, ask = askLine, launchSource = LAUNCH_SOURCE,
  log = console.log, warn = console.error,
} = {}) {
  const missing = [];
  const answer = await gitVersion();
  const have = answer ? gitVersionOf(answer) : null;
  if (!answer) missing.push(`Git ${GIT_MIN} or later, from ${GIT_PAGE}`);
  else if (have && gitTooOld(have)) missing.push(`Git ${GIT_MIN} or later (this computer has ${have}), from ${GIT_PAGE}`);
  if (Number(String(nodeVersion).split('.')[0]) < NODE_MAJOR) missing.push(`Node.js ${NODE_MAJOR} or later (this computer has ${nodeVersion}), from ${NODE_PAGE}`);
  if (missing.length) {
    for (const m of missing) warn(`setup: install ${m}`);
    warn('setup: nothing was changed; run setup again once it is installed');
    return 1;
  }

  root ??= await toplevel(process.cwd());
  if (!root) { warn('setup: run setup inside a clone of the project, or name one with --root'); return 1; }
  let project;
  try { project = await readProject(root); } catch (e) { warn(`setup: ${e.message}`); return 1; }
  const { repos, store } = project;

  for (const [key, what] of [['user.name', 'name'], ['user.email', 'email address']]) {
    const set = await gitAsync(root, ['config', '--get', key]);
    if (set.ok && String(set.out).trim()) continue;
    let answer = '';
    while (answer === '') {
      const a = await ask(`Your ${what}, as your requests and notes will show it: `);
      if (a === null || a === undefined) break;
      answer = String(a).trim();
    }
    if (!answer) { warn(`setup: git needs your ${what}; run setup again`); return 1; }
    const w = await gitAsync(root, ['config', '--global', key, answer]);
    if (!w.ok) { warn(`setup: could not set git's ${key}: ${lastLine(w.err, 'failed')}`); return 1; }
  }

  for (const r of repos) {
    if (samePath(r.dir, root)) continue;
    if (fs.existsSync(path.join(r.dir, '.git'))) { log(`setup: kept ${r.id} at ${r.dir}`); continue; }
    if (typeof r.url !== 'string' || !r.url) continue;
    if (fs.existsSync(r.dir) && fs.readdirSync(r.dir).length) {
      warn(`setup: ${r.dir} holds files but no clone of ${r.id}; move them away and run setup again`);
      return 1;
    }
    log(`setup: cloning ${r.id} into ${r.dir}`);
    const c = await gitAsync(root, ['clone', '--quiet', '--filter=blob:none', '--no-checkout', r.url, r.dir], { timeout: 0 });
    if (!c.ok) { warn(`setup: could not clone ${r.id} from ${r.url}: ${lastLine(c.err, 'failed')}`); return 1; }
  }

  if (!fs.existsSync(path.join(store.dir, '.git'))) {
    warn(`setup: the backlog's repository ${store.id} is not at ${store.dir}; give its solutionMap.repos entry a url`);
    return 1;
  }
  const common = await gitAsync(store.dir, ['rev-parse', '--git-common-dir']);
  if (!common.ok) { warn(`setup: ${store.dir}: ${lastLine(common.err, 'failed')}`); return 1; }
  const launch = path.join(path.resolve(store.dir, String(common.out).trim()), 'faster-spec', 'launcher', 'launch.mjs');
  fs.mkdirSync(path.dirname(launch), { recursive: true });
  fs.copyFileSync(launchSource, launch);
  log(`setup: copied the launcher to ${launch}`);

  const name = repoName(await remoteUrl(root)) || repoName(path.basename(root)) || 'project';
  const desk = platform === 'darwin' ? null : await (desktop ?? (() => systemDesktop(platform, home)))();
  const files = shortcutFiles({ platform, home, desktop: desk, name, node, launch, root });
  for (const f of files) {
    fs.mkdirSync(path.dirname(f.file), { recursive: true });
    fs.writeFileSync(f.file, f.text);
    if (f.executable) fs.chmodSync(f.file, 0o755);
    log(`setup: wrote ${f.file}`);
  }
  log(`setup: done; open ${files[files.length - 1].file} to start the map`);
  return 0;
}

/** The parsed command line: `{ root, print, help }`; throws on a bad argument. */
export function parseArgs(argv) {
  const o = { root: null, print: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error('--root needs a folder');
      o.root = path.resolve(v);
    } else if (a === '--print-command') o.print = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

export async function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(`setup: ${e.message}\n${USAGE}`);
    return 2;
  }
  if (o.help) { console.log(USAGE); return 0; }
  return o.print ? printCommand({ root: o.root }) : setup({ root: o.root });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
