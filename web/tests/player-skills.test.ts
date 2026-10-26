import { describe, expect, it } from 'vitest';
import { createPlayerSkillActionState } from '../src/world/player-skill-action';
import {
  getPlayerSkillActionState,
  playerSkillDescriptionStringId,
  playerSkillNameStringId,
  selectActivePlayerSkill,
  sourcePlayerSkillElement,
} from '../src/world/player-skills';

describe('learned player skills', () => {
  it('selects a learned skill by its stable source slot without reordering the list', () => {
    const learnedSkills = [0, 2, 4];
    expect(selectActivePlayerSkill(learnedSkills, 2)).toBe(4);
    expect(learnedSkills).toEqual([0, 2, 4]);
    expect(selectActivePlayerSkill(learnedSkills, 0)).toBe(0);
  });

  it('rejects a missing skill slot', () => {
    expect(selectActivePlayerSkill([0, 2], -1)).toBeNull();
    expect(selectActivePlayerSkill([0, 2], 2)).toBeNull();
  });

  it('maps skill IDs through the extracted localized name and description table', () => {
    expect(playerSkillNameStringId(4)).toBe(748);
    expect(playerSkillDescriptionStringId(4)).toBe(749);
  });

  it('uses the active skill element for source player attacks', () => {
    expect([0, 1, 2, 3, 4, 5].map(sourcePlayerSkillElement)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(sourcePlayerSkillElement(null)).toBe(0);
  });

  it('restores each learned skill state while preserving the shared action sequence', () => {
    const skillFour = {
      ...createPlayerSkillActionState(4),
      skillRank: 21,
      skillExperience: 123,
      chargeTicksRemaining: [37, 270, 270] as [number, number, number],
    };
    const saved = new Map([[4, skillFour]]);

    expect(getPlayerSkillActionState(4, 6, 9, saved)).toMatchObject({
      skillId: 4,
      skillPowerStat: 6,
      skillRank: 21,
      skillExperience: 123,
      chargeTicksRemaining: [37, 270, 270],
      nextActionId: 9,
    });
    expect(getPlayerSkillActionState(0, 6, 9, saved).chargeTicksRemaining).toEqual([56, 280, 280]);
  });
});
