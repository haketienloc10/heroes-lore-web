#!/usr/bin/env node

/**
 * Smoke-check each map with complete generated class-6 map/collision/
 * decoration/event data through the DEV max-level map-preview route.
 * Every map receives one attempt; failures are recorded without retrying.
 */

import { spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedRoot = join(root, 'web', 'public', 'assets', 'generated');
const milestoneId = process.env.HEROES_LORE_MILESTONE_ID ?? 'M1011';
if (!/^M\d{3,5}$/.test(milestoneId)) throw new Error('Milestone ID must look like M1011');
const attemptNumber = Number(process.env.HEROES_LORE_ROUTE_ATTEMPT ?? 1);
if (!Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 3) {
  throw new Error('Map preview sweep attempt must be from 1 through 3');
}
const concurrency = Number(process.env.HEROES_LORE_SWEEP_CONCURRENCY ?? 3);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
  throw new Error('Sweep concurrency must be from 1 through 4');
}
const previouslyVerifiedMapIds = new Set([13]);
const manifestPath = join(
  root,
  'reference',
  'screenshots',
  'web-render',
  `${milestoneId}-map-preview-sweep`,
  'sweep-results.json',
);
const previewUrl = process.env.HEROES_LORE_URL ?? 'http://127.0.0.1:5174/';
const parsedPreviewUrl = new URL(previewUrl);
if (parsedPreviewUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedPreviewUrl.hostname)) {
  throw new Error('Map preview sweep can connect only to a local HTTP development server');
}
const serverResponse = await fetch(parsedPreviewUrl);
if (!serverResponse.ok) throw new Error(`Local Vite server returned HTTP ${serverResponse.status}`);

async function numericJsonIds(directory) {
  const files = await readdir(directory);
  return new Set(files
    .filter((file) => /^\d+\.json$/.test(file))
    .map((file) => String(Number(file.slice(0, -5)))));
}

const assetSets = await Promise.all([
  numericJsonIds(join(generatedRoot, 'maps')),
  numericJsonIds(join(generatedRoot, 'collision', '6')),
  numericJsonIds(join(generatedRoot, 'decorations', '6')),
  numericJsonIds(join(generatedRoot, 'event-operations', '6')),
]);
const completeAssetIds = [...assetSets[0]]
  .filter((id) => assetSets.slice(1).every((set) => set.has(id)))
  .map(Number)
  .sort((left, right) => left - right);
const skippedPreviouslyVerified = completeAssetIds.filter((id) => previouslyVerifiedMapIds.has(id));
const mapIds = completeAssetIds.filter((id) => !previouslyVerifiedMapIds.has(id));
if (mapIds.length === 0) throw new Error('No new maps have complete generated assets');

const results = [];
let nextIndex = 0;
let completed = 0;
let persistQueue = Promise.resolve();

async function writeManifest(status) {
  const payload = {
    id: milestoneId,
    profile: 'max-level',
    attemptNumber,
    concurrency,
    mapIds,
    skippedPreviouslyVerified,
    completeGeneratedAssetMapCount: completeAssetIds.length,
    completedCount: completed,
    passedCount: results.filter((result) => result.passed).length,
    failedCount: results.filter((result) => !result.passed).length,
    status,
    results: [...results].sort((left, right) => left.mapId - right.mapId),
  };
  persistQueue = persistQueue.then(async () => {
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
  });
  await persistQueue;
}

async function runMap(mapId) {
  const startedAt = Date.now();
  const resultPath = join(
    root,
    'reference',
    'screenshots',
    'web-render',
    `${milestoneId}-map-preview-${mapId}`,
    `attempt-${attemptNumber}`,
    'result.json',
  );
  try {
    await access(resultPath);
    throw new Error(`Refusing to overwrite existing Map ${mapId} attempt ${attemptNumber}`);
  } catch (error) {
    if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error;
  }
  const previewScript = join(root, 'tools', 'campaign_browser_probe.mjs');
  const child = spawn(process.execPath, [previewScript], {
    cwd: root,
    env: {
      ...process.env,
      HEROES_LORE_ROUTE_TARGET: 'map-preview',
      HEROES_LORE_MAP_ID: String(mapId),
      HEROES_LORE_ROUTE_ATTEMPT: String(attemptNumber),
      HEROES_LORE_MILESTONE_ID: milestoneId,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('close', resolvePromise);
  });
  let probeResult = null;
  try {
    probeResult = JSON.parse(await readFile(resultPath, 'utf8'));
  } catch {
    // The process summary and error are retained when the probe did not write a result.
  }
  const finalState = probeResult?.finalState ?? null;
  return {
    mapId,
    exitCode,
    passed: exitCode === 0 && probeResult?.passed === true,
    elapsedMs: Date.now() - startedAt,
    final: finalState === null ? null : {
      mapId: finalState.mapId,
      tileX: finalState.tileX,
      tileY: finalState.tileY,
      level: finalState.level,
      hp: finalState.runtime?.resources?.hp ?? null,
      maxHp: finalState.runtime?.resources?.maxHp ?? null,
      sp: finalState.runtime?.resources?.sp ?? null,
      maxSp: finalState.runtime?.resources?.maxSp ?? null,
    },
    browserErrorCount: Array.isArray(probeResult?.errors) ? probeResult.errors.length : null,
    resultPath: resultPath.startsWith(root) ? resultPath.slice(root.length + 1) : resultPath,
    stdout: stdout.trim().slice(-1200),
    stderr: stderr.trim().slice(-2000),
  };
}

await writeManifest('running');
const workers = Array.from({ length: Math.min(concurrency, mapIds.length) }, async () => {
  while (nextIndex < mapIds.length) {
    const mapId = mapIds[nextIndex++];
    const result = await runMap(mapId);
    results.push(result);
    completed += 1;
    await writeManifest(completed === mapIds.length ? 'complete' : 'running');
    process.stdout.write(`${completed}/${mapIds.length} Map ${mapId}: ${result.passed ? 'PASS' : 'FAIL'}\n`);
  }
});
await Promise.all(workers);
await writeManifest('complete');
const failed = results.filter((result) => !result.passed);
process.stdout.write(`${JSON.stringify({
  id: milestoneId,
  completed: results.length,
  passed: results.length - failed.length,
  failed: failed.map((result) => result.mapId),
  skippedPreviouslyVerified,
  manifest: manifestPath.slice(root.length + 1),
})}\n`);
if (failed.length > 0) process.exitCode = 1;
