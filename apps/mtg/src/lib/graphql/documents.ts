import { graphql } from "@/generated/graphql";

/**
 * The client's queries.
 *
 * `graphql(...)` is the generated tagged helper, not a runtime parser: codegen
 * reads these strings out of the source at build time and emits a typed
 * document for each, so the result of running one is typed from the schema
 * rather than from a hand-written interface. Select a field that does not
 * exist, or read one you did not select, and it is a type error here.
 *
 * Keeping them in one module rather than inline in components is what makes
 * `pnpm graphql:types` a complete check: every document the client can send is
 * in this file, so a schema change that breaks one breaks the build.
 */

export const DeckListDocument = graphql(`
  query DeckList {
    decks {
      id
      name
      updatedAt
      currentVersion {
        id
        name
        mainCount
      }
    }
  }
`);

export const DeckBoardDocument = graphql(`
  query DeckBoard($id: ID!) {
    deck(id: $id) {
      id
      name
      currentVersion {
        id
        name
        mainCount
        record {
          games
          wins
          losses
          draws
        }
        cards {
          id
          quantity
          isCommander
          slot
          card {
            id
            name
            manaCost
            cmc
            typeLine
            colorIdentity
            imageUrl
            ownedQuantity
          }
        }
      }
    }
  }
`);

export const CardSearchDocument = graphql(`
  query CardSearch($name: String, $commanderLegal: Boolean, $limit: Int) {
    cards(name: $name, commanderLegal: $commanderLegal, limit: $limit) {
      id
      name
      manaCost
      typeLine
      imageUrl
      ownedQuantity
    }
  }
`);

export const RenameDeckDocument = graphql(`
  mutation RenameDeck($id: ID!, $name: String!) {
    renameDeck(id: $id, name: $name) {
      id
      name
    }
  }
`);
