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
  'data-test-map-id',
  'data-test-player-tile-x',
  'data-test-player-tile-y',
  'data-test-hp',
  'data-test-level',
  'data-test-commerce-service',
  'data-test-commerce-screen',
  'data-test-map-preview-ready',
  'heroes-lore-campaign-test-runtime',
  'map60-investigation',
  'map27-class6-lunge',
  'map27-class6-lunge-target',
  'map27-class6-skill2',
  'map27-class6-skill-rank',
  'map27-class6-skill-rank9',
  'map27-class6-skill3',
  'map27-class6-skill4',
  'map27-class6-skill5',
  'map2-class6-skill5-element3',
  'map80-refiner-orb-attribute',
  'map80-blacksmith-identify',
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
