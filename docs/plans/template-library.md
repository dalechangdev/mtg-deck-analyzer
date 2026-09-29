# Plan: template library — manage, publish, browse

**Goal.** One page, `/templates`, where a user manages their analysis templates
(create, clone, edit, delete) and can publish any of them. Templates are private
until their owner publishes them; a published template can be found by every
signed-in user through search, previewed, and cloned into their own account.

**Status.**

| Step | Scope | State |
|---|---|---|
| 1 | Schema: `isPublic`, `publishedAt`, `sourceTemplateId`; RLS for public rows | done (uncommitted) — `20260930120000_add_template_visibility` |
| 2 | `ownership.ts`: split "can view" from "can use"; route the six inline ORs through it | todo |
| 3 | `PATCH /api/templates/[id]` accepts `isPublic`; description length cap | todo |
| 4 | Clone of another account's public template (duplicate route + naming) | todo |
| 5 | `GET /api/templates/public` — search, filter, paginate | todo |
| 6 | `/templates` page: "My templates" / "Browse" tabs, publish toggle, delete confirm | todo |
| 7 | Tests (`template-input`, where-builders, search params) | todo |
| 8 | Signed-in browser check (two accounts) | todo |

## What already exists

- `/templates` → `TemplateManager` (`src/components/templates/template-manager.tsx`):
  list, new, edit, duplicate, delete. Built-ins (`ownerId` null, `isBuiltIn`) are
  read-only and duplicated to edit.
- `POST /api/templates`, `GET/PATCH/DELETE /api/templates/[id]`,
  `POST /api/templates/[id]/duplicate`, all validated by `src/lib/template-input.ts`.
- Visibility today is two states: own (`ownerId = me`) or shared reference
  (`ownerId IS NULL`). RLS in `20260910120000_add_ownership_and_rls` mirrors that.

So "create / clone / update / delete" is mostly done. The work is visibility,
search, and reshaping the page around them.

## Design decisions

**Public templates are cloned to use, never attached by reference.** This is the
decision everything else follows from. You can view and clone someone else's
public template, but only your own templates and the built-ins can be attached to
a deck, scored against on the analysis page, or picked in `/decks/start`.

Attaching by reference would tie my deck to your row:

- you edit the template and my scorecard changes under me;
- you unpublish it and my deck's attachment points at a row I can no longer read
  (`loadTemplate` returns null, and the analysis page silently falls back);
- you delete it and the `DeckTemplate` cascade removes the link from *my* deck.

Clone-to-use makes publish, unpublish, edit and delete purely local to the owner,
and it means the five "usable template" checks (`/decks/start`, analysis, compare,
`POST /api/decks`, the attach route, `loadTemplate`) keep their current meaning.
It is also the flow the app already has for built-ins.

**Two predicates, named.** `ownership.ts` gains:

- `usableTemplateWhere(userId)` — `ownerId = me OR ownerId IS NULL`. Attach,
  analyse, start a deck. Unchanged semantics; replaces the six copies of the
  inline `OR`.
- `viewableTemplateWhere(userId)` — usable, `OR isPublic`. Preview and clone only.

`requireTemplateAccess(id, "read")` switches to the viewable predicate; its two
callers (template GET, duplicate) are exactly the view/clone paths. `"write"`
stays owner-only. Naming them makes the mistake — widening a *use* check to public
rows — visible in review, instead of one `OR` clause among six.

**Schema.**

```prisma
model AnalysisTemplate {
  // …
  isPublic         Boolean   @default(false)
  publishedAt      DateTime? // set on first publish; sort key for Browse
  sourceTemplateId String?   // provenance of a clone; survives the source's deletion
  source           AnalysisTemplate?  @relation("TemplateClones", fields: [sourceTemplateId], references: [id], onDelete: SetNull)
  clones           AnalysisTemplate[] @relation("TemplateClones")

  @@index([isPublic, publishedAt])
}
```

- A `Boolean` rather than a visibility enum: there is no third state yet
  (unlisted/link-only would be the candidate), and adding an enum later is cheap.
- Built-ins keep `ownerId` null and `isPublic` false. They are already visible to
  everyone and are shown in "My templates", not in Browse.
- `sourceTemplateId` lets a clone say "cloned from X" and would allow a clone
  count later. It is `SetNull` so deleting a source never touches anyone's copy.
  Optional — drop it if it isn't wanted in step 1.
- Hand-written migration, like the deck-versions ones: the shadow database can't
  replay the RLS migration. Check the SQL against `prisma migrate diff`.

