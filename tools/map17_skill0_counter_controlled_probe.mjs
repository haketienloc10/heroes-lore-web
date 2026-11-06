#!/usr/bin/env node

/** Observe the skill-0 level-2 counter effect against a delayed live Map17 attack. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1077_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1077 attempt must be from 1 to 3');
}
const outputDir = join(root,
  `reference/screenshots/web-render/M1077-map17-skill0-counter-controlled/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1077-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const startUrl = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=damage-survival&testScenario=map17-class6-skill0-level2-counter-controlled';
const parsedUrl = new URL(startUrl);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'damage-survival' ||
  parsedUrl.searchParams.get('testScenario') !== 'map17-class6-skill0-level2-counter-controlled') {
  throw new Error('M1077 requires the local DEV damage-survival Map17 counter preview');
}

let chrome;
let socket;
let page;
let chromeStderr = '';
let lastRuntime = null;
let resultWritten = false;
const events = [];
const captures = [];
const bossSamples = [];

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
      } else if ([
        'Runtime.exceptionThrown', 'Network.loadingFailed', 'Runtime.consoleAPICalled', 'Log.entryAdded',
      ].includes(message.method)) {
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
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
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
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolvePromise, rejectPromise) => {
          socket.addEventListener('open', resolvePromise, { once: true });
          socket.addEventListener('error', rejectPromise, { once: true });
        });
        page = new CdpPage(socket);
        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('Network.enable');
        await page.send('Log.enable');
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
    `--user-data-dir=${profileDir}`, '--window-size=780,420', startUrl,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', (chunk) => { chromeStderr += chunk; });
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
  const deadlineCanvas = Date.now() + 30000;
  while (Date.now() < deadlineCanvas) {
    if (await page.evaluate("document.readyState === 'complete' && document.querySelector('#game canvas') !== null")) break;
    await delay(50);
  }
  await delay(1000);
  await page.send('Page.bringToFront');
}

async function runtime() {
  const value = await page.evaluate(`(() => {
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
      mapPreviewReady: host.dataset.testMapPreviewReady === 'true',
      snapshot,
    };
  })()`);
  lastRuntime = value ?? null;
  return lastRuntime;
}

async function waitFor(predicate, label, timeoutMs = 15000, intervalMs = 15) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtime();
    if (predicate(state)) return state;
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function keyTap(key, code, vk, textValue) {
  const params = { key, code, windowsVirtualKeyCode: vk };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  if (textValue !== undefined) await page.send('Input.dispatchKeyEvent', { type: 'char', text: textValue, ...params });
  await delay(90);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(180);
}

function counterTargetFrom(state) {
  return state?.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8);
}

async function saveScreenshot(label, filename) {
  const image = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const bytes = Buffer.from(image.data, 'base64');
  await writeFile(join(outputDir, filename), bytes);
  const record = {
    label,
    file: filename,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.byteLength,
  };
  captures.push(record);
  return record;
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  await launch();
  const title = await runtime();
  await saveScreenshot('fresh-title', '00-title-screen.png');
  const presses = [
    ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40], ['Enter', 'Enter', 13], ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13], ['ArrowRight', 'ArrowRight', 39], ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of presses) await keyTap(key, code, vk);
  const start = await waitFor((state) => state?.mapId === 17 &&
    state.scenario === 'map17-class6-skill0-level2-counter-controlled' && state.mapPreviewReady &&
    state.snapshot?.format === 'heroes-lore-campaign-test-runtime-v9' && counterTargetFrom(state)?.hp > 0,
  'Map17 preview and source enemy 8/order 2');
  await saveScreenshot('map17-counter-preview-start', '01-map17-preview-start.png');
  const startTarget = counterTargetFrom(start);
  if (start.profile !== 'damage-survival' || start.level !== 1 || start.hp !== start.snapshot.resources.maxHp ||
    start.tileX !== 5 || start.tileY !== 11 || startTarget?.sourceAu !== false ||
    startTarget?.renderSpriteId !== 8 || startTarget.state !== 'alive' || startTarget.hp !== 183 ||
    (startTarget.attackCooldownTicksRemaining ?? 0) <= 0 || startTarget.animationDirection !== 3 ||
    start.snapshot.skillAction.skillId !== 0 || start.snapshot.skillAction.skillRank !== 20 ||
    start.snapshot.skillAction.skillLevelSlotOne !== 2 || start.snapshot.skillAction.chargeTicksRemaining[2] !== 0) {
    throw new Error(`Unexpected controlled Map17 counter preview: ${JSON.stringify({ start, startTarget })}`);
  }
  await keyTap('1', 'Numpad1', 97, '1');
  const active = await waitFor((state) => state?.snapshot?.skillAction?.skillId === 0 &&
    state.snapshot.skillAction.phase === 3 && state.snapshot.skillAction.levelSlot === 2 &&
    state.snapshot.skillAction.effectAge >= 1,
  'skill ID 0 level-2 counter window');
  await saveScreenshot('skill0-counter-active', '02-counter-active.png');
  const observationStartedAt = Date.now();
  let finalState = active;
  let hitState = null;
  let hitCaptureSaved = false;
  while (Date.now() - observationStartedAt < 10000 && hitState === null) {
    const state = await runtime();
    const enemy = counterTargetFrom(state);
    if (enemy !== undefined) {
      bossSamples.push({
        atMs: Date.now() - observationStartedAt,
        state: enemy.state,
        mapId: state.mapId,
        playerHp: state.hp,
        enemyId: enemy.enemyId,
        hp: enemy.hp,
        tileX: enemy.tileX,
        tileY: enemy.tileY,
        behaviorType: enemy.behaviorType,
        animationStateIndex: enemy.animationStateIndex,
        sourceAu: enemy.sourceAu,
        renderSpriteId: enemy.renderSpriteId,
        renderAnimationStateIndex: enemy.renderAnimationStateIndex,
        animationDirection: enemy.animationDirection,
        animationFrameIndex: enemy.animationFrameIndex,
        attackCooldownTicksRemaining: enemy.attackCooldownTicksRemaining,
        actionDelayTicksRemaining: enemy.actionDelayTicksRemaining,
        attackHitResolved: enemy.attackHitResolved,
        skillPhase: state.snapshot.skillAction.phase,
        skillLevelSlot: state.snapshot.skillAction.levelSlot,
        skillEffectAge: state.snapshot.skillAction.effectAge,
      });
      if (enemy.hp < startTarget.hp) {
        hitState = state;
        if (!hitCaptureSaved) {
          await saveScreenshot('counter-damage-observed', '03-counter-damage-observed.png');
          hitCaptureSaved = true;
        }
      }
    }
    finalState = state;
    await delay(40);
  }
  await saveScreenshot('counter-observation-end', '04-counter-observation-end.png');
  const pageErrors = events.filter((event) => event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const renderSlots = [...new Set(bossSamples.map((sample) => sample.renderAnimationStateIndex))];
  const playerHpTrail = [...new Set(bossSamples.map((sample) => sample.playerHp))];
  const minPlayerHp = Math.min(start.hp, active.hp, ...bossSamples.map((sample) => sample.playerHp));
  const hpLossObserved = minPlayerHp < start.hp;
  const attackSamples = bossSamples.filter((sample) => sample.renderAnimationStateIndex === 2);
  const attackTransitions = bossSamples.reduce((count, sample, index) => {
    const wasAttacking = index > 0 && bossSamples[index - 1].renderAnimationStateIndex === 2;
    return count + (sample.renderAnimationStateIndex === 2 && !wasAttacking ? 1 : 0);
  }, 0);
  const tileTrail = [...new Set(bossSamples.map((sample) => `${sample.tileX},${sample.tileY}`))];
  const finalTarget = counterTargetFrom(finalState);
  const counterDamage = startTarget.hp - (finalTarget?.hp ?? startTarget.hp);
  const projectileHitSamples = bossSamples.filter((sample) => sample.attackHitResolved === true);
  const passed = start.profile === 'damage-survival' && start.level === 1 &&
    start.hp === start.snapshot.resources.maxHp && startTarget.behaviorType === 3 &&
    startTarget.sourceAu === false && startTarget.renderSpriteId === 8 &&
    active.snapshot.skillAction.phase === 3 && active.snapshot.skillAction.levelSlot === 2 &&
    attackSamples.length >= 1 && attackTransitions >= 1 && projectileHitSamples.length >= 1 &&
    hitState?.mapId === 17 && counterDamage === 84 && finalTarget?.state === 'alive' &&
    hpLossObserved && finalState?.level === 1 && finalState.hp > 0 && pageErrors.length === 0;
  const result = {
    id: 'M1077', attempt, passed,
    profile: 'damage-survival', scenario: 'map17-class6-skill0-level2-counter-controlled',
    route: 'visible New Game UI -> DEV level-1 damage-survival Map17 fixture -> Numpad1 activates skill 0 level 2 -> observe source enemy 8/order 2 attack and counter damage',
    title, start, startTarget, active, hitState, finalState,
    bossSamples, renderSlots, attackSamples: attackSamples.length, attackTransitions, tileTrail,
    projectileHitSamples: projectileHitSamples.length, counterDamage,
    playerHpTrail, minPlayerHp, hpLossObserved,
    captures, browserErrors: pageErrors,
    restrictions: {
      saveFilesAccessed: false,
      browserStorageRead: false,
      gameSaveActionUsed: false,
      originalJarAccessed: false,
    mapStateSeeded: true,
    },
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  resultWritten = true;
  if (!passed) throw new Error(`M1077 counter observation incomplete: ${JSON.stringify({
    start: { mapId: start?.mapId, tile: [start?.tileX, start?.tileY], level: start?.level, target: startTarget },
    active: { phase: active?.snapshot?.skillAction?.phase, slot: active?.snapshot?.skillAction?.levelSlot },
    final: { mapId: finalState?.mapId, hp: finalState?.hp, target: finalTarget },
    renderSlots, attackSamples: attackSamples.length, attackTransitions, tileTrail,
    projectileHitSamples: projectileHitSamples.length, counterDamage,
    playerHpTrail, minPlayerHp, hpLossObserved,
    browserErrors: pageErrors.length,
  })}`);
  process.stdout.write(`${JSON.stringify({
    id: 'M1077', attempt, passed, mapId: finalState.mapId, level: finalState.level,
    hp: finalState.hp, maxHp: finalState.snapshot.resources.maxHp,
    target: { sourceOrder: 2, enemyId: 8, state: finalTarget?.state, hp: finalTarget?.hp },
    sampleCount: bossSamples.length, renderSlots, attackSamples: attackSamples.length,
    attackTransitions, tileTrail, projectileHitSamples: projectileHitSamples.length,
    counterDamage, playerHpTrail, minPlayerHp, hpLossObserved, browserErrors: pageErrors.length,
    artifacts: `reference/screenshots/web-render/M1077-map17-skill0-counter-controlled/attempt-${attempt}`,
  })}\n`);
}

async function cleanup() {
  try { socket?.close(); } catch {}
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
  await mkdir(outputDir, { recursive: true });
  const partial = {
    id: 'M1077', attempt, passed: false,
    error: error instanceof Error ? error.message : String(error),
    bossSamples, captures, lastRuntime,
    browser: { stderr: chromeStderr.slice(-3000) },
    restrictions: {
      saveFilesAccessed: false,
      browserStorageRead: false,
      gameSaveActionUsed: false,
      originalJarAccessed: false,
      mapStateSeeded: true,
    },
  };
  await writeFile(join(outputDir, resultWritten ? 'probe-error.json' : 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1077', attempt, passed: false, error: partial.error })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
