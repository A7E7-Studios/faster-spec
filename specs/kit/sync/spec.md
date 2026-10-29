---
title: Sync a project
review: unreviewed
code:
  - kit.json
  - tools/kit/
  - tools/gate/lib/kit.mjs
---
# Sync a project

## Summary

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

#### Scenario: A project takes a newer kit
- **GIVEN** a project synced to one kit commit
- **WHEN** the kit changes, adds and drops files and the project syncs again
- **THEN** the project's copy matches the newer kit, dropped files and the folders they emptied
  are gone, and the project's own config is as it was
- **AND** a second sync changes nothing
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: a kit update adds, updates and deletes; the project's own config stays; a second run changes nothing

#### Scenario: A kit that drops a folder
- **GIVEN** a synced project holding a file of its own in a folder the kit owns
- **WHEN** a newer kit stops owning that folder and the project syncs
- **THEN** the files the old lock lists there are deleted, and the project's own file stays, unreported
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: the kit takes back a file the project owned, and drops a folder

#### Scenario: A project that stores SHA-256 objects
- **GIVEN** a project whose git stores SHA-256 objects
- **WHEN** someone syncs the kit into it or checks its copy
- **THEN** the sync says it is not supported, writes nothing and exits 2, since the lock records
  SHA-1 blob ids
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: a project that stores SHA-256 objects is refused

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

#### Scenario: The kit takes back a project's file
- **GIVEN** a synced project that keeps its own copy of a file the kit owned as the project's
- **WHEN** a newer kit ships that file itself and the project syncs
- **THEN** the sync names the file as the project's own, writes nothing and exits 1
- **AND** with `--force` it takes the kit's file, and the check passes after the commit
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: the kit takes back a file the project owned, and drops a folder

#### Scenario: An ignored file where the kit writes
- **GIVEN** a project holding a git-ignored file at a path the kit ships
- **WHEN** someone syncs the kit into it, with `--force` or without
- **THEN** the sync names the file as ignored, writes nothing and exits 1
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: an ignored file where the kit writes stops the sync; a link out of the project is never followed

#### Scenario: A first sync over a hand copy
- **GIVEN** a project that carries a committed hand copy of the kit and no lock
- **WHEN** someone syncs the kit into it
- **THEN** each differing file is replaced and printed as replaced, the project's own config is
  kept, and a file the kit lacks under the kit's paths is named and left as it is
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: the first sync replaces a hand copy it finds committed, refuses one with uncommitted changes, and reports a file the kit lacks

### Requirement: A sync writes only inside the project
The sync SHALL write and delete only real files inside the project, and record no local folder as
the kit's repository, because a link or junction under the kit's paths would otherwise carry its
writes elsewhere, and the lock is committed for everyone to read.

#### Scenario: A kit folder links out of the project
- **GIVEN** a project where a folder the kit writes into is a junction to a folder elsewhere
- **WHEN** someone syncs the kit into it
- **THEN** the sync names the path, writes nothing in the project or outside it, and exits 1
- **AND** a dry run says the same, and a file the kit drops behind such a link is never deleted
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: an ignored file where the kit writes stops the sync; a link out of the project is never followed

#### Scenario: A kit taken from a local folder
- **GIVEN** a kit checkout whose origin is a folder or a `file:` URL
- **WHEN** someone syncs from it
- **THEN** the lock records the repository as null; a URL's user and token are never recorded
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: kit.json and the repository URL

### Requirement: A sync stays the owner's to merge
The sync SHALL warn when the project's config protects no path that holds the lock, because only a
protected lock makes every sync a pull request the owner merges.

#### Scenario: A config that predates the kit
- **GIVEN** a project whose `tools/gate/config.json` lists no protected path holding `tools/kit/lock.json`
- **WHEN** someone syncs the kit into it
- **THEN** the sync says to add `tools/kit/**` to `protectedPaths`
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: a config that leaves the lock unprotected is reported

### Requirement: Line endings are no change
The sync SHALL compare files as git stores them, because a checkout that writes CRLF holds the same
content as the kit.

#### Scenario: A CRLF checkout syncs again
- **GIVEN** a synced project whose checkout writes CRLF line endings
- **WHEN** someone syncs the same kit again
- **THEN** the sync reports every file unchanged and the check passes
- **PROOF** test: tools/kit/test/sync.test.mjs::sync: a checkout with CRLF line endings holds the same content