**RLS.** Two new SELECT policies, `TO anon, authenticated`, mirroring the
shared-template ones: `"isPublic" = true` on `AnalysisTemplate`, and `EXISTS`
parent-is-public on `TemplateRequirement`. The existing `"Own templates" FOR ALL`
policy already lets an owner flip `isPublic` through the Data API. Templates are
not in the GraphQL schema, so nothing there changes; `verify:graphql` still runs
as a regression check.

**Publishing.** `isPublic` is set through `PATCH /api/templates/[id]` (owner-only,
built-ins still 403). `publishedAt` is set the first time it goes public and left
alone on later toggles. Unpublishing hides it from Browse; existing clones are
unaffected. Nothing else about a template changes when it's published, and it
stays editable. Other users see the current version, since clones are snapshots.

**Cloning.** The duplicate route already copies requirements into the caller's
account. Changes:

- Its read gate is widened through `requireTemplateAccess(id, "read")` (above).
- Copies are always `isPublic: false`, with `sourceTemplateId` set.
- Naming: cloning *your own* template keeps the `X (copy)` sequence. Cloning
  someone else's takes the source name as-is when you don't already have one by
  that name, and falls back to the sequence only on collision. Names are unique
  per owner, so this never leaks anything about the source owner.

**Search.** `GET /api/templates/public?q=&format=&role=&cursor=`:

- Public templates only, sorted newest-published first. The caller's own public
  templates are included and flagged `isOwn`.
- `q` is a case-insensitive substring over `name` and `description` (Prisma
  `contains` + `mode: "insensitive"`). The table is small; add `pg_trgm` only if
  it's measured to be slow.
- `role` filters to templates with a requirement for that role ("show me
  templates that ask for sacrifice outlets").
- Keyset pagination on `(publishedAt, id)`, 20 per page.
- Each result carries its requirements (role name + target) so the list can show
  a preview without a second request.
- Signed-in only, like the rest of `/templates`: cloning needs an account, and an
  anonymous browse surface isn't in scope.

**Author attribution is out.** There is no profile table or display name. Results
don't show an author, because an email or user id must never be shown. If
attribution is wanted later it needs a `Profile` model first. That's a separate idea.

**Validation.** `description` currently has no length cap. Once it's shown to
other users, it gets one (2,000 chars) in `template-input.ts`. React escapes
rendered text; no Markdown rendering.

## Page shape

`/templates` keeps its two-pane layout (list left, detail right), with a tab
switch at the top of the list, stored in the URL (`?tab=browse&q=…`) so a search
survives refresh:

- **My templates.** Built-ins first (lock icon, "Clone"), then own templates with
  a "Public" badge when published. Detail pane actions: Edit, Clone, Publish /
  Unpublish, Delete.
- **Browse.** Search box, format and role filters, result list with load-more.
  The detail pane is read-only, with "Clone to my templates" as its only action.
  After a clone, switch to My templates with the new copy selected.
- **Delete** gets a confirmation (it has none today). The confirmation says how
  many of the user's decks have the template attached, since those links cascade
  and those decks fall back to the baseline. It also notes that other people's
  clones are unaffected. Use the app's dialog component, not `window.confirm`.

`TemplateManager` is 520 lines. Split the Browse pane into its own component
(`template-browser.tsx`) rather than growing it further, and pull the read-only
requirement table into a shared piece both panes use.

## Deferred until asked

- **Profile table / author attribution.** Not built until the user says so.
  Until then, results show no author.
- **Clone count on public templates.** Not built until the user says so.
  `sourceTemplateId` is in place for it. Caveat when it lands: the "Own templates"
  RLS policy lets an owner write any column of their own row through the Data
  API, including `sourceTemplateId` and `publishedAt`. So a count over
  `sourceTemplateId` can be inflated by creating templates that point at a public
  one, and `publishedAt` can be back- or forward-dated to move in Browse. Either
  count distinct owners, or restrict those columns (column-level `REVOKE UPDATE`
  plus a trigger for INSERT). REST sets both server-side and isn't affected.

## Open questions

- Should Browse also be reachable from `/decks/start` ("find a template")? It
  could be linked cheaply. Embedding it would be more work, and clone-to-use
  means the user must clone before the template can be picked.

## Notes

- Step 1 RLS was checked as `authenticated` and `anon` in a rolled-back
  transaction. Another account sees a public template and its requirements but
  can't update or delete either. A private template is invisible to other
  accounts and to anon.
- `20260930120000_add_template_visibility` is applied to both the hosted and
  local databases (2026-09-30).
