#!/usr/bin/env node

/** Compare a visible light attack before and during skill ID 0 level 1's power boost. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1067_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1067 attempt must be from 1 to 3');
}
const scenario = 'map17-class6-skill0-level1-combo';
const outDir = join(root, `reference/screenshots/web-render/M1067-skill0-level1-combo/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1067-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = `http://127.0.0.1:5174/?testProfile=damage-survival&testScenario=${scenario}`;

let chrome;
let ws;
let page;
let stderr = '';
const events = [];
const captures = [];
const attackInputs = [];

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
    const scene = game?.scene?.getScenes(true)?.find((candidate) => candidate?.playerSkillAction !== undefined);
    if (!scene) return null;
    const target = scene.maps?.get(scene.currentMapId)?.enemies?.find((enemy) =>
      enemy.sourceOrder === 2 && enemy.enemyId === 8);
    return {
      playerTile: [scene.actor.x >> 4, scene.actor.y >> 4],
      playerDirection: scene.actor.direction,
      playerHp: scene.hudState.hp,
      playerMaxHp: scene.hudState.maxHp,
      attackPower: scene.equipmentStats?.attack?.power ?? 16,
      skillAction: {
        skillId: scene.playerSkillAction.skillId,
        skillRank: scene.playerSkillAction.skillRank,
        skillLevelSlotOne: scene.playerSkillAction.skillLevelSlotOne,
        skillLevelSlotThree: scene.playerSkillAction.skillLevelSlotThree,
        levelSlot: scene.playerSkillAction.levelSlot,
        phase: scene.playerSkillAction.phase,
        effectAge: scene.playerSkillAction.effectAge,
        comboPowerBoostTicksRemaining: scene.playerSkillAction.comboPowerBoostTicksRemaining,
      },
      combo: { ...scene.playerCombo },
      target: target === undefined ? null : {
        sourceOrder: target.sourceOrder, enemyId: target.enemyId,
        tileX: target.tileX, tileY: target.tileY, hp: target.hp, state: target.state,
        actionDelayTicksRemaining: target.actionDelayTicksRemaining,
      },
    };
  })()`);
}

async function waitFor(predicate, label, timeoutMs = 15000, intervalMs = 16) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtime();
    if (predicate(state)) return state;
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function waitForScene(predicate, label, timeoutMs = 10000, intervalMs = 20) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await internalSceneState();
    if (predicate(state)) return state;
    await delay(intervalMs);
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

async function attackUntilHit(previousHp, label) {
  const attempts = [];
  for (let index = 0; index < 3; index += 1) {
    await waitForScene((scene) => scene?.combo?.activeStyle === null, `${label} player attack idle`);
    await keyTap('5', 'Numpad5', 101, '5');
    attackInputs.push({ label, attempt: index + 1, key: 'Numpad5' });
    try {
      const hit = await waitFor((state) => {
        const target = state?.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8);
        return target !== undefined && target.hp < previousHp;
      }, `${label} damage sample`, 2500, 16);
      attempts.push({ attempt: index + 1, hp: hit.snapshot.enemies.find((enemy) =>
        enemy.sourceOrder === 2 && enemy.enemyId === 8)?.hp });
      return { hit, attempts };
    } catch {
      const afterMiss = await runtime();
      const target = afterMiss?.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8);
      attempts.push({ attempt: index + 1, hp: target?.hp, noHpChange: target?.hp === previousHp });
    }
  }
  throw new Error(`No landed ${label} hit after three safe inputs: ${JSON.stringify(attempts)}`);
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
  const start = await waitFor((state) => {
    const target = state?.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8);
    return state?.mapId === 17 && state.scenario === scenario && state.tileX === 5 && state.tileY === 11 &&
      target?.tileX === 6 && target.tileY === 11 && target.hp === 183 &&
      (target.actionDelayTicksRemaining ?? 0) > 800 && state.snapshot?.skillAction.skillId === 0;
  }, 'Map17 level-1 damage-survival fixture and idle target');
  if (start.profile !== 'damage-survival' || start.level !== 1 || start.hp !== start.snapshot.resources.maxHp ||
    start.snapshot.player.direction !== 4 || start.snapshot.skillAction.skillRank !== 9 ||
    start.snapshot.skillAction.skillLevelSlotThree !== 1 || start.snapshot.skillAction.chargeTicksRemaining[1] !== 0) {
    throw new Error(`Unexpected initial skill-0 combo fixture: ${JSON.stringify(start)}`);
  }
  await capture('map17 baseline start', '01-map17-baseline-start.png');

  const baselineResult = await attackUntilHit(183, 'baseline');
  const baselineTarget = baselineResult.hit.snapshot.enemies.find((enemy) =>
    enemy.sourceOrder === 2 && enemy.enemyId === 8);
  const baselineDamage = 183 - baselineTarget.hp;
  await capture('baseline light hit', '02-baseline-light-hit.png');
  const baselineIdle = await waitForScene((scene) => scene?.combo?.activeStyle === null,
    'baseline attack animation finishes');

  await keyTap('3', 'Numpad3', 99, '3');
  const buffStarted = await waitForScene((scene) => scene?.skillAction?.skillId === 0 &&
    scene.skillAction.levelSlot === 1 && scene.skillAction.comboPowerBoostTicksRemaining > 0,
  'skill ID 0 level 1 activates its combo-power timer');
  const buffReady = await waitForScene((scene) => scene?.skillAction?.comboPowerBoostTicksRemaining > 0 &&
    scene.skillAction.phase === 0 && scene.combo?.activeStyle === null,
  'skill action returns to idle while its boost remains active');
  if (buffReady.skillAction.comboPowerBoostTicksRemaining >= buffStarted.skillAction.comboPowerBoostTicksRemaining) {
    throw new Error('The combo-power timer did not advance during the skill action.');
  }
  await capture('skill-0-level-1 boost active', '03-skill0-level1-boost-active.png');

  const boostedResult = await attackUntilHit(baselineTarget.hp, 'boosted');
  const boostedTarget = boostedResult.hit.snapshot.enemies.find((enemy) =>
    enemy.sourceOrder === 2 && enemy.enemyId === 8);
  const boostedDamage = baselineTarget.hp - boostedTarget.hp;
  const final = await capture('boosted light hit', '04-boosted-light-hit.png');
  const pageErrors = browserErrors();
  const passed = baselineDamage > 0 && boostedDamage > baselineDamage &&
    baselineTarget.state === 'alive' && boostedTarget.state === 'alive' && boostedTarget.hp > 0 &&
    final.state.profile === 'damage-survival' && final.state.level === 1 && final.state.hp > 0 &&
    baselineIdle.attackPower === 16 && buffReady.skillAction.comboPowerBoostTicksRemaining > 0 &&
    pageErrors.length === 0;
  const result = {
    id: 'M1067', attempt, scenario, profile: 'damage-survival', passed,
    start, baseline: { ...baselineResult, target: baselineTarget, damage: baselineDamage,
      attackPower: baselineIdle.attackPower },
    buff: { started: buffStarted, ready: buffReady,
      sourceFormula: 'floor(16 * 3 / 2) = 24 base attack power while the 140-tick timer is positive' },
    boosted: { ...boostedResult, target: boostedTarget, damage: boostedDamage },
    final: final.state, attackInputs, captures, errors: pageErrors,
    route: 'visible New Game -> DEV Map17 fixture with level-1 combat stats and high HP -> Numpad5 baseline -> Numpad3 skill-0 level 1 -> Numpad5 boosted hit',
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Chromium', ownedProcess: true, viewport: [780, 420],
      temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1067 combo-power browser criteria failed: ${JSON.stringify({
    baselineDamage, boostedDamage, baselineTarget, boostedTarget, buffReady, playerHp: final.state.hp, pageErrors,
  })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed, profile: result.profile,
    level: final.state.level, playerHp: final.state.hp, maxHp: final.state.snapshot.resources.maxHp,
    target: { initialHp: 183, afterBaseline: baselineTarget.hp, baselineDamage,
      afterBoost: boostedTarget.hp, boostedDamage },
    attackPower: { baseline: baselineIdle.attackPower, boosted: Math.floor(baselineIdle.attackPower * 3 / 2) },
    boostTicksAtAttack: buffReady.skillAction.comboPowerBoostTicksRemaining,
    browserErrors: pageErrors.length,
    artifacts: `reference/screenshots/web-render/M1067-skill0-level1-combo/attempt-${attempt}` })}\n`);
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
  const partial = { id: 'M1067', attempt, scenario, profile: 'damage-survival', passed: false,
    captures, attackInputs, errors: browserErrors(), error: error instanceof Error ? error.message : String(error),
    browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1067', attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state === undefined ? null : {
      label: captures.at(-1)?.label, mapId: captures.at(-1)?.state?.mapId,
      tile: [captures.at(-1)?.state?.tileX, captures.at(-1)?.state?.tileY],
      skillAction: captures.at(-1)?.state?.snapshot?.skillAction,
    } })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
