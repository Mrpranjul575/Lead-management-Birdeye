#!/usr/bin/env node
/**
 * build-standalone.js — Birdeye SDR Workspace
 *
 * Inlines the Vite-built CSS and JS into a single self-contained HTML file.
 * Run after `npm run build` via `npm run build:standalone`.
 *
 * Output: Standalone/birdeye-sdr-latest.html
 *
 * Why a standalone HTML?
 *   The SDR workspace can be shared as a single file — no server, no npm,
 *   no node_modules. Drop the file in a browser and it runs.
 *
 * Usage:
 *   npm run build              # compile with Vite first
 *   npm run build:standalone   # then inline into HTML
 *
 *   Or in one step:
 *   npm run release            # build + standalone in sequence
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const distDir   = join(root, 'dist', 'assets');
const outPath   = join(root, 'Standalone', 'birdeye-sdr-latest.html');

// ── Locate built assets ───────────────────────────────────────────────────────
const assets = readdirSync(distDir);

const cssFile = assets.find(f => f.endsWith('.css'));
const jsFile  = assets.find(f => f.endsWith('.js'));

if (!cssFile || !jsFile) {
  console.error('❌  Build artifacts not found in dist/assets/.');
  console.error('    Run `npm run build` first, then `npm run build:standalone`.');
  process.exit(1);
}

const css = readFileSync(join(distDir, cssFile), 'utf8');
const js  = readFileSync(join(distDir, jsFile),  'utf8');

// ── Assemble HTML ─────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Birdeye SDR Workspace</title>
<style>${css}</style>
</head>
<body style="margin:0">
<div id="root"></div>
<script>${js}</script>
</body>
</html>`;

writeFileSync(outPath, html, 'utf8');

const kb = (html.length / 1024).toFixed(1);
console.log(`✓  Standalone HTML written: Standalone/birdeye-sdr-latest.html (${kb} KB)`);
console.log(`   CSS: ${cssFile}  |  JS: ${jsFile}`);
