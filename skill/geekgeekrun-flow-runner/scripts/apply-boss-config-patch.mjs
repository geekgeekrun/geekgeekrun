import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function deepMerge(target, patch) {
  if (Array.isArray(patch)) {
    return patch.slice();
  }
  if (!patch || typeof patch !== 'object') {
    return patch;
  }
  const base = target && typeof target === 'object' && !Array.isArray(target)
    ? { ...target }
    : {};
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      base[key] = deepMerge(base[key], value);
    } else {
      base[key] = deepMerge(undefined, value);
    }
  }
  return base;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (current === '--json') {
      out.json = argv[++i];
    } else if (current === '--file') {
      out.file = argv[++i];
    }
  }
  return out;
}

function getPatch(args) {
  if (args.json) {
    return JSON.parse(args.json);
  }
  if (args.file) {
    return JSON.parse(fs.readFileSync(path.resolve(args.file), 'utf8'));
  }
  throw new Error('provide --json or --file');
}

const args = parseArgs(process.argv.slice(2));
const patch = getPatch(args);
const configPath = path.join(os.homedir(), '.geekgeekrun', 'config', 'boss.json');

if (!fs.existsSync(configPath)) {
  throw new Error(`boss config not found: ${configPath}`);
}

const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const merged = deepMerge(current, patch);
fs.writeFileSync(configPath, JSON.stringify(merged));

console.log(JSON.stringify({
  success: true,
  configPath,
  appliedKeys: Object.keys(patch)
}, null, 2));
