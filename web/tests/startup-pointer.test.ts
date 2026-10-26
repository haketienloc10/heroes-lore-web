import { describe, expect, it } from 'vitest';
import { startupPointerKeys, type StartupPointerSelection } from '../src/world/startup-pointer';

const baseSelection: StartupPointerSelection = {
  selectedMenu: 0,
  selectedOption: 0,
  selectedHelpTopic: 0,
  selectedGuardian: 0,
  confirmYes: false,
  helpTopicCount: 4,
  selectedSaveIndex: 0,
  saveCount: 3,
};

describe('title-screen pointer controls', () => {
  it('uses one tap to advance each source splash screen', () => {
    expect(startupPointerKeys('brand-splash', 120, 160, baseSelection)).toEqual(['Enter']);
    expect(startupPointerKeys('title-splash', 120, 160, baseSelection)).toEqual(['Enter']);
    expect(startupPointerKeys('title-splash', -1, 160, baseSelection)).toEqual([]);
  });

  it('activates a tapped menu row and selects the shortest wrapped route first', () => {
    expect(startupPointerKeys('menu', 120, 107, baseSelection)).toEqual(['Enter']);
    expect(startupPointerKeys('menu', 120, 123, baseSelection)).toEqual(['ArrowDown', 'Enter']);
    expect(startupPointerKeys('menu', 120, 187, baseSelection)).toEqual(['ArrowUp', 'Enter']);
    expect(startupPointerKeys('menu', 10, 107, baseSelection)).toEqual([]);
  });

  it('selects option rows and changes a value when its value column is tapped', () => {
    expect(startupPointerKeys('options', 80, 172, baseSelection)).toEqual([
      'ArrowDown', 'ArrowDown',
    ]);
    expect(startupPointerKeys('options', 180, 172, baseSelection)).toEqual([
      'ArrowDown', 'ArrowDown', 'ArrowRight',
    ]);
    expect(startupPointerKeys('options', 30, 172, baseSelection)).toEqual([]);
  });

  it('opens a help topic and maps the soft keys to the existing actions', () => {
    expect(startupPointerKeys('help', 120, 171, baseSelection)).toEqual([
      'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter',
    ]);
    expect(startupPointerKeys('help', 20, 310, baseSelection)).toEqual(['Enter']);
    expect(startupPointerKeys('help', 220, 310, baseSelection)).toEqual(['Backspace']);
  });

  it('uses page taps for help and about navigation and the right soft key to go back', () => {
    expect(startupPointerKeys('help-content', 40, 170, baseSelection)).toEqual(['ArrowUp']);
    expect(startupPointerKeys('about', 200, 170, baseSelection)).toEqual(['ArrowDown']);
    expect(startupPointerKeys('about', 220, 310, baseSelection)).toEqual(['Backspace']);
  });

  it('selects a load-game save row and maps its soft keys', () => {
    expect(startupPointerKeys('load-game', 100, 147, baseSelection)).toEqual(['Enter']);
    expect(startupPointerKeys('load-game', 100, 179, baseSelection)).toEqual([
      'ArrowUp', 'Enter',
    ]);
    expect(startupPointerKeys('load-game', 130, 163, baseSelection)).toEqual([]);
    expect(startupPointerKeys('load-game', 20, 171, baseSelection)).toEqual([]);
    expect(startupPointerKeys('load-game', 20, 310, baseSelection)).toEqual(['i']);
    expect(startupPointerKeys('load-game', 220, 310, baseSelection)).toEqual(['Backspace']);
    expect(startupPointerKeys('load-game', 75, 250, baseSelection)).toEqual(['i']);
    expect(startupPointerKeys('load-game', 170, 250, baseSelection)).toEqual(['e']);
    expect(startupPointerKeys('load-game', 100, 147, { ...baseSelection, saveCount: 0 })).toEqual([]);
  });

  it('selects and toggles tapped guardians through the keyboard state machine', () => {
    expect(startupPointerKeys('guardians', 148, 151, baseSelection)).toEqual([
      'ArrowUp', 'Enter',
    ]);
    expect(startupPointerKeys('hero', 120, 150, baseSelection)).toEqual(['Enter']);
    expect(startupPointerKeys('guardians', 220, 310, baseSelection)).toEqual(['Backspace']);
  });

  it('selects a confirmation choice before accepting it', () => {
    expect(startupPointerKeys('confirm', 120, 207, baseSelection)).toEqual([
      'ArrowLeft', 'Enter',
    ]);
    expect(startupPointerKeys('confirm', 150, 207, baseSelection)).toEqual(['Enter']);
    expect(startupPointerKeys('confirm', 150, 207, { ...baseSelection, confirmYes: true })).toEqual([
      'ArrowLeft', 'Enter',
    ]);
  });

  it('maps exit and option soft keys, and ignores taps outside interactive screens', () => {
    expect(startupPointerKeys('exit-confirm', 20, 310, baseSelection)).toEqual(['Enter']);
    expect(startupPointerKeys('exit-confirm', 220, 310, baseSelection)).toEqual(['Escape']);
    expect(startupPointerKeys('options', 20, 310, baseSelection)).toEqual(['ArrowRight']);
    expect(startupPointerKeys('options', 220, 310, baseSelection)).toEqual(['Backspace']);
    expect(startupPointerKeys('loading', 120, 160, baseSelection)).toEqual([]);
    expect(startupPointerKeys('menu', 120, 107, baseSelection).length).toBeGreaterThan(0);
    expect(startupPointerKeys('menu', 120, -1, baseSelection)).toEqual([]);
  });
});
