import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { GameEngine } from '../src/engine.ts';

const url = process.env.GAME_URL || 'http://127.0.0.1:4173';
const key = 'pho-dau-ngo.save.v1';
const money = n => `${n.toLocaleString('vi-VN')}đ`;
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });

// Reach the sixth natural arrival through real engine actions, then finish
// their lime and quay order through browser controls in isolated contexts.
const game = new GameEngine();
for (const [id, quantity] of Object.entries(game.recommendedShopping())) if (quantity) game.buy(id, quantity);
game.prepareBroth(game.state.stock.broth);
game.openShop();
for (let n = 0; n < 6; n++) {
  while (!game.state.orders.some(o => o.status === 'waiting')) game.tick(1);
  const order = game.state.orders.find(o => o.status === 'waiting');
  game.chooseOrder(order.id);
  game.takeBowl();
  for (let i = 0; i < order.noodleUnits; i++) game.add('noodle');
  game.startBlanch(); game.tick(4); game.liftBlanch();
  for (const id of [order.recipeId, order.recipeId, 'broth', 'broth']) game.add(id);
  if (!order.noOnion) { game.add('scallion'); game.add('onion'); }
  game.add('herbs');
  if (n < 5) {
    if (order.lime) game.add('lime');
    if (order.quay) game.add('quay');
    assert.ok(game.serve().ok);
  } else {
    assert.ok(order.lime && order.quay);
    assert.equal(order.quotedPrice, 35000);
  }
}
const fixture = game.export();
const errors = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  for (const width of (process.env.QA_WIDTHS || '320,390,1440').split(',').map(Number)) {
    const mobile = width < 500;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 1040 }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
    await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ key, fixture }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture));
    }, { key, fixture });
    const press = async selector => {
      const target = page.locator(selector).first();
      if (mobile) await target.tap(); else await target.click();
    };
    const readSave = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    await page.goto(url);
    await expect(page.locator('#order-ticket blockquote')).toContainText('thêm chanh');
    await expect(page.locator('#order-ticket blockquote')).toContainText('kèm một phần quẩy');
    await expect(page.locator('.ticket-recipe-title')).toContainText('35.000đ');
    await expect(page.locator('.checklist-title strong')).toHaveText('5/7');
    if (mobile) {
      await press('[data-action="recipe-help"]');
      await expect(page.getByRole('dialog')).toContainText('Thêm chanh 1 lần');
      await expect(page.getByRole('dialog')).toContainText('Quẩy được đặt ra đĩa cạnh bát');
      await press('[data-action="dismiss"]');
    }
    await press('[data-action="serve"]:visible');
    await expect(page.locator('#order-ticket')).toContainText('Cho quán sửa lại một lần nhé');
    await expect(page.locator('#cash-stat')).toHaveText(money(fixture.cash));
    await press('#ingredient-lime');
    await expect(page.locator('.checklist-title strong')).toHaveText('6/7');
    await press('#ingredient-quay');
    await expect(page.locator('.checklist-title strong')).toHaveText('7/7');
    await expect(page.locator('#cash-stat')).toHaveText(money(fixture.cash));
    await page.waitForTimeout(450);
    await page.locator('#counter-stage').screenshot({ path: `artifacts/quay-lime-${width}-plate.png` });
    await page.screenshot({ path: `artifacts/quay-lime-${width}-page.png`, fullPage: true });
    const bounds = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    assert.ok(bounds.content <= bounds.width + 1);
    if (mobile) assert.ok(bounds.height < 1150, `Mobile page stays compact: ${bounds.height}px`);
    await page.reload();
    await expect(page.locator('.checklist-title strong')).toHaveText('7/7');
    const saved = await readSave();
    assert.equal(saved.bowls[0].ingredients.quay, 1);
    assert.equal(saved.bowls[0].ingredients.lime, 1);
    await press('[data-action="serve"]:visible');
    await expect.poll(async () => (await readSave()).ledger.served).toBe(6);
    const served = await readSave();
    assert.equal(served.lastResult.payment, 35000);
    assert.equal(served.lastResult.score, 100);
    assert.equal(served.cash, fixture.cash + 35000 + served.lastResult.tip);
    assert.equal(served.bowls[0].ingredients.quay, 0);
    await press('[data-action="stock"]:visible');
    const dialog = page.getByRole('dialog');
    const buy = dialog.getByRole('button', { name: 'Mua thêm Quẩy', exact: true });
    const original = await buy.elementHandle();
    const before = await readSave();
    await buy.click(); await buy.click();
    await expect(dialog.locator('#stock-quantity-quay')).toHaveText('2');
    assert.ok(await original.evaluate(el => el.isConnected && document.activeElement === el));
    await expect(page.locator('#cash-stat')).toHaveText(money(before.cash - 5000));
    const clock = await page.locator('#time-stat').innerText();
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#time-stat').innerText(), clock);
    await press('[data-action="dismiss"]');
    const restored = new GameEngine(await readSave());
    assert.equal(restored.loadError, null);
    assert.ok(restored.reconciliation().cashBalanced && restored.reconciliation().stockBalanced);
    await context.close();
    console.log(`PASS ${width}px: natural lime + quay order, repair, separate plate, reload, exact charge and stable midshift shopping.`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
