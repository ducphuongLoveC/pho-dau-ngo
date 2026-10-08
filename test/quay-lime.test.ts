import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GameEngine,RECIPES,QUAY_PRICE,validateSave} from '../src/engine.ts';
import type {IngredientId,Order} from '../src/engine.ts';
function ready(quayUnits=2){const g=new GameEngine();const plan=g.recommendedShopping();plan.quay=quayUnits;for(const [id,n] of Object.entries(plan))if(n)assert.ok(g.buy(id as IngredientId,n).ok);g.prepareBroth(g.state.stock.broth);g.openShop();return g;}
function food(g:GameEngine,o:Order){
  g.chooseOrder(o.id);assert.ok(g.takeBowl().ok);
  for(let i=0;i<o.noodleUnits;i++)g.add('noodle');g.startBlanch();g.tick(4);g.liftBlanch();
  g.add(o.recipeId);g.add(o.recipeId);g.add('broth');g.add('broth');
  if(!o.noOnion){g.add('scallion');g.add('onion');}g.add('herbs');if(o.chili)g.add('chili');
}
function next(g:GameEngine){while(!g.state.orders.some(o=>o.status==='waiting'))g.tick(1);return g.state.orders.find(o=>o.status==='waiting')!;}
function serve(g:GameEngine,o=next(g)){food(g,o);if(o.lime)g.add('lime');if(o.quay)g.add('quay');assert.ok(g.serve().ok);return o;}
function books(g:GameEngine){assert.ok(g.reconciliation().cashBalanced);assert.ok(g.reconciliation().stockBalanced);assert.deepEqual(validateSave(g.export()),g.export());}

test('day-one shopping includes sides; natural arrivals request lime, quay and both',()=>{
 const g=ready();assert.equal(g.state.ledger.purchases,129000);assert.equal(g.state.stock.lime,4);assert.equal(g.state.stock.quay,2);
 const orders:Order[]=[];
 for(let i=0;i<8;i++){const o=serve(g);orders.push(o);assert.equal(g.state.lastResult?.score,100);books(g);}
 assert.equal(orders[0].lime,false);assert.equal(orders[0].quay,false);
 assert.equal(orders[1].lime,true);assert.equal(orders[1].quotedPrice,RECIPES.chin.price);
 assert.equal(orders[2].quay,true);assert.equal(orders[2].quotedPrice,RECIPES.tai.price+QUAY_PRICE);
 assert.equal(orders[5].lime,true);assert.equal(orders[5].quay,true);
 assert.equal(g.state.stock.lime,0);assert.equal(g.state.stock.quay,0);
});

test('missing paid quay can be repaired after reload; selecting or serving twice never double charges',()=>{
 const g=ready();serve(g);serve(g);const o=next(g);food(g,o);const cash=g.state.cash,cost=g.bowl.cost;
 assert.equal(g.serve().ok,false);assert.equal(o.status,'repair');assert.equal(g.state.cash,cash);
 assert.ok(g.add('quay').ok);assert.equal(g.bowl.cost,cost+2500);assert.equal(g.state.cash,cash);
 const stock=g.state.stock.quay;assert.equal(g.add('quay').ok,false);assert.equal(g.state.stock.quay,stock);
 const restored=new GameEngine(g.export());assert.equal(restored.loadError,null);assert.ok(restored.serve().ok);
 assert.equal(restored.state.lastResult?.payment,37000);assert.equal(restored.state.cash,cash+39000);
 const paid=restored.state.cash;assert.equal(restored.serve(o.id).ok,false);assert.equal(restored.state.cash,paid);books(restored);
});

test('lime is scored against the actual request without a surcharge',()=>{
 for(const addLime of [true,false]){const g=ready();serve(g);const o=next(g);assert.ok(o.lime);food(g,o);if(addLime)g.add('lime');assert.ok(g.serve().ok);assert.equal(g.state.lastResult?.score,addLime?100:95);assert.equal(o.quotedPrice,30000);books(g);}
});

test('one portion of quay is reserved only once while the first customer is still waiting',()=>{
 const g=ready(1);
 for(let step=0;g.state.spawned<6&&step<250;step++){
  const o=g.state.orders.find(o=>o.status==='waiting'&&!o.quay);
  if(o)serve(g,o);else g.tick(1);
 }
 assert.equal(g.state.orders[2].quay,true);assert.equal(g.state.orders[2].status,'waiting');
 assert.equal(g.state.stock.quay,1);assert.equal(g.state.orders[5].quay,false);books(g);
});

test('small budget play remains available; sides can be restocked midshift while the stock dialog pauses cooking',()=>{
 const g=new GameEngine();g.buySmallBatch();assert.equal(g.state.cash,146000);g.prepareBroth(8);g.openShop();g.setPaused(true);
 assert.ok(g.buy('lime',2).ok);assert.ok(g.buy('quay',1).ok);assert.equal(g.add('quay').ok,false);
 g.setPaused(false);serve(g);assert.equal(next(g).lime,true);books(g);
});

test('v4 cooking saves preserve money and recipes, and malformed v5 side data is rejected',()=>{
 const old=JSON.parse(readFileSync(new URL('./fixtures/v4-cooking.json',import.meta.url),'utf8'));
 const g=new GameEngine(old);assert.equal(g.loadError,null);assert.equal(g.state.version,5);assert.equal(g.state.cash,old.cash);
 assert.equal(g.bowl.cookSeconds,1);assert.equal(g.bowl.cost,old.bowls[0].cost);assert.equal(g.state.stock.quay,0);
 assert.equal(g.state.orders[0].lime,false);assert.equal(g.state.orders[0].quay,false);books(g);
 for(const corrupt of [(s:any)=>{delete s.orders[0].lime;},(s:any)=>{s.orders[0].quay=true;},(s:any)=>{delete s.stock.quay;}]){const save=g.export();corrupt(save);assert.ok(new GameEngine(save).loadError);}
});
