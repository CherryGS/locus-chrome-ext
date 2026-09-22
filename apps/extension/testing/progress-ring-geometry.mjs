/** Verify real SVG transforms, including every sampled animation phase. */
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import ts from 'typescript';

export async function verifyProgressRingGeometry(context, work) {
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 640, height: 220 });
    await page.setContent('<style>body{background:#000;color:#1d9bf0;font:14px Arial;display:flex;gap:24px;padding:28px}svg{overflow:visible;stroke:currentColor;stroke-linecap:round}</style>');
    const source = await readFile(new URL('../ui/shared/progress-ring.ts', import.meta.url), 'utf8');
    const script = ts.transpileModule(source.replace(/^export /gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    await page.addScriptTag({ content: script });
    await page.evaluate(() => {
      const style = document.createElement('style');style.textContent = progressRingStyles;document.head.append(style);
      globalThis.fixtureRings = [];
      for (const size of [18.75, 22.5]) for (const zoom of [.8, 1, 1.25]) {
        const wrapper = document.createElement('div');wrapper.style.zoom = String(zoom);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');svg.setAttribute('viewBox', '0 0 24 24');svg.style.width = `${size}px`;svg.style.height = `${size}px`;
        wrapper.append(svg);document.body.append(wrapper);fixtureRings.push(createProgressRing(svg));
      }
    });
    const cases = [];
    for (const motion of ['reduce', 'no-preference']) {
      await page.emulateMedia({ reducedMotion: motion });
      for (const percent of [null, 45, null]) {
        await page.evaluate(percent => { for (const ring of fixtureRings) renderProgressRing(ring, percent, true); }, percent);
        for (const phase of [0, 300, 600, 900, 1199]) {
          const values = await page.evaluate(phase => fixtureRings.map(ring => {
            const animations = ring.arc.getAnimations();
            for (const animation of animations) { animation.pause();animation.currentTime = phase; }
            const track = ring.group.querySelector('circle');
            const center = element => new DOMPoint(12, 12).matrixTransform(element.getScreenCTM());
            const actual = center(ring.arc), expected = center(track);
            const radius = element => { const edge = new DOMPoint(22.5, 12).matrixTransform(element.getScreenCTM()), c = center(element);return Math.hypot(edge.x - c.x, edge.y - c.y); };
            return { centerError: Math.hypot(actual.x - expected.x, actual.y - expected.y), radiusError: Math.abs(radius(ring.arc) - radius(track)), animations: animations.length, label: ring.label.textContent };
          }), phase);
          for (const value of values) {
            assert.ok(value.centerError < .05, `${motion}, ${percent}, phase ${phase}: center error ${value.centerError}px`);
            assert.ok(value.radiusError < .05, `${motion}, phase ${phase}: radius error ${value.radiusError}px`);
            assert.equal(value.animations, motion === 'no-preference' && percent === null ? 1 : 0);
            assert.equal(value.label, percent === null ? '…' : `${percent}%`);
          }
          cases.push({ motion, percent, phase, maxCenterError: Math.max(...values.map(value => value.centerError)) });
        }
      }
      await page.screenshot({ path: path.join(work, `progress-ring-${motion}.png`) });
    }
    return { cases: cases.length, glyphChecks: cases.length * 6, maxCenterError: Math.max(...cases.map(value => value.maxCenterError)) };
  } finally { await page.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch({ executablePath: process.env.LOCUS_CHROME_PATH, headless: true });
  try {
    const context = await browser.newContext();
    const work = await mkdtemp(path.join(tmpdir(), 'locus-ring-geometry-'));
    console.log(JSON.stringify({ status: 'PASS', work, ...await verifyProgressRingGeometry(context, work) }));
  } finally { await browser.close(); }
}
