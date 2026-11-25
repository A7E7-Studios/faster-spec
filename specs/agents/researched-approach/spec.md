---
title: A researched approach before questions
review: unreviewed
code:
  - .agents/skills/spec/SKILL.md
  - .agents/skills/spec/templates/proposal.md
  - .agents/skills/design/SKILL.md
---
# A researched approach before questions

## Summary

When you ask for a change, the agent first finds out how the question is already settled: in your
own product, in comparable products and in the field's standard. It then brings you one approach
to confirm or comment on. You are asked only the decisions that are yours to take; everything else
is decided, listed with the reason, and yours to overrule.

## Requirements

### Requirement: Research comes before the first question
When a request leaves a decision open, the spec skill SHALL look up how the product itself, the
product it replaces, comparable products and the platform's or the field's standard settle it,
each finding with its source, before it asks the owner anything, because an owner who is asked
what a lookup answers has to send the agent to look it up anyway.

#### Scenario: A decision the standard settles is not asked
- **GIVEN** a request with an open decision that the platform's guidelines settle
- **WHEN** the spec skill brings its approach
- **THEN** the decision is listed as decided, with the guideline as its basis, and is no question

#### Scenario: The owner names a product the research missed
- **WHEN** the owner answers the approach by naming a product or a practice to follow
- **THEN** the skill looks it up, revises the approach and shows what changed

### Requirement: Only the owner's decisions are asked
The spec skill SHALL ask the owner only a decision whose other answer changes what is built, that
the research does not settle and that is costly to change after the build, and SHALL decide every
other one itself and list it under the proposal's Calls for the owner with its basis, because a
question whose recommended answer is always taken costs the owner a wait and teaches them to stop
reading the questions.

#### Scenario: What each kind of decision becomes
| The decision | It becomes |
|---|---|
| what is in scope, and in which order | a question |
| what costs money, or leaves the device | a question |
| stored data that cannot be restored | a question |
| an edge case, a default or a wording | a call for the owner, with its basis |
| a library, a data structure, the shape of a test | a row of design's Decisions table |
| where the owner reviews, when AGENTS.md says | the proposal's Review, unasked |

#### Scenario: A request to act is not a numbered question
- **WHEN** the work needs the owner to allow an install or a download
- **THEN** the skill asks it plainly, outside the numbered questions of the change

### Requirement: The owner confirms one approach
When the research and the decisions are done, the spec skill SHALL bring the owner one approach
(what gets built, the calls it took with their basis, what is out of scope and the open
questions) and write nothing before the owner confirms it, because one page to confirm or comment
on takes the owner minutes where rounds of questions take days.

#### Scenario: An approach with no open question
- **GIVEN** a request whose every decision the research settles
- **WHEN** the spec skill brings its approach
- **THEN** the owner is asked one thing: whether to go ahead with it

#### Scenario: A comment revises the approach
- **WHEN** the owner comments on the approach instead of confirming it
- **THEN** the skill revises the approach and asks a further question only where the comment
  opens a decision that is the owner's
