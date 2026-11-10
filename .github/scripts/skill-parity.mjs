#!/usr/bin/env node
// CI: `.qoder/skills/` is the canonical home for skills shared across the
// cavalry-mcp / stallion / refclone stack. This repo owns the canonical copies;
// sibling repos keep local copies and compare them against this checkout when
// one is available (CAVALRY_MCP_PATH / CAVALRY_MCP_DIR / sibling path). Here we
// validate the canonical shape and, if a mirror exists, compare it byte-for-byte.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SOURCE = path.join(ROOT, '.qoder', 'skills');
const MIRROR = path.join(ROOT, '.agents', 'skills');
let failures = 0;

const names = (await fs.readdir(SOURCE, { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();
if (names.length === 0) {
  console.error('skill-parity: no canonical skills found, which is not expected.');
  process.exit(1);
}
for (const name of names) {
  try {
    await fs.access(path.join(SOURCE, name, 'SKILL.md'));
  } catch {
    failures++;
    console.error(`skill-parity: canonical skill ${name} has no SKILL.md.`);
  }
}

let mirrored = 0;
try {
  const entries = await fs.readdir(MIRROR, { withFileTypes: true });
  const mirroredNames = new Set(entries.filter(entry => entry.isDirectory()).map(entry => entry.name));
  for (const name of names) {
    if (!mirroredNames.has(name)) continue;
    try {
      const [canonicalText, mirrorText] = await Promise.all([
        fs.readFile(path.join(SOURCE, name, 'SKILL.md'), 'utf8'),
        fs.readFile(path.join(MIRROR, name, 'SKILL.md'), 'utf8')
      ]);
      if (canonicalText !== mirrorText) {
        failures++;
        console.error(`skill-parity: .agents/skills/${name}/SKILL.md differs from the canonical copy.`);
      } else {
        mirrored++;
      }
    } catch (error) {
      failures++;
      console.error(`skill-parity: .agents/skills/${name}/SKILL.md is unreadable (${error.code ?? error.message}).`);
    }
  }
} catch {
  // No mirror in this repo; the canonical copies are still checked above.
}

if (failures === 0) {
  console.log(`skill-parity: ${names.length} canonical skills valid${mirrored ? `; ${mirrored} mirrored to .agents/skills` : '; no .agents mirror to check'}`);
}
process.exit(failures ? 1 : 0);
