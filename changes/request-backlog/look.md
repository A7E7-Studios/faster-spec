# Look: A backlog for requests before they become changes

## Pick

**D · Board with a request dialog**: the backlog is a board people know from task tools, and a
request opens the way those tools open an item from a board: a dialog over the dimmed board, with
its own address, the request and its notes in a main column and the state, features and changes in
a details column. The owner chose the board but not a side sheet: "I would actually go with the
board approach for this one. Not sure about a side panel for the details of a task. I would rather
follow best practices from [an established work tracker] or other task tools." Then, on the
drawn direction: "Yes, D as drawn… remove everything from view that is not 100% necessary. Simple,
clean, minimal." The boards hold D under that rule: what a scenario or the accessibility list
needs, and nothing else.

The boards, one section per screen and state:

`specs/overview/solution-map/looks/backlog.html`

| Section | Screen | State |
|---|---|---|
| `waiting-requests` | Waiting for you | New requests beside the features |
| `backlog-board` | Backlog | the board, one draft card |
| `backlog-empty` | Backlog | empty: no requests yet, and how to add the first |
| `request-open` | Request dialog | open over the dimmed board |
| `request-narrow` | Request dialog | full-screen at 700 px, one column |
| `request-new` | Request dialog | create, opened from Suggest a change, its feature filled in |
| `feature-requests` | A feature in Explore | its open requests and Suggest a change |

`specs/overview/solution-map/looks/backlog-drafts.html`

| Section | Screen | State |
|---|---|---|
| `drafts-unsent` | Any view | the unsent count, its list of drafts, Submit |
| `submit-clash` | Request dialog | after Submit, a held draft with both values |
| `submit-unreachable` | Any view | Submit could not reach the backlog; drafts kept |

`specs/overview/map-launcher/looks/launcher.html`

| Section | Screen | State |
|---|---|---|
| `restart-update` | Any view of a launched map | a newer map is on main: Restart to update |

## Directions rejected

Each was drawn in the default state and in the state that tells the directions apart; each stays
on `looks.html` until the change folder is deleted.

- **A · Third tab**: the backlog as a third tab of the map's list and detail, requests grouped
  under state headings, drafts counted in the top bar. The lightest to build and the closest to the
  map's layout, and the page's pick before the owner's call; not the board people know from task
  tools, which the owner asked for.
- **B · Board**: the same board, a request opening in a 500-px side sheet over it, drafts in a
  bottom tray. The owner declined the side panel; reading a discussion in a narrow sheet was its
  weakest point. D keeps its board, its Move menus and its unsent line.
- **C · Conversation**: a request as a thread, moves and the change's progress as timeline lines,
  Waiting for you as one mixed stream, drafts as a pending review. Best for reading a discussion,
  but the mixed stream blurs the owner's two queues, the timeline needs the branch's commit
  history, and it is not a board.

## Components

- **Tokens:** the Solution map's own (`tools/solution-map/page/style.css`), copied into each board's
  `:root` for both themes, with two new tokens and one change: `--edge-strong`, the house tokens'
  strong border, for fields and draft outlines that must reach 3:1; `--scrim`, the dim behind a
  dialog; and the dark `--accent` at the house tokens' value, so white on it reaches 4.5:1.
- **From the map:** the top bar, the tabs, list rows, buttons, the filter chip, the review state
  chip, the banner and the empty state. The kit has no component catalogue; the map's stylesheet
  is its component set.
- **New:**
  - **Request state chip**: a word and an icon per state (New, Discussing, Ready, In progress, To
    review, Done, Parked); the review chip names a feature's review, not a request's state.
  - **Draft tag**: the word Draft in a dashed box, and a dashed outline on a draft card or note.
  - **Board**: columns by state, each with its name and count; a card holds the title, who asked
    and a Move menu (⋯) listing the four states people set, the single-pointer way to move it.
  - **Request dialog**: a modal over a scrim. A main column (title, who asked and when, the request,
    the notes, a note composer) and a details column (state chip with Move, features, changes with
    their state). One column when narrow, full-screen on a narrow window. No catalogue component is
    a dialog; the map has none.
  - **Create dialog**: the same dialog with the request's fields, the features as removable chips,
    Cancel and Save draft.
  - **Unsent line**: one quiet line, "3 unsent · Submit", at the foot of every view and inside the
    dialog; the count opens the list of drafts, each with a Discard button.
  - **Held-draft notice**: one line in the details column, the other person's value and yours, with
    Drop mine and Apply mine again.

What the rule took out of D as drawn on `looks.html`: the dialog's id label, Copy link and file
path (the address bar carries the link); the asker field (a muted line under the title); the
sentence explaining a state set by a change; landing dates; note times (in the date's tooltip);
the draft note's own buttons (discard sits in the drafts list); helper texts; the separate Review
button; card dates, note counts and feature chips; column subtitles; the create dialog's state
block (every request starts in New); the stats strip's new-requests count (the tab and the list
heading count them). The Waiting for you list shows requests as rows, not cards: it has no drag,
so no Move menu, and a row opens the same dialog.

## Critique

| Principle of the brief | How the pick holds it, and what the critique changed |
|---|---|
| Calm | Nothing moves on its own; the dialog and its scrim fade in over 120 ms and simply appear under reduced motion. No helper text competes with the content. |
| Compact, not cramped | Cards are two lines and a Move button; the details column is three fields; a note is its author, its date and its text. Trade-off: at seven open requests the board is sparse, and the map's 30-px buttons stay under the brief's 32 px, as elsewhere in the map. |
| Content first | The request and its notes take the main column; the details column is a narrow tint; the dialog's header holds only the title and Close. |
| Quiet chrome | One floating layer with a soft shadow, as the brief allows for what floats. Everything listed under Components as taken out is gone; the dialog's footer and the board's tray are the same single line. Trade-off: cards and columns are still boxes, which the board needs. |
| One accent | One primary per view: Add note in a request, Save draft in the create dialog, New request in the empty backlog, Start review in Waiting for you. Submit is secondary everywhere; the held draft's two choices are both secondary, since neither is the recommended one. |
| Accessible by default | See Accessibility. |
| Reference products | As the brief's issue tracker: dense, one accent, everything reachable by keyboard (Enter opens a card, Escape closes the dialog). As a work tracker's issue view on its board: the text and its activity in a main column, details beside it, the item at its own address. |

