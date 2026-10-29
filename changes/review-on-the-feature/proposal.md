---
title: The owner reviews features, and tests prove scenarios
capabilities:
  - formats/specs
  - formats/changes
  - gate/review-state
  - overview/review-state
  - agents/design-system
review: unreviewed
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
- **The review state sits on the feature**: `review: approved | unreviewed | changes-requested` in
  the spec's front matter. Seeding writes `unreviewed`; a pull request that changes a feature's spec
  text resets it to `unreviewed`, and the gate enforces it; only triage, on the owner's word, writes
  `approved` or `changes-requested`. The verdict is the whole record: no notes, build or reviewer in
  the spec; the triage pull request says when and on which build.
- **A change folder is the working plan** between spec, design and ship (`proposal.md`, `look.md`,
  `design.md`, `tasks.md`). It lands with its code, and triage deletes it once every feature it
  names is approved. Its proposal says once what the owner looks at and where, in free text, so
  triage can batch the reviews that need a device. The proposal's `review` and `follow-ups` keys go.
- **Feedback is an ordinary change.** A remark is either a bug (the build differs from the spec)
  or a gap (the spec does not cover it); the change that answers it names the feature and edits
  the spec where the spec changes. Its proposal holds the breakdown as text: each remark with the
  owner's words, its time, the review session's id and what it concerns. When that change lands,
  the feature is `unreviewed` again.
- **No images in the repository.** The gate refuses image files under `specs/` and `changes/`;
  `look/<scenario-slug>.png`, `evidence/*.png` and the LFS rule for looks go.
- **The visual design is its own HTML.** The picked design is committed beside the spec as an HTML
  board, each design a section with an `id`; `## Looks` lists `<board>.html#<id>` with a caption,
  and for a web feature the page to open. The directions page and the Solution map pull each
  section in by its id. The directions not picked stay outside the repository.
- **A design-system contract per project**: a `design` block in `tools/gate/config.json` names the
  tokens file, the style brief (principles and 3–5 reference products) and the catalogues; the gate
  validates it. The kit ships a house style (tokens and a brief) as a starter. The design skill runs
  a critique against the brief and an accessibility list before the owner sees directions.
- **The kit's own pages** (the directions page, the triage checklist) are templates in the kit,
  drawn in the Solution map's look; the agent fills in data and never writes the page. A project
  restyles them with a theme file of CSS tokens, or replaces one with a same-named file in a
  project-owned folder; the sync touches neither.
- **CI.** A review-only pull request (a `review:` flip, a deleted change folder) runs only the gate;
  the README tells a project to add `specs/**` and `changes/**` to its heavy workflows'
  `paths-ignore`.
- **The overview JSON is version 3**: each capability's review state read from `review:`, tested
  coverage per scenario, Looks as references, and no human checks.

## Settled questions

- **Q1 Two layers per feature**: Summary and Looks for people, requirements and scenarios for
  agents, as described above. Rejected: Purpose as the only plain-language part.
- **Q2 Proof**: by automation only, `test:` lines; manual QA is not part of the base, and a QA
  skill or a QA test plan may come later as an extension. Rejected: human checks on scenarios.
- **Q3 Where the review state lives**: on the feature, in the spec's front matter, binary in kind
  (approved, unreviewed, changes-requested) with nothing else recorded. Rejected: on the change
  folder.
- **Q4 What resets a feature to unreviewed**: a change to its spec text: Summary, Looks, a
  requirement or a scenario; not its `code` paths and not its PROOF lines. A code-only fix that
  the owner should see is reset by ship. Rejected: any change under the feature's `code` paths,
  which would reset on every refactor.
- **Q5 Feedback and the fix**: the spec holds only what IS; how it came to be is git's. The fix is
  an ordinary change that names the feature; its breakdown is temporary, in its folder, and goes
  when the owner approves. Rejected: a `follow-ups` list on the reviewed change; a fix link in the
  spec.
- **Q6 Change folders**: the working plan, landing with the code, deleted by triage once every
  feature it names is approved; where the owner looks is free text in the proposal.
- **Q7 Images**: none in the repository: no recordings, clips, frames or PNG looks; the gate
  refuses them under `specs/` and `changes/`.
- **Q8 Looks**: as simple as possible: the visual design is its own HTML, kept beside the spec,
  and both the directions page and the Solution map pull it in. Screenshots of the built app,
  devices included, are left for a later change. Rejected: rendered PNGs; catalogue entries with a
  render cache; HTML kept outside the repository, where links rot.
- **Q9 The design-system contract**: a `design` block in `tools/gate/config.json`. Rejected: a
  separate file at the root.
- **Q10 The kit's pages**: templates in the kit; a project's theme file or same-named page
  overrides them; never synced over.
- **Q11 CI**: review-only pull requests run only the gate.

## Calls for the owner

- **A board is `specs/<domain>/<capability>/looks/<name>.html`**, self-contained (its CSS inline,
  no network), at most 30720 bytes like a spec, each design a `<section id="…">`. A Looks line is
  `- <name>.html#<id> — <caption>`, or `- page: <path or URL> — <caption>`; the gate checks that
  the file exists and holds the id. Alternative: one board per domain; it would mix features.
- **The `design` block's keys**: `tokens` (a CSS file of custom properties), `brief` (a Markdown
  file), `catalogues` (names and how to open an entry, for the pages the kit draws), `render`
  (optional, a command; unused until screenshots of the built app return). The house style's
  starter is a tokens file and a brief that a sync writes only when the project names none.
- **The override folder is `kit-pages/`** at the project's root (`theme.css`, and any page by its
  kit name), owned by the project and never synced. Alternative: a folder under `tools/`.
- **An untested scenario is valid** and counts as untested in the overview and the triage
  checklist; the gate fails nothing for it.
- **The overview JSON skips to version 3**, since version 2 already names each module's manifest.
- **The proposal's free text is a `## Review` section**: what the owner looks at and where.
- **This repository's own four specs move to the new format** in this change: Summary, `review:
  unreviewed`, "When …" requirements, and no `desk:` lines.

## Out of scope

- Screenshots of the built app, on a device or a desktop.
- A QA skill or a QA test plan.
- The Solution map itself; it reads version 3.
- Syncing the projects: each takes this version in its own pull request.
