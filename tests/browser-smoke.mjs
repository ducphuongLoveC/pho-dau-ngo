import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// End-to-end checks use the same visible controls as the player. No save editing
// or game-engine hooks: the full day advances on the real game clock.
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
const fullDay = process.env.FULL_DAY !== '0';
const artifactDir = new URL('../artifacts/', import.meta.url);
await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];
const touchPages = new WeakSet();
const log = (text) => console.log(`[browser] ${text}`);

function track(page, label) {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
}
async function click(page, action) {
  log(`Click ${action}`);
  const modalAction = page.getByRole('dialog').locator(`[data-action="${action}"]:visible`);
  const target = await modalAction.count() ? modalAction : page.locator(`[data-action="${action}"]:visible`);
  if (touchPages.has(page)) await target.first().tap(); else await target.first().click();
}
async function ingredient(page, id, count = 1) {
  if (id === 'noodle' && await page.locator('#take-bowl-action').isEnabled()) await click(page, 'take-bowl');
  for (let i = 0; i < count; i++) {
    const target = page.locator(`[data-action="ingredient"][data-ingredient="${id}"]`);
    if (touchPages.has(page)) await target.tap(); else await target.click();
  }
}
async function pour(page) {
  const canvas = page.locator('#kitchen-canvas canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 100, 'The Phaser kitchen is visible.');
  // The broth pot sits below the physical ingredient trays on the 720 x 590 counter.
  const position = { x: box.width * 103 / 720, y: box.height * 380 / 590 };
  if (touchPages.has(page)) await canvas.tap({ position }); else await canvas.click({ position });
}
async function stockAndOpen(page, fromStockModal = false) {
  await expect(page.locator('#cash-stat')).toHaveText('200.000đ');
  if (fromStockModal) {
    await click(page, 'stock');
    await page.getByRole('dialog').locator('[data-action="buy"][data-ingredient="scallion"]').click();
    await expect(page.locator('#cash-stat')).toHaveText('199.750đ');
  }
  await click(page, 'stock-up');
  if (fromStockModal) await click(page, 'dismiss');
  await expect(page.locator('#cash-stat')).toHaveText('71.000đ');
  await expect(page.locator('.prep-checks')).toContainText('2700 ml nước dùng đã nóng');
  await click(page, 'open');
  await expect(page.locator('#order-ticket')).toContainText('Cô Hạnh');
}
async function assembleOrder(page, { resumeRaw = false, screenshot } = {}) {
  const ticket = page.locator('#order-ticket');
  await expect(ticket.locator('.ticket-recipe-title')).toBeVisible({ timeout: 45000 });
  const recipe = (await ticket.locator('.ticket-recipe-title').innerText()).includes('Phở tái') ? 'tai' : 'chin';
  const text = await ticket.innerText();
  if (!resumeRaw) await ingredient(page, 'noodle', text.includes('50 g bánh phở') ? 1 : 2);
  await click(page, 'blanch');
  await expect(page.locator('.cook-info')).toContainText('Đang trụng');
  // Focus the real button before the timing window; Enter tests keyboard access
  // and avoids browser scrolling/actionability checks delaying a timed lift.
  await page.locator('[data-action="lift"]').focus();
  await expect.poll(async () => {
    const visibleTimer = await page.locator('.cook-info').innerText();
    return Number(visibleTimer.match(/Đang trụng · ([\d.]+)/)?.[1] || 0);
  }, { timeout: 15000, intervals: [100] }).toBeGreaterThanOrEqual(3.1);
  log(`Lift via Enter: ${await page.locator('#cook-status').innerText()}`);
  await page.keyboard.press('Enter');
  await expect(page.locator('.cook-info')).toContainText('Bánh vừa ngon');
  await ingredient(page, recipe, 2);
  await pour(page);
  await pour(page);
  if (!text.includes('Không hành lá, hành tây')) {
    await ingredient(page, 'scallion');
    await ingredient(page, 'onion');
  }
  await ingredient(page, 'herbs');
  if (text.includes('Một phần ớt')) await ingredient(page, 'chili');
  if (text.includes('Một miếng chanh')) await ingredient(page,'lime');
  if (text.includes('Một phần quẩy')) await ingredient(page,'quay');
  const n=5+Number(text.includes('Một phần ớt'))+Number(text.includes('Một miếng chanh'))+Number(text.includes('Một phần quẩy'));
  const expectedChecks = `${n}/${n}`;
  await expect(ticket.locator('.checklist-title')).toContainText(expectedChecks);
  if (screenshot) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: new URL(screenshot, artifactDir).pathname, fullPage: true });
  }
  await click(page, 'serve');
  if (await page.locator('#take-bowl-action').isVisible()) await expect(page.locator('#take-bowl-action')).toHaveText('Lấy bát sạch');
}
async function verifyPaused(page, action) {
  await action();
  const clock = await page.locator('#time-stat').innerText();
  await page.waitForTimeout(1300);
  assert.equal(await page.locator('#time-stat').innerText(), clock, 'Game clock pauses while a panel or pause is open.');
}
async function noHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(dimensions.content <= dimensions.viewport + 1,
    `No horizontal page overflow (${dimensions.content}px content / ${dimensions.viewport}px viewport).`);
}
async function counterHitAreas(page, label) {
  await expect(page.locator('.ingredient-panel')).toHaveCount(0);
  const controls = page.locator('#counter-stage [data-action="ingredient"]');
  await expect(controls).toHaveCount(10);
  const ids = ['quay', 'noodle', 'tai', 'chin', 'scallion', 'onion', 'herbs', 'chili', 'lime', 'sauce'];
  for (const id of ids) {
    const control = page.locator(`#ingredient-${id}`);
    await control.scrollIntoViewIfNeeded();
    const geometry = await control.evaluate(button => {
      const b = button.getBoundingClientRect();
      const c = document.querySelector('#kitchen-canvas canvas').getBoundingClientRect();
      const target = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return { width: b.width, height: b.height, inside: b.left >= c.left - 1 && b.top >= c.top - 1 && b.right <= c.right + 1 && b.bottom <= c.bottom + 1, hit: target?.closest('[data-action="ingredient"]')?.id, id: button.id, disabled: button.disabled };
    });
    assert.ok(geometry.inside, `${label}: ${id} hit area stays inside its canvas.`);
    assert.ok(geometry.width >= 40 && geometry.height >= 40, `${label}: ${id} remains large enough to touch (${geometry.width}×${geometry.height}).`);
    if (!geometry.disabled) assert.equal(geometry.hit, geometry.id, `${label}: ${id} receives a pointer at its visible center.`);
  }
  const canvas = page.locator('#kitchen-canvas canvas');
  await canvas.scrollIntoViewIfNeeded();
  const unobstructed = await canvas.evaluate(canvas => {
    const b = canvas.getBoundingClientRect();
    return [{ x: 103, y: 380 }, { x: 548, y: 58 }, { x: 320, y: 434 }].map(point => document.elementFromPoint(b.x + b.width * point.x / 720, b.y + b.height * point.y / 590) === canvas);
  });
  assert.ok(unobstructed.every(Boolean), `${label}: ingredient overlay does not block the pot, clean bowl stack or work bowl.`);
  const b = await canvas.boundingBox();
  assert.ok(b);
  if (await page.locator('#take-bowl-action').isEnabled()) {
    const position = { x: b.width * 548 / 720, y: b.height * 58 / 590 };
    if (touchPages.has(page)) await canvas.tap({ position }); else await canvas.click({ position });
    await expect(page.locator('#take-bowl-action')).toHaveText('Đã lấy bát');
    await expect(page.locator('#take-bowl-action')).toBeDisabled();
  }

  log(`${label}: all 10 physical tray hit areas align; pot and clean bowl stack pointers stay clear.`);
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1040 }, deviceScaleFactor: 1 });
  await desktop.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  desktop.setDefaultTimeout(10000);
  const page = await desktop.newPage();
  track(page, 'desktop');
  await page.goto(url);
  await expect(page.locator('h1')).toContainText('Góc bếp thân quen');
  await expect(page.locator('#kitchen-canvas canvas')).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: new URL('desktop-prep.png', artifactDir).pathname, fullPage: true });
  await click(page, 'help');
  await expect(page.getByRole('dialog')).toContainText('Nhập hàng, nấu nước dùng');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await stockAndOpen(page);
  await counterHitAreas(page, 'Desktop');
  await verifyPaused(page, () => page.locator('#pause-button').click());
  await expect(page.locator('#pause-shade')).toBeVisible();
  await page.locator('#pause-button').click();
  await ingredient(page, 'noodle', 2);
  await expect(page.locator('.cook-info')).toContainText('100 g bánh');
  const cashBeforeReload = await page.locator('#cash-stat').innerText();
  await page.reload();
  await expect(page.locator('#cash-stat')).toHaveText(cashBeforeReload);
  await expect(page.locator('.cook-info')).toContainText('100 g bánh');
  await expect(page.locator('#order-ticket')).toContainText('Cô Hạnh');
  await assembleOrder(page, { resumeRaw: true, screenshot: 'desktop.png' });
  await expect(page.locator('#served-stat')).toContainText('1 / 8 khách');
  await expect(page.locator('#cash-stat')).toHaveText('105.000đ');
  log('Desktop: first perfect order served, cash +34.000đ; pause and reload preserve progress.');
  await verifyPaused(page, () => page.locator('nav [data-tab="ledger"]').click());
  await expect(page.locator('#ledger-view')).toContainText('Tiền và nguyên liệu đã đối soát');
  await expect(page.locator('#ledger-view .ledger-lines')).toContainText('32.000đ');
  await page.locator('nav [data-tab="upgrades"]').click();
  await expect(page.locator('[data-upgrade="basket"]')).toBeDisabled();
  await expect(page.locator('[data-upgrade="pot"]')).toBeDisabled();
  await page.locator('nav [data-tab="kitchen"]').click();

  if (fullDay) {
    for (let served = 2; served <= 8; served++) {
      await assembleOrder(page);
      await expect(page.locator('#served-stat')).toContainText(`${served} / 8 khách`);
      log(`Desktop: served ${served}/8 natural scheduled arrivals.`);
    }
  } else {
    await click(page, 'close-shop');
    await click(page, 'confirm-close');
  }
  await expect(page.locator('#ledger-view')).toBeVisible({ timeout: 35000 });
  await expect(page.locator('#ledger-view h2')).toHaveText('Hết ngày, đếm niềm vui.');
  await expect(page.locator('#ledger-view')).toContainText('Tiền và nguyên liệu đã đối soát');
  if (fullDay) {
    await expect(page.locator('#cash-stat')).toHaveText('315.000đ');
    await expect(page.locator('#ledger-view .profit-line')).toContainText('127.000đ');
    await expect(page.locator('#ledger-view .ledger-mini-stats')).toContainText('100');
  }
  await page.screenshot({ path: new URL('ledger.png', artifactDir).pathname, fullPage: true });
  await click(page, 'next-day');
  await expect(page.locator('#day-label')).toHaveText('Ngày 02');
  await expect(page.locator('#order-ticket')).toContainText('10 người');
  log('Desktop: summary balances cash and inventory; next day opens with retained funds.');
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await mobile.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  mobile.setDefaultTimeout(10000);
  const mobilePage = await mobile.newPage();
  touchPages.add(mobilePage);
  track(mobilePage, 'mobile');
  await mobilePage.goto(url);
  await expect(mobilePage.locator('#kitchen-canvas canvas')).toBeVisible();
  await noHorizontalOverflow(mobilePage);
  await stockAndOpen(mobilePage, true);
  const mobileChecklist = mobilePage.locator('#order-ticket .recipe-checklist');
  await expect(mobileChecklist).toBeVisible();
  await expect(mobileChecklist).toContainText('100 g bánh phở');
  await expect(mobileChecklist).toContainText('50 g bò tái');
  await expect(mobileChecklist).toContainText('300 ml nước dùng');
  for (const row of await mobileChecklist.locator('li').all()) await expect(row).toBeVisible();
  await expect(mobilePage.locator('#mobile-next-step')).toContainText('Chạm chồng bát ở tầng trên của kệ kính');
  await verifyPaused(mobilePage, () => mobilePage.getByRole('button', { name: 'Cách làm Phở tái', exact: true }).tap());
  const guide = mobilePage.getByRole('dialog', { name: 'Cách làm món khách gọi' });
  await expect(guide).toContainText('Phở tái của Cô Hạnh');
  await expect(guide.locator('.help-steps > li')).toHaveCount(7);
  await expect(guide).toContainText('3–5 giây');
  await expect(guide).toContainText('Phải cho đủ thịt trước khi chan nước');
  await guide.getByRole('button', { name: 'Trở lại nấu tiếp' }).tap();
  await expect(guide).toHaveCount(0);
  await expect(mobilePage.locator('#mobile-next-step')).toContainText('Chạm chồng bát ở tầng trên của kệ kính');
  await counterHitAreas(mobilePage, 'Mobile');
  await assembleOrder(mobilePage, { screenshot: 'mobile.png' });
  await expect(mobilePage.locator('#served-stat')).toContainText('1 / 8 khách');
  await noHorizontalOverflow(mobilePage);
  await click(mobilePage, 'stock');
  await expect(mobilePage.getByRole('dialog')).toContainText('Nguyên liệu còn lại.');
  await expect(mobilePage.getByRole('dialog').locator('.stock-row')).toHaveCount(11);
  await click(mobilePage, 'dismiss');
  await ingredient(mobilePage, 'noodle');
  await click(mobilePage, 'discard-prompt');
  await expect(mobilePage.getByRole('dialog')).toContainText('1.500đ');
  await click(mobilePage, 'dismiss');
  await expect(mobilePage.locator('.cook-info')).toContainText('50 g bánh');
  await click(mobilePage, 'discard-prompt');
  await click(mobilePage, 'discard');
  await expect(mobilePage.locator('.cook-info')).toContainText('Chưa có bát');
  await click(mobilePage, 'close-shop');
  await click(mobilePage, 'confirm-close');
  await expect(mobilePage.locator('#ledger-view')).toBeVisible({ timeout: 35000 });
  await expect(mobilePage.locator('#ledger-view')).toContainText('Tiền và nguyên liệu đã đối soát');
  await noHorizontalOverflow(mobilePage);
  log('Mobile 390px: touch controls, perfect order, stock modal and close-shop summary all work without horizontal overflow.');
  await mobile.close();

  const tablet = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await tablet.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  tablet.setDefaultTimeout(10000);
  const tabletPage = await tablet.newPage();
  touchPages.add(tabletPage);
  track(tabletPage, 'tablet');
  await tabletPage.goto(url);
  await click(tabletPage, 'stock-up');
  await click(tabletPage, 'stock');
  for (const id of ['chili', 'lime', 'sauce']) await tabletPage.getByRole('dialog').locator(`[data-action="buy"][data-ingredient="${id}"]`).tap();
  await click(tabletPage, 'dismiss');
  await click(tabletPage, 'open');
  await noHorizontalOverflow(tabletPage);
  await counterHitAreas(tabletPage, 'Tablet');
  const noodle = tabletPage.locator('#ingredient-noodle');
  await noodle.focus();
  await tabletPage.keyboard.press('Enter');
  await expect(noodle.locator('.stock-count')).toHaveText('17');
  await ingredient(tabletPage, 'noodle');
  await expect(noodle.locator('.stock-count')).toHaveText('16');
  await click(tabletPage, 'blanch');
  await expect.poll(async () => Number((await tabletPage.locator('#cook-status').innerText()).match(/([\d.]+) giây/)?.[1] || 0), { intervals: [50] }).toBeGreaterThanOrEqual(3.1);
  await click(tabletPage, 'lift');
  for (const id of ['tai', 'chin']) await ingredient(tabletPage, id);
  await pour(tabletPage);
  await pour(tabletPage);
  for (const id of ['scallion', 'onion', 'herbs', 'chili', 'lime', 'sauce']) await ingredient(tabletPage, id);
  await expect(tabletPage.locator('#ingredient-lime .stock-count')).toHaveText('4');
  for (const id of ['chili', 'sauce']) {
    const control = tabletPage.locator(`#ingredient-${id}`);
    await expect(control.locator('.stock-count')).toHaveText('0');
    if (!await control.isDisabled()) {
      await control.tap();
      await expect(tabletPage.locator('#toast')).toContainText('hết');
    }
    await expect(control.locator('.stock-count')).toHaveText('0');
  }
  await verifyPaused(tabletPage, () => tabletPage.locator('#pause-button').tap());
  for (const id of ['noodle', 'tai', 'chin', 'scallion', 'onion', 'herbs', 'chili', 'lime', 'sauce', 'quay']) await expect(tabletPage.locator(`#ingredient-${id}`)).toBeDisabled();
  await tabletPage.locator('#pause-button').tap();
  await tabletPage.screenshot({ path: new URL('tablet-counter.png', artifactDir).pathname, fullPage: true });
  const cashBeforeTabletReload = await tabletPage.locator('#cash-stat').innerText();
  await tabletPage.reload();
  await expect(tabletPage.locator('#cash-stat')).toHaveText(cashBeforeTabletReload);
  await expect(tabletPage.locator('#ingredient-noodle .stock-count')).toHaveText('16');
  await expect(tabletPage.locator('#ingredient-sauce .stock-count')).toHaveText('0');
  log('Tablet 768px: ingredient trays accept keyboard/touch, empty-stock attempts preserve stock, pause disables all ten controls and reload saves the bowl.');
  await tablet.close();
  assert.deepEqual(errors, [], 'No uncaught browser errors.');
  log(`PASS (${fullDay ? 'full natural day' : 'short day'}). Screenshots saved in artifacts/.`);
} catch (error) {
  let index = 0;
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      await page.screenshot({ path: new URL(`failure-${index++}.png`, artifactDir).pathname, fullPage: true }).catch(() => {});
    }
  }
  throw error;
} finally {
  await browser.close();
}
