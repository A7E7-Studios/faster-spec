---
title: Features and their review
review: unreviewed
code:
  - tools/overview/overview.mjs
  - tools/overview/overview.schema.json
---
# Features and their review

## Summary

The overview reads every repository of a solution into one map: each feature with its review
state, the systems it ships in, its scenarios and which are tested, its looks, and the change
folders in flight. The owner's to-review list and the Solution map are drawn from it.

## Requirements

### Requirement: Each feature carries its verdict and its coverage
When the overview reads a feature, it SHALL give its review state across the repositories that
carry it (changes requested if any side says so, else unreviewed if any side is, else approved),
the commit that last set it, and each scenario as tested or untested, because the owner's list and
the coverage gaps are read from these.

#### Scenario: One side asks for changes
- **GIVEN** a feature approved in one repository and changes-requested in the other
- **WHEN** the overview reads both
- **THEN** the feature is changes-requested

#### Scenario: An untested scenario is a gap, not a review item
- **WHEN** a scenario has no `test:` line
- **THEN** the overview counts it untested and leaves the feature's review state as its spec says

### Requirement: Each feature names its systems
When a repository declares systems, the overview SHALL give each feature the systems its code
paths fall in, each system its features, and the components inside a system that no spec names,
because a system with no feature shows where the next spec belongs.

#### Scenario: A feature in two systems
- **WHEN** a feature's code paths lie in two systems
- **THEN** both list the feature, and the feature lists both
