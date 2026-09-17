/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type DeckListQueryVariables = Exact<{ [key: string]: never; }>;


export type DeckListQuery = { decks: Array<{ id: string, name: string, updatedAt: string, currentVersion: { id: string, name: string, mainCount: number } | null }> };

export type DeckBoardQueryVariables = Exact<{
  id: string | number;
}>;


export type DeckBoardQuery = { deck: { id: string, name: string, currentVersion: { id: string, name: string, mainCount: number, record: { games: number, wins: number, losses: number, draws: number }, cards: Array<{ id: string, quantity: number, isCommander: boolean, slot: string, card: { id: string, name: string, manaCost: string | null, cmc: number, typeLine: string, colorIdentity: Array<string>, imageUrl: string | null, ownedQuantity: number } }> } | null } | null };

export type CardSearchQueryVariables = Exact<{
  name?: string | null | undefined;
  commanderLegal?: boolean | null | undefined;
  limit?: number | null | undefined;
}>;


export type CardSearchQuery = { cards: Array<{ id: string, name: string, manaCost: string | null, typeLine: string, imageUrl: string | null, ownedQuantity: number }> };

export type RenameDeckMutationVariables = Exact<{
  id: string | number;
  name: string;
}>;


export type RenameDeckMutation = { renameDeck: { id: string, name: string } | null };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}

export const DeckListDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<DeckListQuery, DeckListQueryVariables>;
export const DeckBoardDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<DeckBoardQuery, DeckBoardQueryVariables>;
export const CardSearchDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<CardSearchQuery, CardSearchQueryVariables>;
export const RenameDeckDocument = new TypedDocumentString(`
    mutation RenameDeck($id: ID!, $name: String!) {
  renameDeck(id: $id, name: $name) {
    id
    name
  }
}
    `) as unknown as TypedDocumentString<RenameDeckMutation, RenameDeckMutationVariables>;