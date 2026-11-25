---
name: spec
description: Turn a request for a new feature, a change in behaviour or a bug to fix into settled requirements - look up the facts, research how the product itself, comparable products and the field's standard settle each open decision, decide what that settles, bring the owner one approach to confirm or comment on with only the owner's own decisions as numbered questions, then write changes/<id>/proposal.md and the living-spec edits (Summary, requirements, scenarios and the tests that prove them) on a branch in its own worktree. Use when the owner asks for a feature, a new capability, a fix, or a change to how something behaves, looks or sounds, and when triage hands over the owner's feedback. Not for a refactor, a tooling-only or a docs-only change, which goes straight to ship.
---

# Spec a change

Turn a request into settled requirements. Facts and research are yours to find; the owner decides
what only the owner can, and confirms the approach.
Formats: `specs/README.md` (specs, PROOF lines, Looks, review) and `changes/README.md` (change
folders, and which pull requests need one).

## 1. Facts first

`git fetch origin`, then look up, before asking anything:

- **Capabilities.** `specs/domains.json`, `specs/systems.json` and the specs near the request; the
  whole map: `node tools/overview/overview.mjs --repo <id>=. --summary`. Reuse a capability before
  creating one; a new one gets a kebab-case id under the domain that fits.
- **Parallel work** on the same capabilities: change folders on main
  (`git ls-tree -d --name-only origin/main changes/`), branches (`git ls-remote --heads origin`) and
  open pull requests (`gh pr list`). The change id is free on main and as a branch; a change that
  triage opened keeps the id triage gave it.
- **The code** the request touches, and the rules AGENTS.md sets for it. List every code path each
  outcome of the request reaches: each caller of what it changes, each entry point that reaches the
  behaviour. The proposal's `## What changes` names, for each change, the paths it covers.
- **The other repository** AGENTS.md names: does the request need its side too?
- **The kind of change**, by `changes/README.md`'s table:
  - no folder needed (a refactor, tooling only, docs only): hand it to **ship** and stop.
  - a one-line fix whose outcome is plain: no research and no approach to confirm; write (step 5).
  - everything else, a fix included: research (step 2).

Use sub-agents for slow lookups. Never ask the owner for a fact you can look up.

## 2. Research

Map the request as a decision tree: each decision branches into the decisions that depend on it.
For each decision the facts leave open, find how it is settled elsewhere, before asking anything:

- **The product itself and what came before it**: how this product already solves the same kind
  of problem, and how the product it replaces, or a reference AGENTS.md names, does it.
- **Comparable products**: how two or three products a person in this field would know solve it.
- **The standard**: the platform's own guidelines, the field's norm or regulation, the documented
  way of the library in use.

Each finding is one line with its source: a path in the repository, or a title and its URL. Give
the lookups to sub-agents in parallel, one per group of decisions, each briefed to return findings
and sources only. Size it to the change: a small change takes a few minutes of it, and a decision
the facts of step 1 settle takes none.

## 3. Decide

Sort every decision of the tree:

| The decision | What you do |
|---|---|
| Settled by a fact, by the standard, or by how the product already does it | decide it; a call for the owner, with its basis |
| A detail that is cheap to change later: an edge case, a default, a wording, an order | decide it, the simplest answer the research supports; a call for the owner |
| How it is built: a library, a data structure, the shape of a test | leave it to **design**, whose Decisions table carries it |
| The owner's | ask it (step 4) |

A decision is the owner's when a different answer changes what is built, the research does not
settle it, and changing it after the build costs real work:

- what is in scope, and in which order;
- what costs money;
- what leaves the device or reaches another party;
- stored data that cannot be restored;
- the product's direction, where the research finds answers that differ in kind.

Where the research is thin or its sources disagree, say so and ask. A change rarely holds more
than a handful of the owner's decisions: with more than four, test each again.

Work through these, deciding or marking for the owner as the tree reaches them:

- each observable outcome (each becomes a scenario) and its edges: empty, first use, repeated,
  offline, two people at once;
- how each outcome is proven by a test, and which ones no automation reaches (they stay untested:
  say so);
