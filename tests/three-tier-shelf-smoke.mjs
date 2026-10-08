import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
const url=process.env.GAME_URL||'http://127.0.0.1:4173';
const key='pho-dau-ngo.save.v1';
const old=JSON.parse(readFileSync(new URL('../test/fixtures/v3-working.json',import.meta.url),'utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
try {
  for (const width of [320,390,1440]) {
    const mobile=width<500;
    const context=await browser.newContext({viewport:{width,height:mobile?844:1040},deviceScaleFactor:mobile?3:1,isMobile:mobile,hasTouch:mobile});
    await context.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const click=async(selector)=>{const el=page.locator(selector).first();if(mobile)await el.tap();else await el.click();};
    const canvasTap=async(x,y)=>{
      const canvas=page.locator('#kitchen-canvas canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
      const position={x:box.width*x/720,y:box.height*y/590};
      if(mobile)await canvas.tap({position});else await canvas.click({position});
    };
    await page.goto(url);await click('[data-action="stock-up"]:visible');await click('[data-action="open"]:visible');
    await expect(page.locator('#counter-stage .counter-tray')).toHaveCount(10);
    await expect(page.locator('#ingredient-sting,#ingredient-coca,#ingredient-redbull,#buy-drinks-pack')).toHaveCount(0);
    await page.locator('#counter-stage').screenshot({path:`artifacts/three-tier-${width}-before.png`});
    await canvasTap(646,452);await expect(page.locator('#take-bowl-action')).toHaveText('Lấy bát sạch');
    await canvasTap(548,58);await expect(page.locator('#take-bowl-action')).toHaveText('Đã lấy bát');
    await page.waitForTimeout(450);
    await page.locator('#counter-stage').screenshot({path:`artifacts/three-tier-${width}-bowl.png`});
    await page.screenshot({path:`artifacts/three-tier-${width}-page.png`,fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await click('[data-action="stock"]:visible');
    await expect(page.getByRole('dialog').locator('.stock-row')).toHaveCount(11);
    assert.ok(!/Sting|Coca|Red Bull/.test(await page.getByRole('dialog').innerText()));
    await context.close();
    // A separate isolated context verifies a real previous-version save.
    const migrate=await browser.newContext({viewport:{width,height:mobile?844:1040},isMobile:mobile,hasTouch:mobile});
    await migrate.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
    const restored=await migrate.newPage();restored.on('pageerror',e=>errors.push(e.message));
    await restored.addInitScript(({key,old})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(old));},{key,old});
    await restored.goto(url);await expect(restored.locator('#cash-stat')).toHaveText('112.000đ');
    await expect(restored.locator('#order-ticket .checklist-title')).toContainText('5/5');
    assert.ok(!/Sting|Coca|Red Bull/.test(await restored.locator('#order-ticket').innerText()));
    await restored.reload();await expect(restored.locator('#cash-stat')).toHaveText('112.000đ');
    await restored.locator('[data-action="serve"]:visible').first().click();
    await expect(restored.locator('#cash-stat')).toHaveText('144.000đ');
    await expect.poll(async()=>JSON.parse(await restored.evaluate(key=>localStorage.getItem(key),key)).ledger.served).toBe(2);
    const save=JSON.parse(await restored.evaluate(key=>localStorage.getItem(key),key));assert.equal(save.version,5);assert.equal(save.ledger.refunds,18000);
    await restored.locator('[data-action="tab"][data-tab="ledger"]').click();
    await expect(restored.locator('#ledger-view')).toContainText('Hoàn tiền hàng đã bỏ');
    await expect(restored.locator('#ledger-view')).toContainText('Tiền và nguyên liệu đã đối soát');
    await migrate.close();
    console.log(`PASS ${width}px: upper-shelf bowl touch, removed drinks, no overflow, one-time refund and migrated pho served.`);
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
