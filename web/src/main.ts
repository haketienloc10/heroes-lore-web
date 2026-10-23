import Phaser from 'phaser';
import { EndingScene } from './rendering/EndingScene';
import { WorldScene } from './rendering/WorldScene';
import { StartupFlowScene } from './world/startup-flow';
import { mountTouchControls } from './input/touch-controls';
import './style.css';

const touchControls = document.querySelector<HTMLElement>('#touch-controls');
if (touchControls !== null) mountTouchControls(touchControls);

// Logical viewport matches the FreeJ2ME-Plus Motorola profile used by HOUSE-EXIT-001.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#111b2b',
  width: 240,
  height: 320,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 240,
    height: 320,
  },
  scene: [StartupFlowScene, WorldScene, EndingScene],
});
