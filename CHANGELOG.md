# GEN2 Planner + 3D Build Studio — Changelog

Releases use the ecosystem's date scheme: **`vYYMM`** for a month's update,
**`vYYMM.DD`** when a month gets more than one — the same pattern users
already see on model downloads (e.g. the v2602 drawer clips). A same-day
follow-up adds a third segment, **`vYYMM.DD.N`** counting from 1 (`v2608.08.1`),
so the version always reads as a date first and a patch second. The planner
(this repo) and the 3D Build Studio
([gen2-visual-animator](https://github.com/Jerrari12/gen2-visual-animator))
ship together; entries cover both. The current version shows in the planner's
footer.

## v2608.08 — 2026-08-08

Dark mode, a new faceplate series, and the demo kits finally show their
handle screws.

### New

- **Dark mode, and it is now the default.** The planner, the 3D Build Studio
  and the starter-kits gallery share one look: a deep navy workspace with a
  neon grid floor under the build. A sun/moon switch in the top bar flips
  between dark and light, your choice is remembered, and it follows you
  between the three pages.
- **The light stage is still the colour-accurate one.** Only the studio's
  *room* changes with the theme — never the parts, the lighting or the
  identification colours. The filament picker says so out loud on dark:
  screen colour is approximate, light reads truest.
- **Chevron faceplates** — a new premium series in 18 sizes. The 45 degree
  pattern is phase-anchored, so it runs continuously across drawers, side by
  side and stacked, in any mix of widths and heights. The face is built from
  separate diagonal strips, so every strip can take its own filament colour,
  and every size ships a pre-sliced multicolour 3MF.
- **Classic faceplates** — the free series with the grip printed in, so there
  is no handle to bolt on and nothing to buy.
- **Real filament colours throughout the studio.** The picker now carries
  Polymaker Panchroma PLA (28 colours), Panchroma Silk (24), Polymaker PETG
  (25), Elegoo PLA and PETG, Printed Solid Jessie PLA (21) and ERYONE Burnt
  Titanium, searchable across every brand. Every one-click preset is now
  built from real, buyable filament instead of stand-in colours, and 15% off
  your first Polymaker order rides along with code JERRARI.
- **"In this build"** — the colour picker opens with the filaments already
  used in your build, so reusing one is a single tap.
- **Classic Drawers in 3H** for the 115, 240 and 270 collections — every
  collection now offers its full drawer size range.
- **Starter kits download as one file.** Each gallery card links the complete
  kit bundle instead of sending you to about ten separate part pages.
- **Pick your model site.** Choose Printables, Thangs or MakerWorld and every
  download button follows, with the others one click away. MakerWorld links
  were added across the collections.
- **Hardware markers.** A wrench flags anything needing bought hardware, so
  you can see at a glance what you can finish straight off the printer.
- Matching site icons across all four GEN2 sites.

### Fixed

- The demo kits show their **M3 handle screws** being installed. The
  fasteners had been in generated builds since July, but the hand-authored
  kits showed handles held on by nothing.
- The cover and foot-rail screws are now named **socket head**, so they stop
  reading as near-twins of the button head screw that fastens a handle —
  same nominal size, different job.
- Mobile: picking a mount scrolls to the next step (on a phone it sat below
  the fold and looked like a dead end), and the floating 3D Studio button no
  longer covers Remove unit.
- The filament picker no longer sandwiches the model between panels on a
  phone, and on desktop the stage clears while you are picking a colour.
- The selection glow no longer tints the colour you are judging.
- Deep collections (240 and 270): the demo drawer pops clear of the case, so
  the magnet clip is installed outside it rather than appearing to pass
  through it.
- Faceplate colour tooltips name the filament each zone is wearing.
- Fixed a rapid flicker that could hit the 3D view with the picker open.
- Affiliate links are clearly marked as paid links wherever they appear.

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
