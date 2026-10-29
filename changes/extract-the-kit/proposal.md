---
title: The kit in its own repository, synced into each project
capabilities:
  - kit/sync
  - gate/kit-copy
  - gate/human-checks
  - overview/modules
review: unreviewed
---
# The kit in its own repository, synced into each project

## Why

The spec workflow lived as two byte-identical copies in the first two projects that adopted it,
and four more projects (a Python one and a Kotlin/Android one among them) are to take it. Copies
kept by hand drift, and three spots in it spoke of one product only: its five human checks, module
discovery that saw only README, asmdef and package.json folders, and skill text about one headset.

## What changes

- The kit moves into this repository, with neutral names and examples, under MIT.
- A project takes it with `tools/kit/sync.mjs`, which writes the kit's files at one kit commit and
  records them in `tools/kit/lock.json`: *A project takes the kit for the first time*, *A project
  takes a newer kit*, *The project edited a kit file*, *A first sync over a hand copy*, *A CRLF
  checkout syncs again*.
- The gate's new `kit` check holds the copy to its lock: *A pull request edits a kit file*, *The
  kit's own repository*, *Main carries a drift*. `tools/kit/**` joins the protected paths.
- Each project names its human checks in `tools/gate/config.json` `humanChecks`, with how and
  needs: *A PROOF line names a check the project lacks*, *A config that misnames a check*, *Two
  repositories, one without checks named*. The `spec` and `triage` skills read them from there.
- Python and Gradle folders are modules, and a project may name its own markers: *A Python and
  Gradle repository*, *A repository names its own markers*.
- `setup-agents` gains tests; the tests run on `tools/gate/config.template.json`, never a project's
  config.

## Settled questions

- **Q1 Home and licence**: this repository under A7E7-Studios, MIT, holder as CueReview's; a fresh
  history. Rejected: keeping it in one of the projects.
- **Q2 How a project takes it**: a vendored copy, one sync command, a lock with the kit commit and
  each file's hash, a gate check against drift. Rejected: a git submodule (the owner works in many
  worktrees, and the skills must be real files); an npm package (Python and Gradle projects have no
  `package.json`).
- **Q3 What changes in the move**: nothing but the three project-specific spots (human checks,
  module markers, skill text). Rejected: a redesign.
- **Q4 Never synced**: `AGENTS.md`, `tools/gate/config.json`, `specs/domains.json`, the specs and
  the changes; each project owns them.
- **Q5 The viewer**: the Solution map, a local web page over the overview's JSON, comes to this
  repository later; `tools/solution-map/` is reserved for it.

## Calls for the owner

- **The name.** CueSpec, `A7E7-Studios/cue-spec`, as recommended; the README, the schema's `$id`
  and the projects' locks carry it. Another name changes those and nothing else.
- **The lock lives at `tools/kit/lock.json`, and its hash is the git blob id** (what
  `git hash-object` prints), so a checkout's line endings are no drift. Alternative: SHA-256 of the
  bytes; it would flag a CRLF checkout.
- **`--ref` defaults to `origin/main`.** Alternative: the kit's latest tag, once there are tags.
- **A first sync replaces a committed hand copy** and prints each file as `replace`, since git
  holds what it replaced; it refuses uncommitted changes. Alternative: always ask for `--force`.
- **The sync starts `tools/gate/config.json` from `config.template.json`** when a project has none,
  report-only, with one human check, `desk`.
- **The default module markers add `pyproject.toml`, `build.gradle` and `build.gradle.kts`** for
  every project; a project that wants fewer names its own.
- **A repository whose config names no human checks reads any check id** in the overview, so an
  older ref still reads; the gate requires `humanChecks`.
- **This repository is strict** (`reportOnly: false`) and has two human checks, `desk` and `github`.
- **`tools/solution-map/` is kit-owned but not protected**; protect it when the viewer lands if the
  to-review list it shows should be owner-merged like the overview.
- **Commits here carry the `Co-Authored-By` trailer**, as CueReview's do; the projects' own rule
  against it stays theirs.

## Out of scope

- The Solution map itself.
- Releases and tags of the kit; a sync takes any commit.
- Making this repository public: the owner does that after reading it.
