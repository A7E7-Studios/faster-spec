---
title: The spec skill researches first and brings one approach to confirm
capabilities:
  - agents/researched-approach
  - agents/owner-questions
---
# The spec skill researches first and brings one approach to confirm

## Why

The spec skill asks rounds of questions "until nothing is assumed", and looks up only what the
repository holds. Across 18 sessions in the projects that carry the kit, it asked 188 numbered
questions in 73 rounds:

- 135 (72 %) were answered with the recommended option, and 39 of the 73 rounds were accepted
  whole. Of the 104 that were decisions (the others were confirm steps, look picks and requests
  to act), a reading finds about a quarter the owner's to take (scope, privacy, the product's
  direction); the rest were edge-case defaults and technical choices.
- 33 (18 %) got a typed answer. Of the 29 with real text, 18 asked for what the skill had not
  looked up: how the product it replaces handles it, what the field's best practice is, how a
  named product solves it, whether the app already has the capability, or a simpler answer.
- 16 of the 18 sessions made no web lookup before their first question.
- Six sessions held 127 of the questions, at 6 to 9 rounds each. The sessions waited 52 hours in
  all for answers; 11 rounds waited more than an hour.
- 19 questions were confirm or approve steps, and "where do you review this?" was asked 5 times and
  answered as recommended 5 times.

The owner's words on it: the skill should research how other applications do it and what the
field's best practice is, come back with a refined approach to confirm or comment on, and ask
further questions only where something needs clarifying, not for the sake of asking.

## What changes

- **Research before any question** (spec step 2): for each open decision, how the product itself
  and the product it replaces, two or three comparable products, and the platform's or field's
  standard settle it, each finding with its source. Scenarios: "A decision the standard settles is
  not asked", "The owner names a product the research missed". Path:
  `.agents/skills/spec/SKILL.md`.
- **Every decision is sorted** (spec step 3): settled by a fact or the standard, or cheap to
  change later: decided, a call for the owner with its basis. How it is built: design's Decisions
  table. The owner's (scope and order, money, what leaves the device, data that cannot be restored,
  direction where the research finds answers that differ in kind): asked. Scenarios: "What each
  kind of decision becomes", "A request to act is not a numbered question". Paths:
  `.agents/skills/spec/SKILL.md`, `.agents/skills/spec/templates/proposal.md` (a call for the owner
  names its basis), `.agents/skills/design/SKILL.md` step 2.4 (a decision its research settles is
  no question).
- **One approach to confirm or comment on** (spec step 4) replaces the rounds and the separate
  summary to confirm: what gets built, the calls taken with their basis, what is out of scope, the
  open questions, and one "Go ahead?". Scenarios: "An approach with no open question", "A comment
  revises the approach". Path: `.agents/skills/spec/SKILL.md`.
- **Where the owner reviews** comes from AGENTS.md; it is asked only where AGENTS.md is silent.
  Scenario: "What each kind of decision becomes" (its last row). Path:
  `.agents/skills/spec/SKILL.md` step 3.
- **The words that named rounds** follow: the triage skill's two references, the scenarios
  "Five questions in Claude Code" and "Questions asked as text" of `agents/owner-questions`, and
  README.md's diagram and its line on the skills. Paths: `.agents/skills/triage/SKILL.md`,
  `specs/agents/owner-questions/spec.md`, `README.md`.

## Review

At a desk: read spec steps 2 to 4, the proposal template's two lists and design step 2.4. Then,
after a project's next sync, run the spec skill on its next few requests and compare with the
figures under Why: the questions asked, the share answered as recommended, and how often the
answer sends the skill back to look something up.

## Settled questions

None.

## Calls for the owner

- **The approach is shown in chat**, not on a page of the change folder. Basis: the owner asked
  for something to confirm or comment on, and chat needs no new file in the change format.
  Alternative: an `approach.html` beside `looks.html`; adding it later costs a format change.
- **Decisions taken on the research go under Calls for the owner**, each with its basis; the
  proposal gets no new section. Basis: the section already holds "a decision taken without
  asking", so the change format stays as it is. Alternative: a `## Decided on the research`
  section, which is a change to the format and the gate.
- **No fixed limit on questions.** The skill tests each again when it counts more than four.
  Basis: the six large sessions held about a handful of owner's decisions each by the reading
  under Why; a hard cap would hide a real decision in a large change. Alternative: a cap of four.
- **The go-ahead is asked with the last open question**, unnumbered. Basis: the owner asked for
  an approach to confirm or comment on, so one answer pass settles the questions and the
  approach. Alternative: a separate step after the answers, as the summary was; changing it is
  one paragraph of spec step 4.
- **Design keeps its look pick and its approval.** Basis: the owner redirected or commented on 5
  of the 12 look picks, against about a fifth of the other decisions, so that is where asking
  pays. Design's step 2.4 only gains the rule that a researched decision is no question.
  Alternative: design's approval folded into spec's approach; it costs a rewrite of design's
  steps 1 and 2 and loses the approval of what was drawn.
- **Requests to act** (an install, a download, closing an app) leave the numbered questions.
  Basis: 5 of the 188 were such requests and belong to no requirement. Alternative: they stay
  numbered; changing it back is one line of spec step 4.
- **The credit to the `grilling` skill stays**, on the decision tree. Basis: the tree and the
  recommended option first still come from it, and its licence asks for the notice. Alternative:
  the line dropped; restoring it is one line in the skill and one in README.md.

## Out of scope

- **The checks of a built interface** (states, sizes, transitions) and the profiles per kind of
  application: the change `built-ui-checks`.
- **Which model and effort the lookups run on**: a project's own agent settings.
- **A limit on design's or triage's questions**: both ask few, and triage asks once.
