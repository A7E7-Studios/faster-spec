---
title: Systems
review: unreviewed
code:
  - specs/README.md
  - tools/gate/lib/checks.mjs
---
# Systems

## Summary

A repository names its systems (the parts that run on their own, such as an app, a conversion tool
or the API) and the paths each owns, so you can see which features ship in which system and which
system has code no feature describes. Features stay grouped by domain; systems say where they ship.

## Requirements

### Requirement: Systems are declared once per repository
When a repository holds `specs/systems.json`, the gate SHALL fail an entry without a kebab-case
unique id, a title, a purpose or paths present at the commit, and two systems declaring the same
path, because a feature's systems are read from these paths.

#### Scenario: A system naming a missing folder fails
- **WHEN** a pull request adds a system whose paths name a folder that is not there
- **THEN** the gate's specs check fails and names the path

#### Scenario: Two systems declaring one path fail
- **WHEN** two systems in `specs/systems.json` both declare `src/`
- **THEN** the gate's specs check fails and names both
