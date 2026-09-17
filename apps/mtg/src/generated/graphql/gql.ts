/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query DeckList {\n    decks {\n      id\n      name\n      updatedAt\n      currentVersion {\n        id\n        name\n        mainCount\n      }\n    }\n  }\n": typeof types.DeckListDocument,
    "\n  query DeckBoard($id: ID!) {\n    deck(id: $id) {\n      id\n      name\n      currentVersion {\n        id\n        name\n        mainCount\n        record {\n          games\n          wins\n          losses\n          draws\n        }\n        cards {\n          id\n          quantity\n          isCommander\n          slot\n          card {\n            id\n            name\n            manaCost\n            cmc\n            typeLine\n            colorIdentity\n            imageUrl\n            ownedQuantity\n          }\n        }\n      }\n    }\n  }\n": typeof types.DeckBoardDocument,
    "\n  query CardSearch($name: String, $commanderLegal: Boolean, $limit: Int) {\n    cards(name: $name, commanderLegal: $commanderLegal, limit: $limit) {\n      id\n      name\n      manaCost\n      typeLine\n      imageUrl\n      ownedQuantity\n    }\n  }\n": typeof types.CardSearchDocument,
    "\n  mutation RenameDeck($id: ID!, $name: String!) {\n    renameDeck(id: $id, name: $name) {\n      id\n      name\n    }\n  }\n": typeof types.RenameDeckDocument,
};
const documents: Documents = {
    "\n  query DeckList {\n    decks {\n      id\n      name\n      updatedAt\n      currentVersion {\n        id\n        name\n        mainCount\n      }\n    }\n  }\n": types.DeckListDocument,
    "\n  query DeckBoard($id: ID!) {\n    deck(id: $id) {\n      id\n      name\n      currentVersion {\n        id\n        name\n        mainCount\n        record {\n          games\n          wins\n          losses\n          draws\n        }\n        cards {\n          id\n          quantity\n          isCommander\n          slot\n          card {\n            id\n            name\n            manaCost\n            cmc\n            typeLine\n            colorIdentity\n            imageUrl\n            ownedQuantity\n          }\n        }\n      }\n    }\n  }\n": types.DeckBoardDocument,
    "\n  query CardSearch($name: String, $commanderLegal: Boolean, $limit: Int) {\n    cards(name: $name, commanderLegal: $commanderLegal, limit: $limit) {\n      id\n      name\n      manaCost\n      typeLine\n      imageUrl\n      ownedQuantity\n    }\n  }\n": types.CardSearchDocument,
    "\n  mutation RenameDeck($id: ID!, $name: String!) {\n    renameDeck(id: $id, name: $name) {\n      id\n      name\n    }\n  }\n": types.RenameDeckDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query DeckList {\n    decks {\n      id\n      name\n      updatedAt\n      currentVersion {\n        id\n        name\n        mainCount\n      }\n    }\n  }\n"): typeof import('./graphql').DeckListDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query DeckBoard($id: ID!) {\n    deck(id: $id) {\n      id\n      name\n      currentVersion {\n        id\n        name\n        mainCount\n        record {\n          games\n          wins\n          losses\n          draws\n        }\n        cards {\n          id\n          quantity\n          isCommander\n          slot\n          card {\n            id\n            name\n            manaCost\n            cmc\n            typeLine\n            colorIdentity\n            imageUrl\n            ownedQuantity\n          }\n        }\n      }\n    }\n  }\n"): typeof import('./graphql').DeckBoardDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CardSearch($name: String, $commanderLegal: Boolean, $limit: Int) {\n    cards(name: $name, commanderLegal: $commanderLegal, limit: $limit) {\n      id\n      name\n      manaCost\n      typeLine\n      imageUrl\n      ownedQuantity\n    }\n  }\n"): typeof import('./graphql').CardSearchDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RenameDeck($id: ID!, $name: String!) {\n    renameDeck(id: $id, name: $name) {\n      id\n      name\n    }\n  }\n"): typeof import('./graphql').RenameDeckDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
