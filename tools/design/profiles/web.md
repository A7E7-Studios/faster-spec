# Web profile

For anything a browser engine draws: a site, a web app, a desktop or mobile shell around a web
view. It holds the standards such an interface is built to and the checks that prove them on the
build. The [design](../../../.agents/skills/design/SKILL.md) and
[ship](../../../.agents/skills/ship/SKILL.md) skills and the
[review checklist](../../../.agents/skills/ship/review-checklist.md) read it when a change alters
something seen; a project names it in its config's `design.profiles`
([tools/gate](../../gate/README.md#configjson)).

## Standards

1. **Components from one place.** A control comes from the project's component library (its
   catalogues). A new one is built there once, not inside a feature.
2. **Tokens only.** Colour, type size, spacing, radius, shadow, duration and easing are tokens by
   role. No raw value where a token exists.
3. **Every state that applies.** A component has each of these states it can be in, and each
   looks different from the default:

   | State | Applies to |
   |---|---|
   | default | everything |
   | hover, pressed | what can be clicked or tapped |
   | focus, shown for the keyboard | what can take focus |
   | disabled | what can be unavailable |
   | selected, checked, current | what holds a choice |
   | loading | what waits for data or for an action to finish |
   | empty | what lists or shows data |
   | error | what can fail or hold an invalid value |
   | long content | what holds text or a number a person supplies |

4. **Transitions.** A change of state the person causes is animated with the motion tokens, and
   nothing but progress animates by itself. Under reduced motion nothing moves: the end state
   shows at once.
5. **Any size.** A layout is fluid from 320 px wide upward and follows its container, not the
   device. The page never scrolls sideways, text wraps and is never clipped or laid over other
   content, and every target keeps its minimum size. Pointer and touch both work.
6. **Accessible.** The design skill's accessibility list holds in the build, in each theme.
7. **As the board draws it.** Every screen and state the feature's board holds exists in the
   build.

## Checks

Each check is an automated test in the project's suites, run in a browser engine (for example
through Playwright), and a task of the change. One that cannot apply to a change is named, with
the reason, in the pull request's `## Not verified`.

| Check | Standard | Passes when |
|---|---|---|
| States | 3 | each new or changed component is rendered in every state of the list that applies, on a catalogue page or a test page, and each state differs from the default in a style, a label or an element |
| Sizes | 5 | each new or changed screen, at 320, 768 and 1280 px wide and at the widths the project adds, has no horizontal overflow, no text clipped or laid over another element, and no target under its minimum size |
| Text at 200 % | 5, 6 | the Sizes check holds with the text size doubled |
| Touch | 5 | with touch emulated, each control acts on a tap as it does on a click |
| Transitions | 4 | each animated change of state takes its duration and easing from the motion tokens and ends in the state the board shows; on a screen at rest, nothing but a progress indicator is animating |
| Reduced motion | 4 | with reduced motion on, no transition or animation takes time |
| Keyboard | 6 | each control is reached with Tab in reading order, shows its focus, and acts on Enter or Space |
| Accessibility scan | 6 | an automated scan (for example axe) reports no violation on each new or changed screen, in each theme |
| Tokens | 2 | the styles the change adds hold no raw colour, size, spacing, radius, shadow, duration or easing where a token exists |
| The board | 7 | each section of the feature's board is reached in the build by a test |

Standard 1 has no check of its own: whether a control belongs in the library is for the review,
whose check on reuse reads the diff for a second version of what the library has.

The checks are scripts: they assert on the page, they do not ask an agent to judge a picture. A
screenshot a check takes is for the comparison with the board and for the pull request; it is
never committed.
