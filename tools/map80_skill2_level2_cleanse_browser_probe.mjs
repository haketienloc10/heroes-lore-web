#!/usr/bin/env node

/** Verify max-level skill-2 level-2 clears player poison and active buffs. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1063_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1063 attempt must be from 1 to 3');
}
const scenario = 'map80-class6-skill2-level2-cleanse';
const outDir = join(root, `reference/screenshots/web-render/M1063-skill2-level2-cleanse/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1063-'));
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
      hp: scene.hudState.hp,
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
    state.mapId === 80 && state.tileX === 8 && state.tileY === 15 && state.level === 99 &&
    state.snapshot?.format === 'heroes-lore-campaign-test-runtime-v9' &&
    state.snapshot.skillAction.skillId === 2 && state.snapshot.skillAction.skillRank === 20 &&
    state.snapshot.skillAction.skillLevelSlotOne === 2 && state.snapshot.skillAction.chargeTicksRemaining[2] === 0,
  'max-level Map80 class-6 skill-2 level-2 cleanse scenario');
  await delay(200);
  const before = await capture('seeded poison and boosts before skill', '01-before-skill.png');
  const initial = await internalSceneState();
  if (initial === null || !initial.statusEffects.includes(7) ||
    initial.skillAction.skillId !== 2 || initial.skillAction.skillRank !== 20 ||
    initial.skillAction.skillLevelSlotOne !== 2 || initial.skillAction.chargeTicksRemaining[2] !== 0 ||
    initial.skillAction.defenseBoostTicksRemaining <= 0 || initial.skillAction.comboPowerBoostTicksRemaining <= 0 ||
    initial.hp <= 0 || start.hp <= 0) {
    throw new Error(`Unexpected seeded skill-2 cleanse setup: ${JSON.stringify({ start, before, initial })}`);
  }

  await keyTap('1', 'Numpad1', 97, '1');
  const started = await waitFor((state) => state?.snapshot?.skillAction.skillId === 2 &&
    state.snapshot.skillAction.levelSlot === 2 && state.snapshot.skillAction.phase !== 0,
  'skill ID 2 level 2 Numpad1 action starts');
  captures.push({ at: new Date().toISOString(), label: 'skill2-level2-action-started', state: started,
    scene: await internalSceneState() });

  let cleared = null;
  const clearDeadline = Date.now() + 10000;
  while (Date.now() < clearDeadline) {
    const state = await runtime();
    const scene = await internalSceneState();
    if (scene !== null && scene.statusEffects.length === 0 &&
      scene.skillAction.skillId === 2 && scene.skillAction.levelSlot === 2 &&
      scene.skillAction.phase === 3 && scene.skillAction.defenseBoostTicksRemaining === 0 &&
      scene.skillAction.comboPowerBoostTicksRemaining === 0) {
      cleared = { state, scene };
      break;
    }
    await delay(12);
  }
  if (cleared === null) {
    throw new Error(`Skill-2 level-2 did not clear the seeded status and buffs: ${JSON.stringify({
      latest: await runtime(), scene: await internalSceneState(),
    })}`);
  }
  await capture('skill-2 level-2 clears poison and buffs', '02-status-and-buffs-cleared.png');
  await delay(350);
  const after = await capture('post-clear state', '03-post-clear.png');
  const finalScene = await internalSceneState();
  const failures = browserErrors();
  const passed = start.profile === 'max-level' && start.level === 99 && start.mapId === 80 &&
    initial.statusEffects.includes(7) && initial.skillAction.skillId === 2 &&
    initial.skillAction.skillLevelSlotOne === 2 && initial.skillAction.defenseBoostTicksRemaining > 0 &&
    initial.skillAction.comboPowerBoostTicksRemaining > 0 &&
    started.snapshot.skillAction.levelSlot === 2 && started.snapshot.skillAction.phase !== 0 &&
    cleared.state.hp > 0 && cleared.scene.statusEffects.length === 0 &&
    cleared.scene.skillAction.defenseBoostTicksRemaining === 0 &&
    cleared.scene.skillAction.comboPowerBoostTicksRemaining === 0 &&
    after.hp > 0 && finalScene?.statusEffects.length === 0 && failures.length === 0;
  const result = {
    id: 'M1063', attempt, profile: 'max-level', scenario, passed, start, before, initial,
    activationInput: 'Numpad1', started, cleared, after, finalScene, captures, browserErrors: failures,
    route: 'visible New Game -> DEV max-level Map80 scenario with poison, attack-up, and defense-up seeded -> Numpad1 activates skill ID 2 level 2 -> verify all player statuses and buffs clear',
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false,
      originalJarAccessed: false, mapStateSeeded: true },
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1063 skill-2 cleanse criteria failed: ${JSON.stringify({
    start, initial, started, cleared, after, finalScene, failures,
  })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed, mapId: after.mapId,
    level: after.level, skillId: cleared.scene.skillAction.skillId, levelSlot: cleared.scene.skillAction.levelSlot,
    statusBefore: initial.statusEffects, statusAfter: finalScene.statusEffects,
    defenseBefore: initial.skillAction.defenseBoostTicksRemaining,
    defenseAfter: finalScene.skillAction.defenseBoostTicksRemaining,
    attackUpBefore: initial.skillAction.comboPowerBoostTicksRemaining,
    attackUpAfter: finalScene.skillAction.comboPowerBoostTicksRemaining,
    hp: after.hp, browserErrors: failures.length,
    artifacts: `reference/screenshots/web-render/M1063-skill2-level2-cleanse/attempt-${attempt}` })}\n`);
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
  const partial = { id: 'M1063', attempt, profile: 'max-level', scenario, passed: false, captures, events,
    error: error instanceof Error ? error.message : String(error), browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1063', attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state ?? null })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
