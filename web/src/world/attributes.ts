import type { EndingHeroClassId } from './ending';

export const PLAYER_ATTRIBUTE_KEYS = ['power', 'hp', 'agility', 'will'] as const;
export type PlayerAttributeKey = typeof PLAYER_ATTRIBUTE_KEYS[number];

/** Source `an` base attributes, in the order shown by the status allocation tab. */
export interface PlayerAttributes {
  power: number;
  hp: number;
  agility: number;
  will: number;
}

export interface AttributeDraft {
  /** Changes staged in the source allocation screen; committed attributes cannot be reduced. */
  increments: PlayerAttributes;
  remainingPoints: number;
}

const CLASS_BASE_ATTRIBUTES: Record<EndingHeroClassId, PlayerAttributes> = {
  6: { power: 8, hp: 5, agility: 3, will: 4 },
  7: { power: 3, hp: 4, agility: 8, will: 5 },
  8: { power: 5, hp: 8, agility: 4, will: 3 },
};

export function createBasePlayerAttributes(heroClassId: EndingHeroClassId): PlayerAttributes {
  return { ...CLASS_BASE_ATTRIBUTES[heroClassId] };
}

/** Older browser saves did not store the four source attributes. */
export function parsePlayerAttributes(value: unknown, heroClassId: EndingHeroClassId): PlayerAttributes | null {
  if (value === undefined) return createBasePlayerAttributes(heroClassId);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const entries = PLAYER_ATTRIBUTE_KEYS.map((key) => source[key]);
  if (!entries.every((entry) => Number.isSafeInteger(entry) && Number(entry) >= 0 && Number(entry) <= 32767)) {
    return null;
  }
  return {
    power: Number(source.power),
    hp: Number(source.hp),
    agility: Number(source.agility),
    will: Number(source.will),
  };
}

export function createAttributeDraft(remainingPoints: number): AttributeDraft {
  return {
    increments: { power: 0, hp: 0, agility: 0, will: 0 },
    remainingPoints,
  };
}

/** Stage one point in the source screen. Left can undo only this screen's pending edits. */
export function adjustAttributeDraft(
  draft: AttributeDraft,
  attribute: PlayerAttributeKey,
  direction: -1 | 1,
): AttributeDraft {
  if (direction === 1) {
    if (draft.remainingPoints === 0 || draft.increments[attribute] >= 32767) return draft;
    return {
      increments: { ...draft.increments, [attribute]: draft.increments[attribute] + 1 },
      remainingPoints: draft.remainingPoints - 1,
    };
  }
  if (draft.increments[attribute] === 0) return draft;
  return {
    increments: { ...draft.increments, [attribute]: draft.increments[attribute] - 1 },
    remainingPoints: draft.remainingPoints + 1,
  };
}

export function applyAttributeDraft(
  current: PlayerAttributes,
  draft: AttributeDraft,
): PlayerAttributes {
  return {
    power: current.power + draft.increments.power,
    hp: current.hp + draft.increments.hp,
    agility: current.agility + draft.increments.agility,
    will: current.will + draft.increments.will,
  };
}

export function hasAttributeDraftChanges(draft: AttributeDraft): boolean {
  return PLAYER_ATTRIBUTE_KEYS.some((key) => draft.increments[key] !== 0);
}
