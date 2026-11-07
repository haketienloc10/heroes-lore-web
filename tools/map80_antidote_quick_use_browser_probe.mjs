#!/usr/bin/env node

/** Verify visible max-level Antidote use consumes the item and clears poison. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1143_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1063 attempt must be from 1 to 3');
}
const scenario = 'map80-antidote-quick-use';
const outDir = join(root, `reference/screenshots/web-render/M1143-antidote-quick-use/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1143-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = `http://127.0.0.1:5174/?testProfile=max-level&testScenario=${scenario}`;

let chrome;
let ws;
let page;
let stderr = '';
const events = [];
const captures = [];

class CdpPage {
  constructor(webSocket) {
    this.ws = webSocket;
    this.nextId = 1;
    this.pending = new Map();
    webSocket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (pending === undefined) return;
        this.pending.delete(message.id);
        if (message.error !== undefined) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
      } else if (['Runtime.exceptionThrown', 'Network.loadingFailed', 'Runtime.consoleAPICalled', 'Log.entryAdded']
        .includes(message.method)) {
        events.push({ method: message.method, params: message.params ?? {} });
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`CDP request timed out: ${method}`));
      }, 10000);
      this.pending.set(id, {
        resolve: (result) => { clearTimeout(timeout); resolvePromise(result); },
        reject: (error) => { clearTimeout(timeout); rejectPromise(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text ?? 'CDP evaluate failed');
    return result.result?.value;
  }
}

async function connect(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
      if (target !== undefined) {
        ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolvePromise, rejectPromise) => {
          ws.addEventListener('open', resolvePromise, { once: true });
          ws.addEventListener('error', rejectPromise, { once: true });
        });
        page = new CdpPage(ws);
        for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable']) await page.send(method);
        return;
      }
    } catch {}
    await delay(100);
  }
  throw new Error('Timed out connecting to owned Chromium page');
}

async function launch() {
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-extensions',
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*', '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`, '--window-size=780,420', url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', (chunk) => { stderr += chunk; });
  const portFile = join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  let port;
  while (Date.now() < deadline) {
    try {
      const [value] = (await readFile(portFile, 'utf8')).trim().split('\n');
      if (value !== undefined && /^\d+$/.test(value)) { port = Number(value); break; }
    } catch {}
    if (chrome.exitCode !== null) throw new Error(`Chromium exited before DevTools startup: ${chrome.exitCode}`);
    await delay(50);
  }
  if (port === undefined) throw new Error('Timed out waiting for Chromium DevTools port');
  await connect(port);
  const canvasDeadline = Date.now() + 30000;
  while (Date.now() < canvasDeadline) {
    if (await page.evaluate("document.readyState === 'complete' && document.querySelector('#game canvas') !== null")) break;
    await delay(50);
  }
  await delay(1000);
  await page.send('Page.bringToFront');
}

async function runtime() {
  return await page.evaluate(`(() => {
    const host = document.querySelector('#game');
    if (!host) return null;
    let snapshot = null;
    try { snapshot = JSON.parse(host.dataset.testRuntime ?? 'null'); } catch {}
    return {
      profile: host.dataset.testProfile ?? null,
      scenario: host.dataset.testScenario ?? null,
      mapId: host.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
      tileX: host.dataset.testPlayerTileX === undefined ? null : Number(host.dataset.testPlayerTileX),
      tileY: host.dataset.testPlayerTileY === undefined ? null : Number(host.dataset.testPlayerTileY),
      hp: host.dataset.testHp === undefined ? null : Number(host.dataset.testHp),
      level: host.dataset.testLevel === undefined ? null : Number(host.dataset.testLevel),
      selectedItemCategory: host.dataset.testSelectedItemCategory === undefined
        ? null : Number(host.dataset.testSelectedItemCategory),
      playerStatus: (() => { try { return JSON.parse(host.dataset.testPlayerStatus ?? 'null'); } catch { return null; } })(),
      snapshot,
    };
  })()`);
}

async function waitFor(predicate, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtime();
    if (predicate(state)) return state;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function keyTap(key, code, vk, textValue) {
  const params = { key, code, windowsVirtualKeyCode: vk };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  if (textValue !== undefined) {
    await page.send('Input.dispatchKeyEvent', { type: 'char', text: textValue, ...params });
  }
  await delay(45);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(25);
}

async function keyTapImmediate(key, code, vk, textValue) {
  const params = { key, code, windowsVirtualKeyCode: vk };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  if (textValue !== undefined) {
    await page.send('Input.dispatchKeyEvent', { type: 'char', text: textValue, ...params });
  }
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}

async function capture(label, filename) {
  const state = await runtime();
  const image = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const bytes = Buffer.from(image.data, 'base64');
  await writeFile(join(outDir, filename), bytes);
  captures.push({ at: new Date().toISOString(), label, state, file: filename,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength });
  return state;
}

function browserErrors() {
  return events.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
}

async function internalSceneState() {
  return await page.evaluate(`(() => {
    const game = window.__heroesLoreDebugGame;
    const scenes = game?.scene?.getScenes(true) ?? [];
    const scene = scenes.find((candidate) => candidate?.playerStatus !== undefined &&
      candidate?.playerSkillAction !== undefined);
    if (!scene) return null;
    return {
      statusEffects: [...scene.playerStatus.effects],
      poisonTicksElapsed: scene.playerStatus.poisonTicksElapsed,
      poisonRemovalPending: scene.playerStatus.poisonRemovalPending,
      hp: scene.hudState.hp,
      maxHp: scene.hudState.maxHp,
      selectedItemCategory: scene.hudState.selectedItemCategory,
      selectedItemCount: scene.hudState.selectedItemCount,
      inventory: scene.inventory.map((stack) => ({ ...stack })),
      skillAction: {
        skillId: scene.playerSkillAction.skillId,
        skillRank: scene.playerSkillAction.skillRank,
        skillLevelSlotOne: scene.playerSkillAction.skillLevelSlotOne,
        phase: scene.playerSkillAction.phase,
        levelSlot: scene.playerSkillAction.levelSlot,
        effectAge: scene.playerSkillAction.effectAge,
        defenseBoostTicksRemaining: scene.playerSkillAction.defenseBoostTicksRemaining,
        comboPowerBoostTicksRemaining: scene.playerSkillAction.comboPowerBoostTicksRemaining,
        chargeTicksRemaining: [...scene.playerSkillAction.chargeTicksRemaining],
      },
    };
  })()`);
}

async function run() {
  await mkdir(dirname(outDir), { recursive: true });
  await mkdir(outDir);
  await launch();
  await capture('fresh title', '00-title-screen.png');
  const presses = [
    ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40], ['Enter', 'Enter', 13], ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13], ['ArrowRight', 'ArrowRight', 39], ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of presses) await keyTap(key, code, vk);
  const start = await waitFor((state) => state?.profile === 'max-level' && state.scenario === scenario &&
    state.mapId === 80 && state.tileX === 8 && state.tileY === 9 && state.level === 99 &&
    state.snapshot?.format === 'heroes-lore-campaign-test-runtime-v9' &&
    state.selectedItemCategory === 10 && state.playerStatus?.effects?.includes(7),
  'max-level Map80 Antidote scenario');
  const initial = await internalSceneState();
  const maxHp = initial?.maxHp ?? 0;
  const expectedPulseLoss = Math.floor(maxHp / 25);
  if (initial === null || !initial.statusEffects.includes(7) ||
    initial.poisonRemovalPending || initial.selectedItemCategory !== 10 ||
    initial.selectedItemCount !== 1 || initial.inventory.filter((stack) => stack.category === 10)
      .reduce((count, stack) => count + stack.count, 0) !== 1 ||
    initial.hp <= 0 || initial.hp > maxHp || start.hp <= 0 || start.level !== 99) {
    throw new Error(`Unexpected max-level Antidote setup: ${JSON.stringify({ start, initial })}`);
  }

  await keyTapImmediate('9', 'Digit9', 57, '9');
  const afterUse = await internalSceneState();
  if (afterUse === null || afterUse.selectedItemCategory !== 10 ||
    afterUse.inventory.some((stack) => stack.category === 10) ||
    (afterUse.poisonRemovalPending !== true && afterUse.statusEffects.includes(7))) {
    throw new Error(`Visible Antidote input did not consume the selected item: ${JSON.stringify({ afterUse })}`);
  }
  const observedHpLossDuringUse = initial.hp - afterUse.hp;
  if (observedHpLossDuringUse < 0 || observedHpLossDuringUse > expectedPulseLoss) {
    throw new Error(`Unexpected poison HP change around Antidote input: ${JSON.stringify({ initial, afterUse })}`);
  }
  const finalPulseExpected = afterUse.poisonRemovalPending && afterUse.poisonTicksElapsed !== null &&
    (afterUse.poisonTicksElapsed + 1) % 10 === 0 && afterUse.hp > 1;
  const expectedFinalHp = afterUse.hp - (finalPulseExpected ? expectedPulseLoss : 0);

  let removed = null;
  const removeDeadline = Date.now() + 4000;
  while (Date.now() < removeDeadline) {
    const scene = await internalSceneState();
    if (scene !== null && scene.statusEffects.length === 0 && scene.poisonTicksElapsed === null &&
      scene.hp === expectedFinalHp) {
      removed = scene;
      break;
    }
    await delay(5);
  }
  if (removed === null) {
    throw new Error(`Antidote did not remove poison with the expected pulse result: ${JSON.stringify({
      latest: await internalSceneState(), expectedHp: expectedFinalHp,
    })}`);
  }
  captures.push({ at: new Date().toISOString(), label: 'Antidote consumed and poison removed',
    state: await runtime(), scene: removed, finalPulseExpected });
  await capture('Antidote consumed and poison removed', '01-antidote-and-status-removed.png');
  await delay(220);
  const after = await capture('post-removal state', '03-post-removal.png');
  const finalScene = await internalSceneState();
  const failures = browserErrors();
  const passed = start.profile === 'max-level' && start.level === 99 && start.mapId === 80 &&
    initial.statusEffects.includes(7) && initial.hp > 0 &&
    initial.selectedItemCategory === 10 && initial.selectedItemCount === 1 &&
    (afterUse.poisonRemovalPending || afterUse.statusEffects.length === 0) &&
    afterUse.inventory.every((stack) => stack.category !== 10) &&
    removed.statusEffects.length === 0 && removed.hp === expectedFinalHp &&
    after.hp > 0 && finalScene?.statusEffects.length === 0 && finalScene.hp === expectedFinalHp &&
    failures.length === 0;
  const result = {
    id: 'M1143', attempt, profile: 'max-level', scenario, passed, start, initial,
    useInput: 'Digit9', afterUse, removed, after, finalScene, expectedPulseLoss, finalPulseExpected,
    observedHpLossDuringUse, expectedFinalHp, captures, browserErrors: failures,
    route: 'visible New Game -> DEV max-level Map80 fixture with active poison and one Antidote -> visible Digit9 input consumes Antidote -> verify poison removal and record any final pulse in the use window',
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false,
      originalJarAccessed: false, mapStateSeeded: true },
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1143 Antidote criteria failed: ${JSON.stringify({
    start, initial, afterUse, removed, after, finalScene, failures,
  })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed, mapId: after.mapId,
    level: after.level, selectedItemCategory: initial.selectedItemCategory,
    poisonTicksBefore: initial.poisonTicksElapsed, pendingAfterUse: afterUse.poisonRemovalPending,
    finalPulseExpected, statusAfter: finalScene.statusEffects,
    hpBeforeUse: initial.hp, hpAfterUse: afterUse.hp, hpAfterRemoval: removed.hp,
    expectedPulseLoss, inventoryAfter: finalScene.inventory, browserErrors: failures.length,
    artifacts: `reference/screenshots/web-render/M1143-antidote-quick-use/attempt-${attempt}` })}\n`);
}

async function cleanup() {
  try { ws?.close(); } catch {}
  if (chrome !== undefined && chrome.exitCode === null && chrome.signalCode === null) {
    chrome.kill('SIGTERM');
    await new Promise((resolvePromise) => {
      if (chrome.exitCode !== null || chrome.signalCode !== null) return resolvePromise();
      const timeout = setTimeout(resolvePromise, 4000);
      chrome.once('exit', () => { clearTimeout(timeout); resolvePromise(); });
    });
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  }
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

try {
  await run();
} catch (error) {
  const partial = { id: 'M1143', attempt, profile: 'max-level', scenario, passed: false, captures, events,
    error: error instanceof Error ? error.message : String(error), browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1143', attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state ?? null })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
