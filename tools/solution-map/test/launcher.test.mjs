import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setup, setupCommands, shortcutFiles, repoName, gitVersionOf, gitTooOld, GIT_PAGE, GIT_MIN, NODE_PAGE, SETUP_PATHS } from '../launcher/setup.mjs';
import { MAP_PATHS, TREE_ID, pruneMaps, parseArgs as launchArgv } from '../launcher/launch.mjs';
import { parseArgs as parseMapArgs } from '../solution-map.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LAUNCH = path.join(KIT, 'tools', 'solution-map', 'launcher', 'launch.mjs');
const SETUP = path.join(KIT, 'tools', 'solution-map', 'launcher', 'setup.mjs');

// Every git this file starts, and every git setup and launch start, reads a throwaway global
// config and no system one, and the home folder is a throwaway one: nothing here reaches the
// computer's own git config, home or desktop.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'map-launcher-'));
const GLOBAL = path.join(SANDBOX, 'gitconfig');
Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: GLOBAL, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
  HOME: path.join(SANDBOX, 'home'), USERPROFILE: path.join(SANDBOX, 'home'),
});
fs.mkdirSync(process.env.HOME);
after(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));

const ID = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main'];
const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...ID, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fileUrl = (p) => pathToFileURL(p).href;
const real = (p) => { const r = fs.realpathSync.native(p); return process.platform === 'win32' ? r.toLowerCase() : r; };

/** Git's identity for this computer: set, or none at all. */
function identity(set) {
  fs.rmSync(GLOBAL, { force: true });
  if (set) fs.writeFileSync(GLOBAL, '[user]\n\tname = Test\n\temail = test@example.com\n');
}

const withTmp = async (fn) => {
  const tmp = fs.mkdtempSync(path.join(SANDBOX, 't-'));
  try { await fn(tmp); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
};

/** A bare origin that serves clones without blobs, and the folder its commits are made in. */
function origin(tmp, name, files) {
  const bare = path.join(tmp, 'origins', `${name}.git`);
  const work = path.join(tmp, 'origins', `${name}-work`);
  fs.mkdirSync(bare, { recursive: true });
  g(bare, 'init', '--bare', '-q');
  g(bare, 'config', 'uploadpack.allowFilter', 'true');
  fs.mkdirSync(work);
  g(work, 'init', '-q');
  g(work, 'remote', 'add', 'origin', bare);
  const o = { bare, work, url: fileUrl(bare) };
  land(o, files, 'first');
  return o;
}

/** Commits files (path to text) on the origin's main, as someone else would. */
function land(o, files, message) {
  for (const [p, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(o.work, p)), { recursive: true });
    fs.writeFileSync(path.join(o.work, p), body);
  }
  g(o.work, 'add', '.');
  g(o.work, 'commit', '-q', '-m', message);
  g(o.work, 'push', '-q', 'origin', 'HEAD:main');
  return g(o.work, 'rev-parse', 'HEAD');
}

/** A clone the way setup makes one: history, no blobs, no working files. */
function partialClone(o, dest) {
  execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', o.url, dest], { stdio: 'pipe' });
  return dest;
}

const config = (repos, more = {}) => JSON.stringify({ solutionMap: { repos }, ...more }, null, 2);

/** A notes app whose main names its backend (with an address) and a site (without one). */
function solution(tmp) {
  const api = origin(tmp, 'notes-api', { 'README.md': 'the backend\n' });
  land(api, { 'src/server.js': '// serves notes\n' }, 'second');
  const app = origin(tmp, 'notes-app', {
    'README.md': 'a notes app\n',
    'tools/gate/config.json': config([{ id: 'app', path: '.' }, { id: 'api', path: '../notes-api', url: api.url }, { id: 'web', path: '../notes-web' }]),
  });
  const root = partialClone(app, path.join(tmp, 'base', 'notes-app'));
  return { api, app, root, base: path.join(tmp, 'base') };
}

/** Runs setup with every piece that reaches the machine given; collects what it says. */
async function runSetup(o) {
  const said = { log: [], warn: [] };
  const code = await setup({
    platform: 'linux', home: path.join(SANDBOX, 'home'), desktop: async () => null, node: '/usr/bin/node', nodeVersion: '22.11.0',
    ask: async () => { throw new Error('setup asked a question'); },
    log: (s) => said.log.push(s), warn: (s) => said.warn.push(s), ...o,
  });
  return { code, ...said };
}

test('setup names what is missing and stops', () => withTmp(async (tmp) => {
  identity(false);
  const { root, base } = solution(tmp);
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home);
  const unchanged = () => {
    assert.deepEqual(fs.readdirSync(base), ['notes-app']);
    assert.deepEqual(fs.readdirSync(root), ['.git']);
    assert.equal(fs.existsSync(path.join(root, '.git', 'faster-spec')), false);
    assert.deepEqual(fs.readdirSync(home), []);
    assert.equal(fs.existsSync(GLOBAL), false);
  };
  const oldNode = await runSetup({ root, home, nodeVersion: '20.18.0' });
  assert.equal(oldNode.code, 1);
  assert.match(oldNode.warn.join('\n'), new RegExp(`Node\\.js 22 or later \\(this computer has 20\\.18\\.0\\), from ${NODE_PAGE}`));
  assert.doesNotMatch(oldNode.warn.join('\n'), /install Git/);
  unchanged();

  const noGit = await runSetup({ root, home, gitVersion: async () => null });
  assert.equal(noGit.code, 1);
  assert.match(noGit.warn.join('\n'), new RegExp(`install Git 2\\.29 or later, from ${GIT_PAGE}`));
  assert.doesNotMatch(noGit.warn.join('\n'), /Node\.js/);
  unchanged();

  // A Git older than 2.29 lacks what the launcher and the backlog fetch with.
  assert.equal(GIT_MIN, '2.29');
  const oldGit = await runSetup({ root, home, gitVersion: async () => 'git version 2.28.0.windows.1' });
  assert.equal(oldGit.code, 1);
  assert.match(oldGit.warn.join('\n'), new RegExp(`install Git 2\\.29 or later \\(this computer has 2\\.28\\.0\\), from ${GIT_PAGE}`));
  unchanged();
  assert.deepEqual(['git version 2.39.2.windows.1', 'git version 2.29.0', 'git version 3.1', 'no version here'].map(gitVersionOf), ['2.39.2', '2.29.0', '3.1', null]);
  assert.deepEqual(['1.9.5', '2.9.0', '2.28.9', '2.29.0', '2.29', '2.100.0', '3.0'].map(gitTooOld), [true, true, true, false, false, false, false]);

  const neither = await runSetup({ root, home, gitVersion: async () => null, nodeVersion: '18.0.0' });
  assert.equal(neither.code, 1);
  assert.equal(neither.warn.filter((l) => l.startsWith('setup: install ')).length, 2);
  assert.match(neither.warn.join('\n'), /nothing was changed/);
  unchanged();
}));

