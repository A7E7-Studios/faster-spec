---
title: The owner reviews features, and tests prove scenarios
capabilities:
  - formats/specs
  - formats/changes
  - formats/systems
  - gate/review-state
  - gate/kit-copy
  - overview/review-state
  - overview/components
  - kit/sync
  - agents/design-system
  - agents/code-reuse
  - agents/owner-questions
removes:
  - overview/modules
---
# The owner reviews features, and tests prove scenarios

## Why

A scenario carries both its automated proof and the owner's verdicts, so a spec fills up with
dated `pass` and `fail` lines and the owner's review is spread over many scenarios rather than given
once per feature. Looks are PNGs kept through Git LFS, and feedback brings recordings and frames
into the repository. The owner wants each spec to state only what the feature does now, proven by
tests, with one verdict on the whole feature, and everything else kept as temporary work that is
cleaned up.

## What changes

- **A spec has a layer for people and a layer for agents.** `## Summary` (what the feature does,
  when you meet it, why: a few sentences) replaces Purpose; `## Looks` lists the feature's visual
  design. Requirements read "When …, the app SHALL …, because …". A scenario is a named example
  whose name states the outcome; its steps are optional (one WHEN and one THEN, GIVEN only for a
  setup that is not the default), and a table may stand in for many cases.
- **Scenarios are proven by tests only.** PROOF lines are `test:` lines; a test may be a scripted
  run in an editor or on a device. A scenario without one is untested: a coverage gap the overview
  shows, not a review item. The human checks (`desk`, `headset`, …) and `pass`/`fail` lines go.
- **The review state sits on the feature**: `review: unreviewed | approved | changes-requested` in
  the spec's front matter. Seeding writes `unreviewed`; a pull request that changes a feature's spec
  text, or carries a change folder naming it, resets it to `unreviewed`, and the gate enforces both;
  only triage, on the owner's word, writes `approved` or `changes-requested`. The verdict is the
  whole record; the triage pull request says when and on which build.
- **A change folder is the working plan** between spec, design and ship (`proposal.md`, `look.md`,
  `design.md`, `tasks.md`, nothing else). It lands with its code, and triage deletes it once every
  feature it names is approved. Its `## Review` section says once what the owner looks at and
  where, so triage can batch the reviews that need a device. The `review` and `follow-ups` keys go.
- **Feedback is an ordinary change.** A remark is either a bug (the build differs from the spec)
  or a gap (the spec does not cover it); the change that answers it names the feature. Its proposal
  holds the breakdown as text: each remark with the owner's words, its time, the review session's
  id and what it concerns.
- **No images in the repository.** The gate refuses image and video files under `specs/` and
  `changes/`; `look/<scenario-slug>.png`, `evidence/*.png` and the LFS rule for looks go.
- **The visual design is its own HTML.** The picked design is committed beside the spec as a
  self-contained HTML board, each design a section with an `id`; `## Looks` lists
  `looks/<board>.html#<id>` with a caption, and for a web feature the page to open. The directions
  not picked stay outside the repository.
- **A design-system contract per project**: a `design` block in `tools/gate/config.json` names the
  tokens file and the style brief, and optionally catalogues and a render command; the gate checks
  the files exist. The kit ships a house style in `tools/design/house-style/`, which the starter
  config points at. The design skill runs a critique against the brief and an accessibility list
  before the owner sees directions.
