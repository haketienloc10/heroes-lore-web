import Phaser from 'phaser';

/** Chỉ xác nhận Phaser khởi chạy; không mô phỏng gameplay bản gốc. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x263248, 1);
    for (let x = 0; x <= 240; x += 16) graphics.lineBetween(x, 0, x, 320);
    for (let y = 0; y <= 320; y += 16) graphics.lineBetween(0, y, 240, y);

    this.add
      .text(120, 116, 'HEROES LORE', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#e6eefb',
      })
      .setOrigin(0.5);

    this.add
      .text(120, 165, 'WEB PORT RESEARCH\n\nChưa nạp JAR / assets\nChưa có gameplay', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#a5b4c9',
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5);
  }
}
