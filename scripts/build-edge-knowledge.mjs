#!/usr/bin/env node
/**
 * Reads the three knowledge/*.md files and writes knowledge-inline.ts
 * so the Supabase edge function can import them as string constants
 * without relying on Deno.readTextFile at runtime (which fails after bundling).
 *
 * Run before every `supabase functions deploy ai-chat`:
 *   node scripts/build-edge-knowledge.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const knowledgeDir = resolve(root, 'supabase/functions/ai-chat/knowledge');
const outFile = resolve(root, 'supabase/functions/ai-chat/knowledge-inline.ts');

function readMd(filename) {
  return readFileSync(resolve(knowledgeDir, filename), 'utf8');
}

const fish = readMd('fish-aquaculture.md');
const poultry = readMd('poultry.md');
const rabbits = readMd('rabbits.md');

// Use JSON.stringify so any backtick characters in the source are safely escaped.
const out = `// AUTO-GENERATED — do not edit directly.
// Source: supabase/functions/ai-chat/knowledge/*.md
// Regenerate: node scripts/build-edge-knowledge.mjs
export const FISH_KNOWLEDGE: string = ${JSON.stringify(fish)};
export const POULTRY_KNOWLEDGE: string = ${JSON.stringify(poultry)};
export const RABBIT_KNOWLEDGE: string = ${JSON.stringify(rabbits)};
`;

writeFileSync(outFile, out, 'utf8');
console.log(`✓ knowledge-inline.ts written (${out.length} bytes)`);
