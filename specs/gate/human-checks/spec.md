---
title: Human checks
code:
  - tools/gate/lib/spec.mjs
  - tools/gate/lib/index.mjs
  - tools/gate/config.template.json
  - tools/overview/overview.mjs
---
# Human checks

## Purpose

Each project names the ways a person checks a scenario (at a desk, on a device, with two people)
and what each needs, so its PROOF lines speak its own language and the review list says what to
bring.

## Requirements

### Requirement: A project names its human checks
The gate SHALL read the human checks from the project's `tools/gate/config.json` `humanChecks`,
each with how a person checks it and what it needs, and fail a PROOF line that names another,
because a check nobody defined is a check nobody makes.

#### Scenario: A PROOF line names a check the project lacks
- **GIVEN** a project whose config names only `desk`
- **WHEN** a pull request adds a scenario whose PROOF line is `two-devices: open`
- **THEN** the gate's specs check fails, naming the unknown check and the ones the project names
- **PROOF** test: tools/gate/test/gate.test.mjs::specs: a human check is one the project names in its config
- **PROOF** test: tools/gate/test/units.test.mjs::PROOF lines: broken forms are errors

#### Scenario: A config that misnames a check
- **GIVEN** a config whose `humanChecks` lacks a `how` or a `needs`, repeats an id, or names `test`
- **WHEN** the gate loads it
- **THEN** the gate stops with a setup error that says the shape `humanChecks` takes
- **PROOF** test: tools/gate/test/units.test.mjs::config: the starter config loads and is report-only; history rules match what they name and not anchors

### Requirement: The overview lists each repository's checks
The overview SHALL read each repository's human checks from its config at the read ref and list
them under `repos`, because the review list groups the open checks by what they need.

#### Scenario: Two repositories, one without checks named
- **GIVEN** a repository whose config names its checks, and one whose config names none
- **WHEN** the overview reads both
- **THEN** the first lists its checks with how and needs, and a check it does not name is invalid
- **AND** the second lists none and reads any check id
- **PROOF** test: tools/overview/test/overview.test.mjs::overview: a repository's human checks come from its config; a check it does not name is invalid
- **PROOF** desk: open
