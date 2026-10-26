#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
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

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(generatedRoot, relativePath), 'utf8'));
}

async function exists(relativePath) {
  try {
    await access(path.join(generatedRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

try {
  const [appearance, spriteData, equipmentData] = await Promise.all([
    vite.ssrLoadModule('/src/world/hero-sprite-appearance.ts'),
    vite.ssrLoadModule('/src/world/character-sprites.ts'),
    vite.ssrLoadModule('/src/world/equipment-data.ts'),
  ]);
  const catalog = equipmentData.parseEquipmentDataTable(await readJson('equipment-data/catalog.json'));
  const layoutNames = ['a', 'b', 'e', 'hA', 'hB', 'w'];
  const layouts = new Map(await Promise.all(layoutNames.map(async (name) => [
    name,
    spriteData.parseCharacterSpriteLayout(await readJson(`character-layouts/1/${name}.json`)),
  ])));
  const checkedLayoutFolders = new Set();
  const checkedImagePaths = new Set();
  const missing = new Map();

  async function checkLayoutFolder(layoutName, componentSlot, atlasFolder, selection) {
    const layout = layouts.get(layoutName);
    if (layout === undefined) {
      missing.set(`character-layouts/1/${layoutName}.json`, {
        file: `character-layouts/1/${layoutName}.json`,
        reason: 'missing character layout',
        selections: [selection],
      });
      return;
    }
    const folderKey = `${layoutName}:${componentSlot}:${atlasFolder}`;
    checkedLayoutFolders.add(folderKey);
    const imageIndices = new Set(layout.records
      .filter((record) => record.componentSlot === componentSlot)
      .flatMap((record) => record.frames.flatMap((frame) => frame
        .map((part) => part.imageIndex)
        .filter((imageIndex) => imageIndex !== 255))));
    for (const imageIndex of imageIndices) {
      const relativePath = `atlases/c1/i/${atlasFolder}/${String(imageIndex).padStart(3, '0')}.png`;
      checkedImagePaths.add(relativePath);
      if (await exists(relativePath)) continue;
      const current = missing.get(relativePath);
      if (current === undefined) {
        missing.set(relativePath, {
          file: relativePath,
          layout: layoutName,
          componentSlot,
          imageIndex,
          selections: [selection],
        });
      } else if (!current.selections.includes(selection)) {
        current.selections.push(selection);
      }
    }
  }

  const bodyLayout = layouts.get('b');
  await checkLayoutFolder('b', 0, 'b', 'class-6 body');

  for (const armor of catalog.categories[3]) {
    const atlas = appearance.heroArmorAtlas(6, armor.itemId);
    if (atlas === null) continue;
    for (let componentSlot = 2; componentSlot <= 5; componentSlot += 1) {
      await checkLayoutFolder('a', componentSlot, `a${atlas}`, `armor item ${armor.itemId}`);
    }
  }

  let headSelectionCount = 0;
  for (const head of catalog.categories[6]) {
    const atlas = appearance.heroHeadAtlas(head.itemId);
    if (atlas === null) continue;
    headSelectionCount += 1;
    await checkLayoutFolder(
      appearance.heroHeadLayout(head.itemId),
      1,
      `h${atlas}`,
      `helmet item ${head.itemId}`,
    );
  }

  let weaponSelectionCount = 0;
  for (const weaponCategory of catalog.categories.slice(0, 3)) {
    for (const weapon of weaponCategory) {
      const atlas = appearance.heroWeaponAtlas(6, weapon.itemId);
      if (atlas === null) continue;
      weaponSelectionCount += 1;
      for (const element of [0, 1, 2, 3]) {
        const folder = appearance.heroWeaponAtlasFolder(atlas, element);
        await checkLayoutFolder('w', 6, folder,
          `weapon category ${weapon.category} item ${weapon.itemId}, element ${element}`);
      }
    }
  }

  for (const element of [0, 1, 2, 3]) {
    await checkLayoutFolder(
      'e',
      7,
      appearance.heroEffectAtlasFolder(element),
      `class-6 effect element ${element}`,
    );
  }

  const unavailableResourceClasses = [];
  for (const resourceClass of [2, 3]) {
    const hasLayoutBundle = await exists(`character-layouts/${resourceClass}/a.json`);
    const hasAtlasDirectory = await exists(`atlases/c${resourceClass}/i/b/000.png`);
    if (!hasLayoutBundle || !hasAtlasDirectory) {
      unavailableResourceClasses.push({
        resourceClass,
        hasLayoutBundle,
        hasAtlasDirectory,
      });
    }
  }

  const report = {
    classChecked: 6,
    bodyLayoutRecords: bodyLayout?.records.length ?? 0,
    armorItemsChecked: catalog.categories[3].length,
    helmetItemsChecked: headSelectionCount,
    weaponSelectionsChecked: weaponSelectionCount,
    layoutFolderCombinationsChecked: checkedLayoutFolders.size,
    uniqueAtlasImagesChecked: checkedImagePaths.size,
    missing: [...missing.values()],
    unavailableResourceClasses,
    scope: 'Current class-6 body/equipment/effect layouts against generated atlas images; class-7/8 resource bundles are reported separately and are not covered.',
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.missing.length > 0) process.exitCode = 1;
} finally {
  await vite.close();
}
