import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameEngine, INGREDIENTS, validateSave } from '../src/engine.ts';
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/v3-${name}.json`,import.meta.url),'utf8'));
const removed = ['sting','coca','redbull'];
function check(game: GameEngine) {
  assert.equal(game.loadError,null);
  assert.ok(game.reconciliation().cashBalanced);
  assert.ok(game.reconciliation().stockBalanced);
  assert.deepEqual(validateSave(game.export()),game.export());
  for(const id of removed) {
    assert.equal(id in game.state.stock,false);assert.equal(id in game.bowl.ingredients,false);
    assert.equal(game.state.stockLots.some(l=>String(l.ingredient)===id),false);
  }
  assert.ok(game.state.orders.every(o=>!('drink' in o)));
}

test('retiring drinks refunds unused stock and a selected bottle once without changing the pho',()=>{
  const old=fixture('working'), original=structuredClone(old), game=new GameEngine(old);
  check(game);assert.equal(game.state.version,5);assert.equal(game.state.cash,old.cash+18000);
  assert.equal(game.state.ledger.refunds,18000);assert.equal(game.bowl.cost,old.bowls[0].cost-6000);
  assert.equal(game.state.selectedOrderId,old.selectedOrderId);assert.equal(game.bowl.cookState,'cooked');
  assert.equal(game.state.orders[1].quotedPrice,30000);
  for(const id of Object.keys(INGREDIENTS) as (keyof typeof INGREDIENTS)[])assert.equal(game.bowl.ingredients[id],old.bowls[0].ingredients[id] ?? 0);
  const restored=new GameEngine(game.export());assert.equal(restored.state.cash,game.state.cash);check(restored);
  assert.ok(restored.serve().ok);assert.equal(restored.state.lastResult?.payment,30000);check(restored);
  assert.deepEqual(old,original);
});

test('paid drink revenue stays in history; only unused stock is refunded in open, closed and next-day saves',()=>{
  for(const name of ['sold','summary','next-day']) {
    const old=fixture(name), game=new GameEngine(old);check(game);
    assert.equal(game.state.cash,old.cash+12000);assert.equal(game.state.ledger.refunds,12000);
    assert.equal(game.state.ledger.revenue,old.ledger.revenue);assert.equal(game.state.ledger.cogs,old.ledger.cogs);
    assert.equal(game.state.servedTotal,old.servedTotal);assert.deepEqual(game.state.upgrades,old.upgrades);
    if(name==='summary') {assert.equal(game.state.ledger.closingCash,game.state.cash);assert.ok(game.nextDay().ok);assert.equal(game.state.ledger.refunds,0);check(game);}
    if(name==='next-day')assert.equal(game.state.ledger.purchases,0);
  }
});

test('a pending drink repair can continue as pho-only after migration',()=>{
  const old=fixture('working');old.orders[1].status='repair';old.orders[1].repairs=1;
  old.lastResult={orderId:old.orders[1].id,status:'repair',score:100,payment:0,tip:0,issues:['Khách gọi thêm Sting.'],message:'Sửa nước uống'};
  const game=new GameEngine(old);check(game);assert.equal(game.state.lastResult,null);assert.ok(game.serve().ok);check(game);
});

test('corrupt v3 drink inventory is rejected before any refund is applied',()=>{
  for(const corrupt of [
    (s: any)=>{s.stock.sting=10;},
    (s: any)=>{s.cash+=1;},
    (s: any)=>{s.bowls[0].cost-=6000;},
    (s: any)=>{s.ledger.drinkRevenue=12000;},
    (s: any)=>{s.orders[1].drink='unknown';},
  ]) {
    const old=fixture('working');corrupt(old);const copy=structuredClone(old);
    assert.ok(new GameEngine(old).loadError);assert.deepEqual(old,copy);
  }
});

test('v2 saves receive a zero refund field and new games expose only pho ingredients',()=>{
  const game=new GameEngine(), legacy: any=game.export();legacy.version=2;delete legacy.ledger.refunds;
  const restored=new GameEngine(legacy);check(restored);assert.equal(restored.state.cash,200000);assert.equal(restored.state.ledger.refunds,0);
  assert.equal(Object.keys(INGREDIENTS).length,11);
  for(const id of removed)assert.equal(game.buy(id as keyof typeof INGREDIENTS).ok,false);
});
