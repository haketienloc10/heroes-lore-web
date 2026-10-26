#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(repositoryRoot, 'web');
const generatedRoot = path.join(webRoot, 'public', 'assets', 'generated');
const vite = await createServer({
  root: webRoot,
  configFile: path.join(webRoot, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function componentsFromAnimation(animation) {
  return animation.tracks.flatMap((track) => track.frames.flat());
}

function componentsFromEffect(effect) {
  return effect.frames.flat();
}

try {
  const [
    { parseEventOperationData },
    { parseEnemyDataTable },
    { addSourceConstructedMapEnemies, addSourceMap13SecondWaveEnemies },
    {
      MAP11_CB_RENDER_SPRITE_ID,
      MAP13_AQ_RENDER_SPRITE_ID,
      MAP13_AF_RENDER_SPRITE_ID,
      MAP13_BC_RENDER_SPRITE_ID,
      MAP13_CC_RENDER_SPRITE_ID,
      MAP15_CF_RENDER_SPRITE_ID,
      MAP15_AZ_RENDER_SPRITE_ID,
      MAP15_AJ_RENDER_SPRITE_ID,
      parseBossSpriteAnimationCatalog,
      parseBossAttackEffectCatalog,
    },
    { parseEnemySpriteAnimationCatalog },
    { parseEnemyAttackEffectCatalog },
  ] = await Promise.all([
    vite.ssrLoadModule('/src/world/event-data.ts'),
    vite.ssrLoadModule('/src/world/combat.ts'),
    vite.ssrLoadModule('/src/world/source-map-entities.ts'),
    vite.ssrLoadModule('/src/world/boss-sprites.ts'),
    vite.ssrLoadModule('/src/world/enemy-sprites.ts'),
    vite.ssrLoadModule('/src/world/enemy-attacks.ts'),
  ]);

  const [
    enemyAnimationCatalogRaw,
    bossAnimationCatalogRaw,
    enemyEffectsRaw,
    bossEffectsRaw,
    data0Raw,
    data1Raw,
    data2Raw,
  ] = await Promise.all([
    readJson(path.join(generatedRoot, 'enemy-animations', 'catalog.json')),
    readJson(path.join(generatedRoot, 'boss-animations', 'catalog.json')),
    readJson(path.join(generatedRoot, 'enemy-attack-effects', 'catalog.json')),
    readJson(path.join(generatedRoot, 'boss-attack-effects', 'catalog.json')),
    readJson(path.join(generatedRoot, 'enemy-data', 'data0.json')),
    readJson(path.join(generatedRoot, 'enemy-data', 'data1.json')),
    readJson(path.join(generatedRoot, 'enemy-data', 'data2.json')),
  ]);
  const enemyAnimations = parseEnemySpriteAnimationCatalog(enemyAnimationCatalogRaw);
  const bossAnimations = parseBossSpriteAnimationCatalog(bossAnimationCatalogRaw);
  const enemyEffects = parseEnemyAttackEffectCatalog(enemyEffectsRaw);
  const bossEffects = parseBossAttackEffectCatalog(bossEffectsRaw);
  const enemyTables = [data0Raw, data1Raw, data2Raw].map(parseEnemyDataTable);
  const enemyAnimationsById = new Map(enemyAnimations.sprites.map((entry) => [entry.spriteId, entry]));
  const bossAnimationsByKey = new Map(bossAnimations.sprites.map((entry) => [
    `${entry.bossId}:${entry.enemyId}`,
    entry,
  ]));
  const enemyEffectsById = new Map(enemyEffects.effects.map((entry) => [entry.spriteId, entry]));
  const bossEffectsByKey = new Map(bossEffects.effects.map((entry) => [
    `${entry.bossId}:${entry.enemyId}`,
    entry,
  ]));
  const bossRenderIds = new Map([
    [MAP11_CB_RENDER_SPRITE_ID, [1, 32]],
    [MAP13_AQ_RENDER_SPRITE_ID, [2, 35]],
    [MAP13_AF_RENDER_SPRITE_ID, [2, 36]],
    [MAP13_BC_RENDER_SPRITE_ID, [2, 37]],
    [MAP13_CC_RENDER_SPRITE_ID, [2, 38]],
    [MAP15_CF_RENDER_SPRITE_ID, [3, 39]],
    [MAP15_AZ_RENDER_SPRITE_ID, [3, 40]],
    [MAP15_AJ_RENDER_SPRITE_ID, [3, 41]],
  ]);
  const missing = [];
  const missingDefinitions = [];
  const usedEnemySpriteIds = new Set();
  const usedBossRenderIds = new Set();
  const checkedImageKeys = new Set();
  const checkFrames = async (kind, atlasDirectory, components, owner) => {
    for (const { imageIndex } of components) {
      if (imageIndex < 0) continue;
      const relativePath = `${atlasDirectory}/${String(imageIndex).padStart(3, '0')}.png`;
      if (checkedImageKeys.has(relativePath)) continue;
      checkedImageKeys.add(relativePath);
      if (!await exists(path.join(generatedRoot, relativePath))) {
        missing.push({ kind, owner, imageIndex, path: relativePath });
      }
    }
  };

  const eventDirectory = path.join(generatedRoot, 'event-operations', '6');
  const eventFiles = (await readdir(eventDirectory)).filter((name) => name.endsWith('.json')).sort();
  if (eventFiles.length !== 72) {
    throw new Error(`Expected 72 generated class-6 event tables, found ${eventFiles.length}`);
  }
  let mapCount = 0;
  let enemyPlacementCount = 0;
  for (const eventFile of eventFiles) {
    const mapId = Number(path.basename(eventFile, '.json'));
    let events = parseEventOperationData(await readJson(path.join(eventDirectory, eventFile)));
    events = addSourceConstructedMapEnemies(mapId, events);
    if (mapId === 13) events = addSourceMap13SecondWaveEnemies(events);
    mapCount += 1;
    for (const placement of events.enemyPlacements) {
      enemyPlacementCount += 1;
      for (const table of enemyTables) {
        if (table.records[placement.enemyId] === undefined) {
          missingDefinitions.push({ mapId, enemyId: placement.enemyId, variant: table.variant });
        }
      }

      const renderId = placement.renderSpriteId ?? placement.spriteId ?? placement.enemyId;
      const bossKey = bossRenderIds.get(renderId);
      if (bossKey !== undefined) {
        const [bossId, enemyId] = bossKey;
        const animation = bossAnimationsByKey.get(`${bossId}:${enemyId}`);
        if (animation === undefined) {
          missing.push({ kind: 'boss-animation', owner: `${mapId}:${renderId}` });
          continue;
        }
        usedBossRenderIds.add(renderId);
        const directory = `atlases/boss/${bossId}`;
        await checkFrames('boss-animation', directory, componentsFromAnimation(animation), `${bossId}/${enemyId}`);
        const effect = bossEffectsByKey.get(`${bossId}:${enemyId}`);
        if (effect !== undefined) {
          await checkFrames('boss-effect', directory, componentsFromEffect(effect), `${bossId}/${enemyId}`);
        }
        continue;
      }

      const animation = enemyAnimationsById.get(renderId);
      if (animation === undefined) {
        missing.push({ kind: 'enemy-animation', owner: `${mapId}:${renderId}` });
        continue;
      }
      usedEnemySpriteIds.add(renderId);
      const directory = `atlases/enm/${String(renderId).padStart(2, '0')}`;
      await checkFrames('enemy-animation', directory, componentsFromAnimation(animation), String(renderId));
      const effect = enemyEffectsById.get(renderId);
      if (effect !== undefined) {
        await checkFrames('enemy-effect', directory, componentsFromEffect(effect), String(renderId));
      }
    }
  }

  const result = {
    mapCount,
    enemyPlacementCount,
    ordinarySpriteIdsUsed: [...usedEnemySpriteIds].sort((a, b) => a - b),
    sourceBossRenderIdsUsed: [...usedBossRenderIds].sort((a, b) => a - b),
    enemyDataVariantsChecked: enemyTables.map(({ variant, records }) => ({ variant, records: records.length })),
    referencedAtlasImagesChecked: checkedImageKeys.size,
    missingDefinitions,
    missing,
    scope: 'Generated class-6 enemy placements, source-created boss groups, all three enemy data variants, and their catalog-referenced animation/effect atlas images; asset coverage only, not actor behavior or rendered/J2ME parity.',
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (missing.length > 0 || missingDefinitions.length > 0) process.exitCode = 1;
} finally {
  await vite.close();
}
