---
title: Modules
code:
  - tools/overview/overview.mjs
  - tools/overview/overview.schema.json
---
# Modules

## Purpose

The overview groups a repository's capabilities by the modules its code falls into, whatever the
language: a Node package, a Python project, a Gradle module, a Unity assembly, a folder with a
README.

## Requirements

### Requirement: A module is a folder holding a module marker
The overview SHALL count as a module every folder holding a `README.md`, `package.json`,
`pyproject.toml`, `build.gradle`, `build.gradle.kts` or a non-test `*.asmdef`, or the file-name
globs a repository's config names in `overview.moduleMarkers` instead, because a Python or Gradle
project otherwise shows almost no modules.

#### Scenario: A Python and Gradle repository
- **GIVEN** a repository with `pyproject.toml` and `build.gradle(.kts)` folders and no config
- **WHEN** the overview reads it
- **THEN** each such folder is a module, its manifest named, its name and description read from
  `pyproject.toml`'s `[project]` or `[tool.poetry]` table
- **PROOF** test: tools/overview/test/overview.test.mjs::overview: Python and Gradle folders are modules; a config's own markers replace the defaults

#### Scenario: A repository names its own markers
- **GIVEN** a repository whose config names `go.mod` and `pyproject.toml` as its markers
- **WHEN** the overview reads it
- **THEN** only folders holding one of those are modules
- **PROOF** test: tools/overview/test/overview.test.mjs::overview: Python and Gradle folders are modules; a config's own markers replace the defaults
- **PROOF** desk: open
