import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const url = process.env.GAME_URL || 'http://127.0.0.1:4173';
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, deviceScaleFactor: 1 });
context.setDefaultTimeout(10000);
await context.route('https://fonts.googleapis.com/**', route => route.abort());
await context.route('https://fonts.gstatic.com/**', route => route.abort());
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const report = { url, pauseDuringCooking: false, lastOrderClosesDay: false, nextDayCanvasStable: false, errors };

async function action(name) {
  const modal = page.getByRole('dialog').locator(`[data-action="${name}"]:visible`);
  await (await modal.count() ? modal.first() : page.locator(`[data-action="${name}"]:visible`).first()).click();
}
async function ingredient(id, count = 1) {
  for (let i = 0; i < count; i++) await page.locator(`[data-action="ingredient"][data-ingredient="${id}"]`).click();
}
async function visibleCookSeconds() {
  return Number((await page.locator('#cook-status').innerText()).match(/([\d.]+) giây/)?.[1] || 0);
}

try {
  await page.goto(url);
  await expect(page.locator('#kitchen-canvas canvas')).toBeVisible();
  await action('stock-up');
  await action('open');
  await action('take-bowl');
  await ingredient('noodle', 2);
  await expect(page.locator('#cook-status')).toContainText('100 g bánh');
  await action('blanch');
  await expect(page.locator('#cook-status')).toContainText('Đang trụng');
  await expect.poll(visibleCookSeconds, { intervals: [50] }).toBeGreaterThanOrEqual(1);
  await page.locator('#pause-button').click();
  const pausedStatus = await page.locator('#cook-status').innerText();
  const pausedClock = await page.locator('#time-stat').innerText();
  await page.waitForTimeout(650);
  assert.equal(await page.locator('#cook-status').innerText(), pausedStatus);
  assert.equal(await page.locator('#time-stat').innerText(), pausedClock);
  await page.locator('#pause-button').click();
  await expect.poll(visibleCookSeconds, { intervals: [50] }).toBeGreaterThanOrEqual(3.1);
  await action('lift');
  await expect(page.locator('#cook-status')).toContainText('Bánh vừa ngon');
  report.pauseDuringCooking = true;
  await ingredient('tai', 2);
  await action('broth');
  await action('broth');
  for (const id of ['scallion', 'onion', 'herbs']) await ingredient(id);
  await expect(page.locator('#order-ticket .checklist-title')).toContainText('5/5');

  // Keep the guest waiting while closing, so serving this bowl takes the exact
  // active -> closing -> summary -> prep path that used to resume stale effects.
  await action('close-shop');
  await action('confirm-close');
  await expect(page.locator('#shop-status')).toContainText('ĐANG HOÀN THÀNH ĐƠN CUỐI');
  await expect(page.locator('#customers')).toContainText('Cô Hạnh');
  await action('serve');
  await expect(page.locator('#ledger-view')).toBeVisible();
  await expect(page.locator('#ledger-view h2')).toHaveText('Hết ngày, đếm niềm vui.');
  await expect(page.locator('#served-stat')).toContainText('1 / 8 khách');
  report.lastOrderClosesDay = true;
  await action('next-day');
  await expect(page.locator('#day-label')).toHaveText('Ngày 02');
  await expect(page.locator('#shop-status')).toContainText('CHUẨN BỊ MỞ QUÁN');
  await expect(page.locator('#cook-status')).toContainText('Chưa có bát');

  // Compare only the rendered kitchen pixels. DOM toasts, CSS transitions and
  // layout have no effect on this test; no engine state or animation internals.
  const snapshots = await page.locator('#kitchen-canvas canvas').evaluate(async canvas => {
    const started = performance.now();
    await new Promise(resolve => setTimeout(resolve, 120));
    const early = { elapsedMs: +(performance.now() - started).toFixed(2), png: canvas.toDataURL('image/png') };
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 700 - (performance.now() - started))));
    return { early, late: { elapsedMs: +(performance.now() - started).toFixed(2), png: canvas.toDataURL('image/png') } };
  });
  for (const [name, capture] of Object.entries(snapshots)) {
    await writeFile(new URL(`canvas-day2-${name}.png`, artifacts), Buffer.from(capture.png.split(',')[1], 'base64'));
  }
  report.snapshots = Object.fromEntries(Object.entries(snapshots).map(([name, capture]) => [name, { elapsedMs: capture.elapsedMs, sha256: createHash('sha256').update(capture.png).digest('hex') }]));
  assert.ok(snapshots.early.png === snapshots.late.png, 'Cold, empty day-2 prep canvas must stay identical: no resumed bowl/pour/serve effects.');
  report.nextDayCanvasStable = true;
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
  console.log('PASS: cooking pause/resume, final closing order and next-day canvas lifecycle.');
} catch (error) {
  report.failure = String(error);
  await page.screenshot({ path: new URL('canvas-lifecycle-failure.png', artifacts).pathname, fullPage: true }).catch(() => {});

  console.log({errors,status:await page.locator('#cook-status').innerText(),toast:await page.locator('#toast').innerText()});
  throw error;
} finally {
  await writeFile(new URL('canvas-lifecycle.json', artifacts), JSON.stringify(report, null, 2));
  await browser.close();
}
