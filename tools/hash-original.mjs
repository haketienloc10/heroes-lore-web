import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const target = process.argv[2] ?? 'original/heroes-lore-v2.1.2.jar';
const resolved = path.resolve(target);
const hash = createHash('sha256');

try {
  for await (const chunk of createReadStream(resolved)) hash.update(chunk);
  const digest = hash.digest('hex');
  const output = path.resolve('original/SHA256.txt');
  await writeFile(output, `${digest}  ${path.basename(resolved)}\n`, 'utf8');
  console.log(`SHA-256: ${digest}`);
  console.log(`Đã lưu vào ${output}`);
} catch (error) {
  console.error(`Không thể tính SHA-256 cho ${target}: ${error.message}`);
  process.exitCode = 1;
}
