# GEN2 Planner + 3D Build Studio — Changelog

Releases use the ecosystem's date scheme: **`vYYMM`** for a month's update,
**`vYYMM.DD`** when a month gets more than one — the same pattern users
already see on model downloads (e.g. the v2602 drawer clips). The planner
(this repo) and the 3D Build Studio
([gen2-visual-animator](https://github.com/Jerrari12/gen2-visual-animator))
ship together; entries cover both. The current version shows in the planner's
footer.

## v2607.20 — 2026-07-20

The planner and the 3D Build Studio became one workspace.

### New

- **Docked 3D preview** — on wide screens the Build Studio opens in a split
  view beside the planner, the moment the first build is valid. It follows
  every change live: place, move or remove a unit and the 3D build and its
  step-by-step instructions rebuild instantly. The seam is draggable (width
  remembered as a screen percentage), the pane collapses to an edge tab, and
  "Full studio" pops it out to its own tab. Slow machines are protected: no
  auto-open on software-rendered GPUs, and a measured low framerate offers a
  one-click collapse.
- **Live preview landing** — the docked studio starts on the *finished*
  build: orbit, tap parts to identify, try filament colors, then "Begin the
  instructions" enters the step-by-step (a Preview tool and a cover link
  return to the landing).
- **Under-table 3D instructions for every collection** — rail models for 59,
  115, 240 and 270 joined the studio's part library, so every collection ×
  every mount has a complete 3D guide (previously 165/185 only). Rail parts
  lists show per-length renders.
- **Handle picker with pictures** — handle styles are illustrated cards:
  Deco (the new default), BlockBar (6 styles) and Crystal (2 styles,
  newly modeled in 3D). The planner picks the series; the exact variant is
  chosen on the handle itself in the studio. All nine handles carry real
  renders in both parts lists.
- **Colors follow you** — filament picks relay between the docked preview
  and the full studio (and survive reloads), regardless of browser storage
  partitioning.
- **Board quality-of-life** — "+" strips on the grid edges grow the board in
  the directions valid for the mount; "Start fresh" resets the whole session
  after a confirm that points at SAVE.
- **Blocked layouts explain themselves** — when a layout can't be shown in
  3D (floating units, uneven top row, …) the reason appears under the 3D
  button and on the board, and the docked studio veils itself with a "fix it
  in the planner" note until the layout is legal again.

### Fixed

- Under-table rail screws sit in the measured screw holes on every
  collection now (the 59's back row was ~18 mm off; 115/165/240 carried
  smaller errors).
- Floating or unsupported units block the 3D guide with an explanation
  instead of generating impossible instructions.
- Mobile: the step controls fit one row again (a dock-only Preview button
  had leaked into the phone layout and wrapped the bar).
- A camera bug could strand the instruction cover page on an extreme wrong
  zoom after page switches — fixed (it also mis-framed the docked cover).
- Overlapping panels in narrow views cleaned up: long step notes cap and
  scroll, the parts panel and step text never stack, hints dismiss on the
  first interaction.
- Disabled buttons now look disabled.

## 1.0 — mid-July 2026

The baseline announced release: visual layout planner (three mounts, six
collections, per-printer size checks, share links and saved sessions) paired
with the 3D Build Studio — generated step-by-step assembly for tabletop and
wall builds of every collection and under-table 165/185, faceplate families
(Essential / EdgeLabel / Classic Pro), filament color picking with presets,
and the live options sync between the two tools. Shortly after: the Printed
Solid PLA range (21 solid colors) joined the filament menu (July 15).
