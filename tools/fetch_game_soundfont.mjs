import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceCommit = '684543d5e5efaef08d02be50dcda8d552478fa60';
const outputDirectory = fileURLToPath(new URL('../web/public/assets/generated/audio/', import.meta.url));
const artifacts = [
  {
    name: 'GeneralUser-GS.sf2',
    url: `https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/${sourceCommit}/GeneralUser-GS.sf2`,
    sha256: '9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe',
  },
  {
    name: 'GeneralUser-GS-LICENSE.txt',
    url: `https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/${sourceCommit}/documentation/LICENSE.txt`,
    sha256: '7b32efefdf95ce38a043799f0659853ddc00fbaa14d8c50f0aca16b9b8b405be',
  },
];

await mkdir(outputDirectory, { recursive: true });
for (const artifact of artifacts) {
  const outputPath = join(outputDirectory, artifact.name);
  let existing;
  try {
    existing = await readFile(outputPath);
  } catch {
    existing = undefined;
  }
  if (existing !== undefined && hash(existing) === artifact.sha256) {
    console.log(`${artifact.name}: already present and verified`);
    continue;
  }

  const response = await fetch(artifact.url);
  if (!response.ok) throw new Error(`Download failed for ${artifact.name}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualHash = hash(bytes);
  if (actualHash !== artifact.sha256) {
    throw new Error(`${artifact.name} SHA-256 mismatch: expected ${artifact.sha256}, got ${actualHash}`);
  }
  await writeFile(outputPath, bytes);
  console.log(`${artifact.name}: downloaded and verified (${bytes.byteLength} bytes)`);
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
