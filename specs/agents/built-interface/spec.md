---
title: Checks of the built interface
review: unreviewed
code:
  - .agents/skills/design/SKILL.md
  - .agents/skills/design/templates/look.md
  - .agents/skills/design/templates/tasks.md
  - .agents/skills/ship/SKILL.md
  - .agents/skills/ship/review-checklist.md
  - tools/design/profiles/
---
# Checks of the built interface

## Summary

When a change alters something you see, the agent builds it to the standards of that kind of
application and proves them with tests before you look: every component has all the states it can
be in, state changes are animated the same way everywhere, and every screen holds at any size.
Your review then goes to whether the feature is right, not to a missing hover state or a row that
falls off a narrow screen.

## Requirements

### Requirement: A new component is drawn in every state it can be in
When a change adds a component in a project that names a profile, the design skill SHALL draw it
on the feature's board in every state of the profile's list that applies and list those states in
`look.md`, because a state nobody drew is a state nobody builds.

#### Scenario: The board holds a new component's states
- **GIVEN** a project whose config names the web profile
- **WHEN** the design skill commits the pick of a change that adds a button
- **THEN** the board shows the button in each state that applies, and `look.md` lists them and
  says why any other does not apply

#### Scenario: A screen that changes with its width is drawn narrow too
- **WHEN** the picked design lays a screen out differently on a narrow window
- **THEN** the board holds that screen at the profile's narrowest width as well

### Requirement: The build keeps the profile's standards, proven by tests
When a change alters something seen in a project that names a profile, the ship skill SHALL build
to the profile's standards and write each of its checks that applies as an automated test in the
project's suites, because a script finds a missing state or a clipped text in seconds, and the
owner otherwise finds it in review.

#### Scenario: What the web profile's checks prove
| Check | A test proves |
|---|---|
| States | each new or changed component rendered in every state that applies |
| Sizes | no overflow, no clipped or overlapping text and no target too small at each width |
| Text at 200 % | the same with the text size doubled |
| Touch | each control acts on a tap as on a click |
| Transitions | each animated change takes its motion from the tokens and ends in the state the board shows; nothing but progress animates at rest |
| Reduced motion | nothing takes time when reduced motion is on |
| Keyboard | each control reached, focused and operated |
| Accessibility scan | no violation on each new or changed screen, in each theme |
| Tokens | no raw value where a token exists |
| The board | each section of the feature's board reached in the build |

#### Scenario: A check that cannot apply is named with its reason
- **WHEN** a change adds nothing animated
- **THEN** the pull request names the transition check under `## Not verified` with that reason

#### Scenario: A project without a profile builds as before
- **GIVEN** a project whose config names no profile
- **WHEN** the ship skill builds a change that alters something seen
- **THEN** it adds no profile check and the review asks for none

### Requirement: The build is compared with its board before the review
When the build of a change that alters something seen is done in a project that names a profile,
the ship skill SHALL render each screen the board draws and compare it with its board section,
state by state, because a difference found before the review costs one fix and one found by the
owner costs a change.

#### Scenario: A build that differs from its board is fixed or explained
- **WHEN** a built screen differs from its board section
- **THEN** the ship skill fixes it, or the pull request says how it differs and why

### Requirement: The review fails a round on a missing state or check
When the independent reviewer reads a pull request that alters something seen in a project that
names a profile, it SHALL report as a major finding a component state or a profile check that is
missing without a reason, because only a finding that fails the round gets fixed before the merge.

#### Scenario: A component without its disabled state is a finding
- **WHEN** a pull request adds a control that can be unavailable and builds no disabled state
- **THEN** the review lists it as a major finding and the round fails
