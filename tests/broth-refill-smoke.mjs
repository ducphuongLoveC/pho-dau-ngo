import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { GameEngine } from '../src/engine.ts';

const url = process.env.GAME_URL || 'http://127.0.0.1:4173';
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });

function dryPot(raw) {
  const game = new GameEngine();
  for (const [id, units] of Object.entries(game.recommendedShopping())) {
    if (units) assert.ok(game.buy(id, id === 'broth' ? raw + 2 : units).ok);
  }
  game.prepareBroth(2); game.openShop();
  const base = () => {
    assert.ok(game.takeBowl().ok);
    game.add('noodle'); game.add('noodle'); game.startBlanch(); game.tick(4); game.liftBlanch();
    game.add('tai'); game.add('tai');
  };
  base(); game.add('broth'); game.add('broth'); game.discard(); base();
  assert.equal(game.state.hotBroth, 0);
  assert.equal(game.state.stock.broth, raw);
  assert.equal(new GameEngine(game.export()).loadError, null);
  return game;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [];
try {
  for (const [width, height, raw] of [[1440, 960, 3], [320, 568, 0], [390, 700, 0]]) {
    const game = dryPot(raw);
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 3 : 2, isMobile: width < 640, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(save => {
      if (!localStorage.getItem('pho-dau-ngo.save.v1')) localStorage.setItem('pho-dau-ngo.save.v1', JSON.stringify(save));
    }, game.export());
    await page.goto(url);
    const pour = page.locator('#pour-action');
    await expect(pour).toHaveText('Nấu nước');
    await expect(pour).toBeEnabled();
    if (width === 390) {
      // The empty pot itself must also lead to refilling instead of a dead end.
      const canvas = page.locator('#kitchen-canvas canvas');
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      await page.touchscreen.tap(box.x + 103 / 720 * box.width, box.y + 400 / 590 * box.height);
    } else await pour.tap();
    const dialog = page.getByRole('dialog', { name: 'Kho nguyên liệu' });
    const refill = dialog.locator('[data-action="refill"]');
    await expect(refill).toBeInViewport({ ratio: 1 });
    await expect(refill).toHaveText(raw ? 'Nấu thêm 450 ml · 15 giây' : 'Nhập & nấu 1.500 ml · 10.000đ');
    await expect(dialog.locator('#refill-description')).toContainText(raw ? 'không tốn thêm tiền' : '15 giây');
    await page.screenshot({ path: new URL(`broth-refill-${width}-quote.png`, artifacts).pathname });
    await refill.tap();
    await expect(dialog).toBeHidden();
    const expectedCash = `${(game.state.cash - (raw ? 0 : 10000)).toLocaleString('vi-VN')}đ`;
    await expect(page.locator('#cash-stat')).toHaveText(expectedCash);
    await expect(pour).toContainText('Đang nấu');
    await expect(pour).toBeDisabled();
    await page.locator('.counter-stock-link').tap();
    await expect(refill).toBeDisabled();
    await expect(dialog.locator('#stock-quantity-broth')).toHaveText('0');
    await expect(dialog.locator('#refill-description')).toContainText('Trở lại quầy để nấu tiếp');
    const paused = await refill.innerText();
    await page.waitForTimeout(1200);
    assert.equal(await refill.innerText(), paused, 'Opening the stock dialog pauses the batch.');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(pour).toContainText('Đang nấu');
    await expect(page.locator('#cash-stat')).toHaveText(expectedCash);
    await expect(pour).toHaveText('Chan nước', { timeout: 20000 });
    await expect(pour).toBeEnabled();
    await pour.tap(); await pour.tap();
    await expect(page.locator('#order-ticket .recipe-checklist li').nth(2)).toHaveClass(/complete/);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pho-dau-ngo.save.v1')));
    // Wait for the debounced save before checking the completed batch.
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('pho-dau-ngo.save.v1')).brothBatch)).toBeNull();
    const restored = new GameEngine(await page.evaluate(() => JSON.parse(localStorage.getItem('pho-dau-ngo.save.v1'))));
    assert.equal(restored.loadError, null);
    assert.ok(restored.reconciliation().cashBalanced);
    assert.ok(restored.reconciliation().stockBalanced);
    assert.equal(saved.cash, game.state.cash - (raw ? 0 : 10000));
    const sizes = await page.evaluate(() => ({ client: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    assert.ok(sizes.content <= sizes.client + 1);
    console.log(`PASS ${width}: ${raw ? 'small batch from stock' : 'paid refill from empty stock'}, accessible refill, countdown, modal pause, reload, two pours and balanced books.`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
