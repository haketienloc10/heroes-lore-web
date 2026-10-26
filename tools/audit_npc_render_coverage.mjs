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

try {
  const [{
    adaptEnemyAnimationForNpc,
    parseNpcSpriteAnimationCatalog,
    sourceEnemySpriteIdForNpc,
    sourceNpcTextureSource,
  }, { findEnemySpriteAnimation, parseEnemySpriteAnimationCatalog }] = await Promise.all([
    vite.ssrLoadModule('/src/world/npc-sprites.ts'),
    vite.ssrLoadModule('/src/world/enemy-sprites.ts'),
  ]);
  const [rawNpcCatalog, rawEnemyCatalog] = await Promise.all([
    readJson(path.join(generatedRoot, 'npc-animations', 'catalog.json')),
    readJson(path.join(generatedRoot, 'enemy-animations', 'catalog.json')),
  ]);
  const npcCatalog = parseNpcSpriteAnimationCatalog(rawNpcCatalog);
  const enemyCatalog = parseEnemySpriteAnimationCatalog(rawEnemyCatalog);
  const animations = new Map(npcCatalog.sprites.map((animation) => [animation.npcId, animation]));
  for (const npcId of [3, 6]) {
    const enemySpriteId = sourceEnemySpriteIdForNpc(npcId);
    const enemyAnimation = enemySpriteId === undefined
      ? undefined
      : findEnemySpriteAnimation(enemyCatalog, enemySpriteId);
    if (enemyAnimation === undefined) {
      throw new Error(`NPC ${npcId} is missing enemy-backed animation ${enemySpriteId}`);
    }
    animations.set(npcId, adaptEnemyAnimationForNpc(npcId, enemyAnimation));
  }

  const eventDirectory = path.join(generatedRoot, 'event-operations', '6');
  const eventFiles = (await readdir(eventDirectory)).filter((name) => name.endsWith('.json')).sort();
  const imageIds = new Set();
  let placementCount = 0;
  let scriptImageChangeCount = 0;
  let startupImageChangeCount = 0;
  const missing = [];
  for (const eventFile of eventFiles) {
    const events = await readJson(path.join(eventDirectory, eventFile));
    for (const placement of events.npcPlacements ?? []) {
      imageIds.add(placement.imageId);
      placementCount += 1;
    }
    for (const command of (events.scripts ?? []).flat()) {
      if (command[0] === 41) {
        imageIds.add(command[2]);
        scriptImageChangeCount += 1;
      }
    }
    for (const block of events.actionBlocks ?? []) {
      for (const action of block.actions ?? []) {
        if (action.opcode === 110) {
          imageIds.add(action.arguments[1]);
          startupImageChangeCount += 1;
        }
      }
    }

  }

  let animatedImageIdCount = 0;
  let staticImageIdCount = 0;
  for (const imageId of [...imageIds].sort((a, b) => a - b)) {
    const animation = animations.get(imageId);
    const textureSource = sourceNpcTextureSource(imageId, animation !== undefined);
    if (textureSource === undefined) {
      missing.push({ imageId, reason: 'no animation or static texture route' });
      continue;
    }
    if (textureSource.kind === 'static') {
      staticImageIdCount += 1;
      const imagePath = path.join(generatedRoot,
        textureSource.imagePath.replace('/assets/generated/', ''));
      if (!await exists(imagePath)) missing.push({ imageId, imagePath, reason: 'missing static atlas image' });
      continue;
    }

    animatedImageIdCount += 1;
    const imageIndices = new Set(animation.tracks.flatMap((track) =>
      track.frames.flatMap((frame) => frame
        .filter(({ imageIndex }) => imageIndex >= 0)
        .map(({ imageIndex }) => imageIndex))));
    for (const imageIndex of imageIndices) {
      const relativePath = `${textureSource.atlasDirectory.replace('/assets/generated/', '')}/${String(imageIndex).padStart(3, '0')}.png`;
      if (!await exists(path.join(generatedRoot, relativePath))) {
        missing.push({ imageId, imageIndex, relativePath, reason: 'missing animated atlas frame' });
      }
    }
  }

  const result = {
    mapCount: eventFiles.length,
    placementCount,
    scriptImageChangeCount,
    startupImageChangeCount,
    distinctImageIdCount: imageIds.size,
    animatedImageIdCount,
    staticImageIdCount,
    missing,
    scope: 'Generated class-6 initial placements plus opcode-41 script and opcode-110 startup image changes; asset coverage only, not runtime visibility or visual parity.',
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (missing.length > 0) process.exitCode = 1;
} finally {
  await vite.close();
}
