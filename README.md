# CueSpec

**Say what it does. Prove it. Review it after it lands.** A small spec workflow for software that
agents build and a person owns: living specs whose scenarios each end in their proof, change folders
that form the owner's to-review list, four agent skills that run every change, a formality gate
and an overview index across repositories. Plain files and Node scripts, no dependencies; a
project takes them as a vendored copy pinned by a lock.

## The workflow

```
  request ──► spec ──► design ──► ship ──► (merged) ──► triage ──► pass / fail, or a follow-up change
             rounds of   look and    build, test,          the owner's review,
             questions   technical   gate, review,         recorded in PROOF lines
                         design      squash merge
```

| Piece | What it is |
|---|---|
| **Living specs**, `specs/<domain>/<capability>/spec.md` | what one capability does, in words a non-developer follows; each scenario ends in PROOF lines: `test:` an automated test, or a human check (`desk: open`, later `pass <date>, build <version>, by <who>`). [Format](specs/README.md) |
| **Change folders**, `changes/<id>/` | one change: the owner's request, the settled questions, the design picked, the evidence. They land on main with the code and stay until the owner approves the result: **the set of change folders on main is the to-review list**. [Format](changes/README.md) |
| **Four skills**, `.agents/skills/` | `spec` settles the requirements in rounds of numbered questions; `design` draws two or three looks and the technical design; `ship` builds, tests, gates, gets a fresh agent's review and merges; `triage` turns the owner's review (notes, or a [CueReview](https://github.com/A7E7-Studios/cue-review) recording) into `pass`/`fail` lines and new changes. Claude Code and Codex read the same files |
| **The gate**, `tools/gate/` | a deterministic check of form on every pull request: spec and change formats, PROOF lines honest, living docs free of history, byte budgets, links, the nearest README, the PR description, the kit copy, and the protected paths only the owner merges. [Its README](tools/gate/README.md) |
| **The overview**, `tools/overview/` | one JSON index (and a plain-text summary) of every capability, scenario, review state, pending change and module, across repositories. [Its README](tools/overview/README.md) |

What stays each project's own: its `AGENTS.md` (the rules, the build route, the suites, the commit
style), its `tools/gate/config.json` (the protected paths, the vendored folders, the module
markers), `specs/domains.json`, and the specs and changes themselves.

## Taking it into a project

The project gets real files, not a submodule (every worktree holds them, and the skills must be
files) and not a package (a Python or Gradle project has no `package.json`). Git and Node 22 or
later; `gh` for the skills.

```
git clone https://github.com/A7E7-Studios/cue-spec ../cue-spec
node ../cue-spec/tools/kit/sync.mjs --project .
```

[`tools/kit/sync.mjs`](tools/kit/README.md) writes every file the kit owns (`kit.json` lists them),
starts `tools/gate/config.json` from [the starter](tools/gate/config.template.json) when the
project has none, and records the kit commit and each file's git blob id in `tools/kit/lock.json`.
Then, in the project:

1. **Config.** In `tools/gate/config.json`, name the project's vendored folders under `ignore`, any
   owner-only paths under `protectedPaths`, and, when its modules are not README, `package.json`,
   `pyproject.toml`, Gradle or Unity folders, its `overview.moduleMarkers`.
2. **Domains.** Write `specs/domains.json`, `[{ "id", "title", "purpose" }]`: the few areas the
   product's capabilities fall into.
3. **AGENTS.md.** The skills read the rules from it: how to make a worktree, the suites a change
   runs (the quality gate), the commit style, how to render the running app for a look, a build's
   identifier and how to find its commit, the other repository of the solution, and what is
   restricted material. Add `node tools/gate/gate.mjs --local` to its quality gate.
4. **Agents.** Add `/.claude/skills` to `.gitignore` and run `node tools/setup-agents/setup.mjs` in
   each checkout and worktree: it links `.agents/skills` for Claude Code.
5. **CI.** `.github/workflows/gate.yml` runs the gate on every pull request, from main's checkout, so
   a pull request cannot rewrite its own gate. It starts report-only (`reportOnly: true`); the
   `protected` check blocks always.
6. **Commit** in a pull request; it touches protected paths, so the owner merges it.

## Keeping it in step

```
node tools/kit/sync.mjs --kit ../cue-spec --ref <tag or commit>   # take a newer kit
node tools/kit/sync.mjs --check                                    # is the committed copy as the lock says?
```

A sync refuses, writing nothing, when the project changed one of the kit's files; such a change
belongs in the kit. The gate's `kit` check fails a pull request whose copy differs from its lock:
an edited, missing or extra file under the kit's paths, or a deleted lock. `tools/kit/**` is
protected, so every sync is merged by the owner.

## Layout

| Path | What | Synced |
|---|---|---|
| `.agents/skills/{spec,design,ship,triage}/` | the four skills, their templates, the reviewer's checklist | yes |
| `specs/README.md`, `changes/README.md` | the spec and change formats | yes |
| `.github/workflows/gate.yml` | the gate on every pull request | yes |
| `tools/gate/` | the formality gate; `config.template.json` the starter config | yes, but `config.json` |
| `tools/overview/` | the overview index | yes |
| `tools/kit/` | the sync command; `lock.json` in a project | yes, but `lock.json` |
| `tools/setup-agents/` | links the skills for Claude Code | yes |
| `tools/solution-map/` | reserved: the local web viewer over the overview's JSON | yes, once it exists |
| `kit.json` | what the kit owns, what stays each project's, the starters | no |
| `AGENTS.md`, `specs/domains.json`, `specs/<domain>/`, `changes/<id>/`, `tools/gate/config.json` | this repository's own workflow, run on itself | no |

## Tests

```
cd tools/gate && npm test
cd tools/overview && npm test
cd tools/kit && npm test
cd tools/setup-agents && npm test
node tools/gate/gate.mjs --local
```

## Licence

MIT, see [LICENSE](LICENSE). The `spec` skill's round structure adapts the `grilling` skill from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
