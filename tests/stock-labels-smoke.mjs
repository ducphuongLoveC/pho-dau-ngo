import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const url = process.env.GAME_URL || 'http://127.0.0.1:4173';
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [];
const captionMeasurements = [];
try {
  for (const { width, height, dpr, touch } of [
    { width: 1440, height: 960, dpr: 1, touch: false },
    { width: 320, height: 568, dpr: 2, touch: true },
    { width: 390, height: 700, dpr: 3, touch: true },
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: touch, hasTouch: touch });
    await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.locator('.counter-stock-link').click();
    const dialog = page.getByRole('dialog', { name: 'Kho nguyên liệu' });
    const plus = dialog.getByRole('button', { name: 'Mua thêm Tương', exact: true });
    await plus.scrollIntoViewIfNeeded();
    await plus.focus();
    const originalDialog = await dialog.elementHandle();
    const originalButton = await plus.elementHandle();
    const scrollTop = await dialog.evaluate(el => el.scrollTop);
    const box = await plus.boundingBox();
    assert.ok(box);
    for (let i = 1; i <= 5; i++) {
      if (touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(dialog.locator('#stock-quantity-sauce')).toHaveText(String(i));
      assert.ok(await originalDialog.evaluate(el => el.isConnected), 'The original dialog stays mounted.');
      assert.ok(await originalButton.evaluate(el => el.isConnected && document.activeElement === el), 'Repeated purchases retain the button and focus.');
      assert.ok(Math.abs(await dialog.evaluate(el => el.scrollTop) - scrollTop) <= 1, 'Buying does not reset dialog scrolling.');
    }
    await page.keyboard.press('Enter');
    await expect(dialog.locator('#stock-quantity-sauce')).toHaveText('6');
    await expect(page.locator('#cash-stat')).toHaveText('197.000đ');
    await page.screenshot({ path: new URL(`stock-stable-${width}-dpr-${dpr}.png`, artifacts).pathname });
    await dialog.locator('[data-action="stock-up"]').click();
    assert.ok(await originalDialog.evaluate(el => el.isConnected), 'Bulk shopping retains the same dialog.');
    await expect(dialog.locator('#stock-quantity-noodle')).toHaveText('18');
    await expect(dialog.locator('#stock-hot-value')).toContainText('2700 / 4500 ml');
    await expect(page.locator('#cash-stat')).toHaveText('68.000đ');
    const broth = dialog.getByRole('button', { name: 'Mua thêm Nền nước dùng', exact: true });
    for (let i = 0; i < 6; i++) await broth.click();
    await expect(dialog.locator('#stock-quantity-broth')).toHaveText('60');
    await expect(page.locator('#cash-stat')).toHaveText('8.000đ');
    const beforeDenied = await broth.elementHandle();
    const beforeDeniedScroll = await dialog.evaluate(el => el.scrollTop);
    await broth.click();
    await expect(page.locator('#toast.error')).toBeVisible();
    await expect(dialog.locator('#stock-quantity-broth')).toHaveText('60');
    await expect(page.locator('#cash-stat')).toHaveText('8.000đ');
    assert.ok(await beforeDenied.evaluate(el => el.isConnected && document.activeElement === el));
    assert.ok(Math.abs(await dialog.evaluate(el => el.scrollTop) - beforeDeniedScroll) <= 1);
    await page.keyboard.press('Escape');
    await page.reload();
    await page.locator('.counter-stock-link').click();
    await expect(dialog.locator('#stock-quantity-sauce')).toHaveText('6');
    await expect(dialog.locator('#stock-quantity-broth')).toHaveText('60');
    await dialog.getByRole('button', { name: 'Mua thêm Tương', exact: true }).click();
    await expect(dialog.locator('#stock-quantity-sauce')).toHaveText('7');
    await page.keyboard.press('Escape');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#counter-stage').screenshot({ path: new URL(`counter-labels-${width}-dpr-${dpr}.png`, artifacts).pathname });
    // Inspect the actual rasterized headings, including CanvasRenderer's DPR handling.
    const captions = await page.locator('#kitchen-canvas canvas').evaluate(canvas => {
      const c = canvas.getContext('2d');
      const resolution = canvas.width / 720;
      return [{ name: 'pot', x: 20, width: 170 }, { name: 'basket', x: 541, width: 150 }].map(({ name, x, width }) => {
        const pixelWidth = width * resolution, pixelHeight = 23 * resolution;
        const d = c.getImageData(x * resolution, 481 * resolution, pixelWidth, pixelHeight).data;
        let minX = pixelWidth, maxX = -1, minY = pixelHeight, maxY = -1;
        for (let y = 0; y < pixelHeight; y++) for (let xx = 0; xx < pixelWidth; xx++) {
          const i = (y * pixelWidth + xx) * 4;
          if (d[i] < 140 && d[i + 1] < 130 && d[i + 2] < 115) {
            minX = Math.min(minX, xx); maxX = Math.max(maxX, xx);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
        return { name, left: x + minX / resolution, right: x + maxX / resolution, top: 481 + minY / resolution, bottom: 481 + maxY / resolution };
      });
    });
    for (const caption of captions) {
      assert.ok(caption.right > caption.left, `${caption.name}: heading is drawn.`);
      assert.ok(Math.abs((caption.left + caption.right) / 2 - (caption.name === 'pot' ? 103 : 616)) <= 5, `${caption.name}: heading stays centered on its pot at DPR ${dpr}.`);
      assert.ok(caption.right - caption.left < 145, `${caption.name}: heading fits its own column.`);
    }
    assert.ok(Math.abs(captions[0].top - captions[1].top) <= 3, 'Both headings share a baseline.');
    captionMeasurements.push({ dpr, captions });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    assert.ok(dimensions.content <= dimensions.viewport + 1);
    console.log(`PASS ${width}px, DPR ${dpr}: repeated purchases, focus/scroll, bulk shopping, insufficient funds, reload and centered canvas headings.`);
    await context.close();
  }
  for (const { dpr, captions } of captionMeasurements.slice(1)) {
    for (let i = 0; i < captions.length; i++) {
      const reference = captionMeasurements[0].captions[i];
      assert.ok(Math.abs((captions[i].right - captions[i].left) - (reference.right - reference.left)) <= 4, `DPR ${dpr} does not enlarge the heading.`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
