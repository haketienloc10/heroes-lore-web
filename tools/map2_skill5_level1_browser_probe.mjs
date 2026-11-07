#!/usr/bin/env node

/** Verify skill ID 5 level 1 gameplay and its extracted effect stream in Chromium. */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1134_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1134 attempt must be from 1 through 3');
}
const scenario = 'map2-class6-skill5-level1';
const outputDir = join(root, `reference/screenshots/web-render/M1134-skill5-level1/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1134-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = process.env.HEROES_LORE_URL ??
  `http://127.0.0.1:5174/?testProfile=max-level&testScenario=${scenario}`;
const parsedUrl = new URL(url);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'max-level' ||
  parsedUrl.searchParams.get('testScenario') !== scenario) {
  throw new Error('M1134 requires the local DEV max-level Map2 skill-5 level-1 scenario');
}

let chrome;
let ws;
let page;
let stderr = '';
const errors = [];
const observations = [];
const latestLiveSamples = [];

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
        errors.push({ method: message.method, params: message.params ?? {} });
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
      expression, returnByValue: true, awaitPromise: true,
    });
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text ?? 'CDP evaluate failed');
    return result.result?.value ?? null;
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
        for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable']) {
          await page.send(method);
        }
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
      const [value] = (await (await import('node:fs/promises')).readFile(portFile, 'utf8')).trim().split('\n');
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
  await delay(500);
  await page.send('Page.bringToFront');
}

