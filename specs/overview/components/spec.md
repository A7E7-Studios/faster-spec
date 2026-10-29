---
title: Components
review: unreviewed
code:
  - tools/overview/overview.mjs
  - tools/overview/overview.schema.json
---
# Components

## Summary

The overview finds the components a repository's code falls into, whatever the language (a Node
package, a Python project, a Gradle module, a Unity assembly, a folder with a README), so an agent
sees where each feature lives and which code no spec names yet.

## Requirements

### Requirement: A component is a folder holding a component marker
The overview SHALL count as a component every folder holding a `README.md`, `package.json`,
`pyproject.toml`, `build.gradle`, `build.gradle.kts` or a non-test `*.asmdef`, or the file-name
globs a repository's config names in `overview.componentMarkers` instead, because a Python or
Gradle project otherwise shows almost no components.

#### Scenario: A Python and Gradle repository
- **GIVEN** a repository with `pyproject.toml` and `build.gradle(.kts)` folders and no config
- **WHEN** the overview reads it
- **THEN** each such folder is a component, its manifest named, its name and description read from
  `pyproject.toml`'s `[project]` or `[tool.poetry]` table
- **PROOF** test: tools/overview/test/overview.test.mjs::overview: Python and Gradle folders are modules; a config's own markers replace the defaults

#### Scenario: A repository names its own markers
- **GIVEN** a repository whose config names `go.mod` and `pyproject.toml` as its markers
- **WHEN** the overview reads it
- **THEN** only folders holding one of those are components
- **PROOF** test: tools/overview/test/overview.test.mjs::overview: Python and Gradle folders are modules; a config's own markers replace the defaults
