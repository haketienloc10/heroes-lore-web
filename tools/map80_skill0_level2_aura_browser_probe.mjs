#!/usr/bin/env node

/** Verify skill-0 level-2 activation and its attached aura animation in Chromium. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1066_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1066 attempt must be from 1 to 3');
}
const scenario = 'map80-class6-skill0-level2-aura';
const outDir = join(root, `reference/screenshots/web-render/M1066-skill0-level2-aura/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1066-'));
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
      snapshot,
    };
  })()`);
}

async function internalSceneState() {
  return await page.evaluate(`(() => {
    const game = window.__heroesLoreDebugGame;
    const scenes = game?.scene?.getScenes(true) ?? [];
    const scene = scenes.find((candidate) => candidate?.playerSkillAction !== undefined &&
      candidate?.playerAttachedSkillVisuals !== undefined);
    if (!scene) return null;
    const visual = scene.playerAttachedSkillVisuals.find((candidate) => candidate.kind === 'skill-0-aura');
    const sprite = visual === undefined ? undefined : scene.playerAttachedSkillVisualSprites.get(visual.id);
    return {
      playerHp: scene.hudState.hp,
      playerSp: scene.hudState.sp,
      skillAction: {
        skillId: scene.playerSkillAction.skillId,
        skillRank: scene.playerSkillAction.skillRank,
        skillPowerStat: scene.playerSkillAction.skillPowerStat,
        skillLevelSlotOne: scene.playerSkillAction.skillLevelSlotOne,
        levelSlot: scene.playerSkillAction.levelSlot,
        phase: scene.playerSkillAction.phase,
        effectAge: scene.playerSkillAction.effectAge,
        counterattackBoostTicksRemaining: scene.playerSkillAction.counterattackBoostTicksRemaining,
      },
      aura: visual === undefined ? null : {
        frameIndex: visual.frameIndex,
        durationTicks: visual.durationTicks,
        delayTicksRemaining: visual.delayTicksRemaining,
        spriteVisible: sprite?.visible ?? false,
        childCount: sprite?.length ?? 0,
        textureKeys: (sprite?.list ?? []).map((child) => child.texture?.key ?? null),
      },
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
  if (textValue !== undefined) await page.send('Input.dispatchKeyEvent', { type: 'char', text: textValue, ...params });
  await delay(45);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(25);
}

async function capture(label, filename) {
  const state = await runtime();
  const scene = await internalSceneState();
  const image = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const bytes = Buffer.from(image.data, 'base64');
  await writeFile(join(outDir, filename), bytes);
  captures.push({ at: new Date().toISOString(), label, state, scene, file: filename,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength });
  return { state, scene };
}

function browserErrors() {
  return events.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
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
    state.mapId === 80 && state.tileX === 8 && state.tileY === 15 && state.level === 99 &&
    state.snapshot?.format === 'heroes-lore-campaign-test-runtime-v9' &&
    state.snapshot.skillAction.skillId === 0 && state.snapshot.skillAction.skillRank === 20 &&
    state.snapshot.skillAction.skillLevelSlotOne === 2 && state.snapshot.skillAction.chargeTicksRemaining[2] === 0,
  'max-level Map80 skill-0 aura scenario');
  const before = await capture('ready level-2 skill before activation', '01-ready-before-activation.png');
  if (before.state.hp !== before.state.snapshot.resources.maxHp ||
    before.state.snapshot.skillAction.phase !== 0 || before.scene?.aura !== null ||
    before.scene?.skillAction.counterattackBoostTicksRemaining !== 0) {
    throw new Error(`Unexpected skill-0 aura setup: ${JSON.stringify({ start, before })}`);
  }

  await keyTap('1', 'Numpad1', 97, '1');
  const started = await waitFor((state) => state?.snapshot?.skillAction.skillId === 0 &&
    state.snapshot.skillAction.levelSlot === 2 && state.snapshot.skillAction.phase !== 0,
  'Numpad1 starts skill ID 0 level 2');
  const auraDeadline = Date.now() + 6000;
  let activeScene = null;
  let activeRuntime = null;
  while (Date.now() < auraDeadline) {
    activeScene = await internalSceneState();
    activeRuntime = await runtime();
    if ((activeScene?.skillAction.counterattackBoostTicksRemaining ?? 0) > 0 &&
      activeScene?.aura?.frameIndex === 2 && activeScene.aura.childCount === 2 &&
      activeScene.aura.spriteVisible) break;
    await delay(20);
  }
  const aura = await capture('active level-2 counter aura on its two-layer frame', '02-counter-aura-frame-2.png');
  const failures = browserErrors();
  const passed = start.profile === 'max-level' && start.level === 99 && start.mapId === 80 &&
    start.snapshot.skillAction.skillId === 0 && start.snapshot.skillAction.skillRank === 20 &&
    start.snapshot.skillAction.skillLevelSlotOne === 2 &&
    started.snapshot.skillAction.levelSlot === 2 && started.snapshot.skillAction.phase !== 0 &&
    (activeScene?.skillAction.counterattackBoostTicksRemaining ?? 0) > 0 &&
    activeScene?.aura?.durationTicks === 160 && activeScene.aura.frameIndex === 2 &&
    activeScene.aura.childCount === 2 && activeScene.aura.spriteVisible &&
    activeScene.aura.textureKeys.includes('world-player-skill-atlas-fi-0') &&
    activeScene.aura.textureKeys.includes('world-player-skill-atlas-fi-1') &&
    aura.state.hp > 0 && aura.state.hp === aura.state.snapshot.resources.maxHp &&
    failures.length === 0;
  const result = {
    id: 'M1066', attempt, profile: 'max-level', scenario, passed, start, before, started,
    activeRuntime, activeScene, aura, browserErrors: failures,
    route: 'visible New Game -> DEV max-level Map80 with skill ID 0 rank 20, level 2 ready -> Numpad1 -> observe the active 160-tick counter aura and its two-layer atlas frame in the rendered scene',
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false,
      originalJarAccessed: false, mapStateSeeded: true },
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1066 skill-0 aura criteria failed: ${JSON.stringify({
    start, before, started, activeRuntime, activeScene, aura, failures,
  })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed, mapId: aura.state.mapId,
    level: aura.state.level, skillId: aura.state.snapshot.skillAction.skillId,
    levelSlot: aura.state.snapshot.skillAction.levelSlot,
    aura: { frameIndex: aura.scene?.aura?.frameIndex, durationTicks: aura.scene?.aura?.durationTicks,
      childCount: aura.scene?.aura?.childCount, textureKeys: aura.scene?.aura?.textureKeys },
    counterattackTicksRemaining: aura.scene?.skillAction.counterattackBoostTicksRemaining,
    playerHp: { current: aura.state.hp, max: aura.state.snapshot.resources.maxHp },
    browserErrors: failures.length,
    artifacts: `reference/screenshots/web-render/M1066-skill0-level2-aura/attempt-${attempt}` })}\n`);
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
  const partial = { id: 'M1066', attempt, profile: 'max-level', scenario, passed: false, captures, events,
    error: error instanceof Error ? error.message : String(error), browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1066', attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state ?? null })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
