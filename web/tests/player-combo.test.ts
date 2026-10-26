import { describe, expect, it } from 'vitest';
import {
  advancePlayerCombo,
  cancelPlayerComboFollowUp,
  EMPTY_PLAYER_COMBO,
  playerAttackAnimationSlot,
  playerAttackPower,
  playerAttackSpCost,
  playerSpriteAnimationSlot,
  playerSpritePose,
  queuePlayerAttack,
} from '../src/world/player-combo';

describe('source-shaped player attack chains', () => {
  it('starts a light strike and emits its class-specific impact frame', () => {
    const queued = queuePlayerAttack(EMPTY_PLAYER_COMBO, 'light', 1);
    expect(queued.accepted).toBe(true);
    const first = advancePlayerCombo(queued.state, 71, 6, 1);
    expect(first.state).toMatchObject({ stage: 0, frame: 1, activeStyle: 'light' });
    expect(first.impacts).toEqual([]);

    const second = advancePlayerCombo(first.state, 71, 6, 1);
    expect(second.state.frame).toBe(2);
    expect(second.impacts).toEqual([{ stage: 0, style: 'light', frame: 2 }]);
  });

  it('queues only source-permitted follow-up styles', () => {
    const opening = queuePlayerAttack(EMPTY_PLAYER_COMBO, 'light', 3).state;
    const stageZero = advancePlayerCombo(opening, 71, 6, 3).state;
    expect(queuePlayerAttack(stageZero, 'heavy', 3).accepted).toBe(false);
    expect(queuePlayerAttack(stageZero, 'light', 3).accepted).toBe(true);

    const heavyOpening = queuePlayerAttack(EMPTY_PLAYER_COMBO, 'heavy', 3).state;
    const heavyStage = advancePlayerCombo(heavyOpening, 71, 6, 3).state;
    expect(queuePlayerAttack(heavyStage, 'light', 3).accepted).toBe(false);
  });

  it('advances to a queued stage at the source frame threshold', () => {
    let state = queuePlayerAttack(EMPTY_PLAYER_COMBO, 'light', 3).state;
    state = advancePlayerCombo(state, 71, 6, 3).state;
    state = queuePlayerAttack(state, 'light', 3).state;
    const transition = advancePlayerCombo(state, 3 * 71, 6, 3);
    expect(transition.state).toMatchObject({ stage: 1, frame: 0, activeStyle: 'light' });
    expect(transition.impacts).toEqual([{ stage: 0, style: 'light', frame: 2 }]);
    expect(transition.followUps).toEqual([{
      previousStage: 0,
      previousStyle: 'light',
      stage: 1,
      style: 'light',
    }]);
  });

  it('uses class-specific heavy impact frames and attack animation slots', () => {
    let state = queuePlayerAttack(EMPTY_PLAYER_COMBO, 'heavy', 1).state;
    const classSeven = advancePlayerCombo(state, 71, 7, 1);
    expect(classSeven.impacts).toEqual([{ stage: 0, style: 'heavy', frame: 1 }]);
    expect(playerAttackAnimationSlot(classSeven.state)).toBe(7);

    state = { ...classSeven.state, stage: 2, activeStyle: 'heavy', queuedStyle: null, frame: 4 };
    expect(playerAttackAnimationSlot(state)).toBe(8);
  });

  it('uses the source idle and walking slots outside active attacks', () => {
    expect(playerSpriteAnimationSlot(EMPTY_PLAYER_COMBO, false)).toBe(0);
    expect(playerSpriteAnimationSlot(EMPTY_PLAYER_COMBO, true)).toBe(1);
  });

  it('keeps the active source attack slot while the combo is running', () => {
    const queued = queuePlayerAttack(EMPTY_PLAYER_COMBO, 'heavy', 1).state;
    const attack = advancePlayerCombo(queued, 71, 6, 1).state;
    expect(playerSpriteAnimationSlot(attack, false)).toBe(7);
  });

  it('uses the fixed source state-6 death pose regardless of facing or active combo', () => {
    const activeAttack = {
      ...EMPTY_PLAYER_COMBO,
      stage: 2,
      frame: 5,
      activeStyle: 'heavy' as const,
    };
    expect(playerSpritePose(activeAttack, 4, true, 3, true)).toEqual({
      animationSlot: 2,
      directionSlot: 0,
      frameIndex: 0,
    });
  });

  it('keeps source facing and movement frames for living player states', () => {
    expect(playerSpritePose(EMPTY_PLAYER_COMBO, 3, true, 2, false)).toEqual({
      animationSlot: 1,
      directionSlot: 2,
      frameIndex: 2,
    });
    expect(playerSpritePose(EMPTY_PLAYER_COMBO, 4, false, 3, false)).toEqual({
      animationSlot: 0,
      directionSlot: 3,
      frameIndex: 0,
    });
  });

  it('applies the source light-stage and heavy-stage power factors', () => {
    expect(playerAttackPower(20, { stage: 0, style: 'light', frame: 2 })).toBe(20);
    expect(playerAttackPower(20, { stage: 3, style: 'light', frame: 2 })).toBe(28);
    expect(playerAttackPower(20, { stage: 1, style: 'heavy', frame: 1 })).toBe(34);
  });

  it('charges the source weapon-based follow-up SP cost', () => {
    expect(playerAttackSpCost(10, 'light')).toBe(6);
    expect(playerAttackSpCost(10, 'heavy')).toBe(8);
  });

  it('ends an unaffordable follow-up at the preceding stage recovery', () => {
    let state = queuePlayerAttack(EMPTY_PLAYER_COMBO, 'light', 2).state;
    state = advancePlayerCombo(state, 71, 6, 2).state;
    state = queuePlayerAttack(state, 'light', 2).state;
    const transition = advancePlayerCombo(state, 3 * 71, 6, 2);
    const cancelled = cancelPlayerComboFollowUp(transition.state, 0, 'light');
    expect(cancelled).toMatchObject({ stage: 0, activeStyle: null, queuedStyle: null, recoveryTicks: 1 });
  });

  it('retains sub-tick time and rejects invalid elapsed values', () => {
    const start = queuePlayerAttack(EMPTY_PLAYER_COMBO, 'light', 1).state;
    const half = advancePlayerCombo(start, 35, 8, 1);
    expect(half.state.tickRemainderMs).toBe(35);
    expect(half.impacts).toEqual([]);
    expect(() => advancePlayerCombo(start, -1, 8, 1)).toThrow(RangeError);
  });
});
