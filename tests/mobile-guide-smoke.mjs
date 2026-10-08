import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { GameEngine, RECIPES } from '../src/engine.ts';

// Synthetic saves belong only to fresh test contexts; no player profile is used.
const url = process.env.GAME_URL || 'http://127.0.0.1:4173';
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const game = new GameEngine();
game.state.day = 3;
assert.ok(game.buyRecommended().ok);
assert.ok(game.prepareBroth(26).ok);
assert.ok(game.openShop().ok);
Object.assign(game.state.orders[0], { recipeId: 'chin', quotedPrice: RECIPES.chin.price, noodleUnits: 1, noOnion: true, chili: true });
assert.equal(new GameEngine(game.export()).loadError, null);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [];
try {
  for (const [width, height] of [[320, 568], [390, 700]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 320 ? 2 : 3, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(save => {
      if (!localStorage.getItem('pho-dau-ngo.save.v1')) localStorage.setItem('pho-dau-ngo.save.v1', JSON.stringify(save));
    }, game.export());
    await page.goto(url);
    const hint = page.locator('#mobile-next-step');
    const checklist = page.locator('#order-ticket .recipe-checklist');
    await expect(checklist.locator('li')).toHaveCount(6);
    await expect(checklist).toContainText('50 g bánh phở');
    await expect(checklist).toContainText('50 g bò chín');
    await expect(checklist).toContainText('Không hành lá, hành tây');
    await expect(checklist).toContainText('Một phần ớt');
    await expect(hint).toContainText('Chạm chồng bát ở tầng trên của kệ kính');
    // Keep the full requested quantities visible while shortening the mobile page.
    const compact = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      ticketHeight: document.querySelector('#order-ticket').getBoundingClientRect().height,
      width: document.documentElement.clientWidth,
      contentWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(compact.height < 1000, `${width}px: the cooking page should stay compact.`);
    assert.ok(compact.ticketHeight < 210, `${width}px: the order should not displace the counter.`);
    assert.equal(compact.width, width);
    assert.ok(compact.contentWidth <= width + 1, 'Do not shrink the mobile viewport to fit overflow.');
    for (const label of await checklist.locator('li strong').all()) await expect(label).toBeVisible();
    const detail = page.locator('.ticket-details-toggle');
    const firstProgress = checklist.locator('li small').first();
    await expect(firstProgress).toBeHidden();
    await detail.tap();
    await expect(detail).toHaveAttribute('aria-expanded', 'true');
    await expect(firstProgress).toBeVisible();
    await expect(firstProgress).toContainText('0 g đã lấy');
    // Taking a bowl preserves an explicitly expanded recipe.
    await page.locator('#take-bowl-action').tap();
    await expect(detail).toHaveAttribute('aria-expanded', 'true');
    await expect(firstProgress).toBeVisible();
    await expect(page.locator('#take-bowl-action')).toBeDisabled();
    await detail.tap();
    await expect(firstProgress).toBeHidden();
    await page.locator('#order-ticket').scrollIntoViewIfNeeded();
    await page.screenshot({ path: new URL(`mobile-guide-${width}-ticket.png`, artifacts).pathname, fullPage: true });
    await page.getByRole('button', { name: 'Cách làm Phở chín', exact: true }).tap();
    const guide = page.getByRole('dialog', { name: 'Cách làm món khách gọi' });
    await expect(guide).toContainText('ít bánh');
    await expect(guide).toContainText('không thêm hành lá, không thêm hành tây');
    await expect(guide).toContainText('Thêm ớt 1 lần');
    const clock = await page.locator('#time-stat').innerText();
    await page.waitForTimeout(1300);
    assert.equal(await page.locator('#time-stat').innerText(), clock);
    await page.screenshot({ path: new URL(`mobile-guide-${width}-steps.png`, artifacts).pathname });
    await guide.getByRole('button', { name: 'Trở lại nấu tiếp' }).tap();
    await page.locator('#ingredient-noodle').tap();
    await expect(hint).toContainText('Trụng bánh');
    await expect(page.locator('#take-bowl-action')).toBeDisabled();
    // Reproduce a player scrolling the cooking buttons near the bottom edge.
    // Use screen coordinates so Playwright cannot scroll an obstructed button away.
    await page.locator('#cooking-controls').evaluate(el => window.scrollBy(0, el.getBoundingClientRect().bottom - innerHeight + 12));
    const point = await page.locator('#blanch-action').evaluate(button => {
      const b = button.getBoundingClientRect();
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      return { x, y, clear: document.elementFromPoint(x, y)?.closest('#blanch-action') === button };
    });
    await page.screenshot({ path: new URL(`mobile-guide-${width}-controls.png`, artifacts).pathname });
    assert.ok(point.clear, `${width}px: bottom panels must not intercept the blanch button.`);
    await page.touchscreen.tap(point.x, point.y);
    await expect(hint).toContainText('3–5 giây');
    await expect(page.locator('#toast')).toBeVisible();
    const clearance = await page.evaluate(() => {
      const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const controls = document.querySelector('#cooking-controls').getBoundingClientRect();
      const dock = document.querySelector('#mobile-serving').getBoundingClientRect();
      const toast = document.querySelector('#toast').getBoundingClientRect();
      const button = document.querySelector('#blanch-action');
      const b = button.getBoundingClientRect();
      return { toastClear: !overlap(controls, toast), dockClear: !overlap(controls, dock), liftClear: document.elementFromPoint(b.x+b.width/2, b.y+b.height/2)?.closest('#blanch-action') === button };
    });
    assert.deepEqual(clearance, { toastClear: true, dockClear: true, liftClear: true });
    await page.screenshot({ path: new URL(`mobile-guide-${width}-blanch.png`, artifacts).pathname });
    await expect.poll(async () => Number((await page.locator('#cook-status').innerText()).match(/([\d.]+) giây/)?.[1] || 0), { intervals: [50] }).toBeGreaterThanOrEqual(3.1);
    await expect(page.locator('#toast')).toBeHidden();
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.locator('#cook-status')).toContainText('Bánh vừa ngon');
    await expect(hint).toContainText('Bò chín thêm 2 lần');
    await page.locator('#ingredient-chin').tap();
    await expect(hint).toContainText('Bò chín thêm 1 lần');
    await page.locator('#ingredient-chin').tap();
    await expect(hint).toContainText('nồi nước bên trái thêm 2 lần');
    await page.locator('[data-action="broth"]').tap();
    await page.locator('[data-action="broth"]').tap();
    await expect(hint).toContainText('Rau thơm thêm 1 lần');
    await page.locator('#ingredient-herbs').tap();
    await expect(hint).toContainText('Ớt thêm 1 lần');
    await page.locator('#ingredient-chili').tap();
    await expect(hint).toContainText('Bát đã đúng yêu cầu');
    await expect(page.locator('#order-ticket .checklist-title strong')).toHaveText('6/6');
    // An unwanted topping must not produce a false "ready" hint.
    await page.locator('#ingredient-onion').tap();
    await expect(hint).toContainText('thừa hoặc sai nguyên liệu');
    await page.reload();
    await expect(hint).toContainText('thừa hoặc sai nguyên liệu');
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    assert.ok(dimensions.content <= dimensions.viewport + 1);
    console.log(`PASS ${width}×${height}: clear cooking controls, timed touch lift, special order, paused guide, clean bowl action, next steps, wrong topping and reload.`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
