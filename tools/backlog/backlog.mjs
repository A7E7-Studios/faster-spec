#!/usr/bin/env node
// The backlog's command line: list, show, add, note, move and link. Each write fetches the
// backlog's branch, replays onto its tip and pushes one commit; `--json` prints for agents.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runGit } from '../gate/lib/git.mjs';
import { readConfig, resolveRepos, fetchRepo } from '../solution-map/lib/sources.mjs';
import { SET_STATES, SECTIONS } from './lib/item.mjs';
import { SHOWN_STATES, STATE_LABELS, withShownStates } from './lib/state.mjs';
import { locateBacklog, fetchBacklog, readBacklog, writeBacklog } from './lib/store.mjs';

const USAGE = `usage: node tools/backlog/backlog.mjs list [--state <${SHOWN_STATES.join('|')}>] [--json]
       node tools/backlog/backlog.mjs show <id> [--json]
       node tools/backlog/backlog.mjs add <title> [--about <feature-id>]... [--happens <text>] [--should <text>] [--where <text>] [--json]
       node tools/backlog/backlog.mjs note <id> <text>      (text - reads it from stdin)
       node tools/backlog/backlog.mjs move <id> <${SET_STATES.join('|')}>
       node tools/backlog/backlog.mjs link <id> <change-id>
  the backlog is backlog { repo, branch } in tools/gate/config.json; by default the branch
  "backlog" of the repository this runs in`;

const COMMANDS = {
  list: { args: 0, options: ['--state', '--json'] },
  show: { args: 1, options: ['--json'] },
  add: { args: 1, options: ['--about', '--happens', '--should', '--where', '--json'] },
  note: { args: 2, options: [] },
  move: { args: 2, options: [] },
  link: { args: 2, options: [] },
};
const VALUED = ['--state', '--about', '--happens', '--should', '--where'];

/** The parsed command line: `{ cmd, args, about, json, state?, happens?, should?, where?, help }`; throws on a bad one. */
export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const o = { cmd, args: [], about: [], json: false, help: false };
  if (cmd === undefined || cmd === '-h' || cmd === '--help') return { ...o, help: true };
  const spec = COMMANDS[cmd];
  if (!spec) throw new Error(`unknown command "${cmd}"`);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--') {
      o.args.push(...rest.slice(i + 1));
      break;
    }
    if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) {
      if (!spec.options.includes(a)) throw new Error(`${cmd} takes no ${a}`);
      if (a === '--json') o.json = true;
      else {
        const v = rest[++i];
        if (v === undefined) throw new Error(`${a} needs a value`);
        if (a === '--about') o.about.push(v);
        else o[a.slice(2)] = v;
      }
    } else o.args.push(a);
  }
  if (o.help) return o;
  if (o.args.length !== spec.args) throw new Error(`${cmd} takes ${spec.args === 0 ? 'no argument' : `${spec.args} argument${spec.args > 1 ? 's' : ''}`}`);
  if (o.state !== undefined && !SHOWN_STATES.includes(o.state)) throw new Error(`--state is one of ${SHOWN_STATES.join(', ')}`);
  return o;
}

/** The backlog and the solution's repositories, as seen from `cwd`. */
function context(cwd) {
  const top = runGit(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true });
  const root = top.status === 0 && String(top.stdout).trim() ? String(top.stdout).trim() : cwd;
  const config = readConfig(root);
  const repos = config?.solutionMap?.repos ? resolveRepos({ config, root }) : [];
  const where = locateBacklog({ config, repos, root });
  return { where, repos: repos.length ? repos : [{ id: 'repo', dir: where.dir }] };
}

/** The backlog fetched now (else as last fetched, with a warning) and each item's shown state. */
async function load({ where, repos }) {
  const f = await fetchBacklog(where);
  if (f.state === 'unreachable') console.error(`backlog: cannot fetch ${where.branch} (${f.error}); reading what this clone last fetched`);
  // After the backlog's own fetch, never beside it: two fetches in one repository race for its refs.
  await Promise.all(repos.map((r) => fetchRepo(r.dir)));
  const read = readBacklog(where, { tip: f.tip });
  for (const p of read.problems) console.error(`backlog: ${p}`);
  return withShownStates(read.items, repos);
}

