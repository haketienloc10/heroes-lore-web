import Phaser from 'phaser';
import { BootScene } from './rendering/BootScene';
import './style.css';

// Kích thước tạm cho màn hình thử nghiệm, chưa xác minh từ JAR v2.1.2.
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
  scene: [BootScene],
});