test('setup asks for a git name and email when none is set', () => withTmp(async (tmp) => {
  identity(false);
  const { root } = solution(tmp);
  const asked = [];
  const answers = ['', 'A Tester', 'tester@example.com'];
  const run = await runSetup({ root, ask: async (q) => { asked.push(q); return answers.shift(); } });
  assert.equal(run.code, 0, run.warn.join('\n'));
  assert.equal(asked.length, 3);
  assert.match(asked[0], /name/);
  assert.match(asked[1], /name/); // an empty answer is asked again
  assert.match(asked[2], /email/);
  const globalValue = (key) => execFileSync('git', ['config', '--global', '--get', key], { encoding: 'utf8' }).trim();
  assert.equal(globalValue('user.name'), 'A Tester');
  assert.equal(globalValue('user.email'), 'tester@example.com');

  // A name already there is not asked for again; only the email is.
  fs.writeFileSync(GLOBAL, '[user]\n\tname = Test\n');
  asked.length = 0;
  const emailOnly = await runSetup({ root, ask: async (q) => { asked.push(q); return 'test@example.com'; } });
  assert.equal(emailOnly.code, 0, emailOnly.warn.join('\n'));
  assert.equal(asked.length, 1);
  assert.match(asked[0], /email/);

  // No answer at all stops setup.
  identity(false);
  const none = await runSetup({ root, ask: async () => null });
  assert.equal(none.code, 1);
  assert.match(none.warn.join('\n'), /git needs your name/);
}));

test('setup clones each repository with no working files', () => withTmp(async (tmp) => {
  identity(true);
  const { api, root, base } = solution(tmp);
  const run = await runSetup({ root });
  assert.equal(run.code, 0, run.warn.join('\n'));
  // Side by side as main's config lays them out: ../notes-api from the notes app.
  const clone = path.join(base, 'notes-api');
  assert.deepEqual(fs.readdirSync(clone), ['.git']);
  assert.equal(g(clone, 'rev-parse', 'origin/main'), g(api.bare, 'rev-parse', 'main'));
  assert.equal(g(clone, 'rev-list', '--count', 'origin/main'), '2');
  assert.equal(g(clone, 'config', 'remote.origin.partialclonefilter'), 'blob:none');
  assert.equal(g(clone, 'remote', 'get-url', 'origin'), api.url);
  assert.match(run.log.join('\n'), /cloning api into .*notes-api/);
  // The site has no address, so nothing is cloned for it; the notes app is the clone setup ran in.
  assert.equal(fs.existsSync(path.join(base, 'notes-web')), false);
  assert.deepEqual(fs.readdirSync(base).sort(), ['notes-api', 'notes-app']);
  assert.deepEqual(fs.readdirSync(root), ['.git']);
}));

/** The arguments a desktop entry's Exec value runs, read back as the Desktop Entry Specification says. */
function execArgs(value) {
  const unescaped = value.replace(/%%/g, '%').replace(/\\(.)/g, (m, c) => ({ s: ' ', n: '\n', t: '\t', r: '\r', '\\': '\\' })[c] ?? m);
  const args = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m;
  while ((m = re.exec(unescaped))) args.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]);
  return args;
}

test('setup writes the shortcut for each system', () => withTmp(async (tmp) => {
  identity(true);
  const { root } = solution(tmp);
  const launch = path.join(root, '.git', 'faster-spec', 'launcher', 'launch.mjs');
  const node = path.join(tmp, 'node js', 'bin', 'node');

  // Windows: on the desktop .NET names, which may be redirected away from the home folder.
  const winHome = path.join(tmp, 'win home');
  const redirected = path.join(tmp, 'synced', 'Desktop');
  const win = await runSetup({ root, platform: 'win32', home: winHome, desktop: async () => redirected, node });
  assert.equal(win.code, 0, win.warn.join('\n'));
  const cmd = path.join(redirected, 'notes-app map.cmd');
  assert.equal(fs.readFileSync(cmd, 'utf8'), ['@echo off', 'chcp 65001 >nul', 'title notes-app map', `"${node}" "${launch}" --root "${root}"`, 'if errorlevel 1 pause', ''].join('\r\n'));
  assert.ok(win.log.includes(`setup: wrote ${cmd}`));
  assert.equal(fs.existsSync(winHome), false);
  assert.deepEqual(fs.readFileSync(launch), fs.readFileSync(LAUNCH));

  // macOS: ~/Desktop, a .command file that runs when opened.
  const macHome = path.join(tmp, 'mac home');
  const mac = await runSetup({ root, platform: 'darwin', home: macHome, desktop: async () => { throw new Error('macOS uses ~/Desktop'); }, node });
  assert.equal(mac.code, 0, mac.warn.join('\n'));
  const command = path.join(macHome, 'Desktop', 'notes-app map.command');
  assert.equal(fs.readFileSync(command, 'utf8'), `#!/bin/sh\nexec '${node}' '${launch}' --root '${root}'\n`);
  if (process.platform !== 'win32') assert.equal(fs.statSync(command).mode & 0o111, 0o111);
  assert.ok(mac.log.includes(`setup: wrote ${command}`));

  // Linux: an applications entry, and a copy on the desktop xdg-user-dir names (which need not be
  // ~/Desktop). A node path with $ and % checks the Exec line's escaping.
  const linuxHome = path.join(tmp, 'linux home');
  const linuxDesktop = path.join(linuxHome, 'My Desk');
  const linux = await runSetup({ root, platform: 'linux', home: linuxHome, desktop: async () => linuxDesktop, node: `${node}$%` });
  assert.equal(linux.code, 0, linux.warn.join('\n'));
  const entry = path.join(linuxHome, '.local', 'share', 'applications', 'notes-app-map.desktop');
  const text = fs.readFileSync(entry, 'utf8');
  assert.equal(fs.readFileSync(path.join(linuxDesktop, 'notes-app-map.desktop'), 'utf8'), text);
  const lines = text.split('\n');
  assert.equal(lines[0], '[Desktop Entry]');
  for (const l of ['Type=Application', 'Name=notes-app map', 'Terminal=true']) assert.ok(lines.includes(l), l);
  const exec = lines.find((l) => l.startsWith('Exec=')).slice('Exec='.length);
  assert.deepEqual(execArgs(exec), [`${node}$%`, launch, '--root', root]);
  if (process.platform !== 'win32') assert.equal(fs.statSync(entry).mode & 0o111, 0o111);
  assert.ok(linux.log.includes(`setup: wrote ${entry}`));

  // A Linux desktop with no desktop folder gets the applications entry alone.
  const bare = shortcutFiles({ platform: 'linux', home: linuxHome, desktop: null, name: 'notes-app', node, launch, root });
  assert.deepEqual(bare.map((f) => f.file), [entry]);
}));

