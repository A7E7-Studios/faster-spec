---
title: Solution map
review: unreviewed
code:
  - tools/solution-map/
---
# Solution map

## Summary

A local web page over the overview's index and the backlog: what waits for the owner (features to
review and new requests), every feature by domain or by the system it ships in, how well each is
tested, and the requests people raise. One command on the owner's computer fetches the
repositories, builds the index and opens the page; nothing is deployed. From a feature, Start
review opens CueReview to record the review, and Suggest a change starts a request about it. What
people write on the page waits as drafts until they press Submit, which sends it to the backlog's
branch, the only thing the map writes. You meet it before a review, when you raise or discuss a
request, and whenever you want to see what the product does.

## Looks

- looks/solution-map.html#waiting — Waiting for you, a feature in review open
- looks/solution-map.html#explore-system — Explore by system, an approved feature open
- looks/solution-map.html#banners — A repository that cannot be fetched and one that is missing
- looks/backlog.html#waiting-requests — Waiting for you, new requests beside the features
- looks/backlog.html#backlog-board — The backlog's board, one draft card
- looks/backlog.html#backlog-empty — No requests yet
- looks/backlog.html#request-open — A request open in its dialog
- looks/backlog.html#request-narrow — The dialog on a narrow screen
- looks/backlog.html#request-new — A new request from Suggest a change
- looks/backlog.html#feature-requests — A feature with its open requests
- looks/backlog-drafts.html#drafts-unsent — The unsent drafts and Submit
- looks/backlog-drafts.html#submit-clash — A draft held after Submit, both values shown
- looks/backlog-drafts.html#submit-unreachable — Submit could not reach the backlog
- page: http://127.0.0.1:7317/ — The map itself, once the command runs
- page: http://127.0.0.1:7317/backlog — The backlog's board, once the command runs

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
and the backlog's branch again and rebuild the map, because a review judged on an old main misses
what just landed, and a discussion read from an old backlog misses what was just said.

#### Scenario: Refresh shows what landed since the page opened
- **GIVEN** a change lands on a repository's main after the page opened
- **WHEN** the owner presses Refresh
- **THEN** the map shows the change
- **PROOF** test: tools/solution-map/test/server.test.mjs::Refresh fetches again and rebuilds the map

#### Scenario: Refresh shows what others sent to the backlog
- **GIVEN** someone else submits an item or a note after the page opened
- **WHEN** a person presses Refresh
- **THEN** the map shows it
- **PROOF** test: tools/solution-map/test/server.test.mjs::Refresh shows what others sent to the backlog

### Requirement: What waits for the owner comes first
The Solution map SHALL open on "Waiting for you": every feature whose review is not `approved`,
newest change first, and every request in New, because the owner's next step is to review the one
and discuss the other.

#### Scenario: New requests wait beside the features
- **GIVEN** the backlog holds items in New
- **WHEN** the map opens
- **THEN** Waiting for you lists them beside the features, newest first, each with who asked
- **PROOF** test: tools/solution-map/test/backlog.test.mjs::new requests wait beside the features, newest first

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
- **GIVEN** every feature is `approved` and no request is in New
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

### Requirement: The backlog has a view of its own
The Solution map SHALL show the backlog's items grouped by the state each shows, Done and Parked
only behind a filter, and open an item with its request, its notes, the features it names and the
changes it led to, because people follow a request from its first note to the feature it became.

#### Scenario: Items show by state
- **WHEN** a person opens Backlog
- **THEN** the items in New, Discussing, Ready, In progress and To review show, grouped by state,
  and those in Done or Parked only once their filter is on
- **PROOF** test: tools/solution-map/test/backlog.test.mjs::items show by state, done and parked behind a filter

#### Scenario: An item shows what became of it
- **WHEN** a person opens an item
- **THEN** its request, its notes in order, the features it names and each change it led to, with
  that change's state, show
- **PROOF** test: tools/solution-map/test/view.test.mjs::an item shows its notes, its features and its changes

#### Scenario: A person adds a request
- **WHEN** a person fills in a title, what happens, what should happen and where, picks the
  features it is about, and saves
- **THEN** the request shows as a draft in New
- **PROOF** test: tools/solution-map/test/backlog.test.mjs::a request added on the page is a draft in new

#### Scenario: The backlog's branch does not exist yet
- **GIVEN** nobody has written to the backlog
- **WHEN** a person opens Backlog
- **THEN** it says there are no requests yet and how to add the first
- **PROOF** test: tools/solution-map/test/view.test.mjs::an empty backlog says how to add the first request

### Requirement: A feature shows the requests about it
The Solution map SHALL list on each feature the requests that name it and are not Done, and offer
Suggest a change, which starts a draft request naming that feature, because people comment on a
feature where they read it.

#### Scenario: A feature lists its open requests
- **GIVEN** requests name a feature, some of them Done
- **WHEN** a person opens the feature
- **THEN** the requests not Done show, each with its state and a link to it
- **PROOF** test: tools/solution-map/test/backlog.test.mjs::a feature lists the requests about it that are not done

#### Scenario: Suggest a change starts a request about the feature
- **WHEN** a person presses Suggest a change on a feature
- **THEN** a new request opens with that feature already named
- **PROOF** test: tools/solution-map/test/view.test.mjs::suggest a change starts a request naming the feature

### Requirement: What people write waits until they submit it
When a person adds a request, writes a note, edits a request or moves one, the Solution map SHALL
keep it as a draft on this computer, show how many drafts are unsent on every view, and send every
draft as one commit to the backlog's branch when the person presses Submit, because a person reads
what they wrote before others see it, and nothing is lost when the page closes.

#### Scenario: Every view shows what is unsent
- **GIVEN** a person has unsent drafts
- **WHEN** they open any view
- **THEN** the number of unsent drafts and Submit show
- **PROOF** test: tools/solution-map/test/view.test.mjs::every view shows the unsent drafts and submit

#### Scenario: Drafts survive a restart
- **GIVEN** a person has unsent drafts
- **WHEN** the page closes and the map starts again
- **THEN** the drafts are there, still unsent
- **PROOF** test: tools/solution-map/test/server.test.mjs::drafts survive a restart of the map

#### Scenario: Submit sends every draft as one commit
- **WHEN** a person presses Submit
- **THEN** one commit on the backlog's branch holds every draft, named by the person and what it
  did, and nothing is left unsent
- **PROOF** test: tools/solution-map/test/server.test.mjs::submit sends every draft as one commit

#### Scenario: A clashing draft stays unsent with both values
- **GIVEN** someone changed a field of a request after a person's draft changed it too
- **WHEN** the person presses Submit
- **THEN** the other drafts are sent, and that draft stays unsent showing both values, for the
  person to apply again or drop
- **PROOF** test: tools/solution-map/test/server.test.mjs::a clashing draft stays unsent with both values

#### Scenario: Submit without the network keeps the drafts
- **GIVEN** the backlog's repository cannot be reached
- **WHEN** a person presses Submit
- **THEN** every draft stays unsent, and a banner says the backlog could not be reached
- **PROOF** test: tools/solution-map/test/server.test.mjs::submit without the network keeps every draft

#### Scenario: Only the map's own page can write
- **WHEN** a request to write a draft or to submit comes from any other page
- **THEN** it is refused, and nothing is kept or sent
- **PROOF** test: tools/solution-map/test/server.test.mjs::a write from another page is refused

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
