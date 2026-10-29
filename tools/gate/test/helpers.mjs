// Small throwaway git repositories and spec texts for the gate's and the overview's tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const GATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function git(dir, args, input) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', input, windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** A repo whose first commit on main holds `files` (null deletes); origin/main points at it. */
export function makeRepo(files = { 'README.md': '# Root\n\nThe root.\n' }, { prefix = 'gate-test-' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  git(dir, ['init', '-q', '-b', 'main']);
  for (const [k, v] of Object.entries({
    'user.name': 'Gate Test',
    'user.email': 'gate@test.invalid',
    'commit.gpgsign': 'false',
    'core.autocrlf': 'false',
    'core.hooksPath': '.no-hooks',
  })) {
    git(dir, ['config', k, v]);
  }
  const r = {
    dir,
    write(map) {
      for (const [p, content] of Object.entries(map)) {
        const f = path.join(dir, ...p.split('/'));
        if (content === null) {
          fs.rmSync(f, { force: true, recursive: true });
          continue;
        }
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, content);
      }
      return r;
    },
    commit(message = 'chore: test') {
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-q', '--allow-empty', '-m', message]);
      return git(dir, ['rev-parse', 'HEAD']);
    },
    branch(name, from = 'main') {
      git(dir, ['checkout', '-q', '-B', name, from]);
      return r;
    },
    rev(ref) {
      return git(dir, ['rev-parse', ref]);
    },
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  r.write(files);
  r.main = r.commit('chore: initial');
  git(dir, ['update-ref', 'refs/remotes/origin/main', r.main]);
  return r;
}

/** The human checks the tests write. */
export const TEST_CHECKS = [
  { id: 'desk', how: 'at a computer', needs: 'a build with the change' },
  { id: 'device', how: 'on one device', needs: 'a device build with the change' },
  { id: 'two-devices', how: 'with two people on two devices, in one session', needs: 'two devices on that build' },
];

/**
 * The starter config (config.template.json) with report-only off, and the vendored trees, living
 * docs, budgets and human checks the tests write: the same in every repository that carries the gate.
 */
export function testConfig(overrides = {}) {
  const base = JSON.parse(fs.readFileSync(path.join(GATE_DIR, 'config.template.json'), 'utf8'));
  const livingDocs = { include: ['specs/**/*.md', '**/README.md', '**/AGENTS.md', '**/ARCHITECTURE.md'], exclude: ['changes/**'] };
  const budgets = [
    { pattern: 'changes/**/*.md', bytes: 30720 },
    { pattern: 'specs/**/spec.md', bytes: 30720 },
    { pattern: '**/AGENTS.md', bytes: 32768 },
    { pattern: '**/README.md', bytes: 40960 },
  ];
  return { ...base, reportOnly: false, ignore: ['Packages/com.vendor.*/**', 'Packages/com.unity.*/**'], livingDocs, budgets, humanChecks: TEST_CHECKS, ...overrides };
}

export function check(report, id) {
  return report.checks.find((c) => c.id === id);
}

export function fails(report, id) {
  return check(report, id).findings.filter((f) => f.level === 'fail');
}

export function failText(report, id) {
  return fails(report, id).map((f) => `${f.file ?? ''}:${f.line ?? ''} ${f.message}`).join('\n');
}

export function infos(report, id) {
  return check(report, id).findings.filter((f) => f.level === 'info');
}

export const DOMAINS = JSON.stringify(
  [
    ['collaboration', 'Collaboration'],
    ['library', 'Library'],
    ['layout', 'Layout'],
    ['assistant', 'Assistant'],
    ['learning', 'Learning'],
    ['account', 'Account'],
    ['tooling', 'Tooling'],
  ].map(([id, title]) => ({ id, title, purpose: `Everything about ${title.toLowerCase()}.` })),
  null,
  2,
);

export const P = (v) => `- **PROOF** ${v}`;

const SCENARIO = {
  name: 'A collaborator edits the same note',
  steps: ['GIVEN two users in one note', 'WHEN one user types in a paragraph', 'THEN the other sees a cursor where they type'],
  proofs: ['test: src/cursors/cursors.test.js', 'two-devices: open'],
};

/** A spec in the contract's format; every part can be replaced. */
export function specText({
  title = 'Shared cursors',
  code = ['src/cursors/'],
  purpose = 'A cursor shows where each collaborator is typing.',
  requirements,
  scenarios,
  proofs,
  then,
} = {}) {
  const sc = scenarios ?? [
    {
      ...SCENARIO,
      ...(proofs ? { proofs } : {}),
      ...(then ? { steps: [...SCENARIO.steps.slice(0, 2), `THEN ${then}`] } : {}),
    },
  ];
  const reqs = requirements ?? [
    { name: 'Cursors show where others type', text: 'The app SHALL show a cursor for each collaborator in the note, because a user otherwise loses track of who is where.', scenarios: sc },
  ];
  const lines = ['---', `title: ${title}`, 'code:', ...code.map((c) => `  - ${c}`), '---', `# ${title}`, '', '## Purpose', '', purpose, '', '## Requirements', ''];
  for (const r of reqs) {
    lines.push(`### Requirement: ${r.name}`, r.text, '');
    for (const s of r.scenarios) {
      lines.push(`#### Scenario: ${s.name}`);
      for (const st of s.steps) {
        const [k, ...rest] = st.split(' ');
        lines.push(`- **${k}** ${rest.join(' ')}`);
      }
      lines.push(...s.proofs.map(P), '');
    }
  }
  return lines.join('\n');
}

/** A change proposal in the contract's format. */
export function proposalText({ title = 'Cursors for collaborators', capabilities = ['collaboration/shared-cursors'], removes = null, review = 'unreviewed', followUps = null } = {}) {
  return [
    '---',
    `title: ${title}`,
    'capabilities:',
    ...capabilities.map((c) => `  - ${c}`),
    ...(removes ? ['removes:', ...removes.map((c) => `  - ${c}`)] : []),
    `review: ${review}`,
    ...(followUps ? ['follow-ups:', ...followUps.map((f) => `  - ${f}`)] : []),
    '---',
    `# ${title}`,
    '',
    '## Why',
    '',
    'Wearers lose each other.',
    '',
  ].join('\n');
}

/** The files of a repo with one valid capability, collaboration/shared-cursors. */
export function baseFiles(extra = {}) {
  return {
    'README.md': '# Root\n\nThe root.\n',
    'specs/domains.json': DOMAINS,
    'src/README.md': '# Source\n\nThe code.\n',
    'src/cursors/cursors.js': 'export const cursors = 1;\n',
    'src/cursors/cursors.test.js': 'test\n',
    'specs/collaboration/shared-cursors/spec.md': specText(),
    ...extra,
  };
}
