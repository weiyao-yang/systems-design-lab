import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { websiteFiles } from './files.mjs';

const root = new URL('../', import.meta.url);
const manifest = new Set(websiteFiles);
const failures = [];
for (const name of websiteFiles) {
  const file = new URL(name, root);
  try { await access(file); } catch { failures.push(`Missing website file: ${name}`); continue; }
  if (name.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(file)], { encoding: 'utf8' });
    if (result.status !== 0) failures.push(result.stderr || `Syntax check failed: ${name}`);
  }
  if (!/\.(html|css|js)$/.test(name)) continue;
  const text = await readFile(file, 'utf8');
  if (/(?:[A-Za-z]:[\\/]Users[\\/]|file:\/\/(?:\/[A-Za-z]:|\/Users\/|\/home\/))/i.test(text)) failures.push(`Machine-specific path found: ${name}`);
  const patterns = name.endsWith('.html')
    ? [/\b(?:src|href)=["']([^"']+)["']/g]
    : name.endsWith('.js')
      ? [/\bfrom\s*["'](\.[^"']+)["']/g]
      : [/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/g];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(value)) continue;
    if (value.startsWith('/')) { failures.push(`Root-absolute asset path breaks project Pages URLs: ${name}: ${value}`); continue; }
    const target = new URL(value, file);
    target.search = ''; target.hash = '';
    const assetPath = relative(fileURLToPath(root), fileURLToPath(target)).replaceAll('\\', '/');
    if (assetPath && !manifest.has(assetPath)) failures.push(`Asset not listed in scripts/files.mjs: ${name}: ${assetPath}`);
    try { await access(target); } catch { failures.push(`Missing local asset: ${name}: ${value}`); }
  }
}
if (failures.length) {
  console.error(failures.join('\n')); process.exitCode = 1;
} else {
  console.log('PASS: syntax, local assets, portable paths, and GitHub Pages project-path compatibility.');
}
