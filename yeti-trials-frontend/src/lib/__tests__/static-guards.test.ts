// Feature: yeti-trials-frontend, static guards (Requirements 1.3, 1.7, 20.5, 20.7, 21.1)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs with the package root as cwd.
const PROJECT = process.cwd();
const SRC = join(PROJECT, 'src');

/** Recursively collect source files, skipping tests and generated artifacts. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'routeTree.gen.ts') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = sourceFiles(SRC);
const read = (f: string) => readFileSync(f, 'utf8');

// Sui package/object ids are 0x + 64 hex; nullifiers/keys are long too. Any
// 0x-hex literal of 16+ nibbles in source is a hard-coded id and is banned.
const HARDCODED_ID = /0x[0-9a-fA-F]{16,}/;
const VITE_BUILTINS = new Set(['MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL']);
const VITE_VARS = [
  'VITE_ORCHESTRATOR_URL',
  'VITE_SUI_NETWORK',
  'VITE_SUI_RPC_URL',
  'VITE_ENABLE_3D',
  'VITE_ENABLE_POST_FX',
  'VITE_DEMO_MODE',
  'VITE_ENABLE_ZKLOGIN',
] as const;

describe('Static guards', () => {
  it('contains no hard-coded Sui package/object ids in source (1.3, 1.7, 21.1)', () => {
    const offenders = FILES.filter((f) => HARDCODED_ID.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('uses only VITE_-prefixed env and never NEXT_PUBLIC_ (20.7)', () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src.includes('NEXT_PUBLIC_')).toBe(false);
      for (const m of src.matchAll(/import\.meta\.env\.([A-Za-z0-9_]+)/g)) {
        const name = m[1];
        if (name === undefined) continue;
        expect(name.startsWith('VITE_') || VITE_BUILTINS.has(name)).toBe(true);
      }
    }
  });

  it('ships a .env.example with every VITE_ var and no NEXT_PUBLIC_ (20.5, 20.7)', () => {
    const example = read(join(PROJECT, '.env.example'));
    for (const v of VITE_VARS) expect(example).toContain(v);
    expect(example.includes('NEXT_PUBLIC_')).toBe(false);
  });

  it('commits no obvious secret values in .env.example (20.5)', () => {
    for (const line of read(join(PROJECT, '.env.example')).split('\n')) {
      if (line.trimStart().startsWith('#') || !line.includes('=')) continue;
      const value = line.slice(line.indexOf('=') + 1).trim();
      // Only documented defaults (urls / networks / false) may carry a value.
      if (value === '') continue;
      expect(/^(https?:\/\/|localnet|testnet|true|false)/.test(value)).toBe(true);
    }
  });
});