- **Ship builds on the code that is there** (the owner's request): before writing a task's code it
  looks for code that already does it, and extends or refactors that code rather than adding a
  second version, keeping one home per concern. The reviewer's checklist makes re-implementation,
  duplicated logic and architecture drift findings.
- **Systems beside domains.** Each repository declares its systems in `specs/systems.json`: the
  parts that run on their own, each with the paths it owns. A feature's systems follow from its
  `code` paths, so a feature may ship in several, and its spec gains no key.
- **The overview JSON is version 3**: each feature's review state and the commit that set it,
  tested coverage per scenario, Looks as references, each feature's systems, code that no spec or
  no system covers, each change's `## Review` text, and no human checks. The folders found by
  marker files stay for agents as `components`.
- **CI.** A review-only pull request needs only the gate; the README tells a project to add
  `specs/**` and `changes/**` to its heavier workflows' `paths-ignore`.
- **This repository's own specs** move to the new format, and `overview/modules` becomes
  `overview/components`.

## Review

At a desk: read the formats (`specs/README.md`, `changes/README.md`) and the four skills; run the
overview on a project that carries the kit, and the gate on a pull request in one.

## Settled questions

- **Q1 Two layers per feature**: Summary and Looks for people, requirements and scenarios for
  agents. Rejected: Purpose as the only plain-language part.
- **Q2 Proof**: by automation only, `test:` lines; manual QA is not part of the base, and a QA
  skill or a QA test plan may come later as an extension. Rejected: human checks on scenarios.
- **Q3 Where the review state lives**: on the feature, in the spec's front matter, with nothing
  else recorded. Rejected: on the change folder.
- **Q4 What resets a feature to unreviewed**: a change to its spec text: Summary, Looks, a
  requirement or a scenario; not its `code` paths and not its PROOF lines. Rejected: any change
  under the feature's `code` paths, which would reset on every refactor.
- **Q5 Feedback and the fix**: the spec holds only what IS; how it came to be is git's. The fix is
  an ordinary change that names the feature; its breakdown is temporary, in its folder. Rejected:
  a `follow-ups` list on the reviewed change; a fix link in the spec.
- **Q6 Change folders**: the working plan, landing with the code, deleted by triage once every
  feature it names is approved; where the owner looks is free text in the proposal.
- **Q7 Images**: none in the repository: no recordings, clips, frames or PNG looks.
- **Q8 Looks**: as simple as possible: the visual design is its own HTML, kept beside the spec,
  pulled in by the directions page and the Solution map. Screenshots of the built app are left for
  a later change. Rejected: rendered PNGs; catalogue entries with a render cache; HTML kept outside
  the repository, where links rot.
- **Q9 The design-system contract**: a `design` block in `tools/gate/config.json`. Rejected: a
  separate file at the root.
- **Q10 The kit's pages**: templates in the kit that a project's theme file or same-named page
  overrides, never synced over.
- **Q11 CI**: review-only pull requests run only the gate.
- **Q12 How features are grouped**: domains plus systems, the practice of a service catalog.
  Rejected: folder modules as the second grouping, which adds nothing for a person.
- **Q13 Code reuse**: ship looks for existing code before writing, extends or refactors it, and
  the review checks for duplication and re-implementation (the owner's request).

## Calls for the owner

- **The kit's pages land with the Solution map**, not here: they are drawn in its look, which that
  change designs. Alternative: plain pages now, restyled later; they would be drawn twice.
- **The house style is kit files a project points at**, `tools/design/house-style/tokens.css` and
  `brief.md`, and the starter config's `design` block names them; a project with its own style
  points at its own files. Alternative: a starter the sync copies into the project; the copy would
  drift from the kit's.
- **A board is `specs/<domain>/<capability>/looks/<name>.html`**, self-contained (its CSS inline,
  no `http(s)` source), at most 30720 bytes, each design a `<section id="…">`. A Looks line is
  `- looks/<name>.html#<id> — <caption>` or `- page: <path or URL> — <caption>`; the gate checks
  the board exists and holds the id, and a board no line names is stray. Alternative: one board
  per domain; it would mix features.
- **A board's edit counts as spec text**: it resets the feature and needs a change folder.
- **Every statement holds `SHALL` and `because`**, which the gate checks; "When …," is the form
  the skills write, not checked, since a behaviour that always holds has no event.
- **Steps, when a scenario has them, are one WHEN and one THEN**, at most one GIVEN first, `AND`
  after any; the gate checks it. A table follows the steps and precedes the PROOF lines.
- **An untested scenario is valid** and counts as untested in the overview and the triage
  checklist; the gate fails nothing for it.
- **`specs/systems.json` is `[{ "id", "title", "purpose", "paths" }]`**, like `domains.json`,
  `paths` written as a spec's `code` is, each present at the commit. A system across repositories
  has the same id in each. A path belongs to the nearest system declaring it or a folder above it;
  two systems declaring the same path fail the gate; code outside every system is information.
  Alternative: systems inside `domains.json`; it would mix the product view with what ships.
- **Config keys renamed**: `overview.moduleMarkers` becomes `overview.componentMarkers`,
  `overview.excludeModules` becomes `overview.excludeComponents`; an old key fails the config with
  its new name. A project renames them on its next sync.
- **The overview JSON skips to version 3**, since version 2 already names each module's manifest.

## Out of scope

- Screenshots of the built app, on a device or a desktop.
- A QA skill or a QA test plan.
- The Solution map and the kit's pages; they read version 3.
- Syncing the projects: each takes this version in its own pull request.
