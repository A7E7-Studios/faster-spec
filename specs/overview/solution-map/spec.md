---
title: Solution map
review: unreviewed
code:
  - tools/solution-map/
---
# Solution map

## Summary

A local web page over the overview's index: what waits for the owner's review, every feature by
domain or by the system it ships in, and how well each is tested. One command on the owner's
computer fetches the repositories, builds the index and opens the page; nothing is deployed and
the page writes nothing. From a feature, Start review opens CueReview to record the review. You
meet it before a review and whenever you want to see what the product does.

## Looks

- looks/solution-map.html#waiting — Waiting for you, a feature in review open
- looks/solution-map.html#explore-system — Explore by system, an approved feature open
- looks/solution-map.html#banners — A repository that cannot be fetched and one that is missing
- page: http://127.0.0.1:7317/ — The map itself, once the command runs

## Requirements

### Requirement: One command opens the map on this computer
When the owner runs `node tools/solution-map/solution-map.mjs`, the Solution map SHALL fetch each
repository, build the overview from each one's `origin/main` and serve the page on the loopback
address only, because the map shows unreleased work and needs no sign-in or deployment.

#### Scenario: The map answers on the loopback address only
- **WHEN** the command runs
- **THEN** the page and its data answer on 127.0.0.1, and on no other address
- **PROOF** test: tools/solution-map/test/server.test.mjs::serves the page and the map on 127.0.0.1 only

#### Scenario: The repositories come from the project or the command line
- **WHEN** the command runs with `--repo <id>=<folder>`, or without it in a project whose config
  names its repositories
- **THEN** the map reads exactly those repositories
- **PROOF** test: tools/solution-map/test/cli.test.mjs::reads the repositories from the config or the command line

### Requirement: The map shows main as it is now
When the page opens or the owner presses Refresh, the Solution map SHALL fetch every repository
again and rebuild the map, because a review judged on an old main misses what just landed.

#### Scenario: Refresh shows what landed since the page opened
- **GIVEN** a change lands on a repository's main after the page opened
- **WHEN** the owner presses Refresh
- **THEN** the map shows the change
- **PROOF** test: tools/solution-map/test/server.test.mjs::Refresh fetches again and rebuilds the map

### Requirement: What waits for the owner comes first
The Solution map SHALL open on "Waiting for you": every feature whose review is not `approved`,
newest change first, because the owner's next step is to review them.

#### Scenario: The queue holds every feature not approved, newest change first
- **WHEN** the map opens
- **THEN** each feature that is `unreviewed` or `changes-requested` is listed, the one whose
  change landed last on top, a feature no change names last
- **PROOF** test: tools/solution-map/test/adapt.test.mjs::the queue holds every feature not approved, newest change first

#### Scenario: A feature in review shows what to judge it by
- **WHEN** the owner opens a feature in the queue
- **THEN** its Summary, its Looks, what to look at (the Review section of the change that names
  it), and the changes that landed since its last approval show
- **PROOF** test: tools/solution-map/test/adapt.test.mjs::a feature in review carries its looks, review note and changes since approval

#### Scenario: Start review opens CueReview
- **WHEN** the owner presses Start review on a feature
- **THEN** CueReview, the review recorder, opens on this computer, and the page says to start the
  take with the feature's name and to hand CueReview's Copy for agent to a triage session
- **AND** when CueReview is not installed, the page says where it looked
- **PROOF** test: tools/solution-map/test/server.test.mjs::Start review opens CueReview, and says so when it is missing
- **PROOF** test: tools/solution-map/test/view.test.mjs::start review says what to say at the start of the take

#### Scenario: Nothing waits
- **GIVEN** every feature is `approved`
- **WHEN** the map opens
- **THEN** it says nothing waits, and names the scenarios that have no test
- **PROOF** test: tools/solution-map/test/view.test.mjs::nothing waiting says so and points at untested scenarios

### Requirement: Features are explored by domain or by system
The Solution map SHALL list every feature under its domain, and on request under each system it
ships in, each with its review state and tested coverage, because the owner looks at the product
by what it does and by what ships.

#### Scenario: Features by domain and by system
- **WHEN** the owner opens Explore and switches between Domain and System
- **THEN** each feature sits under its domain, or under every system it ships in
- **PROOF** test: tools/solution-map/test/adapt.test.mjs::features group by domain and by system

