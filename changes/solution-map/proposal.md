---
title: The Solution map, a local page over the overview
capabilities:
  - overview/solution-map
---
# The Solution map, a local page over the overview

## Why

The overview writes one JSON index of a solution, but nobody reads JSON before a review. The owner
needs one page that says what waits for them, shows each feature as a person sees it, and lets them
explore the whole product by what it does and by what ships, across every repository of the
solution. Without it, triage starts from a terminal table and the owner never sees the product as a
whole.

## What changes

- One command, `node tools/solution-map/solution-map.mjs`, fetches each repository, builds the
  overview and serves the page on 127.0.0.1 (The map answers on the loopback address only; The
  repositories come from the project or the command line).
- Opening the page or pressing Refresh fetches again (Refresh shows what landed since the page
  opened).
- The page opens on Waiting for you: every feature not approved, newest change first, with its
  Summary, its Looks, what to look at, the changes since its last approval and Copy for triage
  (The queue holds every feature not approved, newest change first; A feature in review shows what
  to judge it by; Copy for triage hands the feature to a triage session; Nothing waits).
- Explore lists the features by domain, or by the systems they ship in, with review state and
  tested coverage; a system no feature covers shows as such (Features by domain and by system; A
  system with no feature shows what the specs do not cover; An approved feature shows what it does
  and where its code is).
- Looks: a board line shows that section of the board, a page line shows the page live (A board
  section is drawn from the board by its id; A page that does not answer becomes a placeholder).
- Search, an address per view, and links to GitHub at the commit read (Search finds a feature by
  what it does; Every view has its own address; Code links point at the commit read).
- Banners instead of errors (A repository that cannot be fetched keeps its last fetch; A missing
  repository leaves the others; A spec that breaks the format still shows; An overview of another
  version says so; A project with no spec yet).

## Review

At the desk. Run the command in a project with two repositories and click through Waiting for
you, Explore by domain and by system, a feature, and search; press Refresh with the network off;
start it once with a repository folder that does not exist. Judge the page against the board in
`specs/overview/solution-map/looks/solution-map.html`.

## Settled questions

- **Q1 Where it lives**: a local page on the owner's computer, one command, served on 127.0.0.1;
  nothing deployed, nothing leaves the computer. Rejected: a screen behind a sign-in; a static site
  built in CI.
- **Q2 Refresh**: live; opening the page or pressing Refresh fetches every repository and shows
  each `origin/main` as it is now. Rejected: a snapshot at start; a build after every merge.
- **Q3 Front page**: Waiting for you, every feature not approved, newest change first. Rejected:
  features by domain first; a dashboard of totals.
- **Q4 Link to triage**: Copy for triage per feature puts a ready instruction on the clipboard;
  the page writes nothing. Rejected: ticking verdicts in the page; the list without buttons.
- **Q5 Grouping**: features under domains, the product view, and a declared list of systems that
  says what each feature ships in; Explore groups by either. Folder modules are not shown.
  Rejected: a Modules tab of every folder; systems as the only parent; domains only.
- **Q6 Finding things**: filters, search over titles, summaries, requirements, scenarios and
  systems, and an address per view. Rejected: filters only; one long page.
- **Q7 Links out**: to GitHub, the spec and the code at the commit read. Rejected: links into a
  local editor, whose checkout may be on another branch.
- **Q8 When something is missing**: the page still opens, and a banner says what is missing.
  Rejected: refusing to open until everything resolves.
- **Q9 Name**: "Solution map", `overview/solution-map`.
- **Q10 How it is proven**: Node tests for the server, the adapter and the page's views, and the
  owner's review at the desk. Rejected: tests only.
- **Q11 Generic**: it names no project; repositories, domains, systems and features come from the
  data, and each repository's links from its own remote.
- **Q12 Home**: in the kit, under `tools/solution-map/`.
- **Q13 Visuals**: a feature's Looks are its design board, kept beside the spec, and its live page
  for a web feature; no image of the built app until screenshots of it come to the kit. Rejected:
  the built feature beside the picked design only until approval, which needs rendered screenshots.
- **Q14 Direction**: A, the review inbox: the queue beside one feature at a time. Rejected: B, a
  coverage map of tiles; C, a gallery of cards.

## Calls for the owner

- **Where the repositories are named**: a `solutionMap` block in `tools/gate/config.json`,
  `{ "repos": [{ "id", "path" }], "pages": "<base address>" }`, paths relative to the repository
  the command runs in; `--repo` replaces it. Alternative: only `--repo`, typed every time.
- **The port** is 7317, or the next free one when it is taken, printed at start. Alternative: a
  random port, which breaks bookmarked addresses.
- **Feedback on a feature**: on main the change that answers it has not landed yet, so the map
  shows that the owner asked for changes and when, and that no answering change has landed; it
  cannot quote the remark, which lives in that change's proposal on its branch. Alternative:
  reading open branches, which the map otherwise never does.
- **When the last verdict was given** needs the commit that set `review:`; the overview's version 3
  carries it per feature (asked of the format change). Without it the line is left out.
- **A page line's address**: a path is joined to `solutionMap.pages`; a full URL is used as it is.
  The server asks each address once per build whether it answers.
- **No dependencies**: Node's own HTTP server, a page of plain ES modules, the overview imported
  as a library. Alternative: a bundler and a UI framework, which every project would then carry.

## Out of scope

- The overview's version 3 and `specs/systems.json`: the format change that this map reads.
- Writing anything: verdicts, specs and change folders are triage's and ship's.
- Previewing a branch or a pull request; access from another device.
- Screenshots of the built app.
