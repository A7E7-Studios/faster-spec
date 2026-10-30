---
title: The directions page lives in the change folder
capabilities:
  - formats/changes
  - agents/design-system
---
# The directions page lives in the change folder

## Why

The design skill's directions reached the owner in ways the owner could not use: one session's
HTML page did not open, another only posted screenshots in the conversation. The skill's step
"One page" allowed a local HTML file outside the repository or the harness's page or artifact
tool, which is no single route, and a file outside the checkout does not open in an agent app's
built-in browser or file pane. Every agent app the owner works in has a built-in browser.

## What changes

- **The directions page is `changes/<id>/looks.html`**: one self-contained HTML file (its CSS
  inline, nothing loaded from the network or another file, as a board is), holding the current
  state, the directions side by side, each one's trade-offs against the research and the
  critique, and the recommended pick. It becomes the scenario "The directions page is
  self-contained" in `formats/changes`.
- **It reaches the owner in the harness's built-in browser**: the design skill writes it in the
  change's worktree, opens it there and gives its path, then asks for the pick through the
  question tool. It becomes the scenario "The owner picks from the page in the built-in browser"
  in `agents/design-system`.
- **It is committed with `look.md`** once the owner has picked, and deleted with the change
  folder by triage. The picked design still lands as the board beside the spec. The directions
  not picked stay on the page until the folder is deleted; `templates/look.md` says so.
- **The gate's `changes` check** accepts `looks.html` in a change folder and fails one that loads
  anything from outside itself.

## Review

At a desk: read the design skill's steps 1 and 7, `changes/README.md` and the Looks section of
`specs/README.md`; then run the design skill on a change in a project that carries the kit and
open its `looks.html` in the agent app's built-in browser.

## Settled questions

- **Q1 Route**: the directions page is a working HTML page, as the picked board is, opened in the
  harness's built-in browser; the kit names no agent app, since every one the owner may work in
  has a built-in browser. Rejected: the harness's page or artifact tool, which is product-specific.
- **Q2 A render check**: none; the page is expected to work, and opening it has not failed
  before. Rejected: a step that checks the page renders before the owner sees it.
- **Q3 How the route is stated**: positively, as the way the owner gets the directions. Rejected:
  a list of forbidden alternatives.
- **Q4 Reach**: a kit fix only; projects take it on their next sync. Rejected: a message to the
  projects' running sessions.
- **Q5 Where the page lives**: in the change folder, `changes/<id>/looks.html`: a working
  artifact that shows the before and after, committed with `look.md` and deleted with the folder,
  while the one design per feature is the board beside the spec. Rejected: a local file outside
  the repository; the directions never committed.

## Calls for the owner

- **The current state is drawn as HTML** on the page: the feature's existing board sections where
  it has a board, else redrawn on the tokens from the rendered app, so no image file enters the
  repository. Alternative: an inline screenshot as a `data:` URL; it would put an image in the
  change folder in all but name.
- **`looks.html` has no byte budget of its own**: it is deleted with the folder. Alternative: the
  boards' 30720 bytes; a page of three directions over several states would split or crop.

## Out of scope

- A check that the page renders (Q2).
- Updating the projects that carry the kit: each takes this on its next sync, with nothing to
  change in its config.
