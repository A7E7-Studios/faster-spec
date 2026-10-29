---
title: Kit copy check
code:
  - tools/gate/lib/checks.mjs
  - tools/gate/lib/kit.mjs
---
# Kit copy check

## Purpose

The gate holds a project's copy of the kit to its lock, so the kit's files change in a project only
through a sync the owner merges.

## Requirements

### Requirement: A copy that differs from its lock fails
The gate SHALL fail a pull request whose kit copy differs from `tools/kit/lock.json`: a file the
lock lists missing or holding other bytes, a file under the kit's paths that is neither the kit's
nor the project's own, or the lock deleted, because a vendored copy edited in place drifts from the
kit unseen.

#### Scenario: A pull request edits a kit file
- **GIVEN** a project whose copy is as its lock says
- **WHEN** a pull request edits, deletes or adds a file under the kit's paths, or deletes the lock
- **THEN** the gate's kit check fails and names the file
- **AND** a pull request that changes only the project's own config, or a sync that changes the
  files and the lock together, passes
- **PROOF** test: tools/gate/test/gate.test.mjs::kit: a copy as its lock says passes; an edited, missing or extra kit file fails; the project's own files are free
- **PROOF** github: open

### Requirement: A repository without a lock is not checked
The gate SHALL skip the kit check where there is no lock, because the kit's own repository and a
project that does not carry the kit have no copy to hold.

#### Scenario: The kit's own repository
- **GIVEN** a repository with no `tools/kit/lock.json`
- **WHEN** a pull request changes files under the kit's paths
- **THEN** the kit check is skipped
- **PROOF** test: tools/gate/test/gate.test.mjs::kit: a repository with no lock is skipped

### Requirement: A drift already on main is not this pull request's
The gate SHALL list a drift that main already had as information for a pull request that touches
no kit file, because only the pull request that touches the copy answers for it.

#### Scenario: Main carries a drift
- **GIVEN** a project whose main already differs from its lock
- **WHEN** a pull request touches only other files
- **THEN** the kit check passes and lists the drift as information
- **AND** a pull request that touches a kit file fails on every drift
- **PROOF** test: tools/gate/test/gate.test.mjs::kit: a drift already on main is information for a PR that does not touch the kit
