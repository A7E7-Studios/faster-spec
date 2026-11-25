---
title: A built interface is checked against its profile before the owner sees it
capabilities:
  - agents/built-interface
  - agents/design-system
---
# A built interface is checked against its profile before the owner sees it

## Why

The design skill critiques a direction for accessibility on the drawing, before any code exists.
Nothing after that looks at the build: ship's only rule is to say where the build differs from the
board, and the review checklist's one check on Looks is that the board file is self-contained.
No step asks whether a component has its hover, disabled or error state, whether a state change
is animated, or whether a screen holds on a narrow window.

That is where the owner's review goes. Three passes over the owner's prompts in the projects'
sessions counted about 64 that corrected how a built interface looked (an estimate), for example:

- a button that is not round, another that is slightly oval;
- controls that are not at the corners the board put them in;
- a row that was not there on the phone.

The owner's words on it: implementations should make sure every component has all its states and
transitions and that these are tested, built the same standard way; every web module should work
at any size, checked as well; and the standards should differ by kind of application, a web
application having its UI standards and a headset application its drive-through harness.

## What changes

- **A profile per kind of application**, a Markdown file with the Standards an interface is built
  to and the Checks that prove them, named in the config's `design.profiles`. The kit ships the
  web profile and the starter names it. Scenarios: "A design block naming a missing profile
  fails", "A profile list that names no file is refused", "The starter names a profile the kit
  ships". Paths: `tools/design/profiles/web.md`, `tools/gate/lib/index.mjs` (the key),
  `tools/gate/lib/checks.mjs` (the design check), `tools/gate/config.template.json`.
- **Design draws every state**: each new component on the board in every state of the profile's
  list that applies, listed in `look.md`; a screen that changes with its width at the narrowest
  width too; each profile check a task, by the tasks template. Scenarios: "The board holds a new component's states", "A
  screen that changes with its width is drawn narrow too". Paths:
  `.agents/skills/design/SKILL.md` steps 0 and 1.7, `.agents/skills/design/templates/look.md` and
  `tasks.md`.
- **Ship builds to the profile and tests it**: the Standards kept, each Check that applies a test
  in the project's suites, one that cannot apply named under `## Not verified`; then each built
  screen compared with its board section. Scenarios: "What the web profile's checks prove", "A
  check that cannot apply is named with its reason", "A project without a profile builds as
  before", "A build that differs from its board is fixed or explained". Path:
  `.agents/skills/ship/SKILL.md` step 2.
- **The review fails a round** on a component state or a profile check missing without a reason.
  Scenario: "A component without its disabled state is a finding". Path:
  `.agents/skills/ship/review-checklist.md` (Read, check 8, Severity).
- **The docs say so**: `tools/design/README.md` (profiles, and how a project writes its own),
  `tools/gate/README.md` (the `design` check and key), README.md's line on `tools/design/`.

A project takes this on its next sync by adding `"profiles": ["tools/design/profiles/web.md"]` to
the `design` block of its `tools/gate/config.json`, when it builds web interfaces. Without the key
nothing changes for it.

## Review

At a desk: read `tools/design/profiles/web.md`, design step 1.7, the tasks template, ship step
2's "The built look" and the review checklist's check 8. Then, in a project that names the web profile, build
its next change that adds a component and look at what the pull request lists under `## Tests`
and `## Not verified`, and at how much of the review still goes to states and sizes.

## Settled questions

None.

## Calls for the owner

- **A profile is a file the config names, not a skill of its own.** Basis: the kind of application
  is a fact about the project, which the config states once; a skill that starts when an agent
  judges "this is a web app" is skipped some of the time. Alternative: one skill per kind of
  application that design and ship call; it costs a skill per kind and a trigger to keep right.
- **The kit ships only the web profile.** Basis: its checks are the same in every web project,
  while a headset profile depends on the harness a project drives its application with, which
  the kit cannot name. A project writes its own profile; `tools/design/README.md` says how.
  Alternative: a generic headset profile in the kit now, written without a harness to test it on.
- **The starter names the web profile; a project that already carries the kit opts in** by adding
  the key. Basis: its config is its own and the sync never writes it. Alternative: the skills
  apply the web profile whenever a `design` block exists; that would change every project on
  its next sync without its say.
- **The checks are tests in the project's own suites**, run with the suites AGENTS.md names.
  Basis: ship and the review already require and list those. Alternative: a `design.check` command
  in the config, a second place to say what runs.
- **The widths are 320, 768 and 1280 px**, plus what a project adds. Basis: the reflow width of
  the accessibility guidelines (WCAG 2.2, 1.4.10), and one common tablet and one desktop width.
- **No stored screenshots.** The kit commits no image, so a check asserts on the page (overflow,
  computed styles, the accessibility tree) and the comparison with the board is made on a fresh
  render. Alternative: baselines kept outside git, which is a tool and a store to run.
- **The checklist gains no fifteenth check**: check 8, Looks, carries the profile. Basis: the
  self-check and several steps name the checks by number, 1 to 14.
- **The gate checks only that a named profile exists**, not what it holds. Basis: the gate judges
  form; whether a build keeps a standard is for the tests and the review.
- **Transitions are tested for what a script can assert**: that the motion comes from the tokens,
  ends in the right state and stops under reduced motion. Whether it feels right stays with the
  owner's review.

## Out of scope

- **Shared component libraries**: a few central design systems whose components carry all their
  states and tests once, which projects reuse. The web profile's first standard assumes one per
  project; building and sharing them is a project of its own.
- **A headset profile, and one for native desktop applications**: each written by the first
  project that has the harness to prove its checks.
- **The spec skill**: which scenarios a change needs is unchanged; the change
  `research-before-questions` reworks its questions.
- **Which model the checks' authors run on**: a project's own agent settings.
