---
title: Map launcher
review: unreviewed
code:
  - tools/solution-map/launcher/
---
# Map launcher

## Summary

A way for people who are not developers to open the Solution map with a double-click. One setup
command, run once, checks that Git and Node are there, makes copies of the project's repositories
without any working files, and puts a shortcut on the computer. The shortcut always runs the newest map from
main, so nobody pulls or updates anything, and when a newer map lands while it runs, a banner
offers a restart. You meet it when you raise or discuss requests without working in the code.

## Looks

- looks/launcher.html#restart-update — Restart to update, a newer map on main

## Requirements

### Requirement: One setup command prepares the computer
When a person runs the setup command their project gives, the launcher SHALL check for Git and
Node 22 or later, ask for a git name and email when none is set, clone each of the project's
repositories that its config gives an address for, with no working files, and add a shortcut for
this system, because a person who is not a developer gets the map without a developer's setup.

#### Scenario: A developer prints the setup command
- **WHEN** a developer runs `node tools/solution-map/launcher/setup.mjs --print-command`
- **THEN** one command per system prints, ready to paste, that checks Git and Node, clones the
  backlog's repository without working files and runs setup from it
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::print-command prints one setup command per system

#### Scenario: Something missing stops setup and says what to install
- **GIVEN** Git, or Node 22 or later, is missing
- **WHEN** setup runs
- **THEN** it names what is missing and its official download page, and stops without changing
  anything
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::setup names what is missing and stops

#### Scenario: Setup asks for a name and email when git has none
- **GIVEN** git has no user name or email set
- **WHEN** setup runs
- **THEN** it asks for them and sets them for git
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::setup asks for a git name and email when none is set

#### Scenario: Setup clones each repository with no working files
- **WHEN** setup finishes
- **THEN** each repository the config gives an address for is cloned, side by side as the config
  lays them out, holding its history and no working files
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::setup clones each repository with no working files

#### Scenario: The shortcut fits the system
| System | Shortcut |
|---|---|
| Windows | a `.cmd` file |
| macOS | a `.command` file |
| Linux | a `.desktop` entry |
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::setup writes the shortcut for each system

#### Scenario: Running setup again keeps the clone and the drafts
- **GIVEN** setup ran before on this computer
- **WHEN** it runs again
- **THEN** the clone and any unsent drafts stay, and the shortcut is written again
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::setup run again keeps the clone and the drafts

### Requirement: The shortcut always runs the newest map
When the shortcut is opened, the launcher SHALL fetch, run the map from the code on `origin/main` in
a folder kept for that code, and open the browser on it, because nobody has to pull or update
anything.

#### Scenario: The map runs from main's code
- **GIVEN** main holds a newer map than the one last run
- **WHEN** the shortcut opens
- **THEN** the newer map runs, from a folder named for the map's code on main
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::the launched map runs from main's code

#### Scenario: Without the network the last map runs
- **GIVEN** the fetch fails
- **WHEN** the shortcut opens
- **THEN** the map last run starts, with the banner that says the fetch failed
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::without the network the last map runs

#### Scenario: A launcher fixed on main reaches the shortcut
- **GIVEN** main holds a newer launcher than the one this computer runs
- **WHEN** the shortcut opens
- **THEN** this computer runs main's launcher from then on, and a launcher in a checkout is never
  rewritten
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::the launcher takes main's copy of itself, never into a checkout

#### Scenario: The shortcut opens the browser on the map
- **WHEN** a person double-clicks the shortcut on their desktop
- **THEN** the browser opens on the map

### Requirement: A newer map offers a restart
When main gets a newer map while a launched map runs, the map SHALL show a banner offering Restart
to update, and the restart SHALL run the newer map and reload the page with the drafts kept,
because people keep the map open for long and should not work in an old one.

#### Scenario: A newer map on main shows a banner
- **GIVEN** a launched map runs
- **WHEN** Refresh finds a newer map on main
- **THEN** a banner offers Restart to update
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::a newer map on main offers a restart

#### Scenario: Restart runs the newer map and keeps the drafts
- **WHEN** the person presses Restart to update
- **THEN** the newer map runs, the page reloads, and the unsent drafts are unchanged
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::restart runs the newer map and keeps the drafts

#### Scenario: A map run from a checkout never offers a restart
- **WHEN** the map runs from a checkout with `node tools/solution-map/solution-map.mjs`
- **THEN** no restart banner shows, whatever main holds
- **PROOF** test: tools/solution-map/test/launcher.test.mjs::a map run from a checkout offers no restart