#### Scenario: A system with no feature shows what the specs do not cover
- **GIVEN** a system no feature ships in, or code inside a system that no spec names
- **WHEN** the owner explores by system
- **THEN** the system says it has no feature yet, or lists the code no spec names
- **PROOF** test: tools/solution-map/test/adapt.test.mjs::a system no feature ships in is listed as a gap
- **PROOF** test: tools/solution-map/test/view.test.mjs::a system no feature ships in, and a project with no spec, say so in words

#### Scenario: An approved feature shows what it does and where its code is
- **WHEN** the owner opens an approved feature
- **THEN** its Summary, its Looks, the systems it ships in and its code show, with its
  requirements and scenarios folded away, and each scenario with its test
- **PROOF** test: tools/solution-map/test/view.test.mjs::an approved feature folds its behaviour away

### Requirement: Looks are drawn from the repository
The Solution map SHALL draw a board line from the board's section with that id, and show a page
line's page live, because the design is drawn once, beside the spec.

#### Scenario: A board section is drawn from the board by its id
- **WHEN** a feature's Looks name `looks/<name>.html#<id>`
- **THEN** that section of the board shows, at the commit read
- **PROOF** test: tools/solution-map/test/server.test.mjs::a board section is served from the board by its id

#### Scenario: A page that does not answer becomes a placeholder
- **GIVEN** nothing answers at a page line's address
- **WHEN** the feature opens
- **THEN** a placeholder names the address it tried, and a banner says how to start it
- **PROOF** test: tools/solution-map/test/view.test.mjs::a page line that does not answer becomes a placeholder

### Requirement: Every feature can be found and linked
The Solution map SHALL search feature titles, summaries, requirements, scenarios and systems as
the owner types, and give every view its own address, because a feature is found by what it does
and shared by its link.

#### Scenario: Search finds a feature by what it does
- **WHEN** the owner types a word that a feature's title, Summary, a requirement, a scenario or
  one of its systems holds
- **THEN** the feature is listed, the matching text marked
- **PROOF** test: tools/solution-map/test/view.test.mjs::search finds features by title, summary, requirement, scenario and system

#### Scenario: Every view has its own address
- **WHEN** the owner opens a view, a feature or a search
- **THEN** the address names it, and opening that address opens it again
- **PROOF** test: tools/solution-map/test/view.test.mjs::every view has its own address

#### Scenario: Code links point at the commit read
- **WHEN** a feature shows its spec or its code
- **THEN** each links to the repository's web page at the commit the map read, when the
  repository is on GitHub, and is plain text otherwise
- **PROOF** test: tools/solution-map/test/adapt.test.mjs::a feature's code links point at the commit read

### Requirement: The map opens whatever is missing
When something the map reads is missing, the Solution map SHALL still open and show a banner that
says what is missing, what still shows and what to do, because a partial map is more use than
none.

#### Scenario: A repository that cannot be fetched keeps its last fetch
- **GIVEN** a repository's fetch fails
- **WHEN** the map builds
- **THEN** that repository shows its main as last fetched, and a banner says when that was
- **PROOF** test: tools/solution-map/test/server.test.mjs::a repository that cannot be fetched keeps its last fetch, with a banner

#### Scenario: A missing repository leaves the others
- **GIVEN** a named repository's folder is not a repository
- **WHEN** the map builds
- **THEN** the other repositories show, and a banner says how to point the map at it
- **PROOF** test: tools/solution-map/test/server.test.mjs::a repository that is missing leaves the others, with a banner

#### Scenario: A spec that breaks the format still shows
- **GIVEN** a spec on main breaks the format
- **WHEN** the map builds
- **THEN** its feature shows with each problem and its line, and a banner names it
- **PROOF** test: tools/solution-map/test/adapt.test.mjs::a spec's format problems reach its feature and a banner

#### Scenario: An overview of another version says so
- **GIVEN** the overview the project carries writes a version the map does not read
- **WHEN** the map builds
- **THEN** a banner says which version it found and which it reads
- **PROOF** test: tools/solution-map/test/server.test.mjs::an overview of another version gives a banner, not a page error

#### Scenario: A project with no spec yet
- **GIVEN** no repository has a spec
- **WHEN** the map opens
- **THEN** it says there are no features yet and how to write the first, and lists the systems
- **PROOF** test: tools/solution-map/test/adapt.test.mjs::an empty project has no features and lists its systems
- **PROOF** test: tools/solution-map/test/view.test.mjs::a system no feature ships in, and a project with no spec, say so in words