const newestFirst = (a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : a.id < b.id ? -1 : 1);
const label = (s) => STATE_LABELS[s] ?? 'Cannot be read';
const summary = (i) => ({ id: i.id, title: i.title, by: i.by, created: i.created, state: i.state, shown: i.shown, about: i.about, change: i.change, ...(i.problems.length ? { problems: i.problems } : {}) });

function printList(items, json) {
  if (json) return console.log(JSON.stringify(items.map(summary), null, 2));
  if (!items.length) return console.log('no requests');
  const w = Math.max(...items.map((i) => i.id.length));
  const s = Math.max(...items.map((i) => label(i.shown).length));
  for (const i of items) {
    const tail = i.problems.length ? `backlog/${i.id}.md: ${i.problems[0].message}` : `${i.title}  (${i.by}, ${i.created})`;
    console.log(`${i.id.padEnd(w)}  ${label(i.shown).padEnd(s)}  ${tail}`);
  }
}

function printItem(i, json) {
  if (json) return console.log(JSON.stringify(i, null, 2));
  const out = [i.title || i.id, `${i.id} · ${label(i.shown)}${i.change.length ? ` (set: ${label(i.state)})` : ''} · asked by ${i.by} on ${i.created}`];
  if (i.about.length) out.push(`About: ${i.about.join(', ')}`);
  if (i.changes.length) out.push(`Changes: ${i.changes.map((c) => `${c.id} (${label(c.state)})`).join(', ')}`);
  for (const p of i.problems) out.push(`Problem: line ${p.line}: ${p.message}`);
  for (const [key, heading] of SECTIONS) out.push('', heading, i[key] || '-');
  out.push('', 'Notes');
  if (!i.notes.length) out.push('-');
  for (const n of i.notes) out.push(`${n.by} · ${n.at} UTC`, n.text, '');
  console.log(out.join('\n').trimEnd());
}

/** Sends one write; prints why nothing was sent and returns null when so, else its one result. */
async function send({ where }, op) {
  const w = await writeBacklog(where, [op]);
  if (!w.ok) {
    console.error(`backlog: nothing was sent: ${w.error}`);
    return null;
  }
  const r = w.results[0];
  if (r.status === 'refused') {
    console.error(`backlog: ${r.reason}`);
    return null;
  }
  return { ...r, commit: w.commit };
}

const short = (sha) => sha.slice(0, 7);

export async function main(argv, { cwd = process.cwd() } = {}) {
  let o;
  let ctx;
  try {
    o = parseArgs(argv);
    if (o.help) {
      console.log(USAGE);
      return 0;
    }
    ctx = context(cwd);
  } catch (e) {
    console.error(`backlog: ${e.message}\n${USAGE}`);
    return 2;
  }
  if (o.cmd === 'list') {
    const items = (await load(ctx)).filter((i) => o.state === undefined || i.shown === o.state).sort(newestFirst);
    printList(items, o.json);
    return 0;
  }
  if (o.cmd === 'show') {
    const item = (await load(ctx)).find((i) => i.id === o.args[0]);
    if (!item) {
      console.error(`backlog: no request "${o.args[0]}"`);
      return 1;
    }
    printItem(item, o.json);
    return 0;
  }
  if (o.cmd === 'add') {
    const r = await send(ctx, { op: 'add', title: o.args[0], about: o.about, happens: o.happens, should: o.should, where: o.where });
    if (!r) return 1;
    console.log(o.json ? JSON.stringify({ id: r.id, commit: r.commit }) : r.id);
    return 0;
  }
  const [id, value] = o.args;
  if (o.cmd === 'note') {
    const text = value === '-' ? fs.readFileSync(0, 'utf8') : value;
    const r = await send(ctx, { op: 'note', id, text });
    if (!r) return 1;
    console.log(`${id}: note sent (${short(r.commit)})`);
    return 0;
  }
  if (o.cmd === 'move') {
    const r = await send(ctx, { op: 'move', id, to: value });
    if (!r) return 1;
    console.log(r.status === 'unchanged' ? `${id} is ${label(value)} already; nothing sent` : `${id}: ${label(r.before)} -> ${label(value)} (${short(r.commit)})`);
    return 0;
  }
  const r = await send(ctx, { op: 'link', id, change: value });
  if (!r) return 1;
  console.log(r.status === 'unchanged' ? `${id} names ${value} already; nothing sent` : `${id}: linked to ${value} (${short(r.commit)})`);
  return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }, (e) => {
    console.error(`backlog: ${e.message}`);
    process.exitCode = 1;
  });
}
