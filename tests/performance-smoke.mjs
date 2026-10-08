import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Measure visible DOM and browser scheduling, without reading the engine or saves.
// Run both builds with the same Chrome/renderer flags for a fair comparison:
// GAME_URL=http://127.0.0.1:4174 QA_LABEL=before node tests/performance-smoke.mjs
// GAME_URL=http://127.0.0.1:5173 QA_LABEL=after node tests/performance-smoke.mjs
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
const label = process.env.QA_LABEL || 'current';
const sampleMs = Number(process.env.SAMPLE_MS || 5000);
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const launchArgs = ['--no-sandbox', '--disable-dev-shm-usage'];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: launchArgs,
});
const report = { label, url, sampleMs, browser: browser.version(), launchArgs, remoteFontsBlocked: true, capturedAt: new Date().toISOString(), devices: [], errors: [] };
const log = message => console.log(`[performance:${label}] ${message}`);

async function clickAction(page, action, touch = false) {
  const inModal = page.getByRole('dialog').locator(`[data-action="${action}"]:visible`);
  const locator = await inModal.count() ? inModal.first() : page.locator(`[data-action="${action}"]:visible`).first();
  if (touch) await locator.tap(); else await locator.click();
}

async function sample(page, phase) {
  const result = await page.evaluate(async ({ duration, phase }) => {
    const intervals = [];
    const longTasks = [];
    const mutations = { records: 0, childList: 0, attributes: 0, characterData: 0, addedNodes: 0, removedNodes: 0, byRegion: {} };
    const regions = ['ingredients', 'cooking-controls', 'customers', 'order-ticket', 'mobile-serving', 'save-status'];
    let previous = performance.now();
    let active = true;
    let rafId;
    const raf = now => {
      intervals.push(now - previous);
      previous = now;
      if (active) rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
    const observer = new MutationObserver(records => {
      mutations.records += records.length;
      for (const record of records) {
        mutations[record.type]++;
        mutations.addedNodes += record.addedNodes.length;
        mutations.removedNodes += record.removedNodes.length;
        const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        const region = regions.find(id => element?.closest?.(`#${id}`)) || 'other';
        mutations.byRegion[region] = (mutations.byRegion[region] || 0) + 1;
      }
    });
    observer.observe(document.querySelector('#app'), { subtree: true, childList: true, attributes: true, characterData: true });
    const longTaskObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    try { longTaskObserver.observe({ entryTypes: ['longtask'] }); } catch { /* Optional browser capability. */ }
    const start = performance.now();
    await new Promise(resolve => setTimeout(resolve, duration));
    const actualMs = performance.now() - start;
    active = false;
    cancelAnimationFrame(rafId);
    observer.disconnect();
    longTaskObserver.disconnect();
    const sorted = intervals.slice(1).sort((a, b) => a - b);
    const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
    return {
      phase, actualMs: Math.round(actualMs), mutations,
      raf: { frames: sorted.length, medianMs: +percentile(0.5).toFixed(2), p95Ms: +percentile(0.95).toFixed(2), maxMs: +percentile(1).toFixed(2), over50ms: sorted.filter(x => x > 50).length },
      longTasks: { count: longTasks.length, totalMs: +longTasks.reduce((sum, x) => sum + x, 0).toFixed(2), maxMs: +Math.max(0, ...longTasks).toFixed(2) },
    };
  }, { duration: sampleMs, phase });
  log(`${phase}: mutations=${result.mutations.records}, RAF median/p95/max=${result.raf.medianMs}/${result.raf.p95Ms}/${result.raf.maxMs}ms, longTasks=${result.longTasks.count}`);
  return result;
}

async function ingredientProbe(page, ingredient, touch) {
  const selector = `[data-action="ingredient"][data-ingredient="${ingredient}"]`;
  await page.evaluate(selector => {
    const original = document.querySelector(selector);
    const before = original.querySelector('.stock-count').textContent;
    const probe = { before, started: null, result: null };
    const begin = event => {
      if (event.target.closest?.(selector)) probe.started = performance.now();
    };
    document.addEventListener('pointerdown', begin, true);
    const observer = new MutationObserver(() => {
      if (probe.started === null) return;
      const current = document.querySelector(selector);
      const after = current?.querySelector('.stock-count')?.textContent;
      if (after !== before) {
        probe.result = { latencyMs: +(performance.now() - probe.started).toFixed(2), before: Number(before), after: Number(after), retainedButton: current === original };
        observer.disconnect();
        document.removeEventListener('pointerdown', begin, true);
      }
    });
    observer.observe(document.querySelector('#ingredients'), { subtree: true, childList: true, attributes: true, characterData: true });
    window.__qaIngredientProbe = probe;
  }, selector);
  if (touch) await page.locator(selector).tap(); else await page.locator(selector).click();
  await expect.poll(() => page.evaluate(() => window.__qaIngredientProbe.result !== null), { timeout: 5000 }).toBe(true);
  return page.evaluate(() => window.__qaIngredientProbe.result);
}

async function rapidTwoInputs(page, ingredient, touch) {
  const selector = `[data-action="ingredient"][data-ingredient="${ingredient}"]`;
  const control = page.locator(selector);
  await control.scrollIntoViewIfNeeded();
  const before = Number(await control.locator('.stock-count').innerText());
  const box = await control.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const began = performance.now();
  // Physical input goes to the same visible coordinates, including during CSS animation.
  if (touch) {
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y, { clickCount: 2, delay: 35 });
  }
  const inputMs = performance.now() - began;
  await expect(control.locator('.stock-count')).toHaveText(String(before - 2));
  return { before, after: Number(await control.locator('.stock-count').innerText()), inputMs: +inputMs.toFixed(2), passed: true };
}

