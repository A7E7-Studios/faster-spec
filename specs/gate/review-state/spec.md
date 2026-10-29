---
title: Review state
review: unreviewed
code:
  - tools/gate/lib/checks.mjs
---
# Review state

## Summary

Each feature's spec carries the owner's verdict: unreviewed, approved or changes requested. The
gate sends a feature back to unreviewed whenever its spec or its looks change, or a change naming
it lands, so an approval always covers what the feature does now.

## Requirements

### Requirement: A changed feature is unreviewed
When a pull request adds a spec, changes a spec's text or its boards, or carries a change folder
naming the feature, the gate SHALL fail it unless that spec's `review` is `unreviewed`, because an
approval covers only what the owner saw.

#### Scenario: An approved feature whose scenario changes must go back
- **GIVEN** a spec with `review: approved` on main
- **WHEN** a pull request changes one of its scenarios and keeps `approved`
- **THEN** the gate fails, saying the feature goes back to unreviewed

#### Scenario: A change folder naming an approved feature must reset it
- **GIVEN** a spec with `review: approved` on main
- **WHEN** a pull request carries a change folder naming it and changes only code
- **THEN** the gate fails until the spec says `review: unreviewed`

### Requirement: A verdict alone is shown
When a pull request changes only a spec's `review`, the gate SHALL list the new verdict as a
notice, because the reviewer checks each one against the owner's words.

#### Scenario: Triage approves a feature
- **WHEN** a pull request sets a spec's `review` from `unreviewed` to `approved` and changes nothing else
- **THEN** the gate passes and shows the verdict as a notice