## Accessibility

| Check | Result |
|---|---|
| Contrast | Text: lowest 4.9:1 (muted text on the panel, light), 5.0:1 dark; state chips 5.4:1 or more in both themes; white on the accent 5.4:1 in both. Control boundaries: fields and draft outlines 3.6:1 (light, on the panel) and 3.3:1 (dark, on the sheet); the focus ring 5.4:1 light, 3.2:1 dark. Left as it is: the shell's button and card edges are 1.3:1, and a control is told by its label or glyph. |
| Focus order and visibility | The dialog is a modal (`dialog`, `aria-modal`, named by its title): focus moves to the title, Tab stays inside, Escape and Close shut it, and focus returns to the card. On the board: the toolbar, then each column left to right, each card's title then its Move button. The drafts list returns focus to the count. Focus shows as the map's 3-px accent outline. Narrow, the dialog keeps the wide order (title, state and details, request, notes, composer), so focus follows reading. |
| Hit sizes | Smallest: the × that removes a feature chip, 24 px; the unsent count is 24 px tall; Move, Close and Discard are 28 px. |
| Text scaling | Heights are minimums. Below 900 px of window the board's columns stack and the dialog is full-screen; below 720 px of dialog width it is one column. |
| Motion | Only the dialog and its scrim fade in; nothing moves under reduced motion and nothing flashes; a dragged card moves only under the pointer. |
| Colour not the only cue | Every state chip pairs its word with an icon; a draft has a dashed outline and the word Draft; the held draft a triangle and the words "Changed meanwhile"; banners are sentences. |
| Labels | Close, Move (named with the card's title), Remove (named with the feature), Discard this draft and Light or dark are labelled; every field has a visible label; the composer is labelled Add a note; the dialog is named by its title and the drafts list Unsent drafts. A note's time is only in its date's tooltip, which a keyboard or touch user does not see: the date stays visible, so nothing a scenario needs is lost. |

## Research

- Drafts wait, then one Submit sends them: a code-review tool keeps comments pending, seen only by
  their author, until Submit review sends them together; the backlog's drafts follow it, counted
  on every view
  ([reviewing proposed changes](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request)).
- New requests land in a triage inbox, apart from the workflow: an issue tracker holds incoming
  issues in Triage until someone accepts, declines or comments; New requests wait in Waiting for
  you beside the features ([Triage](https://linear.app/docs/triage)).
- A list to triage, a board to watch flow: a service-desk tracker shows the same items as a list
  for triage or as a board for work moving through states; here three states follow a change, and
  the board's columns for them take no drops
  ([views](https://support.atlassian.com/jira-service-management-cloud/docs/switch-between-views-for-different-ways-to-visualize-your-work-items/),
  [board layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/changing-the-layout-of-a-view)).
- WCAG 2.2, 2.5.7 Dragging Movements (AA): whatever a drag does works with a single pointer too,
  such as a menu of the columns; every card has its Move menu
  ([Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)).
- Move with a menu, return focus, announce: a design system's drag-and-drop guidance puts moves in
  an action menu, returns focus to the trigger and announces the old and new place
  ([guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines)).
- From a board, an item opens over the board at its own address: a work tracker opens a card as a
  modal issue view with the open issue in the board's address; a card tool opens a card over its
  board from the card's link; a planner tool opened task details in a dialog over the board; a code
  host's projects open an item in a side panel with a deep link; the brief's issue tracker opens the
  full issue page. The dialog's address reopens the board with it open
  ([modal or sidebar](https://community.atlassian.com/t5/Jira-questions/Use-a-modal-dialog-instead-of-issue-detail-sidebar-in-board-and/qaq-p/646515),
  [board address](https://community.atlassian.com/forums/Jira-questions/Option-to-disable-selectedIssue-side-panel-behavior-on-the-quot/qaq-p/3269500),
  [card links](https://jira.atlassian.com/browse/TRELLO-1348),
  [dialog and side pane](https://blog-en.topedia.com/?p=71270),
  [deep links](https://github.blog/changelog/2023-01-05-github-issues-january-5th-update/),
  [peek](https://linear.app/changelog/2019-09-23-improved-peek)).
- The text and its activity in a main column, details beside it: a work tracker puts description
  fields on the left with Activity at the bottom, and status and details down the right side, or
  at the bottom in a single column; a card tool that moved comments beside the description met
  requests for the stacked view back
  ([field layout](https://support.atlassian.com/jira-software-cloud/docs/configure-field-layout-in-the-issue-view/),
  [Activity](https://support.atlassian.com/jira-software-cloud/docs/what-are-the-different-types-of-activity-on-an-issue/),
  [comments beside](https://community.atlassian.com/forums/Trello-questions/Trello-Cards-changed-Comments-on-right-side-instead-of/qaq-p/3040684)).
- WAI-ARIA APG, modal dialog: focus moves in on open (to the title for structured content), stays
  inside, Escape closes, and focus returns to what opened it; a work tracker's bug where focus was
  not set onto its board's modal shows what breaks without it
  ([modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
  [focus bug](https://jira.atlassian.com/browse/JRACLOUD-98297)).