async function pointerLift(page, touch) {
  await clickAction(page, 'blanch', touch);
  const lift = page.locator('[data-action="lift"]');
  await lift.scrollIntoViewIfNeeded();
  const box = await lift.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await expect.poll(async () => Number((await page.locator('#cook-status').innerText()).match(/([\d.]+) giây/)?.[1] || 0), {
    timeout: 15000, intervals: [50],
  }).toBeGreaterThanOrEqual(3.1);
  const visibleBeforeInput = await page.locator('#cook-status').innerText();
  const began = performance.now();
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await expect(page.locator('#cook-status')).not.toContainText('Đang trụng');
  const visibleAfterInput = await page.locator('#cook-status').innerText();
  return { visibleBeforeInput, visibleAfterInput, inputAndRenderMs: +(performance.now() - began).toFixed(2), perfect: visibleAfterInput.includes('Bánh vừa ngon'), input: touch ? 'touch' : 'mouse' };
}

try {
  for (const device of [{ name: 'desktop', width: 1440, height: 1040, touch: false }, { name: 'mobile', width: 390, height: 844, touch: true }]) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, deviceScaleFactor: 1, isMobile: device.touch, hasTouch: device.touch });
    context.setDefaultTimeout(10000);
    context.setDefaultNavigationTimeout(30000);
    // The sample compares local rendering/input; external font DNS/availability
    // must not randomly change navigation time or inject layout shifts.
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    await context.route('https://fonts.gstatic.com/**', route => route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(`${device.name}: ${error.message}`));
    const data = { device: device.name, viewport: { width: device.width, height: device.height }, samples: [], interactions: {}, regression: {} };
    report.devices.push(data);
    log(`Starting ${device.name}.`);
    await page.goto(url);
    await expect(page.locator('#kitchen-canvas canvas')).toBeVisible();
    data.renderer = await page.locator('#kitchen-canvas canvas').evaluate(canvas => canvas.getContext('2d') ? 'canvas-2d' : canvas.getContext('webgl2') ? 'webgl2' : canvas.getContext('webgl') ? 'webgl' : 'unknown');
    await page.waitForTimeout(1000);
    data.samples.push(await sample(page, 'prep-idle'));
    await clickAction(page, 'stock-up', device.touch);
    await expect(page.locator('#cash-stat')).toHaveText('71.000đ');
    await clickAction(page, 'open', device.touch);
    data.samples.push(await sample(page, 'open-waiting'));
    await page.locator('#pause-button').click();
    const pausedClock = await page.locator('#time-stat').innerText();
    data.samples.push(await sample(page, 'paused'));
    assert.equal(await page.locator('#time-stat').innerText(), pausedClock);
    await page.locator('#pause-button').click();

    await clickAction(page, 'take-bowl', device.touch);
    data.interactions.firstNoodle = await ingredientProbe(page, 'noodle', device.touch);
    data.interactions.secondNoodle = await ingredientProbe(page, 'noodle', device.touch);
    log(`${device.name} ingredient response: ${JSON.stringify(data.interactions)}`);
    data.regression.pointerLift = await pointerLift(page, device.touch);
    log(`${device.name} timed pointer lift: ${JSON.stringify(data.regression.pointerLift)}`);
    data.interactions.rapidMeat = await rapidTwoInputs(page, 'tai', device.touch);
    await clickAction(page, 'broth', device.touch);
    await clickAction(page, 'broth', device.touch);
    for (const id of ['scallion', 'onion', 'herbs']) data.interactions[id] = await ingredientProbe(page, id, device.touch);
    await expect(page.locator('#order-ticket .checklist-title')).toContainText('5/5');
    await page.screenshot({ path: new URL(`performance-${label}-${device.name}-bowl.png`, artifacts).pathname, fullPage: true });
    await clickAction(page, 'serve', device.touch);
    await expect(page.locator('#served-stat')).toContainText('1 / 8 khách');
    data.regression.cashAfterServe = await page.locator('#cash-stat').innerText();
    data.samples.push(await sample(page, 'open-after-serving'));
    const cashBeforeReload = await page.locator('#cash-stat').innerText();
    await page.reload();
    await expect(page.locator('#cash-stat')).toHaveText(cashBeforeReload);
    await expect(page.locator('#served-stat')).toContainText('1 / 8 khách');
    data.regression.reloadPreservedCashAndServing = true;
    await clickAction(page, 'stock', device.touch);
    await expect(page.getByRole('dialog')).toContainText('Nguyên liệu còn lại.');
    const clockInModal = await page.locator('#time-stat').innerText();
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#time-stat').innerText(), clockInModal);
    await clickAction(page, 'dismiss', device.touch);
    data.regression.stockModalPausedAndClosed = true;
    data.regression.noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    assert.ok(data.regression.noHorizontalOverflow);
    await page.screenshot({ path: new URL(`performance-${label}-${device.name}.png`, artifacts).pathname, fullPage: true });
    await context.close();
    log(`${device.name} short gameplay regression passed.`);
    await writeFile(new URL(`performance-${label}.json`, artifacts), JSON.stringify(report, null, 2));
  }
  assert.deepEqual(report.errors, []);
  if (!label.startsWith('before')) {
    for (const device of report.devices) {
      assert.equal(device.regression.pointerLift.perfect, true, `${device.device} pointer lift stays in its visible timing window.`);
      for (const [name, interaction] of Object.entries(device.interactions)) {
        if ('retainedButton' in interaction) assert.equal(interaction.retainedButton, true, `${device.device} ${name} keeps its ingredient button connected.`);
      }
    }
    // Additional regression for the optimized sleeping canvas. This runs after
    // all measured samples, so it cannot warm or perturb their renderer state.
    const idleContext = await browser.newContext({ viewport: { width: 1440, height: 1040 } });
    await idleContext.route('https://fonts.googleapis.com/**', route => route.abort());
    await idleContext.route('https://fonts.gstatic.com/**', route => route.abort());
    const idlePage = await idleContext.newPage();
    idlePage.setDefaultTimeout(10000);
    idlePage.on('pageerror', error => report.errors.push(`idle-canvas: ${error.message}`));
    await idlePage.goto(url);
    const canvas = idlePage.locator('#kitchen-canvas canvas');
    await expect(canvas).toBeVisible();
    await idlePage.waitForTimeout(1500);
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    assert.ok(box);
    await canvas.click({ position: { x: box.width * 548 / 720, y: box.height * 58 / 590 } });
    await expect(idlePage.locator('#take-bowl-action')).toBeDisabled();
    await clickAction(idlePage, 'stock-up');
    await clickAction(idlePage, 'open');
    await canvas.click({ position: { x: box.width * 548 / 720, y: box.height * 58 / 590 } });
    await expect(idlePage.locator('#take-bowl-action')).toHaveText('Đã lấy bát');
    report.idleCanvasTakeBowl = 'The stack accepts a pointer after the prep canvas sleeps and the shop opens.';
    await idlePage.locator('[data-action="ingredient"][data-ingredient="noodle"]').click();
    await idlePage.reload();
    await expect(idlePage.locator('#cook-status')).toContainText('50 g bánh');
    await expect(idlePage.locator('[data-ingredient="noodle"] .stock-count')).toHaveText('17');
    await expect(idlePage.locator('#cash-stat')).toHaveText('71.000đ');
    report.immediateReloadAfterIngredient = 'The last portion, stock decrement and cash survive immediate reload during debounced saving.';
    await idleContext.close();
    assert.deepEqual(report.errors, []);
  }
  log('PASS. Measurements are for this headless Chrome environment, not a device performance guarantee.');
} catch (error) {
  report.failure = String(error);
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: new URL(`performance-${label}-failure.png`, artifacts).pathname, fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await writeFile(new URL(`performance-${label}.json`, artifacts), JSON.stringify(report, null, 2));
  await browser.close();
}
