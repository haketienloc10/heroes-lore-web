#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(repositoryRoot, 'web');
const generatedRoot = path.join(webRoot, 'public', 'assets', 'generated');
// FND-0046 establishes that map 60 has eight NPC placements, no marker group 7
// on its collision grid, and two otherwise-selected scripts that address NPC 8.
// Keep these scripts rejected until source data proves a reachable ninth NPC.
const expectedRejectedScripts = [
  { mapId: '60', scriptIndex: 10, npcEmotionTargets: [8], opcodes: [50, 9, 99] },
  { mapId: '60', scriptIndex: 11, npcEmotionTargets: [8], opcodes: [50, 9, 99] },
];
const vite = await createServer({
  root: webRoot,
  configFile: path.join(webRoot, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

try {
  const [{ canRunEventCutscene }, { parseEquipmentDataTable }] = await Promise.all([
    vite.ssrLoadModule('/src/world/event-cutscene.ts'),
    vite.ssrLoadModule('/src/world/equipment-data.ts'),
  ]);
  const equipmentDataTable = parseEquipmentDataTable(await readJson(
    path.join(generatedRoot, 'equipment-data', 'catalog.json'),
  ));
  const eventDirectory = path.join(generatedRoot, 'event-operations', '6');
  const eventFiles = (await readdir(eventDirectory)).filter((name) => name.endsWith('.json')).sort();
  const rejected = [];
  let scriptCount = 0;

  for (const eventFile of eventFiles) {
    const mapId = path.basename(eventFile, '.json');
    const [events, map, decorations] = await Promise.all([
      readJson(path.join(eventDirectory, eventFile)),
      readJson(path.join(generatedRoot, 'maps', `${mapId}.json`)),
      readJson(path.join(generatedRoot, 'decorations', '6', eventFile)),
    ]);
    for (let scriptIndex = 0; scriptIndex < events.scripts.length; scriptIndex += 1) {
      scriptCount += 1;
      const commands = events.scripts[scriptIndex];
      if (canRunEventCutscene(
        commands,
        events.npcPlacements.length,
        { width: map.width, height: map.height },
        equipmentDataTable,
        decorations.objects.length,
      )) continue;
      rejected.push({
        mapId,
        scriptIndex,
        npcEmotionTargets: commands
          .filter(([opcode]) => opcode === 50)
          .map(([, npcIndex]) => npcIndex),
        opcodes: commands.map(([opcode]) => opcode),
      });
    }
  }

  const keyFor = ({ mapId, scriptIndex }) => `${mapId}:${scriptIndex}`;
  const rejectedKeys = new Set(rejected.map(keyFor));
  const expectedKeys = new Set(expectedRejectedScripts.map(keyFor));
  const unexpectedRejections = rejected.filter((entry) => !expectedKeys.has(keyFor(entry)));
  const unexpectedlySupported = expectedRejectedScripts.filter((entry) => !rejectedKeys.has(keyFor(entry)));
  const expectedByKey = new Map(expectedRejectedScripts.map((entry) => [keyFor(entry), entry]));
  const rejectionDetailsMatch = rejected.length === expectedRejectedScripts.length && rejected.every((entry) => {
    const expected = expectedByKey.get(keyFor(entry));
    return expected !== undefined &&
      JSON.stringify(entry.npcEmotionTargets) === JSON.stringify(expected.npcEmotionTargets) &&
      JSON.stringify(entry.opcodes) === JSON.stringify(expected.opcodes);
  });
  const coverageInvariantPassed = eventFiles.length === 72 && scriptCount === 387 &&
    rejectionDetailsMatch && unexpectedRejections.length === 0 && unexpectedlySupported.length === 0;

  process.stdout.write(`${JSON.stringify({
    mapCount: eventFiles.length,
    scriptCount,
    supportedScriptCount: scriptCount - rejected.length,
    rejected,
    expectedRejectedScripts,
    unexpectedRejections,
    unexpectedlySupported,
    coverageInvariantPassed,
    scope: 'Structural capability-gate audit of current extracted data; not runtime reachability or J2ME parity.',
  }, null, 2)}\n`);
  if (!coverageInvariantPassed) process.exitCode = 1;
} finally {
  await vite.close();
}
