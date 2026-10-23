import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const candidates = [
  fileURLToPath(new URL('../node_modules/spessasynth_lib/dist/spessasynth_processor.min.js', import.meta.url)),
  fileURLToPath(new URL('../web/node_modules/spessasynth_lib/dist/spessasynth_processor.min.js', import.meta.url)),
];
const destinationDirectory = fileURLToPath(new URL('../web/public/assets/generated/vendor/', import.meta.url));
await mkdir(destinationDirectory, { recursive: true });
let source;
for (const candidate of candidates) {
  try {
    await copyFile(candidate, join(destinationDirectory, 'spessasynth_processor.min.js'));
    source = candidate;
    break;
  } catch {
    // Try the workspace-local node_modules location if npm did not hoist the package.
  }
}
if (source === undefined) throw new Error('Could not find the SpessaSynth AudioWorklet processor.');
console.log(`Prepared AudioWorklet processor from ${source}`);
