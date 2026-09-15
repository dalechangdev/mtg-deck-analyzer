/**
 * Real Card/CardFace rows for the land capability tests, exported from the local
 * database after the produced_mana and layout re-syncs (2026-09-15). The tests
 * assert against this exact oracle text, so update a fixture by hand if Scryfall
 * rewords a card.
 */

import type { LandCard } from "@/lib/land-capabilities";

export const LANDS: Record<string, LandCard> = {
  "Barkchannel Pathway // Tidechannel Pathway": {
    "cardId": "barkchannel-pathway-tidechannel-pathway",
    "name": "Barkchannel Pathway // Tidechannel Pathway",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land // Land",
    "oracleText": null,
    "colorIdentity": [
      "G",
      "U"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "G",
      "U"
    ],
    "layout": "modal_dfc",
    "faces": [
      {
        "typeLine": "Land",
        "oracleText": "{T}: Add {G}."
      },
      {
        "typeLine": "Land",
        "oracleText": "{T}: Add {U}."
      }
    ]
  },
  "Blast Zone": {
    "cardId": "blast-zone",
    "name": "Blast Zone",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "This land enters with a charge counter on it.\n{T}: Add {C}.\n{X}{X}, {T}: Put X charge counters on this land.\n{3}, {T}, Sacrifice this land: Destroy each nonland permanent with mana value equal to the number of charge counters on this land.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "C"
    ],
    "layout": "normal"
  },
  "Bojuka Bog": {
    "cardId": "bojuka-bog",
    "name": "Bojuka Bog",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "This land enters tapped.\nWhen this land enters, exile target player's graveyard.\n{T}: Add {B}.",
    "colorIdentity": [
      "B"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "B"
    ],
    "layout": "normal"
  },
  "Boseiju, Who Endures": {
    "cardId": "boseiju-who-endures",
    "name": "Boseiju, Who Endures",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Legendary Land",
    "oracleText": "{T}: Add {G}.\nChannel — {1}{G}, Discard this card: Destroy target artifact, enchantment, or nonbasic land an opponent controls. That player may search their library for a land card with a basic land type, put it onto the battlefield, then shuffle. This ability costs {1} less to activate for each legendary creature you control.",
    "colorIdentity": [
      "G"
    ],
    "keywords": [
      "Channel"
    ],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "G"
    ],
    "layout": "normal"
  },
  "Bridgeworks Battle // Tanglespan Bridgeworks": {
    "cardId": "bridgeworks-battle-tanglespan-bridgeworks",
    "name": "Bridgeworks Battle // Tanglespan Bridgeworks",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Sorcery // Land",
    "oracleText": null,
    "colorIdentity": [
      "G"
    ],
    "keywords": [
      "Fight"
    ],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "G"
    ],
    "layout": "modal_dfc",
    "faces": [
      {
        "typeLine": "Sorcery",
        "oracleText": "Target creature you control gets +2/+2 until end of turn. It fights up to one target creature you don't control. (Each deals damage equal to its power to the other.)"
      },
      {
        "typeLine": "Land",
        "oracleText": "As this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {G}."
      }
    ]
  },
  "Cabaretti Courtyard": {
    "cardId": "cabaretti-courtyard",
    "name": "Cabaretti Courtyard",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "When this land enters, sacrifice it. When you do, search your library for a basic Mountain, Forest, or Plains card, put it onto the battlefield tapped, then shuffle and you gain 1 life.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [],
    "layout": "normal"
  },
  "Castle Doom": {
    "cardId": "castle-doom",
    "name": "Castle Doom",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast an artifact spell.\n{3}, {T}, Sacrifice an artifact: Create a 3/3 colorless Robot Villain artifact creature token named Doombot. Activate only as a sorcery.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "B",
      "C",
      "G",
      "R",
      "U",
      "W"
    ],
    "layout": "normal"
  },
  "Castle Vantress": {
    "cardId": "castle-vantress",
    "name": "Castle Vantress",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "This land enters tapped unless you control an Island.\n{T}: Add {U}.\n{2}{U}{U}, {T}: Scry 2.",
    "colorIdentity": [
      "U"
    ],
    "keywords": [
      "Scry"
    ],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "U"
    ],
    "layout": "normal"
  },
  "City of Brass": {
    "cardId": "city-of-brass",
    "name": "City of Brass",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "Whenever this land becomes tapped, it deals 1 damage to you.\n{T}: Add one mana of any color.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "B",
      "G",
      "R",
      "U",
      "W"
    ],
    "layout": "normal"
  },
  "Command Tower": {
    "cardId": "command-tower",
    "name": "Command Tower",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "{T}: Add one mana of any color in your commander's color identity.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "B",
      "G",
      "R",
      "U",
      "W"
    ],
    "layout": "normal"
  },
  "Deserted Temple": {
    "cardId": "deserted-temple",
    "name": "Deserted Temple",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "{T}: Add {C}.\n{1}, {T}: Untap target land.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "C"
    ],
    "layout": "normal"
  },
  "Dwarven Mine": {
    "cardId": "dwarven-mine",
    "name": "Dwarven Mine",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land — Mountain",
    "oracleText": "({T}: Add {R}.)\nThis land enters tapped unless you control three or more other Mountains.\nWhen this land enters untapped, create a 1/1 red Dwarf creature token.",
    "colorIdentity": [
      "R"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "R"
    ],
    "layout": "normal"
  },
  "Evolving Wilds": {
    "cardId": "evolving-wilds",
    "name": "Evolving Wilds",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [],
    "layout": "normal"
  },
  "Fetid Pools": {
    "cardId": "fetid-pools",
    "name": "Fetid Pools",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land — Island Swamp",
    "oracleText": "({T}: Add {U} or {B}.)\nThis land enters tapped.\nCycling {2} ({2}, Discard this card: Draw a card.)",
    "colorIdentity": [
      "B",
      "U"
    ],
    "keywords": [
      "Cycling"
    ],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "B",
      "U"
    ],
    "layout": "normal"
  },
  "Glacial Fortress": {
    "cardId": "glacial-fortress",
    "name": "Glacial Fortress",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "This land enters tapped unless you control a Plains or an Island.\n{T}: Add {W} or {U}.",
    "colorIdentity": [
      "U",
      "W"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "U",
      "W"
    ],
    "layout": "normal"
  },
  "Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun": {
    "cardId": "growing-rites-of-itlimoc-itlimoc-cradle-of-the-sun",
    "name": "Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Legendary Enchantment // Legendary Land",
    "oracleText": null,
    "colorIdentity": [
      "G"
    ],
    "keywords": [
      "Transform"
    ],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "G"
    ],
    "layout": "transform",
    "faces": [
      {
        "typeLine": "Legendary Enchantment",
        "oracleText": "When Growing Rites of Itlimoc enters, look at the top four cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in any order.\nAt the beginning of your end step, if you control four or more creatures, transform Growing Rites of Itlimoc."
      },
      {
        "typeLine": "Legendary Land",
        "oracleText": "(Transforms from Growing Rites of Itlimoc.)\n{T}: Add {G}.\n{T}: Add {G} for each creature you control."
      }
    ]
  },
  "Haven of the Spirit Dragon": {
    "cardId": "haven-of-the-spirit-dragon",
    "name": "Haven of the Spirit Dragon",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Dragon creature spell.\n{2}, {T}, Sacrifice this land: Return target Dragon creature card or Ugin planeswalker card from your graveyard to your hand.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "B",
      "C",
      "G",
      "R",
      "U",
      "W"
    ],
    "layout": "normal"
  },
  "High Market": {
    "cardId": "high-market",
    "name": "High Market",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "{T}: Add {C}.\n{T}, Sacrifice a creature: You gain 1 life.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "C"
    ],
    "layout": "normal"
  },
  "Kyoshi Village": {
    "cardId": "kyoshi-village",
    "name": "Kyoshi Village",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "This land enters tapped.\n{T}: Add {G} or {W}.\n{4}, {T}, Sacrifice this land: Draw a card.",
    "colorIdentity": [
      "G",
      "W"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "G",
      "W"
    ],
    "layout": "normal"
  },
  "Maze of Ith": {
    "cardId": "maze-of-ith",
    "name": "Maze of Ith",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [],
    "layout": "normal"
  },
  "Mikokoro, Center of the Sea": {
    "cardId": "mikokoro-center-of-the-sea",
    "name": "Mikokoro, Center of the Sea",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Legendary Land",
    "oracleText": "{T}: Add {C}.\n{2}, {T}: Each player draws a card.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "C"
    ],
    "layout": "normal"
  },
  "Mount Doom": {
    "cardId": "mount-doom",
    "name": "Mount Doom",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Legendary Land",
    "oracleText": "{T}, Pay 1 life: Add {B} or {R}.\n{1}{B}{R}, {T}: Mount Doom deals 1 damage to each opponent.\n{5}{B}{R}, {T}, Sacrifice Mount Doom and a legendary artifact: Choose up to two creatures, then destroy the rest. Activate only as a sorcery.",
    "colorIdentity": [
      "B",
      "R"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "B",
      "R"
    ],
    "layout": "normal"
  },
  "Multiversal Passage": {
    "cardId": "multiversal-passage",
    "name": "Multiversal Passage",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "As this land enters, choose a basic land type. Then you may pay 2 life. If you don't, it enters tapped.\nThis land is the chosen type.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [],
    "layout": "normal"
  },
  "Mutavault": {
    "cardId": "mutavault",
    "name": "Mutavault",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "{T}: Add {C}.\n{1}: This land becomes a 2/2 creature with all creature types until end of turn. It's still a land.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "C"
    ],
    "layout": "normal"
  },
  "Mystic Sanctuary": {
    "cardId": "mystic-sanctuary",
    "name": "Mystic Sanctuary",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land — Island",
    "oracleText": "({T}: Add {U}.)\nThis land enters tapped unless you control three or more other Islands.\nWhen this land enters untapped, you may put target instant or sorcery card from your graveyard on top of your library.",
    "colorIdentity": [
      "U"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "U"
    ],
    "layout": "normal"
  },
  "Overgrown Tomb": {
    "cardId": "overgrown-tomb",
    "name": "Overgrown Tomb",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land — Swamp Forest",
    "oracleText": "({T}: Add {B} or {G}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.",
    "colorIdentity": [
      "B",
      "G"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "B",
      "G"
    ],
    "layout": "normal"
  },
  "Phyrexian Tower": {
    "cardId": "phyrexian-tower",
    "name": "Phyrexian Tower",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Legendary Land",
    "oracleText": "{T}: Add {C}.\n{T}, Sacrifice a creature: Add {B}{B}.",
    "colorIdentity": [
      "B"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "B",
      "C"
    ],
    "layout": "normal"
  },
  "Plains": {
    "cardId": "plains",
    "name": "Plains",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Basic Land — Plains",
    "oracleText": "({T}: Add {W}.)",
    "colorIdentity": [
      "W"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "W"
    ],
    "layout": "normal"
  },
  "Prismatic Vista": {
    "cardId": "prismatic-vista",
    "name": "Prismatic Vista",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "{T}, Pay 1 life, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield, then shuffle.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [],
    "layout": "normal"
  },
  "Reliquary Tower": {
    "cardId": "reliquary-tower",
    "name": "Reliquary Tower",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "You have no maximum hand size.\n{T}: Add {C}.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "C"
    ],
    "layout": "normal"
  },
  "Snow-Covered Forest": {
    "cardId": "snow-covered-forest",
    "name": "Snow-Covered Forest",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Basic Snow Land — Forest",
    "oracleText": "({T}: Add {G}.)",
    "colorIdentity": [
      "G"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "G"
    ],
    "layout": "normal"
  },
  "Spirebluff Canal": {
    "cardId": "spirebluff-canal",
    "name": "Spirebluff Canal",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "This land enters tapped unless you control two or fewer other lands.\n{T}: Add {U} or {R}.",
    "colorIdentity": [
      "R",
      "U"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "R",
      "U"
    ],
    "layout": "normal"
  },
  "Sunken Hollow": {
    "cardId": "sunken-hollow",
    "name": "Sunken Hollow",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land — Island Swamp",
    "oracleText": "({T}: Add {U} or {B}.)\nThis land enters tapped unless you control two or more basic lands.",
    "colorIdentity": [
      "B",
      "U"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "B",
      "U"
    ],
    "layout": "normal"
  },
  "Temple Garden": {
    "cardId": "temple-garden",
    "name": "Temple Garden",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land — Forest Plains",
    "oracleText": "({T}: Add {G} or {W}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.",
    "colorIdentity": [
      "G",
      "W"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "G",
      "W"
    ],
    "layout": "normal"
  },
  "Temple of Malady": {
    "cardId": "temple-of-malady",
    "name": "Temple of Malady",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "This land enters tapped.\nWhen this land enters, scry 1. (Look at the top card of your library. You may put that card on the bottom.)\n{T}: Add {B} or {G}.",
    "colorIdentity": [
      "B",
      "G"
    ],
    "keywords": [
      "Scry"
    ],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "B",
      "G"
    ],
    "layout": "normal"
  },
  "Thran Portal": {
    "cardId": "thran-portal",
    "name": "Thran Portal",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land — Gate",
    "oracleText": "This land enters tapped unless you control two or fewer other lands.\nAs this land enters, choose a basic land type.\nThis land is the chosen type in addition to its other types.\nMana abilities of this land cost an additional 1 life to activate.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [],
    "layout": "normal"
  },
  "Tranquil Thicket": {
    "cardId": "tranquil-thicket",
    "name": "Tranquil Thicket",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "This land enters tapped.\n{T}: Add {G}.\nCycling {G} ({G}, Discard this card: Draw a card.)",
    "colorIdentity": [
      "G"
    ],
    "keywords": [
      "Cycling"
    ],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "G"
    ],
    "layout": "normal"
  },
  "Treetop Village": {
    "cardId": "treetop-village",
    "name": "Treetop Village",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "This land enters tapped.\n{T}: Add {G}.\n{1}{G}: This land becomes a 3/3 green Ape creature with trample until end of turn. It's still a land. (It can deal excess combat damage to the player or planeswalker it's attacking.)",
    "colorIdentity": [
      "G"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "G"
    ],
    "layout": "normal"
  },
  "Vesuva": {
    "cardId": "vesuva",
    "name": "Vesuva",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "You may have this land enter tapped as a copy of any land on the battlefield.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [],
    "layout": "normal"
  },
  "Volatile Fjord": {
    "cardId": "volatile-fjord",
    "name": "Volatile Fjord",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Snow Land — Island Mountain",
    "oracleText": "({T}: Add {U} or {R}.)\nThis land enters tapped.",
    "colorIdentity": [
      "R",
      "U"
    ],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "R",
      "U"
    ],
    "layout": "normal"
  },
  "Wastes": {
    "cardId": "wastes",
    "name": "Wastes",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Basic Land",
    "oracleText": "{T}: Add {C}.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "C"
    ],
    "layout": "normal"
  },
  "Westvale Abbey // Ormendahl, Profane Prince": {
    "cardId": "westvale-abbey-ormendahl-profane-prince",
    "name": "Westvale Abbey // Ormendahl, Profane Prince",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land // Legendary Creature — Demon",
    "oracleText": null,
    "colorIdentity": [
      "B"
    ],
    "keywords": [
      "Flying",
      "Lifelink",
      "Indestructible",
      "Transform",
      "Haste"
    ],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [
      "C"
    ],
    "layout": "transform",
    "faces": [
      {
        "typeLine": "Land",
        "oracleText": "{T}: Add {C}.\n{5}, {T}, Pay 1 life: Create a 1/1 white and black Human Cleric creature token.\n{5}, {T}, Sacrifice five creatures: Transform this land, then untap it."
      },
      {
        "typeLine": "Legendary Creature — Demon",
        "oracleText": "Flying, lifelink, indestructible, haste"
      }
    ]
  },
  "Windswept Heath": {
    "cardId": "windswept-heath",
    "name": "Windswept Heath",
    "manaCost": null,
    "cmc": 0,
    "typeLine": "Land",
    "oracleText": "{T}, Pay 1 life, Sacrifice this land: Search your library for a Forest or Plains card, put it onto the battlefield, then shuffle.",
    "colorIdentity": [],
    "keywords": [],
    "canBeCommander": false,
    "imageUrl": null,
    "producedMana": [],
    "layout": "normal"
  },
};