test('setup run again keeps the clone and the drafts', () => withTmp(async (tmp) => {
  identity(true);
  const { root, base } = solution(tmp);
  const home = path.join(tmp, 'home');
  const desktop = path.join(home, 'Desktop');
  const first = await runSetup({ root, home, desktop: async () => desktop });
  assert.equal(first.code, 0, first.warn.join('\n'));
  const shortcut = path.join(desktop, 'notes-app-map.desktop');
  const written = fs.readFileSync(shortcut, 'utf8');

  const drafts = path.join(root, '.git', 'faster-spec', 'backlog-drafts.json');
  fs.writeFileSync(drafts, '{"drafts":[{"key":"d1","op":"note","text":"unsent"}]}\n');
  const clone = path.join(base, 'notes-api');
  const marker = path.join(clone, '.git', 'kept-marker');
  fs.writeFileSync(marker, 'this clone\n');
  const head = g(clone, 'rev-parse', 'HEAD');
  fs.rmSync(shortcut);

  const again = await runSetup({ root, home, desktop: async () => desktop });
  assert.equal(again.code, 0, again.warn.join('\n'));
  assert.equal(fs.readFileSync(drafts, 'utf8'), '{"drafts":[{"key":"d1","op":"note","text":"unsent"}]}\n');
  assert.equal(fs.readFileSync(marker, 'utf8'), 'this clone\n');
  assert.equal(g(clone, 'rev-parse', 'HEAD'), head);
  assert.deepEqual(fs.readdirSync(clone), ['.git']);
  assert.match(again.log.join('\n'), /kept api at .*notes-api/);
  assert.doesNotMatch(again.log.join('\n'), /cloning/);
  assert.equal(fs.readFileSync(shortcut, 'utf8'), written);
}));

/** An sh by its full path (the commands run under a PATH without it): /bin/sh, or Git for Windows' own; null when the test has none. */
function findSh() {
  const candidates = process.platform === 'win32'
    ? [path.resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '..', '..', '..', 'usr', 'bin', 'sh.exe')]
    : ['/bin/sh', '/usr/bin/sh'];
  return candidates.find((sh) => fs.existsSync(sh) && spawnSync(sh, ['-c', 'exit 0']).status === 0) ?? null;
}

/** A folder of sh scripts named for programs. */
function shims(dir, programs) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(programs)) fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return dir;
}
const slashes = (p) => p.split(path.sep).join('/');
/** This process's environment with some variables replaced; Windows names them in any case (`Path`). */
const envWith = (over) => {
  const names = new Set(Object.keys(over).map((k) => k.toUpperCase()));
  return { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !names.has(k.toUpperCase()))), ...over };
};

