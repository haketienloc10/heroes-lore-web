import { describe, expect, it } from 'vitest';
import enemyData0Raw from '../public/assets/generated/enemy-data/data0.json';
import enemyData1Raw from '../public/assets/generated/enemy-data/data1.json';
import enemyData2Raw from '../public/assets/generated/enemy-data/data2.json';
import { parseEnemyDataTable } from '../src/world/combat';
import { rollEnemyDrops } from '../src/world/loot';

describe('max-level route loot prerequisites', () => {
  it('keeps Wolf Dragon-tooth candidates independent of player level in all enemy variants', () => {
    const tables = [enemyData0Raw, enemyData1Raw, enemyData2Raw].map(parseEnemyDataTable);

    for (const table of tables) {
      const wolf = table.records[21];
      expect(wolf.dropCandidates[0]).toEqual([12, 0, 25]);

      let roll = 0;
      const drops = rollEnemyDrops({ tileX: 1, tileY: 2, definition: wolf }, 99, {
        between(minimum, maximum) {
          roll += 1;
          return roll === 1 ? 1 : maximum;
        },
      });

      expect(drops).toContainEqual({
        kind: 'item', category: 12, itemId: 0, count: 1, tileX: 1, tileY: 2,
      });
      expect(drops.some((drop) => drop.kind === 'item' && drop.category === 11)).toBe(false);
    }
  });
});
