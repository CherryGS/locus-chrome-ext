import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function installProgressFixture(extension) {
  // Only the disposable extension copy drips real fixture bytes. Production
  // fetch, boundedBody, validation, persistence and UI polling remain in use.
  await writeFile(path.join(extension, 'progress-fixture.js'), `
    const fixtureFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (...args) => {
      const response = await fixtureFetch(...args);
      const match = /synthetic-image-(701|702)\\.png$/.exec(String(args[0]));
      if (!match) return response;
      const bytes = new Uint8Array(await response.arrayBuffer()), headers = new Headers(response.headers);
      if (match[1] === '702') headers.delete('content-length');else headers.set('content-length', String(bytes.length));
      let timer, offset = 0;
      const body = new ReadableStream({
        start(controller) {
          const next = () => {
            if (offset === bytes.length) { controller.close();return; }
            const end = Math.min(bytes.length, offset + Math.ceil(bytes.length / 4));
            controller.enqueue(bytes.slice(offset, end));offset = end;timer = setTimeout(next, 1200);
          };
          timer = setTimeout(next, 1200);
        },
        cancel() { clearTimeout(timer); }
      });
      return new Response(body, { status: response.status, headers });
    };
  `);
  const html = path.join(extension, 'offscreen.html');
  await writeFile(html, '<script src="progress-fixture.js"></script>' + await readFile(html, 'utf8'));
}

export async function verifyProgressRing({ context, until, checks, work }) {
  for (const id of ['701', '702']) {
    const page = await context.newPage();await page.goto(`https://x.com/synthetic/status/${id}`);
    const action = page.locator('[data-locus-action] button');await action.waitFor();
    const height = await page.locator('article').evaluate(article => article.getBoundingClientRect().height);
    await action.click();
    if (id === '701') {
      const first = await until(() => action.getAttribute('data-locus-percent'), value => value !== null && value !== 'indeterminate' && Number(value) > 0 && Number(value) < 50, 'live byte percentage');
      const visual = await action.evaluate(button => {
        const ring = button.querySelector('[data-locus-progress]');
        return { percent: button.dataset.locusPercent, text: ring.querySelector('text').textContent, offset: ring.querySelector('circle:last-of-type').getAttribute('stroke-dashoffset'), visible: getComputedStyle(ring).display !== 'none', label: button.getAttribute('aria-label') };
      });
      assert.equal(visual.visible, true);assert.equal(visual.text, `${visual.percent}%`);assert.equal(Number(visual.offset), 100 - Number(visual.percent));assert.ok(visual.label.includes(`${visual.percent}%`));
      await page.locator('article').screenshot({ path: path.join(work, 'twitter-import-percentage.png') });
      await until(() => action.getAttribute('data-locus-percent'), value => value !== null && value !== 'indeterminate' && Number(value) > Number(first) && Number(value) < 100, 'percentage advances during the same file');
    } else {
      await until(() => action.evaluate(button => ({ percent: button.dataset.locusPercent, text: button.querySelector('[data-locus-progress] text').textContent, label: button.getAttribute('aria-label') })), value => value.percent === 'indeterminate' && value.text === '…' && value.label.includes('File size unknown'), 'unknown byte total stays indeterminate after queue submission');
    }
    await until(() => action.getAttribute('data-locus-state'), value => value === 'saved', 'finished capture reports missing Locus connection');
    assert.equal(await action.getAttribute('data-locus-percent'), null);
    assert.equal(await action.locator('[data-locus-progress]').evaluate(ring => getComputedStyle(ring).display), 'none');
    assert.equal(await action.locator('svg > path').getAttribute('d'), 'M4 4h16l2 10v6H2v-6L4 4zm-2 10h6l2 3h4l2-3h6');
    assert.equal(await page.locator('article').evaluate(article => article.getBoundingClientRect().height), height);
    await page.close();
  }
  checks.push('Live byte progress ring advances within one file, matches its numeric label and accessible button name, preserves row height, keeps unknown lengths indeterminate, and shows missing Locus configuration after complete local capture');
}
