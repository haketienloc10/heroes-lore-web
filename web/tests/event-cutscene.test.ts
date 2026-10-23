import { describe, expect, it } from 'vitest';
import {
  advanceEventCutscene,
  advanceEventCutsceneDialogue,
  canRunEventCutscene,
  createEventCutscene,
  EVENT_CUTSCENE_TICK_MS,
  selectEventCutsceneChoice,
} from '../src/world/event-cutscene';

describe('ordered event cutscenes', () => {
  it('opens the three source shop, refiner, and blacksmith states from event commands', () => {
    const requests = [
      [45, 'shop'], [48, 'refiner'], [44, 'blacksmith'],
    ] as const;
    for (const [opcode, request] of requests) {
      const commands = [[1, 0, 0], [opcode, 0, 0], [99, 0, 0]];
      expect(canRunEventCutscene(commands)).toBe(true);
      let result = advanceEventCutscene(createEventCutscene(3, 2), commands, () => ['service'] );
      expect(result.status).toBe('dialogue');
      result = advanceEventCutsceneDialogue(result);
      result = advanceEventCutscene(result, commands, () => ['service']);
      expect(result).toMatchObject({ status: 'service', serviceRequest: request });
      expect(advanceEventCutscene(result, commands, () => []).status).toBe('service');
    }
  });

  it('hands the source GAMEOVER opcode to the ending flow after applying final quest flags', () => {
    const commands = [[30, 17, 0], [20, 0, 0]];
    expect(canRunEventCutscene(commands)).toBe(true);

    const result = advanceEventCutscene(createEventCutscene(1, 2), commands, () => [], 0, true);
    expect(result.status).toBe('ending');
    expect(result.flagChanges).toEqual([
      { flagSet: 'quest', operation: 'set', flagIndex: 17 },
    ]);
    expect(advanceEventCutscene(result, commands, () => []).status).toBe('ending');
  });

  it('runs both branches of the extracted map-59 yes/no transfer script', () => {
    const commands = [
      [1, 0, 0], [2, 1, 6], [11, 19, 9], [21, 255, 0], [7, 12, 0], [8, 13, 13],
      [31, 2, 0], [99, 0, 0], [99, 0, 0],
    ];
    const inventory = [{ category: 19, itemId: 9, count: 1 }];
    expect(canRunEventCutscene(commands)).toBe(true);

    let yes = advanceEventCutscene(createEventCutscene(1, 2, inventory), commands, (id) => [`text-${id}`]);
    expect(yes.status).toBe('dialogue');
    yes = advanceEventCutsceneDialogue(yes);
    yes = advanceEventCutscene(yes, commands, (id) => [`text-${id}`]);
    expect(yes).toMatchObject({ status: 'choice', dialogueStringIndex: 1, choiceSelection: 0 });
    yes = selectEventCutsceneChoice(yes, 0);
    yes = advanceEventCutscene(yes, commands, (id) => [`text-${id}`]);
    expect(yes.status).toBe('transfer');
    expect(yes.inventory).toEqual([]);
    expect(yes.transition).toEqual({
      mapId: 12, regionId: 0, tileX: 13, tileY: 13, scriptIndex: 1,
    });

    let no = advanceEventCutscene(createEventCutscene(1, 2, inventory), commands, (id) => [`text-${id}`]);
    no = advanceEventCutsceneDialogue(no);
    no = advanceEventCutscene(no, commands, (id) => [`text-${id}`]);
    no = selectEventCutsceneChoice(no, 1);
    no = advanceEventCutscene(no, commands, (id) => [`text-${id}`]);
    expect(no.status).toBe('ended');
    expect(no.inventory).toEqual(inventory);
    expect(no.transition).toBeNull();
  });

  it('executes opcode-31 forward jumps without running skipped player changes', () => {
    const commands = [[31, 3, 0], [10, 3, 232], [13, 0, 10], [99, 0, 0]];
    expect(canRunEventCutscene(commands)).toBe(true);
    expect(canRunEventCutscene([[31, 4, 0], [99, 0, 0]])).toBe(false);

    const result = advanceEventCutscene(createEventCutscene(0, 2), commands, () => []);
    expect(result.status).toBe('ended');
    expect(result.playerChanges).toEqual([]);
  });

  it('raises the signed-byte combo limit from opcode 19 without lowering saved progress', () => {
    const commands = [[19, 3, 0], [19, 2, 0], [19, 255, 0], [99, 0, 0]];
    expect(canRunEventCutscene(commands)).toBe(true);
    expect(advanceEventCutscene(
      createEventCutscene(60, 2, [], [], 4), commands, () => [], 0, true,
    ).comboLimit).toBe(4);
    expect(advanceEventCutscene(
      createEventCutscene(60, 2), commands, () => [], 0, true,
    ).comboLimit).toBe(3);
    expect(canRunEventCutscene([[19, 256, 0], [99, 0, 0]])).toBe(false);
  });

  it('applies the quest-29 combo bonus only for the Ronin source class', () => {
    const setRoninQuest = [[30, 29, 0], [99, 0, 0]];
    expect(canRunEventCutscene(setRoninQuest)).toBe(true);
    expect(advanceEventCutscene(
      createEventCutscene(79, 2, [], [], 1, 6), setRoninQuest, () => [], 0, true,
    ).comboLimit).toBe(2);
    expect(advanceEventCutscene(
      createEventCutscene(79, 2, [], [], 1, 7), setRoninQuest, () => [], 0, true,
    ).comboLimit).toBe(1);
    expect(canRunEventCutscene([[30, 29, 2], [99, 0, 0]])).toBe(false);
  });

  it('preserves combo limits from the four extracted event streams', () => {
    const fixtures = [
      { mapId: 60, scriptIndex: 8, comboLimit: 3, runnable: true, commands: [
        [11, 18, 4], [21, 1, 0], [1, 14, 0], [1, 15, 0], [1, 16, 0], [22, 0, 0],
        [4, 10, 0], [23, 0, 0], [1, 17, 0], [19, 3, 0], [4, 5, 0], [1, 18, 0],
        [11, 18, 3], [21, 255, 0], [11, 20, 0], [21, 255, 0], [1, 19, 0], [49, 4, 0],
        [1, 20, 0], [49, 0, 0], [1, 21, 0], [9, 29, 0], [50, 2, 0], [1, 28, 0],
        [1, 37, 0], [10, 3, 232], [30, 33, 0], [99, 0, 0],
      ] },
      { mapId: 79, scriptIndex: 4, comboLimit: 2, runnable: true, commands: [
        [1, 9, 0], [11, 18, 3], [21, 1, 0], [1, 10, 0], [1, 11, 0], [1, 12, 0],
        [1, 13, 0], [1, 14, 252], [1, 15, 0], [1, 16, 0], [1, 17, 0], [9, 9, 1],
        [50, 3, 0], [9, 10, 0], [30, 29, 0], [11, 12, 0], [21, 251, 0], [1, 25, 0],
        [19, 2, 0], [99, 0, 0],
      ] },
      { mapId: 76, scriptIndex: 3, comboLimit: 4, runnable: true, commands: [
        [1, 6, 0], [11, 18, 4], [21, 255, 0], [24, 0, 0], [1, 7, 0], [19, 4, 0],
        [9, 57, 0], [99, 0, 0],
      ] },
      { mapId: 76, scriptIndex: 7, comboLimit: 5, runnable: false, commands: [
        [11, 6, 12], [21, 1, 0], [1, 12, 0], [50, 0, 0], [24, 0, 0], [1, 13, 0],
        [19, 5, 0], [1, 14, 0], [1, 16, 0], [1, 17, 0], [9, 60, 0], [30, 42, 0],
        [99, 0, 0],
      ] },
    ];
    for (const fixture of fixtures) {
      expect(
        canRunEventCutscene(fixture.commands, fixture.mapId === 60 ? 8 : fixture.mapId === 79 ? 6 : 1),
        `map ${fixture.mapId} script ${fixture.scriptIndex}`,
      ).toBe(fixture.runnable);
      if (fixture.runnable) {
        const fullState = advanceEventCutscene(
          createEventCutscene(fixture.scriptIndex, 2), fixture.commands, () => [], 0, true,
        );
        expect(fullState.status).toBe('ended');
        expect(fullState.comboLimit).toBe(fixture.comboLimit);
      }
      const comboCommandIndex = fixture.commands.findIndex(([opcode]) => opcode === 19);
      expect(comboCommandIndex).toBeGreaterThanOrEqual(0);
      const comboSuffix = fixture.commands.slice(comboCommandIndex);
      expect(canRunEventCutscene(comboSuffix)).toBe(true);
      const state = advanceEventCutscene(
        createEventCutscene(fixture.scriptIndex, 2), comboSuffix, () => [], 0, true,
      );
      expect(state.status).toBe('ended');
      expect(state.comboLimit).toBe(fixture.comboLimit);
    }
  });

  it('maps player stat and flag opcodes to their source state changes in command order', () => {
    const commands = [
      [10, 3, 232], [9, 4, 0], [12, 0, 5], [13, 0, 10], [14, 0, 20], [30, 5, 0], [99, 0, 0],
    ];
    expect(canRunEventCutscene(commands)).toBe(true);

    const result = advanceEventCutscene(createEventCutscene(0, 2), commands, () => [], 0, true);
    expect(result.playerChanges).toEqual([
      { kind: 'wallet', amount: 1000 },
      { kind: 'experience', amount: 5 },
      { kind: 'hp', amount: 10 },
      { kind: 'sp', amount: 20 },
    ]);
    expect(result.experienceAwards).toEqual([5]);
    expect(result.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 4 },
      { flagSet: 'quest', operation: 'set', flagIndex: 5 },
    ]);
  });

  it('applies NPC image changes only to valid placements', () => {
    const commands = [[41, 1, 44], [99, 0, 0]];
    expect(canRunEventCutscene(commands, 2)).toBe(true);
    expect(canRunEventCutscene(commands, 1)).toBe(false);

    const result = advanceEventCutscene(createEventCutscene(0, 2), commands, () => []);
    expect(result.status).toBe('ended');
    expect(result.npcImages).toEqual({ 1: 44 });
  });

  it('routes complete rendered command streams and rejects streams with unimplemented opcodes', () => {
    expect(canRunEventCutscene([
      [15, 1, 4], [4, 2, 0], [16, 1, 0], [17, 1, 2], [1, 3, 0], [99, 0, 0],
    ])).toBe(true);
    expect(canRunEventCutscene([[46, 1, 0], [99, 0, 0]])).toBe(true);
    expect(canRunEventCutscene([[49, 13, 0], [99, 0, 0]])).toBe(false);
    expect(canRunEventCutscene([[50, 0, 13], [99, 0, 0]])).toBe(false);
    expect(canRunEventCutscene([[50, 1, 4], [99, 0, 0]], 1)).toBe(false);
    expect(canRunEventCutscene([[35, 0, 0], [37, 2, 4], [38, 0, 0], [99, 0, 0]])).toBe(true);
    expect(canRunEventCutscene([[36, 1, 0], [99, 0, 0]])).toBe(true);
    expect(canRunEventCutscene([[39, 12, 13], [99, 0, 0]])).toBe(true);
    expect(canRunEventCutscene([[39, 256, 13], [99, 0, 0]])).toBe(false);
    expect(canRunEventCutscene([[37, 9, 4], [99, 0, 0]])).toBe(false);
    expect(canRunEventCutscene([[47, 1, 0], [99, 0, 0]])).toBe(false);
    expect(canRunEventCutscene([[15, 1, 0], [99, 0, 0]])).toBe(false);
    expect(canRunEventCutscene([])).toBe(false);
  });

  it('hides the selected NPC while keeping visibility restoration unsupported', () => {
    const commands = [[46, 2, 0], [99, 0, 0]];
    const result = advanceEventCutscene(createEventCutscene(0, 2), commands, () => []);

    expect(result.status).toBe('ended');
    expect(result.npcVisibility).toEqual({ 2: false });
  });

  it('runs the extracted map-12 prerequisite script with source emotion and hide commands', () => {
    const commands = [
      [11, 21, 3], [21, 255, 0], [1, 0, 251], [17, 0, 4], [17, 1, 3], [49, 6, 0],
      [1, 1, 247], [3, 1, 0], [4, 10, 0], [5, 0, 0], [17, 0, 2], [17, 1, 2], [50, 0, 6],
      [1, 2, 248], [50, 0, 0], [1, 3, 252], [1, 4, 247], [1, 5, 252], [1, 6, 248],
      [1, 7, 253], [1, 8, 247], [49, 6, 0], [1, 9, 253], [49, 0, 0], [1, 10, 252],
      [1, 11, 248], [24, 0, 0], [46, 0, 0], [24, 0, 0], [6, 2, 0], [17, 1, 2],
      [1, 12, 0], [1, 13, 253], [1, 14, 0], [1, 15, 247], [9, 48, 0], [7, 13, 0],
      [8, 10, 10], [99, 0, 0],
    ];
    expect(canRunEventCutscene(commands, 2)).toBe(true);
    expect(canRunEventCutscene(commands, 1)).toBe(false);

    const result = advanceEventCutscene(
      createEventCutscene(0, 2, [{ category: 21, itemId: 3, count: 1 }]),
      commands,
      () => ['line'],
      0,
      true,
    );
    expect(result.status).toBe('transfer');
    expect(result.inventory).toEqual([]);
    expect(result.npcVisibility).toEqual({ 0: false });
    expect(result.heroEmotionChanged).toBe(true);
    expect(result.heroEmotion).toBeNull();
    expect(result.npcEmotions[0]).toBeNull();
    expect(result.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 48 },
    ]);
    expect(result.transition).toEqual({
      mapId: 13, regionId: 0, tileX: 10, tileY: 10, scriptIndex: 0,
    });
  });

  it('runs map-12 script 1 with its source experience reward and Guardian skill grant', () => {
    const commands = [
      [17, 1, 3], [6, 4, 0], [1, 16, 252], [1, 17, 247], [1, 18, 255], [1, 19, 247],
      [1, 20, 255], [1, 21, 247], [3, 4, 0], [4, 2, 0], [5, 0, 0], [1, 22, 252],
      [15, 1, 2], [4, 2, 0], [16, 1, 0], [1, 23, 247], [6, 2, 0], [1, 24, 252],
      [1, 25, 247], [1, 26, 247], [1, 27, 247], [1, 28, 252], [15, 1, 2], [4, 6, 0],
      [16, 1, 0], [1, 29, 247], [1, 30, 0], [12, 19, 136], [1, 32, 0], [18, 0, 0],
      [1, 31, 0], [7, 62, 1], [8, 16, 2], [99, 0, 0],
    ];
    expect(canRunEventCutscene(commands, 2)).toBe(true);
    expect(canRunEventCutscene([[18, 3, 0], [99, 0, 0]])).toBe(false);

    const result = advanceEventCutscene(
      createEventCutscene(1, 2, [], [0, 1]), commands, () => ['line'], 0, true,
    );
    expect(result.status).toBe('transfer');
    expect(result.experienceAwards).toEqual([5000]);
    expect(result.skillIds).toEqual([0, 1, 4]);
    expect(result.transition).toEqual({
      mapId: 62, regionId: 1, tileX: 16, tileY: 2, scriptIndex: 1,
    });
  });

  it('validates paired item quantity commands and applies successful source inventory changes', () => {
    const commands = [[11, 21, 3], [21, 255, 0], [9, 48, 0], [99, 0, 0]];
    expect(canRunEventCutscene(commands)).toBe(true);
    expect(canRunEventCutscene([[11, 21, 3], [99, 0, 0]])).toBe(false);
    expect(canRunEventCutscene([[11, 4, 2], [21, 1, 0], [99, 0, 0]])).toBe(false);
    expect(canRunEventCutscene([[21, 1, 0], [99, 0, 0]])).toBe(false);

    const result = advanceEventCutscene(
      createEventCutscene(0, 2, [{ category: 21, itemId: 3, count: 2 }]),
      commands,
      () => [],
      0,
      false,
      () => [],
    );
    expect(result.status).toBe('ended');
    expect(result.inventory).toEqual([{ category: 21, itemId: 3, count: 1 }]);
    expect(result.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 48 },
    ]);
  });

  it('shows source-localized item failure messages and ends the event after confirmation', () => {
    const commands = [[11, 21, 3], [21, 255, 0], [9, 48, 0], [99, 0, 0]];
    const state = advanceEventCutscene(
      createEventCutscene(0, 2),
      commands,
      () => [],
      0,
      false,
      (languageStringId) => [languageStringId === 2367 ? 'No item.' : 'Inventory is full.'],
    );
    expect(state.status).toBe('dialogue');
    expect(state.dialogueStringIndex).toBe(2367);
    expect(state.dialoguePages).toEqual(['No item.']);
    expect(state.dialogueEndsCutscene).toBe(true);
    expect(state.flagChanges).toEqual([]);

    const ended = advanceEventCutsceneDialogue(state);
    expect(ended.status).toBe('ended');
    expect(ended.flagChanges).toEqual([]);
  });

  it('renders five alternating source flash frames at the world tick and resumes the script', () => {
    const commands = [[24, 0, 0], [9, 48, 0], [99, 0, 0]];
    expect(canRunEventCutscene(commands)).toBe(true);
    let state = advanceEventCutscene(createEventCutscene(0, 2), commands, () => []);
    expect(state).toMatchObject({
      status: 'flash',
      screenFlashColor: 'white',
      screenFlashStepsRemaining: 5,
      delayRemainingMs: EVENT_CUTSCENE_TICK_MS,
    });

    const colors: Array<'black' | 'white' | null> = [];
    for (let step = 0; step < 5; step += 1) {
      state = advanceEventCutscene(state, commands, () => [], EVENT_CUTSCENE_TICK_MS);
      colors.push(state.screenFlashColor);
    }
    expect(colors).toEqual(['black', 'white', 'black', 'white', null]);
    expect(state.status).toBe('ended');
    expect(state.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 48 },
    ]);
  });

  it('runs source screen shake values and paired tile/collision writes in event order', () => {
    const commands = [
      [25, 0, 0], [42, 1, 0], [43, 4, 6], [9, 34, 0], [99, 0, 0],
    ];
    const randomValues = [1, -1, 2, -2, 3, -3];
    let randomIndex = 0;
    const randomInteger = (minimum: number, maximum: number): number => {
      expect(minimum).toBe(-5);
      expect(maximum).toBe(5);
      return randomValues[randomIndex++];
    };

    expect(canRunEventCutscene(commands, undefined, { width: 2, height: 1 })).toBe(true);
    expect(canRunEventCutscene([[42, 1, 0], [99, 0, 0]], undefined, {
      width: 2,
      height: 1,
    })).toBe(false);
    expect(canRunEventCutscene([[42, 2, 0], [43, 4, 6], [99, 0, 0]], undefined, {
      width: 2,
      height: 1,
    })).toBe(false);

    let state = advanceEventCutscene(
      createEventCutscene(0, 2), commands, () => [], 0, false, undefined, randomInteger,
    );
    expect(state).toMatchObject({ status: 'shake', screenShakeX: 1, screenShakeY: -1 });
    for (let tick = 0; tick < 3; tick += 1) {
      state = advanceEventCutscene(
        state, commands, () => [], EVENT_CUTSCENE_TICK_MS, false, undefined, randomInteger,
      );
    }
    expect(state.status).toBe('ended');
    expect(state.tileChanges).toEqual([{
      tileX: 1,
      tileY: 0,
      tileId: 6,
      collisionValue: 4,
    }]);
    expect(state.screenShakeValues).toEqual([]);
    expect(state.screenShakeX).toBe(0);
    expect(state.screenShakeY).toBe(0);
    expect(state.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 34 },
    ]);
    expect(randomIndex).toBe(6);
  });

  it('runs the extracted map-53 quest script with its screen and map changes', () => {
    const commands = [
      [1, 5, 0], [24, 0, 0], [9, 34, 0], [11, 21, 2], [21, 255, 0],
      [35, 0, 0], [37, 4, 36], [4, 8, 0], [38, 0, 0], [4, 5, 0], [25, 0, 0],
      [42, 33, 12], [43, 4, 0], [42, 33, 11], [43, 4, 0], [42, 33, 10], [43, 4, 0],
      [42, 33, 9], [43, 4, 0], [4, 6, 0], [35, 0, 0], [37, 2, 36], [4, 8, 0],
      [38, 0, 0], [4, 5, 0], [25, 0, 0], [42, 34, 24], [43, 4, 0], [42, 34, 25],
      [43, 4, 0], [42, 34, 26], [43, 4, 0], [42, 34, 27], [43, 4, 0], [4, 6, 0],
      [34, 0, 0], [99, 0, 0],
    ];
    expect(canRunEventCutscene(commands, undefined, { width: 40, height: 40 })).toBe(true);

    const result = advanceEventCutscene(
      createEventCutscene(7, 2, [{ category: 21, itemId: 2, count: 3 }]),
      commands,
      () => [],
      0,
      true,
    );
    expect(result.status).toBe('ended');
    expect(result.transition).toBeNull();
    expect(result.inventory).toEqual([{ category: 21, itemId: 2, count: 2 }]);
    expect(result.tileChanges).toHaveLength(8);
    expect(result.tileChanges[0]).toEqual({ tileX: 33, tileY: 12, tileId: 0, collisionValue: 4 });
    expect(result.tileChanges[7]).toEqual({ tileX: 34, tileY: 27, tileId: 0, collisionValue: 4 });
    expect(result.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 34 },
    ]);

    const handoff = advanceEventCutscene(
      createEventCutscene(10, 2),
      [[7, 54, 0], [8, 17, 14], [99, 0, 0]],
      () => [],
    );
    expect(handoff.status).toBe('transfer');
    expect(handoff.transition).toMatchObject({ mapId: 54, regionId: 0, tileX: 17, tileY: 14 });
  });

  it('moves the fixed camera by source direction and speed for each event tick', () => {
    const commands = [[35, 0, 0], [37, 2, 4], [4, 17, 0], [38, 0, 0], [99, 0, 0]];
    expect(canRunEventCutscene(commands)).toBe(true);
    let state = advanceEventCutscene(createEventCutscene(5, 2), commands, () => []);
    expect(state).toMatchObject({
      status: 'delay',
      cameraMode: 'fixed',
      cameraMoveDirection: 2,
      cameraMoveSpeed: 4,
      cameraPanX: 0,
      cameraPanY: 0,
      delayRemainingMs: 16 * EVENT_CUTSCENE_TICK_MS,
    });

    state = advanceEventCutscene(state, commands, () => [], 7 * EVENT_CUTSCENE_TICK_MS);
    expect(state).toMatchObject({
      status: 'delay',
      cameraMoveSpeed: 4,
      cameraPanX: 0,
      cameraPanY: 28,
      delayRemainingMs: 9 * EVENT_CUTSCENE_TICK_MS,
    });

    state = advanceEventCutscene(state, commands, () => [], 9 * EVENT_CUTSCENE_TICK_MS);
    expect(state).toMatchObject({
      status: 'ended',
      cameraMode: 'hero',
      cameraMoveSpeed: 0,
      cameraPanY: 64,
    });
  });

  it('holds the camera when source opcode 36 selects an NPC target', () => {
    const commands = [[36, 2, 0], [1, 0, 0], [99, 0, 0]];
    expect(canRunEventCutscene(commands, 3)).toBe(true);
    const result = advanceEventCutscene(
      createEventCutscene(5, 2), commands, () => ['pause'],
    );
    expect(result).toMatchObject({
      status: 'dialogue',
      cameraMode: 'fixed',
      cameraMoveDirection: 0,
      cameraMoveSpeed: 0,
      cameraFollowNpcIndex: 2,
      cameraPositionTile: null,
    });
  });

  it('sets an absolute camera tile with source signed-byte coordinates', () => {
    const commands = [[39, 12, 13], [1, 0, 0], [99, 0, 0]];
    const result = advanceEventCutscene(
      createEventCutscene(5, 2), commands, () => ['pause'],
    );
    expect(result).toMatchObject({
      status: 'dialogue',
      cameraMode: 'fixed',
      cameraPositionTile: { x: 12, y: 13 },
      cameraPanX: 0,
      cameraPanY: 0,
    });

    const signed = advanceEventCutscene(
      createEventCutscene(5, 2), [[39, 255, 128], [1, 0, 0], [99, 0, 0]], () => ['pause'],
    );
    expect(signed.cameraPositionTile).toEqual({ x: -1, y: -128 });
  });

  it('accepts map-62 movement and supports the class-specific quest-29 combo side effect', () => {
    const sourceShape = [
      [1, 12, 0], [15, 0, 2], [4, 4, 0], [16, 0, 0], [6, 1, 0],
      [30, 11, 0], [30, 13, 0], [7, 1, 3], [8, 2, 17],
    ];
    expect(canRunEventCutscene(sourceShape)).toBe(true);
    expect(canRunEventCutscene([[30, 29, 0], [99, 0, 0]])).toBe(true);

    const result = advanceEventCutscene(
      createEventCutscene(7, 2), sourceShape, () => ['dialogue'], 0, true,
    );
    expect(result.status).toBe('transfer');
    expect(result.flagChanges).toEqual([
      { flagSet: 'quest', operation: 'set', flagIndex: 11 },
      { flagSet: 'quest', operation: 'set', flagIndex: 13 },
    ]);
    expect(result.transition).toEqual({
      mapId: 1, regionId: 3, tileX: 2, tileY: 17, scriptIndex: 7,
    });

    const extractedMap62Script = [
      [1, 12, 0], [15, 0, 2], [4, 4, 0], [16, 0, 0], [1, 13, 0], [1, 14, 0],
      [1, 15, 0], [6, 1, 0], [1, 16, 0], [1, 17, 0], [1, 18, 0], [1, 19, 0],
      [1, 20, 0], [1, 21, 0], [1, 22, 0], [1, 23, 0], [1, 24, 0], [1, 25, 0],
      [1, 26, 0], [1, 27, 0], [1, 28, 0], [1, 29, 0], [1, 30, 0], [1, 31, 0],
      [6, 2, 0], [1, 32, 0], [1, 33, 0], [1, 34, 0], [1, 35, 0], [1, 36, 0],
      [1, 37, 0], [30, 11, 0], [30, 13, 0], [7, 1, 3], [8, 2, 17], [99, 0, 0],
    ];
    expect(canRunEventCutscene(extractedMap62Script)).toBe(true);
    const extractedResult = advanceEventCutscene(
      createEventCutscene(7, 2), extractedMap62Script, () => ['line'], 0, true,
    );
    expect(extractedResult.status).toBe('transfer');
    expect(extractedResult.npcDirections[0]).toBe(2);
    expect(extractedResult.npcMoving[0]).toBe(false);
    expect(extractedResult.flagChanges).toEqual([
      { flagSet: 'quest', operation: 'set', flagIndex: 11 },
      { flagSet: 'quest', operation: 'set', flagIndex: 13 },
    ]);
    expect(extractedResult.transition).toEqual({
      mapId: 1, regionId: 3, tileX: 2, tileY: 17, scriptIndex: 7,
    });
  });

  it('runs the extracted map-62 script-5 camera sequence and sets its source flag', () => {
    const commands = [
      [3, 2, 0], [4, 4, 0], [5, 0, 0], [1, 1, 0], [1, 2, 0], [49, 6, 0],
      [35, 0, 0], [37, 2, 4], [4, 16, 0], [38, 0, 0], [38, 0, 0], [4, 6, 0],
      [35, 0, 0], [37, 1, 16], [4, 4, 0], [38, 0, 0], [49, 0, 0], [1, 3, 0],
      [1, 4, 0], [1, 5, 0], [1, 6, 0], [1, 7, 0], [9, 49, 0], [30, 36, 1],
      [30, 36, 0], [99, 0, 0],
    ];
    expect(canRunEventCutscene(commands)).toBe(true);

    const result = advanceEventCutscene(
      createEventCutscene(5, 2), commands, () => ['line'], 0, true,
    );
    expect(result.status).toBe('ended');
    expect(result.cameraMode).toBe('hero');
    expect(result.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 49 },
      { flagSet: 'quest', operation: 'clear', flagIndex: 36 },
      { flagSet: 'quest', operation: 'set', flagIndex: 36 },
    ]);
  });

  it('applies commands around dialogue and waits before the map transfer', () => {
    const commands = [
      [17, 1, 4],
      [6, 3, 0],
      [9, 54, 0],
      [1, 0, 0],
      [4, 3, 0],
      [22, 0, 0],
      [49, 1, 0],
      [50, 1, 5],
      [7, 64, 1],
      [8, 9, 8],
      [99, 0, 0],
    ];
    const dialogue = (index: number) => index === 0 ? ['opening page one', 'opening page two'] : [];
    let state = advanceEventCutscene(createEventCutscene(9, 2), commands, dialogue);

    expect(state.status).toBe('dialogue');
    expect(state.dialogueStringIndex).toBe(0);
    expect(state.npcDirections[1]).toBe(4);
    expect(state.heroDirection).toBe(3);
    expect(state.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 54 },
    ]);

    state = advanceEventCutsceneDialogue(state);
    expect(state.dialoguePages[state.dialoguePageIndex]).toBe('opening page two');
    state = advanceEventCutsceneDialogue(state);
    state = advanceEventCutscene(state, commands, dialogue);
    expect(state.status).toBe('delay');
    expect(state.delayRemainingMs).toBe(2 * EVENT_CUTSCENE_TICK_MS);

    state = advanceEventCutscene(state, commands, dialogue, EVENT_CUTSCENE_TICK_MS);
    expect(state.status).toBe('delay');
    state = advanceEventCutscene(state, commands, dialogue, EVENT_CUTSCENE_TICK_MS);
    expect(state.status).toBe('transfer');
    expect(state.screenBlank).toBe(true);
    expect(state.heroEmotion).toBe(0);
    expect(state.npcEmotions[1]).toBe(4);
    expect(state.transition).toEqual({
      mapId: 64,
      regionId: 1,
      tileX: 9,
      tileY: 8,
      scriptIndex: 9,
    });
  });

  it('fast-forwards text and delays while still applying ordered flags and presentation state', () => {
    const commands = [
      [1, 0, 0],
      [9, 87, 0],
      [4, 20, 0],
      [22, 0, 0],
      [7, 64, 1],
      [8, 9, 8],
    ];
    const state = advanceEventCutscene(
      createEventCutscene(9, 2),
      commands,
      () => ['opening text'],
      0,
      true,
    );
    expect(state.status).toBe('transfer');
    expect(state.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 87 },
    ]);
    expect(state.screenBlank).toBe(true);
  });

  it('completes the extracted opening script 9 command stream', () => {
    const commands = [
      [17, 1, 4], [6, 3, 0], [9, 54, 0], [9, 87, 0],
      [1, 4, 0], [1, 5, 0], [1, 6, 0], [1, 7, 0], [6, 3, 0],
      [1, 8, 0], [1, 9, 0], [6, 4, 0], [1, 10, 0], [50, 1, 5],
      [1, 11, 0], [50, 1, 0], [1, 12, 0], [50, 1, 4], [1, 13, 0],
      [6, 3, 0], [1, 14, 0], [1, 15, 0], [49, 1, 0], [1, 16, 0],
      [1, 17, 0], [6, 4, 0], [1, 18, 0], [50, 1, 0], [1, 19, 0],
      [49, 0, 0], [6, 3, 0], [1, 20, 0], [1, 21, 0], [1, 22, 0],
      [1, 23, 0], [1, 24, 0], [1, 25, 0], [1, 26, 0], [4, 5, 0],
      [22, 0, 0], [4, 7, 0], [1, 27, 0], [7, 64, 1], [8, 9, 8], [99, 0, 0],
    ];
    const resolved: number[] = [];
    const resolve = (index: number) => {
      resolved.push(index);
      return [`opening text ${index}`];
    };
    let state = advanceEventCutscene(createEventCutscene(9, 2), commands, resolve);

    while (state.status !== 'transfer') {
      if (state.status === 'dialogue') {
        while (state.dialoguePageIndex + 1 < state.dialoguePages.length) {
          state = advanceEventCutsceneDialogue(state);
        }
        state = advanceEventCutsceneDialogue(state);
        state = advanceEventCutscene(state, commands, resolve);
      } else if (state.status === 'delay') {
        state = advanceEventCutscene(state, commands, resolve, state.delayRemainingMs);
      } else {
        state = advanceEventCutscene(state, commands, resolve);
      }
      expect(state.status).not.toBe('unsupported');
      expect(state.status).not.toBe('ended');
    }

    expect(resolved).toEqual(Array.from({ length: 24 }, (_, index) => index + 4));
    expect(state.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 54 },
      { flagSet: 'game', operation: 'set', flagIndex: 87 },
    ]);
    expect(state.heroDirection).toBe(3);
    expect(state.npcDirections[1]).toBe(4);
    expect(state.heroEmotion).toBeNull();
    expect(state.npcEmotions[1]).toBeNull();
    expect(state.screenBlank).toBe(true);
    expect(state.transition).toEqual({
      mapId: 64,
      regionId: 1,
      tileX: 9,
      tileY: 8,
      scriptIndex: 9,
    });
  });

  it('stops safely when a map transfer has no following hero-position command', () => {
    const state = advanceEventCutscene(
      createEventCutscene(9, 2),
      [[7, 64, 1]],
      () => [],
    );
    expect(state.status).toBe('unsupported');
    expect(state.unsupportedOpcode).toBe(7);
  });
});
