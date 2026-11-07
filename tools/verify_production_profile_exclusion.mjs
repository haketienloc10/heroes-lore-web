import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(repositoryRoot, 'web', 'dist');
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg']);
const forbiddenMarkers = [
  'testProfile',
  'testScenario',
  'max-level',
  'loot-survival',
  'damage-survival',
  'data-test-profile',
  'data-test-scenario',
  'data-test-runtime',
  'data-test-enemy-status-effects',
  'data-test-enemy-projectiles',
  'testEnemyProjectiles',
  'data-test-map-id',
  'data-test-player-tile-x',
  'data-test-player-tile-y',
  'data-test-hp',
  'data-test-level',
  'data-test-player-sprite-pose',
  'data-test-commerce-service',
  'data-test-commerce-screen',
  'data-test-map-preview-ready',
  'heroes-lore-campaign-test-runtime',
  'serializeCampaignTestEnemyStatusSnapshot',
  'serializeCampaignTestEnemyProjectileSnapshot',
  'map60-investigation',
  'map27-class6-lunge',
  'map27-class6-lunge-target',
  'map27-class6-skill2',
  'map27-class6-skill-rank',
  'map27-class6-skill-rank9',
  'map27-class6-skill3',
  'map27-class6-skill4',
  'map27-class6-skill5',
  'map27-weapon-proc-status',
  'map27-weapon-proc-status-slow',
  'map27-weapon-proc-status-slow-ai',
  'map27-weapon-proc-status-defense',
  'map27-weapon-proc-poison',
  'map27-weapon-proc-status-2',
  'map27-weapon-proc-damage',
  'map27-weapon-proc-sp',
  'map27-weapon-proc-hp',
  'map27-poison-tick',
  'map27-no-target-wander',
  'map37-class6-multitarget',
  'map37-class6-triple-target',
  'map37-class6-light-followup',
  'map37-class6-heavy-stage4-sweep',
  'map11-boss-ai-live',
  'map13-aq-ai-live',
  'map13-au-proc-sp',
  'map13-au-proc-hp',
  'map13-cc-heal-live',
  'map13-bc-attack-live',
  'map2-class6-skill5-element3',
  'map2-class6-skill3-level2-element3-mismatch',
  'map17-class6-skill3-level2',
  'map17-class6-skill0-level1-combo',
  'map17-class6-skill4-level1-immunity',
  'campaignTestImmunityBlockedHits',
  'map80-class6-skill1-level2-recovery',
  'map80-class6-skill0-level2-aura',
  'map80-class6-skill2-level2-cleanse',
  'map80-class6-skill4-level2-restore',
  'map80-refiner-orb-attribute',
  'map80-blacksmith-identify',
  'map80-blacksmith-identify-direct',
  'map0-walking-recovery-controlled',
  'map76-equipment-reward',
  'map76-equipment-recovery-boundary',
  'map-preview-',
];

async function collectTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTextFiles(entryPath);
    if (entry.isFile() && textExtensions.has(path.extname(entry.name))) return [entryPath];
    return [];
  }));
  return nested.flat();
}

const files = await collectTextFiles(buildDirectory);
if (files.length === 0) {
  throw new Error(`Production build has no text assets to scan: ${buildDirectory}`);
}

const matches = [];
for (const file of files) {
  const content = await readFile(file, 'utf8');
  for (const marker of forbiddenMarkers) {
    if (content.includes(marker)) matches.push(`${path.relative(buildDirectory, file)}: ${marker}`);
  }
}

if (matches.length > 0) {
  throw new Error(`Developer campaign-test profile code leaked into the production build:\n${matches.join('\n')}`);
}

console.log(`Production profile check passed (${files.length} text assets scanned).`);
