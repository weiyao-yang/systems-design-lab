import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { websiteFiles } from './files.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await mkdir(output, { recursive: true });
for (const name of websiteFiles) {
  const target = new URL(name, output);
  await mkdir(new URL('.', target), { recursive: true });
  await copyFile(new URL(name, root), target);
}
console.log(`Built ${websiteFiles.length} static files: ${fileURLToPath(output)}`);
