import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setup, setupCommands, shortcutFiles, repoName, GIT_PAGE, NODE_PAGE, SETUP_PATHS } from '../launcher/setup.mjs';
import { MAP_PATHS } from '../launcher/launch.mjs';

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
  assert.doesNotMatch(oldNode.warn.join('\n'), /Git, from/);
  unchanged();

  const noGit = await runSetup({ root, home, gitVersion: async () => null });
  assert.equal(noGit.code, 1);
  assert.match(noGit.warn.join('\n'), new RegExp(`install Git, from ${GIT_PAGE}`));
  assert.doesNotMatch(noGit.warn.join('\n'), /Node\.js/);
  unchanged();

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
  // A project whose main carries the launcher, and a developer's checkout of it.
  const kitFiles = {};
  for (const p of ['tools/solution-map/launcher/setup.mjs', 'tools/solution-map/launcher/launch.mjs', 'tools/solution-map/lib/sources.mjs']) {
    kitFiles[p] = fs.readFileSync(path.join(KIT, p), 'utf8');
  }
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
    const taken = path.join(clone, '.git', 'faster-spec', 'setup', 'tools', 'solution-map', 'launcher', 'setup.mjs');
    assert.equal(fs.readFileSync(taken, 'utf8'), kitFiles['tools/solution-map/launcher/setup.mjs']);
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
    assert.match(runSh(empty, h1).stdout, new RegExp(`^Install Git first: ${GIT_PAGE}`));
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
    assert.match(runPs(empty, home).stdout, new RegExp(`^Install Git first: ${GIT_PAGE}`));
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
  const open = () => {
    fs.rmSync(record, { force: true });
    const r = spawnSync(process.execPath, [launcher, '--root', root], { encoding: 'utf8', env: { ...process.env, LAUNCH_RECORD: record } });
    return { ...r, ran: fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8')) : null };
  };
  return { api, app, root, apiClone, open, maps: path.join(root, '.git', 'faster-spec', 'maps') };
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

  const first = open();
  assert.equal(first.status, 0, first.stderr);
  const t1 = expectedTree(app, tmp);
  assert.equal(first.ran.version, 'v1');
  assert.equal(real(first.ran.cwd), real(path.join(maps, t1)));
  assert.deepEqual(first.ran.argv, ['--launched', t1, '--repo', `app=${root}`, '--repo', `api=${apiClone}`]);

  // Main gets a newer map, and the backend a new commit.
  land(app, { 'tools/solution-map/solution-map.mjs': standIn('v2') }, 'a newer map');
  const apiMain = land(api, { 'src/server.js': '// serves notes\n' }, 'backend change');
  const second = open();
  assert.equal(second.status, 0, second.stderr);
  const t2 = expectedTree(app, tmp);
  assert.notEqual(t2, t1);
  assert.equal(second.ran.version, 'v2');
  assert.equal(real(second.ran.cwd), real(path.join(maps, t2)));
  assert.deepEqual(second.ran.argv, ['--launched', t2, '--repo', `app=${root}`, '--repo', `api=${apiClone}`]);
  assert.equal(g(apiClone, 'rev-parse', 'origin/main'), apiMain);

  // A commit outside the map's code is the same map: no new folder.
  land(app, { 'README.md': 'a notes app, reworded\n' }, 'docs only');
  const third = open();
  assert.equal(third.ran.argv[1], t2);
  assert.deepEqual(fs.readdirSync(maps).sort(), [t1, t2].sort());

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
