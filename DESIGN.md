---
name: Audra Control Deck
mode: dark
colors:
  void: "#011936"
  surface: "#071d36"
  surface-raised: "#102b49"
  border: "#465362"
  text: "#F4FFFD"
  muted: "#91A2B4"
  accent: "#ED254E"
  primary: "#ED254E"
  signal: "#F9DC5C"
  focus: "#F9DC5C"
typography:
  display:
    fontFamily: Outfit
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.1
  ui:
    fontFamily: Outfit
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.4
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
rounded:
  sm: 10px
  md: 16px
  lg: 24px
---

# Audra Control Deck

Audra is a local audio-to-video tool for music makers. The create screen should
feel like a premium studio utility: fast, calm, and immediately understandable.

## Direction

- Use a single focused creation workspace with plain-language sections.
- Let navy and near-black surfaces carry the structure. Red is reserved for the
  primary action and selected state. Yellow is limited to small status signals.
- Use familiar segmented controls for categorical choices and sliders only for
  numeric ranges. Do not use decorative dials, rings, or faux hardware.
- Use visible upload bays for source media with clear file states and actions.
- Keep project history and exports out of the main creation screen.

## Layout

- Compact toolbar at the top.
- One content column with an optional compact activity rail on wide screens.
- A small title, output settings, two media bays, and one persistent render action.
- No marketing headline, decorative diagrams, or visual noise inside the app.
- Desktop uses one focused column. Mobile stacks controls without shrinking text.

## Components

- Use dark translucent glass surfaces for the workspace: restrained backdrop blur,
  soft depth, and fine light-catching borders. Keep controls legible and avoid
  stacking glass inside glass more than one level deep.
- Controls show a clear active state through both color and shape.
- Keyboard focus uses yellow outline.
- Motion is limited to short opacity and transform transitions, and respects
  reduced-motion preferences.
