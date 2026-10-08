import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [];
try {
  for (const [width, reducedMotion] of [[1440, 'no-preference'], [390, 'no-preference'], [320, 'reduce']]) {
    const context = await browser.newContext({ viewport: { width, height: 1040 }, deviceScaleFactor: width < 500 ? 2 : 1, reducedMotion, isMobile: width < 500, hasTouch: width < 500 });
    await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const press = selector => page.locator(selector).first()[width < 500 ? 'tap' : 'click']();
    // Compare actual rendered pixels on the opaque front, not object depths.
    // The same metal surface must remain unchanged throughout the basket tween.
    const front = () => page.locator('#kitchen-canvas canvas').evaluate(canvas => {
      const r = canvas.width / 720;
      return Array.from(canvas.getContext('2d').getImageData(582*r, 391*r, 68*r, 29*r).data);
    });
    await page.goto(process.env.GAME_URL || 'http://localhost:5173');
    await press('[data-action="stock-up"]:visible');
    await press('[data-action="open"]:visible');
    await press('[data-action="take-bowl"]');
    await press('#ingredient-noodle');
    await press('#ingredient-noodle');
    await page.waitForTimeout(450);
    const original = await front();
    await page.locator('#counter-stage').screenshot({ path: `artifacts/hanoi-${width}-raised.png` });
    await press('[data-action="blanch"]:visible');
    for (let frame = 0; frame < 7; frame++) {
      assert.deepEqual(await front(), original, `${width}: basket must not show through aluminium during lowering (sample ${frame})`);
      await page.waitForTimeout(60);
    }
    await page.locator('#counter-stage').screenshot({ path: `artifacts/hanoi-${width}-submerged.png` });
    await page.screenshot({ path: `artifacts/hanoi-${width}-page.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.reload();
    await expect(page.locator('#cook-status')).toContainText('Đang trụng');
    assert.deepEqual(await front(), original, `${width}: restored cooking state keeps opaque pot`);
    await page.locator('#blanch-action').focus();
    await expect.poll(async () => Number((await page.locator('#cook-status').innerText()).match(/([\d.]+) giây/)?.[1] || 0), { intervals: [50] }).toBeGreaterThanOrEqual(3.1);
    await page.keyboard.press('Enter');
    await expect(page.locator('#cook-status')).toContainText('Bánh vừa ngon');
    for (let frame = 0; frame < 7; frame++) {
      assert.deepEqual(await front(), original, `${width}: basket must not show through aluminium during lifting (sample ${frame})`);
      await page.waitForTimeout(60);
    }
    await page.locator('#counter-stage').screenshot({ path: `artifacts/hanoi-${width}-lifted.png` });
    console.log(`PASS ${width}px (${reducedMotion}): opaque pot during lower/lift/reload, correct cooking, no overflow`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
