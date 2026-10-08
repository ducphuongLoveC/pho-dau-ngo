import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { GameEngine } from '../src/engine.ts';

const url = process.env.GAME_URL || 'http://127.0.0.1:4173';
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
function assemble(game) {
  while (!game.state.orders.some(o => o.status === 'waiting')) game.tick(1);
  const order = game.state.orders.find(o => o.status === 'waiting'); game.chooseOrder(order.id);
  assert.ok(game.takeBowl().ok);
  for(let i=0;i<order.noodleUnits;i++)game.add('noodle');
  game.startBlanch(); game.tick(4); game.liftBlanch();
  game.add(order.recipeId); game.add(order.recipeId); game.add('broth'); game.add('broth');
  if(!order.noOnion){game.add('scallion');game.add('onion');}
  game.add('herbs');if(order.chili)game.add('chili');
}
const approaching = new GameEngine(); approaching.buyRecommended(); approaching.prepareBroth(18); approaching.openShop();
for (let i=0;i<4;i++) { assemble(approaching); approaching.serve(); }
assemble(approaching);
const summary = new GameEngine(approaching.export()); summary.serve(); summary.closeShop(); summary.tick(30);
// Version-1 fixture from before the new equipment existed.
const legacy = summary.export(); legacy.version=1; delete legacy.bowlReady; legacy.bowls.push({...structuredClone(legacy.bowls[0]),id:1}); delete legacy.upgrades.menu; delete legacy.upgrades.stove; delete legacy.upgrades.tea;
const ending = new GameEngine(); ending.buyRecommended(); ending.prepareBroth(18); ending.openShop();
for(let i=0;i<8;i++){assemble(ending);ending.serve();}
ending.nextDay();ending.buyRecommended();ending.prepareBroth(22);ending.openShop();
for(let i=0;i<9;i++){assemble(ending);ending.serve();}
assemble(ending);
const veteran = new GameEngine();
// These are purchases and customers from earlier days, outside today's ledger.
veteran.state.day=8; veteran.state.servedTotal=100;
veteran.state.upgrades.menu=true; veteran.state.upgrades.tea=true; veteran.state.upgrades.stove=true;
veteran.buySmallBatch(); veteran.prepareBroth(2); veteran.openShop();
assert.equal(new GameEngine(veteran.export()).loadError,null);
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
async function open(width,save) {
  const context=await browser.newContext({viewport:{width,height:width>640?960:700},deviceScaleFactor:width===390?3:2,isMobile:width<640,hasTouch:true});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  if(save)await page.addInitScript(save=>{if(!localStorage.getItem('pho-dau-ngo.save.v1'))localStorage.setItem('pho-dau-ngo.save.v1',JSON.stringify(save));},save);
  await page.goto(url);return {context,page};
}
async function noOverflow(page) {
  const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll<=size.width+1,JSON.stringify(size));
}
try {
  for(const width of [1440,320]) {
    const {context,page}=await open(width);
    await page.locator('.tab[data-tab="upgrades"]').tap();
    await expect(page.locator('.upgrade-card')).toHaveCount(5);
    await expect(page.locator('#upgrade-menu progress')).toHaveAttribute('value','0');
    await expect(page.locator('#upgrade-menu [data-action="upgrade"]')).toBeDisabled();
    await expect(page.locator('.goal-card')).toContainText('Phục vụ thêm 5 khách');
    await expect(page.locator('.rank-journey')).toContainText('100 khách');
    await expect(page.locator('#cash-stat')).toHaveText('200.000đ');
    await noOverflow(page);
    await page.screenshot({path:new URL(`goals-locked-${width}.png`,artifacts).pathname,fullPage:true});
    await context.close();
  }
  {
    const {context,page}=await open(390,approaching.export());
    await expect(page.locator('#upgrade-badge')).toBeHidden();
    await page.locator('#mobile-serving [data-action="serve"]').tap();
    await expect(page.locator('#toast')).toContainText('Mở khóa Bảng thực đơn rõ ràng');
    await expect(page.locator('#upgrade-badge')).toHaveText('1');
    await page.locator('.tab[data-tab="upgrades"]').tap();
    await expect(page.locator('#upgrade-menu')).toContainText('ĐÃ MỞ KHÓA');
    await expect(page.locator('#upgrade-menu progress')).toHaveAttribute('value','5');
    await expect(page.locator('#upgrade-menu [data-action="upgrade"]')).toHaveText(/Mua sau ca/);
    await expect(page.locator('#upgrade-menu [data-action="upgrade"]')).toBeDisabled();
    await noOverflow(page);
    await page.reload();
    await expect(page.locator('#toast')).toBeHidden();
    await expect(page.locator('#upgrade-badge')).toHaveText('1');
    await context.close();
  }
  {
    const {context,page}=await open(320,legacy);
    await expect(page.locator('#cash-stat')).toHaveText(`${legacy.cash.toLocaleString('vi-VN')}đ`);
    await page.locator('.tab[data-tab="upgrades"]').tap();
    const buy=page.locator('#upgrade-menu [data-action="upgrade"]');
    await expect(buy).toBeEnabled();await buy.tap();
    await expect(buy).toBeDisabled();await expect(buy).toHaveText(/Đã sở hữu/);
    await expect(page.locator('#cash-stat')).toHaveText(`${(legacy.cash-40000).toLocaleString('vi-VN')}đ`);
    await expect(page.locator('#upgrade-badge')).toBeHidden();
    await expect(page.locator('.goal-card')).toContainText('Giỏ trụng giữ nhiệt');
    await page.reload();await page.locator('.tab[data-tab="upgrades"]').tap();
    await expect(page.locator('#upgrade-menu')).toContainText('ĐANG SỬ DỤNG');
    await expect(page.locator('#cash-stat')).toHaveText(`${(legacy.cash-40000).toLocaleString('vi-VN')}đ`);
    await noOverflow(page);
    await page.screenshot({path:new URL('goals-purchased-320.png',artifacts).pathname,fullPage:true});
    const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('pho-dau-ngo.save.v1')));
    const restored=new GameEngine(state);assert.equal(restored.loadError,null);assert.equal(restored.patienceBonus,5);
    assert.ok(restored.reconciliation().cashBalanced);assert.ok(restored.reconciliation().stockBalanced);
    await context.close();
  }
  {
    const {context,page}=await open(390,ending.export());
    await page.locator('#mobile-serving [data-action="serve"]').tap();
    await expect(page.locator('#ledger-view')).toBeVisible();
    await expect(page.locator('#toast')).toContainText('Mở khóa Giỏ trụng giữ nhiệt');
    await expect(page.locator('#upgrade-badge')).toHaveText('2');
    await noOverflow(page);
    await context.close();
  }
  {
    const {context,page}=await open(390,veteran.export());
    await expect(page.locator('.brand-mark')).toHaveClass(/renowned/);
    await page.locator('.tab[data-tab="upgrades"]').tap();
    await expect(page.locator('.rank-card')).toContainText('Quán ruột của phố');
    await expect(page.locator('.rank-journey li.earned')).toHaveCount(6);
    await expect(page.locator('#upgrade-stove')).toContainText('ĐANG SỬ DỤNG');
    await expect(page.locator('#upgrade-stove')).toContainText('10 giây');
    await noOverflow(page);
    await page.screenshot({path:new URL('goals-veteran-390.png',artifacts).pathname,fullPage:true});
    await page.locator('.tab[data-tab="kitchen"]').tap();await page.locator('.counter-stock-link').tap();
    await expect(page.locator('[data-action="refill"]')).toHaveText('Nấu thêm 900 ml · 10 giây');
    await expect(page.locator('#refill-description')).toContainText('sau 10 giây');
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS progression: locked goals, fifth-customer unlock, no repeated alert on reload, buying after the shift, legacy saves, persistent perks, 100-customer rank, 10-second broth and mobile layout.');
} finally {await browser.close();}
