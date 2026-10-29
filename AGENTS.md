# Agent instructions — CueSpec

This repository is the kit: the spec workflow's skills, formats and tools that projects take as a
vendored copy ([README.md](README.md)). It runs the same workflow on itself. Claude Code and Codex
read this file natively.

## What is the kit, and what is this repository's own

- **The kit** is every path `kit.json` lists; `node tools/kit/sync.mjs` copies exactly those into a
  project. What a project receives must hold in any project: **no product, company, customer,
  person or local-path names** in code, docs, tests or examples, and examples that are neutral (a
  notes app, a backend, a device). A rule that varies by project is project config
  (`tools/gate/config.json`) or that project's `AGENTS.md`, never kit text.
- **This repository's own** files, never synced: this `AGENTS.md`, `kit.json`, `README.md`,
  `LICENSE`, `specs/domains.json`, the specs and the changes, and `tools/gate/config.json`.
- The tests run on `tools/gate/config.template.json`, never on a project's config, so they hold in
  every project that carries the kit.
- `tools/solution-map/` is reserved for the local web viewer over the overview's JSON.

## Quality gate

Every suite green before a change is done, each `node --test`, no dependencies, Node 22 or later:

```
cd tools/gate && npm test
cd tools/overview && npm test
cd tools/kit && npm test
cd tools/setup-agents && npm test
node tools/gate/gate.mjs --local
```

- Every behaviour change lands **with** its test; new logic (parsers, the sync's decisions) gets
  unit tests. A tool's README states what it does at the commit it sits in.
- A change to what a project receives is a change for every project: say in the pull request what
  a project must do on its next sync (a new config key, a renamed path).
- Formats are contracts: the spec and change formats, the overview's JSON (`version`), the lock
  (`version`). A change that breaks one bumps its version and says how a reader migrates.

## Specs and changes

The workflow is the one the kit ships: [specs/README.md](specs/README.md),
[changes/README.md](changes/README.md), the four skills in `.agents/skills/`. Run
`node tools/setup-agents/setup.mjs` once per checkout or worktree.

| Check | Here |
|---|---|
| Human checks | `desk` and `github`, in `tools/gate/config.json` `humanChecks` |
| A build | a commit of this repository: `build <short sha>`, its commit that sha |
| A look | none: the kit draws nothing; a tool's output is checked at the desk |
| The other repository | none; a project that carries the kit is no side of a kit change |

- **Every behaviour change carries a change folder** and edits the living spec in the same pull
  request. Which pull requests need none: [changes/README.md](changes/README.md#which-pull-requests-carry-a-change-folder).
- **Only the owner's word sets `pass` or `fail`** on a PROOF line; agents write `test:` and `open`.
- **The owner merges.** Nearly every pull request here touches a protected path
  ([the list](tools/gate/README.md#protected-paths)), so the gate's `protected` check fails it and
  the owner merges it, never an agent.

## Worktrees

Worktrees live under the main checkout's `.claude/worktrees/`, one per change, cut from a freshly
fetched `origin/main`:

```
git fetch origin
git -C "$(git rev-parse --path-format=absolute --git-common-dir)/.." worktree add .claude/worktrees/<change-id> -b <change-id> origin/main
```

Then `node tools/setup-agents/setup.mjs` inside it.

## Documentation

- Each fact has one home: the specs for behaviour and its proof, a tool's README for how it is
  built and used, this file for the rules. Link to a fact's home; never restate it.
- Living docs (specs, READMEs, this file) state what IS: no history, no status, no pull request
  numbers or dates outside PROOF lines. Rewrite, don't append.
- Byte budgets: this file 32 KiB, a README 40 KiB, a spec and each `.md` of a change folder 30 KiB.

## Commit style

- Imperative, lowercase, no trailing period; title ≤ ~70 chars; prefixes `feat:` `fix:` `docs:`
  `chore:` `refactor:` `test:`, optionally scoped (`feat(kit): …`).
- The body explains the why and the tradeoffs, not the diff. One logical change per commit.
- Code changed where its nearest README does not change carries a `Doc-Impact: none; <reason>`
  trailer on one of the pull request's commits.
- Commit on a feature branch, never on `main`.