test('print-command prints one setup command per system', () => withTmp(async (tmp) => {
  identity(true);
  // A project whose main carries the kit's map, its launcher and the gate's library, and a
  // developer's checkout of it. The command takes SETUP_PATHS of it alone.
  const kitFiles = kitMap();
  const app = origin(tmp, 'notes-app', { ...kitFiles, 'README.md': 'a notes app\n', 'tools/gate/config.json': config([{ id: 'app', path: '.' }]) });
  const checkout = path.join(tmp, 'checkout');
  execFileSync('git', ['clone', '-q', app.url, checkout], { stdio: 'pipe' });

  const printed = spawnSync(process.execPath, [SETUP, '--print-command'], { cwd: checkout, encoding: 'utf8' });
  assert.equal(printed.status, 0, printed.stderr);
  const lines = printed.stdout.split(/\r?\n/);
  const lineAfter = (label) => lines[lines.indexOf(label) + 1];
  const ps = lineAfter('Windows (PowerShell):');
  const sh = lineAfter('macOS or Linux (Terminal):');
  assert.deepEqual(setupCommands({ url: app.url, name: 'notes-app' }), { powershell: ps, sh });
  for (const c of [ps, sh]) {
    assert.ok(c.includes(`git clone -q --filter=blob:none --no-checkout '${app.url}'`), c);
    assert.ok(c.includes(GIT_PAGE) && c.includes(NODE_PAGE), c);
    assert.ok(c.includes(`restore --source=origin/main -- ${SETUP_PATHS.join(' ')}`), c);
  }
  assert.ok(!ps.includes('&&'), 'PowerShell 5.1 has no &&');
  assert.match(ps, /Get-Command git .*Get-Command node/);
  assert.match(sh, /command -v git .*command -v node/);

  /** What a run of a printed command left: the clone, and what it ran setup with. */
  const ranSetup = (home, record) => {
    const clone = path.join(home, 'notes-app-map', 'notes-app');
    assert.deepEqual(fs.readdirSync(clone), ['.git']);
    assert.equal(g(clone, 'config', 'remote.origin.partialclonefilter'), 'blob:none');
    const setupDir = path.join(clone, '.git', 'faster-spec', 'setup');
    const taken = path.join(setupDir, 'tools', 'solution-map', 'launcher', 'setup.mjs');
    assert.equal(fs.readFileSync(taken, 'utf8'), kitFiles['tools/solution-map/launcher/setup.mjs']);
    // SETUP_PATHS and nothing else of main.
    const within = (p) => SETUP_PATHS.some((s) => p === s || p.startsWith(`${s}/`));
    const files = [];
    const walk = (dir, rel) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}${e.name}/`);
        else files.push(`${rel}${e.name}`);
      }
    };
    walk(setupDir, '');
    assert.deepEqual(files.filter((p) => !within(p)), []);
    assert.deepEqual(files.sort(), Object.keys(kitFiles).filter(within).sort());
    const args = fs.readFileSync(record, 'utf8');
    assert.match(slashes(args).trim(), /notes-app-map\/notes-app\/\.git\/faster-spec\/setup\/tools\/solution-map\/launcher\/setup\.mjs"?\s+--root\s+"?[^\n]*notes-app-map\/notes-app"?$/);
    // What the command took from git is enough for setup to load: every module it imports is there.
    const help = spawnSync(process.execPath, [taken, '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0, help.stderr);
  };

  const shell = findSh();
  if (shell) {
    // Missing: a PATH holding nothing, then one holding only a git. Present: a stand-in node ahead
    // of this computer's own PATH, so the clone is real and setup itself does not run.
    const empty = slashes(shims(path.join(tmp, 'sh-none'), {}));
    const gitOnly = slashes(shims(path.join(tmp, 'sh-git'), { git: 'exit 0' }));
    const record = path.join(tmp, 'sh-node-args.txt');
    const both = `${slashes(shims(path.join(tmp, 'sh-node'), { node: `printf '%s\\n' "$@" > '${slashes(record)}'` }))}${path.delimiter}${process.env.PATH}`;
    const runSh = (PATH, home) => {
      fs.mkdirSync(home, { recursive: true });
      return spawnSync(shell, ['-c', sh], { encoding: 'utf8', env: envWith({ PATH, HOME: slashes(home) }) });
    };
    const h1 = path.join(tmp, 'sh home one');
    assert.match(runSh(empty, h1).stdout, new RegExp(`^Install Git 2\\.29 or later first: ${GIT_PAGE}`));
    assert.deepEqual(fs.readdirSync(h1), []);
    const h2 = path.join(tmp, 'sh home two');
    assert.match(runSh(gitOnly, h2).stdout, new RegExp(`^Install Node\\.js 22 or later first: ${NODE_PAGE}`));
    assert.deepEqual(fs.readdirSync(h2), []);
    const h3 = path.join(tmp, 'sh home three');
    const r3 = runSh(both, h3);
    assert.equal(r3.status, 0, r3.stderr);
    ranSetup(h3, record);
    // Pasted again, it fetches the clone it made and runs setup again.
    fs.rmSync(record);
    const again = runSh(both, h3);
    assert.equal(again.status, 0, again.stderr);
    ranSetup(h3, record);
  }

  const powershell = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : null;
  if (powershell && fs.existsSync(powershell)) {
    const runPs = (bin, home) => {
      fs.mkdirSync(home, { recursive: true });
      return spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', env: envWith({ PATH: bin, USERPROFILE: home }) });
    };
    const empty = path.join(tmp, 'ps-none');
    fs.mkdirSync(empty);
    // One profile folder for the three runs (PowerShell keeps its own caches there, slow to build),
    // so only the command's own folder is looked for.
    const home = path.join(tmp, 'ps home');
    assert.match(runPs(empty, home).stdout, new RegExp(`^Install Git 2\\.29 or later first: ${GIT_PAGE}`));
    assert.equal(fs.existsSync(path.join(home, 'notes-app-map')), false);
    const gitDir = path.dirname(execFileSync('where', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim());
    if (!fs.existsSync(path.join(gitDir, 'node.exe'))) {
      assert.match(runPs(gitDir, home).stdout, new RegExp(`^Install Node\\.js 22 or later first: ${NODE_PAGE}`));
      assert.equal(fs.existsSync(path.join(home, 'notes-app-map')), false);
      const fake = path.join(tmp, 'ps-node');
      fs.mkdirSync(fake);
      const record = path.join(tmp, 'ps-node-args.txt');
      fs.writeFileSync(path.join(fake, 'node.cmd'), `@echo off\r\n(echo %*) > "${record}"\r\n`);
      const r3 = runPs(`${fake};${process.env.PATH}`, home);
      assert.equal(r3.status, 0, r3.stderr);
      ranSetup(home, record);
    }
  }
}));

test('a repository is named for its address', () => {
  assert.equal(repoName('https://example.com/team/notes-app.git'), 'notes-app');
  assert.equal(repoName('git@example.com:team/notes-api.git'), 'notes-api');
  assert.equal(repoName('file:///C:/work/origins/notes-app.git/'), 'notes-app');
  assert.equal(repoName('https://example.com/team/notes app'), 'notes-app');
  assert.equal(repoName(''), '');
  assert.throws(() => setupCommands({ url: 'x', name: 'two words' }), /folder name/);
});

/** A stand-in for the map that records where it ran and with what, then exits. */
const standIn = (version) => `import fs from 'node:fs';\nfs.writeFileSync(process.env.LAUNCH_RECORD, JSON.stringify({ version: '${version}', cwd: process.cwd(), argv: process.argv.slice(2) }));\n`;

/** A notes app whose main holds the stand-in map, its backend, both cloned as setup clones them, and the launcher copied in. */
function launched(tmp) {
  const api = origin(tmp, 'notes-api', { 'README.md': 'the backend\n' });
  const app = origin(tmp, 'notes-app', {
    'README.md': 'a notes app\n',
    'tools/solution-map/solution-map.mjs': standIn('v1'),
    'tools/overview/overview.mjs': '// the overview\n',
    'tools/gate/lib/git.mjs': '// git\n',
    'tools/gate/config.json': config([{ id: 'app', path: '.' }, { id: 'api', path: '../notes-api', url: api.url }]),
  });
  const root = partialClone(app, path.join(tmp, 'base', 'notes-app'));
  const apiClone = partialClone(api, path.join(tmp, 'base', 'notes-api'));
  const launcher = path.join(root, '.git', 'faster-spec', 'launcher', 'launch.mjs');
  fs.mkdirSync(path.dirname(launcher), { recursive: true });
  fs.copyFileSync(LAUNCH, launcher);
  const record = path.join(tmp, 'record.json');
  const open = (more = [], file = launcher) => {
    fs.rmSync(record, { force: true });
    const r = spawnSync(process.execPath, [file, '--root', root, ...more], { encoding: 'utf8', env: { ...process.env, LAUNCH_RECORD: record } });
    return { ...r, ran: fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8')) : null };
  };
  return { api, app, root, apiClone, launcher, open, maps: path.join(root, '.git', 'faster-spec', 'maps') };
}

/** What the launcher gives the map before its `--repo` arguments; the rest. */
function launchArgs(argv, tree, root) {
  assert.deepEqual(argv.slice(0, 4), ['--launched', tree, '--root', root]);
  return argv.slice(4);
}

/** The tree of the map's paths at the origin's main, by porcelain in a full clone. */
function expectedTree(o, tmp) {
  const full = fs.mkdtempSync(path.join(tmp, 'full-'));
  execFileSync('git', ['clone', '-q', o.url, full], { stdio: 'pipe' });
  g(full, 'rm', '-r', '-q', '--cached', '--', '.', ...MAP_PATHS.map((p) => `:(exclude)${p.replace(/\/$/, '')}`));
  return g(full, 'write-tree');
}

test('the launched map runs from main\'s code', () => withTmp(async (tmp) => {
  identity(true);
  const { api, app, root, apiClone, open, maps } = launched(tmp);
  const head = g(root, 'rev-parse', 'HEAD');

  // What follows -- goes to the map, after the launcher's own arguments.
  const first = open(['--', '--port', '0']);
  assert.equal(first.status, 0, first.stderr);
  const t1 = expectedTree(app, tmp);
  assert.equal(first.ran.version, 'v1');
  assert.equal(real(first.ran.cwd), real(path.join(maps, t1)));
  assert.deepEqual(launchArgs(first.ran.argv, t1, root), ['--repo', `app=${root}`, '--repo', `api=${apiClone}`, '--port', '0']);

  // Main gets a newer map, and the backend a new commit.
  land(app, { 'tools/solution-map/solution-map.mjs': standIn('v2') }, 'a newer map');
  const apiMain = land(api, { 'src/server.js': '// serves notes\n' }, 'backend change');
  const second = open();
  assert.equal(second.status, 0, second.stderr);
  const t2 = expectedTree(app, tmp);
  assert.notEqual(t2, t1);
  assert.equal(second.ran.version, 'v2');
  assert.equal(real(second.ran.cwd), real(path.join(maps, t2)));
  assert.deepEqual(launchArgs(second.ran.argv, t2, root), ['--repo', `app=${root}`, '--repo', `api=${apiClone}`]);
  assert.equal(g(apiClone, 'rev-parse', 'origin/main'), apiMain);

  // A commit outside the map's code is the same map: no new folder (and v1's goes, being neither
  // the map run nor the one run before it).
  assert.deepEqual(fs.readdirSync(maps).sort(), [t1, t2].sort());
  land(app, { 'README.md': 'a notes app, reworded\n' }, 'docs only');
  const third = open();
  assert.equal(third.ran.argv[1], t2);
  assert.deepEqual(fs.readdirSync(maps), [t2]);

  // The clone's HEAD, index and working files are as setup left them.
  assert.equal(g(root, 'rev-parse', 'HEAD'), head);
  assert.equal(fs.existsSync(path.join(root, '.git', 'index')), false);
  assert.deepEqual(fs.readdirSync(root), ['.git']);
  assert.deepEqual(fs.readdirSync(apiClone), ['.git']);
}));

test('without the network the last map runs', () => withTmp(async (tmp) => {
  identity(true);
  const { app, open, maps } = launched(tmp);
  const away = `${app.bare}-unreachable`;

  // Never run here and no network: nothing to run, and it says so.
  fs.renameSync(app.bare, away);
  const never = open();
  assert.equal(never.status, 1);
  assert.equal(never.ran, null);
  assert.match(never.stderr, /no map has run on this computer yet/);
  fs.renameSync(away, app.bare);

  const first = open();
  assert.equal(first.status, 0, first.stderr);
  const t1 = first.ran.argv[1];

  land(app, { 'tools/solution-map/solution-map.mjs': standIn('v2') }, 'a newer map');
  fs.renameSync(app.bare, away);
  const offline = open();
  assert.equal(offline.status, 0, offline.stderr);
  assert.match(offline.stderr, /could not fetch .*opening the map last run here/);
  assert.equal(offline.ran.version, 'v1');
  assert.equal(real(offline.ran.cwd), real(path.join(maps, t1)));
  assert.equal(offline.ran.argv[1], t1);
  assert.deepEqual(fs.readdirSync(maps).filter((n) => !n.startsWith('.')), [t1]);

  // Back online: v2 runs and gets its folder. Main then goes back to v1's map, which runs from
  // the folder it already had. Offline again, the map last run is v1, though v2's folder is newer.
  fs.renameSync(away, app.bare);
  const t2 = open().ran.argv[1];
  assert.notEqual(t2, t1);
  land(app, { 'tools/solution-map/solution-map.mjs': standIn('v1') }, 'back to the first map');
  const back = open();
  assert.equal(back.ran.argv[1], t1);
  fs.renameSync(app.bare, away);
  const lastRun = open();
  assert.equal(lastRun.status, 0, lastRun.stderr);
  assert.equal(lastRun.ran.version, 'v1');
  assert.equal(real(lastRun.ran.cwd), real(path.join(maps, t1)));
}));

test('the launcher keeps the map it runs and the one run before, and removes the others', () => withTmp(async (tmp) => {
  identity(true);
  const { app, open, maps } = launched(tmp);
  const t1 = open().ran.argv[1];
  land(app, { 'tools/solution-map/solution-map.mjs': standIn('v2') }, 'a newer map');
  const t2 = open().ran.argv[1];
  assert.deepEqual(fs.readdirSync(maps).sort(), [t1, t2].sort(), 'the map before stays: it may run in another window');

  // An older map, a folder another launch is still writing, and one a prune left aside.
  const older = '0'.repeat(40);
  fs.mkdirSync(path.join(maps, older, 'tools', 'solution-map'), { recursive: true });
  fs.writeFileSync(path.join(maps, older, 'tools', 'solution-map', 'solution-map.mjs'), standIn('v0'));
  const longAgo = new Date(Date.now() - 86400000);
  fs.utimesSync(path.join(maps, older), longAgo, longAgo);
  const writing = `${'1'.repeat(40)}.part-4242`;
  fs.mkdirSync(path.join(maps, writing, 'tools'), { recursive: true });
  const aside = `${'2'.repeat(40)}.prune-77`;
  fs.mkdirSync(path.join(maps, aside, 'tools'), { recursive: true });

  land(app, { 'tools/solution-map/solution-map.mjs': standIn('v3') }, 'a third map');
  const third = open();
  assert.equal(third.status, 0, third.stderr);
  const t3 = third.ran.argv[1];
  assert.equal(third.ran.version, 'v3');
  assert.deepEqual(fs.readdirSync(maps).sort(), [t2, t3, writing].sort());

  // Offline, the map last run runs, and it alone is kept.
  fs.renameSync(app.bare, `${app.bare}-unreachable`);
  const offline = open();
  assert.equal(offline.ran.version, 'v3');
  assert.deepEqual(fs.readdirSync(maps).filter((n) => TREE_ID.test(n)), [t3]);
  assert.ok(fs.existsSync(path.join(maps, writing)));

  // Nothing there to prune, and a prune of nothing, change nothing.
  pruneMaps(path.join(tmp, 'no-maps-here'), []);
  pruneMaps(maps, [t3]);
  assert.deepEqual(fs.readdirSync(maps).sort(), [t3, writing].sort());
}));

test('the launcher takes main\'s copy of itself, never into a checkout', () => withTmp(async (tmp) => {
  identity(true);
  const { app, launcher, open } = launched(tmp);
  const fixed = `${fs.readFileSync(LAUNCH, 'utf8')}\n// a launcher fix on main\n`;
  land(app, { 'tools/solution-map/launcher/launch.mjs': fixed }, 'a launcher fix');

  // A launcher in a checkout runs main's map and is never rewritten.
  const checkout = path.join(tmp, 'checkout');
  const inCheckout = path.join(checkout, 'tools', 'solution-map', 'launcher', 'launch.mjs');
  fs.mkdirSync(path.dirname(inCheckout), { recursive: true });
  g(checkout, 'init', '-q');
  fs.copyFileSync(LAUNCH, inCheckout);
  const fromCheckout = open([], inCheckout);
  assert.equal(fromCheckout.status, 0, fromCheckout.stderr);
  assert.ok(fromCheckout.ran, 'the map ran');
  assert.deepEqual(fs.readFileSync(inCheckout), fs.readFileSync(LAUNCH));

  // The launcher setup installed takes main's copy, which runs from the next opening.
  const taken = open();
  assert.equal(taken.status, 0, taken.stderr);
  assert.match(taken.stdout, /took main's launcher/);
  assert.equal(fs.readFileSync(launcher, 'utf8'), fixed);
  const again = open();
  assert.equal(again.status, 0, again.stderr);
  assert.doesNotMatch(again.stdout, /took main's launcher/);

  // A copy on main that does not pass node --check is left where it is.
  land(app, { 'tools/solution-map/launcher/launch.mjs': 'export const launch = (;\n' }, 'a broken launcher');
  const broken = open();
  assert.equal(broken.status, 0, broken.stderr);
  assert.ok(broken.ran, 'the map ran');
  assert.match(broken.stderr, /does not pass node --check; kept this launcher/);
  assert.equal(fs.readFileSync(launcher, 'utf8'), fixed);
}));

test('the launcher\'s two arguments make a launched map, both or none', () => {
  const tree = 'a'.repeat(40);
  const args = ['--launched', tree, '--root', 'base/notes-app'];
  assert.deepEqual(parseMapArgs(args).launched, { tree, root: path.resolve('base/notes-app') });
  assert.equal('launched' in parseMapArgs(['--port', '0']), false);
  assert.throws(() => parseMapArgs(args.slice(0, 2)), /go together/);
  assert.throws(() => parseMapArgs(['--root', 'x']), /go together/);
  assert.throws(() => parseMapArgs(['--launched', 'not-a-tree', ...args.slice(2)]), /tree id/);
  assert.throws(() => parseMapArgs([...args, '--from', 'overview.json']), /do not go together/);
  assert.throws(() => parseMapArgs([...args, '--launcher', 'launch.mjs']), /unknown argument/);
  // What follows -- goes to the map; a restart's run adds the port and --no-open after it, which win.
  assert.deepEqual(launchArgv(['--root', 'base/notes-app', '--', '--port', '0', '--port', '7318', '--no-open']),
    { root: path.resolve('base/notes-app'), help: false, mapArgs: ['--port', '0', '--port', '7318', '--no-open'] });
  assert.equal(parseMapArgs(['--port', '0', '--port', '7318', '--no-open']).port, 7318);
});

/* ---------- a launched map, running ---------- */

/** The kit's map code as a project's main carries it: the folders of MAP_PATHS from this checkout, without their tests. */
function kitMap() {
  const files = {};
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(KIT, rel), { withFileTypes: true })) {
      const p = `${rel}/${e.name}`;
      if (!e.isDirectory()) files[p] = fs.readFileSync(path.join(KIT, p), 'utf8');
      else if (e.name !== 'test' && e.name !== 'node_modules') walk(p);
    }
  };
  for (const p of MAP_PATHS.filter((x) => x.endsWith('/'))) walk(p.slice(0, -1));
  return files;
}

