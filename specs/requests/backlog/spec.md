---
title: Backlog
review: unreviewed
code:
  - tools/backlog/
  - .agents/skills/spec/SKILL.md
  - .agents/skills/spec/templates/proposal.md
  - .agents/skills/triage/SKILL.md
---
# Backlog

## Summary

The place where requests wait before they become a change: what someone wants, the discussion
about it, and what became of it. Anyone who can push to the repository adds a request, writes notes
on it and moves it from New to Discussing, Ready or Parked; once an agent turns it into a change,
the request shows whether that change is in progress, waiting for review or done. Each request is
one file on a branch of its own, so the whole story reads in one place, and main, its pull requests
and its gate never see the discussion. You meet it when you raise a request, discuss one, or hand
one to an agent.

## Requirements

### Requirement: The backlog lives on its own branch
The backlog SHALL keep its items on the branch the project's config names, by default `backlog` in
the project's own repository, a branch that shares no history with main, because requests and their
discussion change daily and must not crowd main, its pull requests or its gate.

#### Scenario: The first item creates the branch
- **GIVEN** the branch does not exist
- **WHEN** the first item is written
- **THEN** the branch exists, holding that one commit and sharing no history with main
- **PROOF** test: tools/backlog/test/store.test.mjs::the first write creates the branch with no shared history

#### Scenario: A project names another repository and branch
- **WHEN** the project's config names a repository and a branch for the backlog
- **THEN** items are read from and written to that branch of that repository
- **PROOF** test: tools/backlog/test/store.test.mjs::reads and writes the configured repository and branch

#### Scenario: Main and every checkout stay untouched
- **WHEN** an item is added, noted, edited, moved or linked
- **THEN** no commit reaches main, and no checkout's files or branch change
- **PROOF** test: tools/backlog/test/store.test.mjs::a write leaves main and every checkout untouched

### Requirement: An item is one file holding its request and its notes
The backlog SHALL keep each item as one Markdown file, `backlog/<id>.md`: its title, who asked,
when, its state, the features it is about and the changes it led to, then what happens, what should
happen and where, then its notes in the order they arrived, each with its author and time, because
a person or an agent reads one file for the whole story.

#### Scenario: A new item holds the request
- **WHEN** a person adds an item
- **THEN** `backlog/<id>.md` holds its title, the person's git name, the date, the state New, the
  features named, and what happens, what should happen and where
- **PROOF** test: tools/backlog/test/store.test.mjs::a new item is one file holding the request, state new

#### Scenario: A note is appended with its author and time
- **WHEN** a person adds a note to an item
- **THEN** the note is the item's last, headed by the person's git name and the time in UTC
- **PROOF** test: tools/backlog/test/store.test.mjs::a note is appended with its author and time

#### Scenario: A write changes only the item's own file
- **WHEN** an item is written
- **THEN** that item's file is the only file the commit changes, and it holds text and links only
- **PROOF** test: tools/backlog/test/store.test.mjs::a write changes only the item's own file

### Requirement: Every write lands on the latest backlog
When the backlog is written, it SHALL fetch the branch, apply the write to the branch's latest
commit as an operation and push, trying again when someone pushed first, because people write at
the same time and no one's note may be lost.

#### Scenario: Two notes sent at once both arrive
- **GIVEN** two people add a note to one item from two computers
- **WHEN** both send at the same moment
- **THEN** the item holds both notes, the one pushed later last
- **PROOF** test: tools/backlog/test/store.test.mjs::two notes sent at once both arrive

#### Scenario: A field changed meanwhile is held, not overwritten
- **GIVEN** someone changed a field of an item after a write to that field was prepared
- **WHEN** the write is sent
- **THEN** the other person's value stays, that field's write is refused with both values, and the
  rest of the write is applied
- **PROOF** test: tools/backlog/test/store.test.mjs::a field changed meanwhile is held with both values

### Requirement: People set where an item stands, and its changes say what became of it
People SHALL move an item between New, Discussing, Ready and Parked, any of them by anyone who can
push to the branch, and once an item names a change the backlog SHALL show its state from that
change's folders on main, because what became of a request follows from what landed.

#### Scenario: A person moves an item
- **WHEN** a person moves an item to New, Discussing, Ready or Parked
- **THEN** the item's state is the one chosen
- **PROOF** test: tools/backlog/test/store.test.mjs::a person moves an item to any state they set

#### Scenario: An item's changes decide what it shows
| The item's changes | It shows |
|---|---|
| none | the state people set |
| one whose folder is not on main | In progress |
| none in progress, one whose folder is on main | To review |
| every one's folder landed on main and was removed since | Done |
- **PROOF** test: tools/backlog/test/state.test.mjs::an item's changes decide its shown state

### Requirement: One command line reads and writes the backlog
The backlog SHALL offer `node tools/backlog/backlog.mjs` with `list`, `show`, `add`, `note`,
`move` and `link`, each write sent at once as one commit, and `--json` for agents, because agents
and scripts use the backlog without the page.

#### Scenario: Each write command sends one commit
- **WHEN** `add`, `note`, `move` or `link` runs
- **THEN** exactly one commit reaches the branch, naming the person and what it did
- **PROOF** test: tools/backlog/test/cli.test.mjs::each write command sends one commit

#### Scenario: Show prints an item with its notes and its state
- **WHEN** `show <id> --json` runs
- **THEN** the item's fields, its request, its notes in order and the state it shows print
- **PROOF** test: tools/backlog/test/cli.test.mjs::show prints the item, its notes and its shown state

#### Scenario: List filters by state
- **WHEN** `list --state <state>` runs
- **THEN** every item showing that state prints, with its id, title, who asked and when
- **PROOF** test: tools/backlog/test/cli.test.mjs::list filters by the state an item shows

### Requirement: spec takes a request from the backlog
When an agent runs the spec skill on `backlog:<id>`, the skill SHALL quote the item and its notes as
the requester's words in the proposal's Why and link the change to the item with a note, because the
requester's words reach the spec and the item shows what became of it.

#### Scenario: A request becomes a change
- **WHEN** spec runs on `backlog:<id>` and writes its proposal
- **THEN** Why quotes the item and its notes, and the item names the change with a note saying so

### Requirement: Triage lists new requests
When triage runs with no input, its list SHALL include every item in New, with who asked and when,
because new requests wait for the owner as features in review do.

#### Scenario: New requests wait beside the features
- **WHEN** triage runs with no input
- **THEN** its list holds each item in New with its title, who asked and when
