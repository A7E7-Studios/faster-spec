---
title: The kit in its own repository, synced into each project
capabilities:
  - kit/sync
  - gate/kit-copy
  - overview/modules
  - agents/owner-questions
review: unreviewed
---
# The kit in its own repository, synced into each project

## Why

The spec workflow lived as two byte-identical copies in the first two projects that adopted it,
and four more projects (a Python one and a Kotlin/Android one among them) are to take it. Copies
kept by hand drift; module discovery saw only README, asmdef and package.json folders; and the
owner's questions came as walls of text rather than through the harness's question tool.

## What changes

- The kit moves into this repository, with neutral names and examples, under MIT.
- A project takes it with `tools/kit/sync.mjs`, which writes the kit's files at one kit commit and
  records them in `tools/kit/lock.json`: *A project takes the kit for the first time*, *A project
  takes a newer kit*, *The project edited a kit file*, *A first sync over a hand copy*, *A CRLF
  checkout syncs again*.
- The gate's new `kit` check holds the copy to its lock: *A pull request edits a kit file*, *The
  kit's own repository*, *Main carries a drift*. `tools/kit/**` joins the protected paths.
- Python and Gradle folders are modules, and a project may name its own markers: *A Python and
  Gradle repository*, *A repository names its own markers*.
- The spec and design skills ask the owner through the harness's question tool: *A round of five
  questions in Claude Code*, *A round asked as text*.
- `setup-agents` gains tests; the tests run on `tools/gate/config.template.json`, never a project's
  config, so they hold in every project.

## Settled questions

- **Q1 Home, name and licence**: `A7E7-Studios/faster-spec`, private until the owner has read it,
  MIT, holder as CueReview's; a fresh history. Rejected: keeping it in one of the projects; the
  names CueSpec, Proofline, Signoff, Specwright and Proofmark.
- **Q2 How a project takes it**: a vendored copy, one sync command, a lock with the kit commit and
  each file's hash, a gate check against drift. Rejected: a git submodule (the owner works in many
  worktrees, and the skills must be real files); an npm package (Python and Gradle projects have no
  `package.json`).
- **Q3 What changes in the move**: the module markers and the question-tool rule; everything else
  moves as it was. Rejected: a redesign.
- **Q4 The human checks**: they move as they were, the gate's five (`desk`, `headset`,
  `two-headsets`, `printed-card`, `live-tenant`), with the skills' text about them. The owner is
  redesigning human review (likely: automated proof only on scenarios, a whole-change review by the
  owner); that is the kit's next format change. Rejected: making the five configurable first.
- **Q5 Never synced**: `AGENTS.md`, `tools/gate/config.json`, `specs/domains.json`, the specs and
  the changes; each project owns them.
- **Q6 The viewer**: the Solution map, a local web page over the overview's JSON, comes to this
  repository later; `tools/solution-map/` is reserved for it.
- **Q7 Questions**: through the harness's question tool (Claude Code's `AskUserQuestion`: 4
  questions a call, 2–4 options, recommended first); numbered text with one list item per option
  only without one.

## Calls for the owner

- **The lock lives at `tools/kit/lock.json`, and its hash is the git blob id** (what
  `git hash-object` prints), so a checkout's line endings are no drift. Alternative: SHA-256 of the
  bytes; it would flag a CRLF checkout.
- **`--ref` defaults to `origin/main`.** Alternative: the kit's latest tag, once there are tags.
- **A first sync replaces a committed hand copy** and prints each file as `replace`, since git
  holds what it replaced; it refuses uncommitted changes. Alternative: always ask for `--force`.
- **The sync starts `tools/gate/config.json` from `config.template.json`** when a project has none,
  report-only.
- **The default module markers add `pyproject.toml`, `build.gradle` and `build.gradle.kts`** for
  every project; a project that wants fewer names its own.
- **This repository is strict** (`reportOnly: false`); its one human check is `desk`.
- **`tools/solution-map/` is kit-owned but not protected**; protect it when the viewer lands if the
  to-review list it shows should be owner-merged like the overview.
- **Commits here carry the `Co-Authored-By` trailer**, as CueReview's do; the projects' own rule
  against it stays theirs.

## Out of scope

- The redesign of human review, and the Solution map itself.
- Releases and tags of the kit; a sync takes any commit.
- Making this repository public: the owner does that after reading it.
