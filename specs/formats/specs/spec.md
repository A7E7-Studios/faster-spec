---
title: The spec format
review: unreviewed
code:
  - specs/README.md
  - tools/gate/lib/spec.mjs
---
# The spec format

## Summary

A spec says what one feature does in two layers: a Summary and its Looks for people, and
requirements with named scenarios for agents, each scenario proven by an automated test. The gate
reads every spec the same way, so a spec that breaks the format never lands.

## Requirements

### Requirement: A spec holds a Summary, its Looks and its requirements
When the gate reads a spec, it SHALL fail one whose front matter lacks `title`, `review` or `code`,
whose sections are not `## Summary`, an optional `## Looks` and `## Requirements` in that order, or
whose requirement statement lacks `SHALL` or its `because`, because the overview and the owner read
every spec by these parts.

#### Scenario: A spec in the format reads with no problems
- **WHEN** the gate parses a spec with a Summary, Looks lines, a requirement and its scenarios
- **THEN** it reports no problem and reads each part

#### Scenario: A statement without its reason fails
- **WHEN** a requirement's statement holds `SHALL` but no `because`
- **THEN** the gate names the requirement

### Requirement: Scenarios are named examples proven by tests
When the gate reads a scenario, it SHALL accept one with no steps, one WHEN and one THEN with at
most one GIVEN first, a table, and `test:` PROOF lines or none, and fail any other PROOF line,
because the owner reviews the feature and only automation proves a scenario.

#### Scenario: A human check on a scenario fails
- **WHEN** a scenario ends in `- **PROOF** desk: open`
- **THEN** the gate says a scenario is proven by tests only

#### Scenario: What a scenario may hold
| Steps | Table | PROOF | Reads |
|---|---|---|---|
| none | none | none | untested, no problem |
| WHEN, THEN | none | test | no problem |
| none | three rows | test | no problem |
| two WHEN | none | test | a problem |

### Requirement: A Looks line names a board section or a page
When the gate reads `## Looks`, it SHALL accept `looks/<name>.html#<id> — <caption>` and
`page: <where> — <caption>` lines only, because the pages that show a feature's design find it by
these references.

#### Scenario: A Looks line in another form fails
- **WHEN** a Looks line reads `banner.png`
- **THEN** the gate names the line and the two forms it takes