const THEME = ':root { --accent: #0a7f5a; }\n';

/** A notes app whose main carries the kit's map and a theme. */
const mapOrigin = (tmp) => origin(tmp, 'notes-app', { ...kitMap(), 'tools/gate/config.json': config([{ id: 'app', path: '.' }]), 'kit-pages/theme.css': THEME, 'README.md': 'a notes app\n' });

/** That notes app cloned as setup clones it, with the launcher installed as setup installs it. */
function mapProject(tmp) {
  const app = mapOrigin(tmp);
  const root = partialClone(app, path.join(tmp, 'base', 'notes-app'));
  const launcher = path.join(root, '.git', 'faster-spec', 'launcher', 'launch.mjs');
  fs.mkdirSync(path.dirname(launcher), { recursive: true });
  fs.copyFileSync(LAUNCH, launcher);
  return { app, root, launcher, drafts: path.join(root, '.git', 'faster-spec', 'backlog-drafts.json') };
}

/**
 * Every node process a test's map starts, launchers and maps, records itself and its parent in
 * `dir` (through NODE_OPTIONS `--import`) and exits once `dir/stop` exists: `stop` ends them all and
 * waits until they have, without killing anything by its id.
 */
function processes(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const hook = path.join(dir, 'hook.mjs');
  const log = path.join(dir, 'ran.jsonl');
  const stopFile = path.join(dir, 'stop');
  fs.writeFileSync(hook, [
    "import fs from 'node:fs';",
    `const note = (o) => fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(o) + '\\n');`,
    'note({ pid: process.pid, ppid: process.ppid, argv: process.argv.slice(1) });',
    "process.on('exit', () => note({ exited: process.pid }));",
    `setInterval(() => { if (fs.existsSync(${JSON.stringify(stopFile)})) process.exit(0); }, 100).unref();`,
    '',
  ].join('\n'));
  const ran = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  // Signal 0 only asks whether a process is there. On Windows a launcher that exits first takes
  // its map with it, before the map can note its own exit.
  const alive = (pid) => {
    try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
  };
  const stop = async () => {
    fs.writeFileSync(stopFile, '');
    for (const deadline = Date.now() + 30000; ;) {
      const live = new Set(ran().filter((r) => r.pid && alive(r.pid)).map((r) => r.pid));
      for (const r of ran()) if (r.exited) live.delete(r.exited);
      if (!live.size) return;
      if (Date.now() > deadline) throw new Error(`still running: ${[...live].join(', ')}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  /** The maps of `tree` started so far. */
  const maps = (tree) => ran().filter((r) => r.argv?.[0]?.endsWith('solution-map.mjs') && r.argv[r.argv.indexOf('--launched') + 1] === tree);
  return { env: { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(hook).href}` }, ran, maps, alive, stop };
}

/** The address a started map prints, the process started and its exit; rejects when it ends first. */
function serving(child) {
  return new Promise((resolve, reject) => {
    let out = '';
    const exited = new Promise((r) => child.once('exit', (code) => r(code)));
    child.stdout.on('data', (c) => {
      out += c;
      const m = /http:\/\/127\.0\.0\.1:\d+/.exec(out);
      if (m) resolve({ base: m[0], port: Number(m[0].split(':').pop()), child, exited });
    });
    child.stderr.on('data', (c) => { out += c; });
    exited.then((code) => reject(new Error(`it ended (${code}) before the map served: ${out}`)));
  });
}

/** Opens the map as its shortcut does, on a free port and with no browser. */
const openLaunched = (p, env) => serving(spawn(process.execPath, [p.launcher, '--root', p.root, '--', '--port', '0', '--no-open'], { env, stdio: ['ignore', 'pipe', 'pipe'] }));

const WRITE = { 'x-solution-map': '1', 'content-type': 'application/json' };
/** A write as the map's page sends it: `{ status, body }`. */
async function post(base, route, body = {}) {
  const r = await fetch(`${base}${route}`, { method: 'POST', headers: WRITE, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
const updates = (model) => model.banners.filter((b) => b.kind === 'map-update');
const NEWER = { 'tools/solution-map/lib/newer.mjs': '// a newer map\n' };

/** Whether nothing holds `port` on 127.0.0.1: a server of this test can listen there (asked again for up to `ms`). */
async function portFree(port, ms = 10000) {
  for (const deadline = Date.now() + ms; ;) {
    const free = await new Promise((resolve) => {
      const s = net.createServer();
      s.once('error', () => resolve(false));
      s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
    });
    if (free || Date.now() > deadline) return free;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** The view model of the map at `base`, asked again until a map answers (a restart's map takes a moment). */
async function mapAt(base, ms = 90000) {
  for (const deadline = Date.now() + ms; ;) {
    try {
      const r = await fetch(`${base}/api/map`);
      if (r.ok) return await r.json();
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) throw new Error(`no map answers at ${base}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

test('a newer map on main offers a restart', () => withTmp(async (tmp) => {
  identity(true);
  const p = mapProject(tmp);
  const procs = processes(path.join(tmp, 'processes'));
  try {
    const m = await openLaunched(p, procs.env);
    assert.deepEqual(updates(await mapAt(m.base)), []);
    // A commit outside the map's code is no newer map.
    const docs = land(p.app, { 'README.md': 'a notes app, reworded\n' }, 'docs only');
    const same = (await post(m.base, '/api/refresh')).body;
    assert.equal(same.repos[0].commit, docs);
    assert.deepEqual(updates(same), []);
    // Main gets a newer map: Refresh finds it, and the banner names it.
    land(p.app, NEWER, 'a newer map');
    const tree = expectedTree(p.app, tmp);
    assert.deepEqual(updates((await post(m.base, '/api/refresh')).body), [{ kind: 'map-update', tree }]);
    assert.deepEqual(updates(await mapAt(m.base)), [{ kind: 'map-update', tree }]);
  } finally { await procs.stop(); }
}));

test('restart runs the newer map and keeps the drafts', () => withTmp(async (tmp) => {
  identity(true);
  const p = mapProject(tmp);
  const procs = processes(path.join(tmp, 'processes'));
  try {
    const m = await openLaunched(p, procs.env);
    const key = (await post(m.base, '/api/drafts', { save: { op: 'add', title: 'Dark mode', about: ['editing/theme'] } })).body.draft.key;
    assert.equal((await post(m.base, '/api/drafts', { save: { op: 'note', ref: key, text: 'For night shifts.' } })).body.ok, true);
    const unsent = fs.readFileSync(p.drafts, 'utf8');
    land(p.app, NEWER, 'a newer map');
    const tree = expectedTree(p.app, tmp);
    assert.deepEqual(updates((await post(m.base, '/api/refresh')).body), [{ kind: 'map-update', tree }]);

    let ended = false;
    m.exited.then(() => { ended = true; });
    assert.deepEqual(await post(m.base, '/api/restart'), { status: 200, body: { ok: true } });
    // The old map ends; the launcher the shortcut started runs main's newer map as its child again,
    // in the same window, at the same address, with no banner left to offer.
    assert.deepEqual(updates(await mapAt(m.base)), []);
    assert.equal(ended, false, 'the shortcut\'s launcher still runs');
    const newer = procs.maps(tree);
    assert.equal(newer.length, 1, 'main\'s newer map runs');
    assert.equal(newer[0].ppid, m.child.pid, 'as the child of the launcher the shortcut started');
    assert.ok(fs.existsSync(path.join(p.root, '.git', 'faster-spec', 'maps', tree, 'tools', 'solution-map', 'lib', 'newer.mjs')));
    // The unsent drafts are unchanged.
    const b = await (await fetch(`${m.base}/api/backlog`)).json();
    assert.deepEqual(b.drafts.map((d) => [d.op, d.request]), [['add', key], ['note', key]]);
    assert.equal(fs.readFileSync(p.drafts, 'utf8'), unsent);
    // Ending the launcher, as Ctrl+C or closing its window does, ends the newer map with it: nothing
    // is left holding the port.
    m.child.kill('SIGINT');
    await m.exited;
    for (const deadline = Date.now() + 10000; procs.alive(newer[0].pid) && Date.now() < deadline;) await new Promise((r) => setTimeout(r, 100));
    assert.equal(procs.alive(newer[0].pid), false, 'the newer map ended with its launcher');
    assert.equal(await portFree(m.port), true);
  } finally { await procs.stop(); }
}));

test('a launched map no launcher waits on does not restart', () => withTmp(async (tmp) => {
  identity(true);
  const app = mapOrigin(tmp);
  const checkout = path.join(tmp, 'checkout');
  execFileSync('git', ['clone', '-q', app.url, checkout], { stdio: 'pipe' });
  const procs = processes(path.join(tmp, 'processes'));
  try {
    // Started by hand with the launcher's arguments: no launcher is there to run it again.
    const map = path.join(checkout, 'tools', 'solution-map', 'solution-map.mjs');
    const m = await serving(spawn(process.execPath, [map, '--launched', 'a'.repeat(40), '--root', checkout, '--port', '0', '--no-open'], { cwd: checkout, env: procs.env, stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(updates(await mapAt(m.base)).length, 1, 'main holds another map than the one named');
    const r = await post(m.base, '/api/restart');
    assert.deepEqual([r.status, r.body.ok], [409, false]);
    assert.match(r.body.error, /no longer waits on it/);
    assert.equal((await fetch(`${m.base}/api/map`)).status, 200, 'it keeps serving');
  } finally { await procs.stop(); }
}));

test('a map run from a checkout offers no restart', () => withTmp(async (tmp) => {
  identity(true);
  const app = mapOrigin(tmp);
  const checkout = path.join(tmp, 'checkout');
  execFileSync('git', ['clone', '-q', app.url, checkout], { stdio: 'pipe' });
  const procs = processes(path.join(tmp, 'processes'));
  try {
    const m = await serving(spawn(process.execPath, [path.join(checkout, 'tools', 'solution-map', 'solution-map.mjs'), '--port', '0', '--no-open'], { cwd: checkout, env: procs.env, stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.deepEqual(updates(await mapAt(m.base)), []);
    const newer = land(app, NEWER, 'a newer map');
    const refreshed = (await post(m.base, '/api/refresh')).body;
    assert.equal(refreshed.repos[0].commit, newer);
    assert.deepEqual(updates(refreshed), []);
    const r = await post(m.base, '/api/restart');
    assert.equal(r.status, 409);
    assert.equal(r.body.ok, false);
    assert.match(r.body.error, /shortcut/);
    assert.equal((await fetch(`${m.base}/api/map`)).status, 200, 'it keeps serving');
  } finally { await procs.stop(); }
}));

test('a launched map serves the theme on main', () => withTmp(async (tmp) => {
  identity(true);
  const p = mapProject(tmp);
  const procs = processes(path.join(tmp, 'processes'));
  try {
    const m = await openLaunched(p, procs.env);
    await mapAt(m.base); // the first build, so the Refresh below is one of its own
    const theme = async () => (await fetch(`${m.base}/theme.css`)).text();
    assert.equal(await theme(), THEME);
    // The map's folder holds no theme of its own; the one on main is served, as Refresh fetches it.
    const newer = ':root { --accent: #7a3fd6; }\n';
    land(p.app, { 'kit-pages/theme.css': newer }, 'a new theme');
    await post(m.base, '/api/refresh');
    assert.equal(await theme(), newer);
  } finally { await procs.stop(); }
}));