async function runtime() {
  return page.evaluate(`(() => {
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

async function liveSkillVisuals() {
  return page.evaluate(`(() => {
    const game = window.__heroesLoreDebugGame;
    const world = game?.scene.getScenes(true).find((scene) => scene.sys.settings.key === 'WorldScene');
    const map = world?.maps?.get(world.currentMapId);
    if (!world || !map) return { worldFound: Boolean(world), mapFound: Boolean(map) };
    const source = world.playerSkillEffects?.effects?.find((effect) =>
      effect.skillId === 5 && effect.levelSlot === 1) ?? null;
    const visuals = (map.playerSkillVisuals ?? []).map((visual) => {
      const sprite = map.playerSkillVisualSprites.get(visual.id);
      const sourceComponents = source?.frames?.[visual.frameIndex] ?? [];
      const renderedComponents = sprite?.list?.map((image) => ({
        textureKey: image.texture?.key ?? null,
        x: image.x,
        y: image.y,
        visible: image.visible,
      })) ?? [];
      return {
        id: visual.id,
        frameIndex: visual.frameIndex,
        effectType: visual.effectType,
        skillId: visual.skillId,
        levelSlot: visual.levelSlot,
        tileX: visual.tileX,
        tileY: visual.tileY,
        sourceResource: source?.sourceResource ?? null,
        sourceComponents,
        renderedComponents,
      };
    });
    return {
      worldFound: true,
      mapFound: true,
      currentMapId: world.currentMapId,
      skillAction: {
        skillId: world.playerSkillAction.skillId,
        phase: world.playerSkillAction.phase,
        levelSlot: world.playerSkillAction.levelSlot,
        effectAge: world.playerSkillAction.effectAge,
      },
      source: source === null ? null : {
        sourceResource: source.sourceResource,
        frameCount: source.frameCount,
      },
      visuals,
    };
  })()`);
}

async function waitFor(predicate, label, timeoutMs = 15000, intervalMs = 20) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtime();
    if (predicate(state)) {
      observations.push({ at: new Date().toISOString(), label, state });
      return state;
    }
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function keyTap(key, code, virtualKey, textValue) {
  const params = { key, code, windowsVirtualKeyCode: virtualKey };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  if (textValue !== undefined) await page.send('Input.dispatchKeyEvent', { type: 'char', text: textValue, ...params });
  await delay(45);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(25);
}

async function capture(label, filename) {
  const state = await runtime();
  const image = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(join(outputDir, filename), Buffer.from(image.data, 'base64'));
  const observation = { at: new Date().toISOString(), label, filename, state };
  observations.push(observation);
  return observation;
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  await launch();
  await capture('title screen before New Game', '00-title.png');
  for (const [key, code, vk] of [
    ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40], ['Enter', 'Enter', 13], ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13], ['ArrowRight', 'ArrowRight', 39], ['Enter', 'Enter', 13],
  ]) await keyTap(key, code, vk);

  const start = await waitFor((state) => {
    const target = state?.snapshot?.enemies?.find((enemy) => enemy.sourceOrder === 11 && enemy.enemyId === 10);
    const skill = state?.snapshot?.skillAction;
    return state?.mapId === 2 && state.scenario === scenario && state.profile === 'max-level' &&
      state.level === 99 && state.tileX === 8 && state.tileY === 27 && skill?.skillId === 5 &&
      skill.skillRank === 20 && skill.skillLevelSlotOne === 0 && skill.skillLevelSlotThree === 1 &&
      skill.chargeTicksRemaining?.[1] === 0 && skill.phase === 0 && target?.tileX === 9 &&
      target.tileY === 27 && target.hp === 300;
  }, 'visible New Game reaches the Map2 max-level skill-5 state');
  const initialTarget = start.snapshot.enemies.find((enemy) => enemy.sourceOrder === 11 && enemy.enemyId === 10);
  if (start.hp !== start.snapshot.resources.maxHp) {
    throw new Error(`Unexpected level-1 skill fixture: ${JSON.stringify({ start, initialTarget })}`);
  }
  await delay(500);
  await capture('rank-20 skill-5 defaults level 1 to action button 3', '01-ready.png');

  await keyTap('3', 'Digit3', 51, '3');
  const started = await waitFor((state) => state?.snapshot?.skillAction.skillId === 5 &&
    state.snapshot.skillAction.levelSlot === 1 && state.snapshot.skillAction.phase !== 0,
  'visible Numpad3 starts skill-5 level 1');
  observations.push({ at: new Date().toISOString(), label: 'skill-5 level-1 action started', state: started });

  const visualDeadline = Date.now() + 12000;
  let visualObservation = null;
  let poll = 0;
  while (Date.now() < visualDeadline) {
    const live = await liveSkillVisuals();
    const visuals = live?.visuals ?? [];
    if (poll++ % 5 === 0) {
      latestLiveSamples.push({ at: new Date().toISOString(), ...live });
      if (latestLiveSamples.length > 12) latestLiveSamples.shift();
    }
    const matched = visuals.find((visual) => visual.effectType === 9 && visual.skillId === 5 &&
      visual.levelSlot === 1 && visual.sourceResource === 'grd/spr/5_1.eif' &&
      visual.sourceComponents.length > 0 && visual.renderedComponents.length === visual.sourceComponents.length &&
      visual.renderedComponents.every((rendered, index) => rendered.textureKey ===
        `world-player-skill-atlas-gr-${visual.sourceComponents[index].imageIndex}` &&
        rendered.x === visual.sourceComponents[index].offsetX &&
        rendered.y === visual.sourceComponents[index].offsetY && rendered.visible));
    if (matched !== undefined) {
      const state = await runtime();
      const image = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      await writeFile(join(outputDir, '02-skill5-level1-effect.png'), Buffer.from(image.data, 'base64'));
      visualObservation = { at: new Date().toISOString(), state, visual: matched,
        screenshot: '02-skill5-level1-effect.png' };
      observations.push({ ...visualObservation, label: 'rendered type-9 skill-5 level-1 effect matches source components' });
      break;
    }
    await delay(12);
  }
  if (visualObservation === null) throw new Error(`No rendered type-9 skill-5 level-1 effect matched the source stream: ${JSON.stringify(latestLiveSamples.at(-1))}`);

  const hit = await waitFor((state) => {
    const target = state?.snapshot?.enemies?.find((enemy) => enemy.sourceOrder === 11 && enemy.enemyId === 10);
    return target !== undefined && (target.hp < 300 || target.state === 'death-pending');
  }, 'source-random skill-5 level-1 cell reaches element-3 target', 12000);
  await capture('element-3 target receives level-1 damage', '03-target-hit.png');
  const target = hit.snapshot.enemies.find((enemy) => enemy.sourceOrder === 11 && enemy.enemyId === 10);
  const pageErrors = errors.filter((event) => event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const passed = started.snapshot.skillAction.levelSlot === 1 && started.snapshot.skillAction.phase !== 0 &&
    visualObservation.visual.sourceResource === 'grd/spr/5_1.eif' &&
    target !== undefined && (target.hp < 300 || target.state === 'death-pending') &&
    hit.level === 99 && hit.hp > 0 && pageErrors.length === 0;
  const result = {
    id: 'M1134', attempt, passed, scenario, profile: 'max-level', start, started,
    visualObservation, hit, target, observations, errors: pageErrors,
    route: 'visible New Game -> DEV Map2 level-99 state -> visible Numpad3 activates skill ID 5 level 1 -> extracted type-9 effect renders and a source-random cell hits element-3 enemy 10/order 11',
    browser: { product: 'Chromium', viewport: [780, 420], processOwned: true,
      isolatedContext: true, temporaryProfileDeleted: true },
    restrictions: { saveFilesAccessed: false, browserStorageRead: false,
      gameSaveActionUsed: false, originalJarAccessed: false },
  };
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1134 skill level-1 verification criteria failed: ${JSON.stringify({
    start: { level: start.level, hp: start.hp, maxHp: start.snapshot.resources.maxHp },
    started: started.snapshot.skillAction, visual: visualObservation.visual, target, pageErrors,
  })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed,
    skill: { id: 5, rank: started.snapshot.skillAction.skillRank,
      levelSlot: started.snapshot.skillAction.levelSlot, actionButton: 3,
      phase: started.snapshot.skillAction.phase },
    visual: { sourceResource: visualObservation.visual.sourceResource,
      frameIndex: visualObservation.visual.frameIndex,
      sourceComponents: visualObservation.visual.sourceComponents.length,
      renderedComponents: visualObservation.visual.renderedComponents.length },
    target: { enemyId: target.enemyId, sourceOrder: target.sourceOrder, hp: target.hp, state: target.state },
    player: { level: hit.level, hp: hit.hp, maxHp: hit.snapshot.resources.maxHp },
    browserErrors: pageErrors.length,
    artifacts: `reference/screenshots/web-render/M1134-skill5-level1/attempt-${attempt}` })}\n`);
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
  const partial = { id: 'M1134', attempt, passed: false, scenario,
    error: error instanceof Error ? error.message : String(error), observations, latestLiveSamples, errors,
    browser: { product: 'Chromium', processOwned: true, stderr: stderr.slice(-3000) },
    restrictions: { saveFilesAccessed: false, browserStorageRead: false,
      gameSaveActionUsed: false, originalJarAccessed: false } };
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1134', attempt, passed: false,
    error: partial.error, lastObservation: observations.at(-1)?.label ?? null })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
