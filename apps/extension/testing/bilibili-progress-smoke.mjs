import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function installBilibiliProgressFixture(extension) {
  await writeFile(path.join(extension, 'bilibili-progress-fixture.js'), `
    const nativeFetch = fetch.bind(globalThis);
    globalThis.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      if (!String(args[0]).includes('/100002/')) return response;
      const bytes = new Uint8Array(await response.arrayBuffer());let offset = 0, timer;
      return new Response(new ReadableStream({
        start(controller) {
          const next = () => {
            if (offset === bytes.length) { controller.close();return; }
            const end = Math.min(bytes.length, offset + Math.ceil(bytes.length / 4));
            controller.enqueue(bytes.slice(offset, end));offset = end;timer = setTimeout(next, 650);
          };
          timer = setTimeout(next, 650);
        }, cancel() { clearTimeout(timer); }
      }), { status: response.status, headers: response.headers });
    };
  `);
  const html = path.join(extension, 'offscreen.html');
  await writeFile(html, '<script src="bilibili-progress-fixture.js"></script>' + await readFile(html, 'utf8'));
}

export async function verifyBilibiliProgress(page, until, work) {
  const button = page.locator('[data-locus-bilibili-action="toolbar"]');
  await until(() => button.getAttribute('data-locus-percent'), value => value !== null && value !== 'indeterminate' && Number(value) > 50 && Number(value) < 75, 'video track advances the progress ring');
  const current = await button.evaluate(button => {
    const group = button.querySelector('[data-locus-progress]'), track = group.querySelector('circle'), arc = group.querySelector('circle:last-of-type');
    const center = element => new DOMPoint(12, 12).matrixTransform(element.getScreenCTM());
    const a = center(track), b = center(arc);
    return { percent: button.dataset.locusPercent, text: group.querySelector('text').textContent, centerError: Math.hypot(a.x - b.x, a.y - b.y), description: button.getAttribute('aria-description') };
  });
  assert.equal(current.text, `${current.percent}%`);assert.ok(current.description.includes(`${current.percent}%`));assert.ok(current.centerError < .05);
  await page.locator('#arc_toolbar_report').screenshot({ path: path.join(work, 'bilibili-toolbar-progress.png') });
  await until(() => button.getAttribute('data-locus-percent'), value => value !== null && value !== 'indeterminate' && Number(value) > 75 && Number(value) < 100, 'audio track continues the same progress ring');
}
