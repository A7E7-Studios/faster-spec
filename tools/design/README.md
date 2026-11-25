# Design

The kit's house style and its profiles. The house style is a starting design system for a project
that has none of its own: the [design skill](../../.agents/skills/design/SKILL.md) builds every
visual direction on a project's tokens and critiques it against its brief, and these two files are
what it uses until the project names its own. A profile holds, for one kind of application, the
standards its interface is built to and the checks that prove them on the build.

| File | What |
|---|---|
| [`house-style/tokens.css`](house-style/tokens.css) | CSS custom properties by role: the font stack, type sizes, spacing, control heights, radii, motion and colours, for a light theme and a dark one (`[data-theme="dark"]`, or the system setting unless `[data-theme="light"]`). Nothing is loaded from the network. |
| [`house-style/brief.md`](house-style/brief.md) | the style brief: the principles a design is critiqued against, and the reference products it is measured by |
| [`profiles/web.md`](profiles/web.md) | the web profile, for anything a browser engine draws: components from one library, tokens only, every state a component can be in, transitions, any size from 320 px wide, and the checks of each as tests |

## How a project uses it

A project's `tools/gate/config.json` names its design system in its `design` block
([its keys](../gate/README.md)). The starter config points at the house style:

```json
"design": {
  "tokens": "tools/design/house-style/tokens.css",
  "brief": "tools/design/house-style/brief.md",
  "profiles": ["tools/design/profiles/web.md"]
}
```

## Profiles

`design.profiles` lists the profile of each kind of application the project builds. When a change
alters something seen, the design skill draws each new component in every state of the profile's
list, the [ship skill](../../.agents/skills/ship/SKILL.md) builds to the profile's Standards and
writes its Checks as tests in the project's own suites, and the
[review checklist](../../.agents/skills/ship/review-checklist.md) fails a round on a state or a
check that is missing without a reason. The gate checks only that each named file exists.

A project that builds another kind of application (a headset app, a native desktop app) writes
its own profile in a folder of its own and names it beside or instead of the web profile: a
Markdown file with a `## Standards` list, among them the states a component has, and a `## Checks`
table of what an automated test proves, run through the harness the project drives its
application with.

A board the design skill draws copies the token values it uses into its own inline CSS, so a
committed board stays self-contained whichever tokens it was built on.

## Who owns these files

The sync owns `tools/design/`: every sync overwrites it with the kit's version. A project never
edits these files. To restyle, it keeps its own tokens and brief in a folder of its own (a copy of
these as a start, or its component library's tokens) and points its `design` block at them; a
profile of its own lives there too.
