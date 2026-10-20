# Plan: Tag graph in the analysis breakdown

**Goal.** A second display mode for the breakdown on `/decks/[id]/analysis`:
a force-directed graph of the main deck's cards linked to the Scryfall Tagger
oracle tags they carry. Clusters show which cards share a job; hub tags show
what the deck leans on. The table stays the default view.

**Status.**

| Step | Scope | State |
|---|---|---|
| 1 | Oracle tags in the database (`OracleTag`, `CardOracleTag`, `sync:tags`) and the table's Scryfall tag dimension | done (uncommitted) — applied local + hosted |
| 2 | `src/lib/deck-tag-graph.ts`: pure nodes/links builder with tag pruning, plus tests | done (uncommitted) — `test/deck-tag-graph.test.ts` |
| 3 | `d3-force` dependency; `tag-graph.tsx` SVG view with simulation, zoom/pan, node drag | done (uncommitted) |
| 4 | Table/Graph toggle in `deck-breakdown.tsx`; clicking a tag opens the existing card list, clicking a card opens the card modal | done (uncommitted) |
| 5 | Hide trivia tags (`src/lib/oracle-tags.ts`, subtrees of five Tagger roots), on by default in the graph | done (uncommitted) |
| 6 | Browser check, light and dark | done 2026-10-20 — Helga deck: fitted on open, lands/removal/card-advantage clusters visible, hover highlights neighbours, clicking "ramp" lists its 12 cards, page scroll passes through |

## Design

**d3-force with our own SVG, not a canvas graph library.** Only the physics
comes from a library (`d3-force`, about 15 KB). React draws the nodes and
links, so fills take raw tokens (`var(--info)`, `MANA_SVG`), as CLAUDE.md
requires for charts, and dark mode works without reading CSS values in JS. A
deck graph is a few hundred nodes at most, well within SVG's range. We
considered react-force-graph (canvas, client-only import, theming through JS),
Sigma.js (WebGL, built for far larger graphs) and Cytoscape (its own styling
language).

**Cards ↔ tags, so the graph is bipartite.** Card nodes are small and coloured
by colour identity, using `MANA_SVG` with its edge stroke, since the white and
black fills nearly vanish on the page surfaces. Multicolour cards use a neutral
fill with a ring. Tag nodes are sized by how many cards carry them (square
root of the count) and are always labelled. Card names show on hover.

**Tags are pruned, or the graph is a hairball.** Every card carries about 20
tags once ancestors are rolled up. The graph shows tags carried by at least
*N* main-deck cards (default 3, adjustable), capped at the 40 most common, and
narrowed by the tag filter box shared with the table. Cards linked to none of
the shown tags are left out, and the caption says how many. The pruning is
pure (`deck-tag-graph.ts`) so it can be tested without a DOM.

**The simulation is client state, not data.** Nodes are rebuilt when the
deck, filter or threshold changes. Positions carry over by id, so a change of
filter doesn't throw the layout away. The layout is run to rest before the
first paint, then fitted to the box. Animating it into place took seconds and
looked like a hairball the whole time. The live simulation runs only while a
node is dragged. Zoom is ⌘/Ctrl+scroll (which trackpad pinch also sends) or
the +/− buttons. Plain scrolling belongs to the page, because a 520px graph
shouldn't trap it. Labels, card dots and strokes are scaled against the zoom
so they stay the same size on screen. Only tag circles grow, because their area
is the card count. At rest only the 15 most common tags are labelled.

**Trivia tags are hidden by default.** The roots in `TRIVIA_TAG_ROOTS`
(card names, cycle, flavors of vanilla, unique type line, staple with set's
mechanic) describe the card as an object rather than its play. Before they
were hidden they filled the graph's top hubs ("cycle" was on 35 of Helga's
99 cards). A recursive CTE over `OracleTag.parentIds` expands them. The page
sends only the ones this deck carries, out of about 1,700. Rules-structure
roots like "triggered ability" stay, because their subtrees hold real hooks
("cast trigger"). The table still shows every tag.

**Interaction reuses the table.** Clicking a tag selects it, highlights its
cards and links, and opens the same grouped card list as a table cell
(`breakdownDeck(…, "tag", "none")`). Clicking a card calls `onInspect`. The
table stays available as the accessible, non-visual view of the same data.