- where the owner reviews the feature (the proposal's `## Review`): as AGENTS.md says. It is a
  question only where AGENTS.md says nothing, or the change needs a setup it does not name;
- whether anything seen or heard changes (design then draws it);
- the other repository's side, the contracts between the two, stored data and its migration;
- what is out of scope.

## 4. The approach

Bring the owner one approach, in chat, short enough to read in a minute or two:

- **What gets built**: the requirements in plain words, one line per observable outcome.
- **Decided**: a table `Decision | Chosen | Basis` of the calls you took, the basis a finding and
  its source. The ones the owner is likeliest to see differently come first.
- **Out of scope.**
- **Open**: the owner's decisions, each with its options and the one the research backs.

Then ask once: the open questions, and last "Go ahead with this approach?" (`Go ahead
(Recommended)`, `Change something`). With no open question, that one alone.

- The owner confirms, or comments. A comment changes the approach: revise it, research again where
  the comment names a product or a practice you did not look at, and show what changed. Ask a
  further question only when the comment opens a decision that is the owner's.
- Never ask again what was answered, and never ask to fill a round. A question that depends on
  another's answer waits for that answer.
- A request to act for you (install a tool, download files, close an app) is no question of the
  spec: ask it plainly when the work needs it, unnumbered.
- Write nothing before the owner confirms the approach.

**Ask through the harness's question tool** when it has one. Claude Code's `AskUserQuestion` takes
up to 4 questions per call and 2–4 options each: the recommended option first, its label ending
"(Recommended)"; one short description per option; a preview on any option whose example the
owner should compare. It adds "Other" itself. More than 4 questions span several calls.

Only a harness without such a tool gets the questions as text. Each option is its own top-level
list item, its details nested under it:

```
**Q1 - <title>**: <the question>

- **a) <option> (Recommended)**
  - <what it means, what it costs, and why it is recommended>
- **b) <option>**
  - <what it means, what it costs>
```

Never `a) … b) … c)` on one line, and never a plain line after a nested list: Markdown folds such
a line into the last bullet.

Number the questions across the change (Q1, Q2, … never restarting), in the question tool too (its
header starts `Q<n>`). Word each so "yes" accepts your recommendation.

## 5. Write

1. **Worktree.** `git fetch origin`, then a worktree as AGENTS.md says, named for the change id, on
   a new branch `<id>` from `origin/main`.
2. **`changes/<id>/proposal.md`** from `templates/proposal.md`: every question asked under
   Settled questions, every decision you took without asking under Calls for the owner with its
   basis, and
   `## Review` saying what the owner looks at and where. A change triage handed over keeps each
   remark of the owner's in Why as text, as triage wrote it.
3. **Spec edits** in `specs/<domain>/<capability>/spec.md`; a new capability starts from
   `templates/spec.md`. Keep to `specs/README.md` exactly: the gate refuses a front matter key
   other than `title`, `review` and `code`, a `##` section other than Summary, Looks and
   Requirements, stray text, a step keyword other than GIVEN/WHEN/THEN/AND, and two scenarios with
   one slug.
   - **Summary**: what the feature does, when you meet it and why, in a few sentences a
     non-developer understands. Rewrite it when the change alters what it says.
   - **A requirement per behaviour**: "When …, the app SHALL …, because …"; a behaviour that holds
     always drops the "When …,". Present tense; no history, dates or numbers of pull requests or
     issues.
   - **A scenario per observable outcome**, named by its outcome. Steps only where the name leaves
     something open: one WHEN, one THEN, a GIVEN only for a setup that is not the default; a table
     for many cases of one outcome. It ends in its PROOF lines, `test: <path>::<selector>` for the
     test that proves it (an existing one, or the one ship will write: name its path). A scenario
     no automation reaches has none and is untested; never a human check, never `pass` or `fail`.
   - **Looks** lines are design's, once the owner picks a direction; a renamed or removed screen
     updates its lines and its board.
   - **`review: unreviewed`** in every spec the change names, whether or not its text changes.
   - A new capability over existing code: its Summary and only the requirements this change adds,
     changes or fixes; `code:` lists the paths this change touches, a folder ending in `/`.
   - Deleting a capability: `git rm -r` its folder, and list it under the proposal's `removes:`.
4. **The other repository's side**, when there is one: the same change id, its own folder and spec
   edits in its own worktree, each naming its own capabilities. A repository without `specs/` gets
   no folder; design names its side.
5. **Commit** in AGENTS.md's commit style (for example `docs(specs): specify <id>`) and push the
   branch. Open no pull request. The gate's path checks fail on this branch until ship creates the
   `code:` and `test:` paths; that is expected.

## 6. Hand over

- Something seen or heard changes, or the work needs decisions (several modules, the network, a
  format or contract, storage, the other repository): **design**.
- Otherwise: **ship**.

Tell the owner the change id, the branch, the calls for the owner and the scenarios left untested.

The decision tree adapts the `grilling` skill from mattpocock/skills (MIT).
