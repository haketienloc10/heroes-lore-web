import {
  createPlayerSkillActionState,
  type PlayerSkillActionState,
} from './player-skill-action';
import type { ElementCode } from './combat';

const SOURCE_SKILL_ELEMENTS: readonly ElementCode[] = [1, 2, 3, 1, 2, 3];

/** Port `o.m112a()`: active skills 0/3, 1/4, and 2/5 map to elements 1, 2, and 3. */
export function sourcePlayerSkillElement(skillId: number | null): ElementCode {
  return Number.isInteger(skillId) && skillId !== null && skillId >= 0 && skillId < SOURCE_SKILL_ELEMENTS.length
    ? SOURCE_SKILL_ELEMENTS[skillId]
    : 0;
}

/** Select a learned skill by its stable source slot without reordering the learned list. */
export function selectActivePlayerSkill(skillIds: readonly number[], selectedIndex: number): number | null {
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= skillIds.length) return null;
  return skillIds[selectedIndex] ?? null;
}

/** Resume that skill's own charges while keeping a scene-wide action identifier. */
export function getPlayerSkillActionState(
  skillId: number,
  skillPowerStat: number,
  nextActionId: number,
  savedActions: ReadonlyMap<number, PlayerSkillActionState>,
): PlayerSkillActionState {
  const saved = savedActions.get(skillId) ?? createPlayerSkillActionState(skillId, skillPowerStat);
  return { ...saved, skillPowerStat, nextActionId };
}

/** `grdsk.tdf` stores six strings per skill: name, description, then four ranks. */
export function playerSkillNameStringId(skillId: number): number {
  return 724 + skillId * 6;
}

export function playerSkillDescriptionStringId(skillId: number): number {
  return playerSkillNameStringId(skillId) + 1;
}
