---
title: Sync a project
code:
  - kit.json
  - tools/kit/
  - tools/gate/lib/kit.mjs
---
# Sync a project

## Purpose

A project takes the kit as real files in its own tree, pinned to one kit commit by a lock file, and
takes a newer kit the same way, without ever losing a change the project made.

## Requirements

### Requirement: A sync writes the kit and its lock
The sync SHALL write every file the kit owns at the revision asked for, start each of the project's
own files the project lacks from its starter, and record the kit commit and each file's git blob id
in `tools/kit/lock.json`, because the lock is what the gate holds the copy to.

#### Scenario: A project takes the kit for the first time
- **GIVEN** a project that has never carried the kit
- **WHEN** someone syncs the kit into it
- **THEN** the project holds every file the kit owns, a `tools/gate/config.json` started from the
  starter, and a lock naming the kit commit and each file's blob id
- **AND** after the commit, the sync's check and the gate's kit check both pass
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: the first sync writes the kit, a starter config and the lock; --check and the gate agree
- **PROOF** desk: open

#### Scenario: A project takes a newer kit
- **GIVEN** a project synced to one kit commit
- **WHEN** the kit changes, adds and drops files and the project syncs again
- **THEN** the project's copy matches the newer kit, dropped files and the folders they emptied
  are gone, and the project's own config is as it was
- **AND** a second sync changes nothing
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: a kit update adds, updates and deletes; the project's own config stays; a second run changes nothing

### Requirement: A sync never loses the project's work
The sync SHALL write nothing when the project changed a kit file since the last sync or holds
uncommitted changes to one, unless told to force, because such a change belongs in the kit and
would otherwise vanish.

#### Scenario: The project edited a kit file
- **GIVEN** a project that committed an edit to a kit file, or holds an uncommitted one
- **WHEN** someone syncs a newer kit
- **THEN** the sync names each such file, writes nothing and exits 1
- **AND** with `--force` it takes the kit's files, and with `--dry-run` it only says what would change
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: a kit file the project changed stops the sync, unless --force; --dry-run writes nothing

#### Scenario: A first sync over a hand copy
- **GIVEN** a project that carries a committed hand copy of the kit and no lock
- **WHEN** someone syncs the kit into it
- **THEN** each differing file is replaced and printed as replaced, the project's own config is
  kept, and a file the kit lacks under the kit's paths is named and left as it is
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: the first sync replaces a hand copy it finds committed, refuses one with uncommitted changes, and reports a file the kit lacks

### Requirement: Line endings are no change
The sync SHALL compare files as git stores them, because a checkout that writes CRLF holds the same
content as the kit.

#### Scenario: A CRLF checkout syncs again
- **GIVEN** a synced project whose checkout writes CRLF line endings
- **WHEN** someone syncs the same kit again
- **THEN** the sync reports every file unchanged and the check passes
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: a checkout with CRLF line endings holds the same content
