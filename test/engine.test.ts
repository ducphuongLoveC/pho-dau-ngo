import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, INGREDIENTS, UPGRADES, validateSave } from '../src/engine.ts';
import type { IngredientId, Order } from '../src/engine.ts';

function ready(): GameEngine {
  const game = new GameEngine();
  assert.equal(game.buyRecommended().ok, true);
  assert.equal(game.prepareBroth(game.state.stock.broth).ok, true);
  assert.equal(game.openShop().ok, true);
  return game;
}
function add(game: GameEngine, id: IngredientId, amount = 1): void {
  if (id === 'noodle' && !game.state.bowlReady) assert.ok(game.takeBowl().ok);
  for (let n = 0; n < amount; n++) assert.equal(game.add(id).ok, true, `add ${id}: ${game.state.notice}`);
}
function makeBowl(game: GameEngine, order: Order, withOnions = !order.noOnion): void {
  add(game, 'noodle', order.noodleUnits);
  assert.equal(game.startBlanch().ok, true);
  game.tick(4);
  assert.equal(game.liftBlanch().ok, true);
  add(game, order.recipeId, 2);
  add(game, 'broth', 2);
  if (withOnions) { add(game, 'scallion'); add(game, 'onion'); }
  add(game, 'herbs');
  if (order.chili) add(game, 'chili');
  if (order.lime) add(game, 'lime');
  if (order.quay) add(game, 'quay');
}
function checkBooks(game: GameEngine): void {
  const books = game.reconciliation();
  assert.equal(books.cashBalanced, true, JSON.stringify(books));
  assert.equal(books.stockBalanced, true, JSON.stringify(books));
}
function playDay(game: GameEngine): void {
  let steps = 0;
  while (game.state.phase !== 'summary' && steps++ < 500) {
    const order = game.state.orders.find(order => order.status === 'waiting' || order.status === 'repair');
    if (!order) { game.tick(1); continue; }
    if (game.state.hotBroth < 2) {
      assert.equal(game.prepareBroth(Math.min(game.state.stock.broth, game.potCapacity - game.state.hotBroth)).ok, true);
      game.tick(15);
    }
    game.chooseOrder(order.id);
    makeBowl(game, order);
    assert.equal(game.serve(order.id).ok, true, game.state.notice);
    checkBooks(game);
  }
  assert.equal(game.state.phase, 'summary');
}

test('complete day reconciles purchases, consumed stock, tips, waste and cash', () => {
  const game = ready();
  assert.equal(game.state.orders[0]!.name, 'Cô Hạnh');
  assert.equal(game.state.ledger.purchases, 129000);
  playDay(game);
  assert.equal(game.state.ledger.served, 8);
  assert.equal(game.state.ledger.failed, 0);
  assert.equal(game.state.ledger.revenue, 258000);
  assert.equal(game.state.ledger.tips, 16000);
  assert.equal(game.state.ledger.cogs, 115000);
  assert.equal(game.state.ledger.waste, 2000);
  assert.equal(game.state.ledger.opex, 30000);
  assert.equal(game.state.cash, 315000);
  assert.equal(game.stockValue(), 12000);
  assert.deepEqual(validateSave(game.export()), game.export());
});

test('ingredient costs move from inventory to WIP and into waste exactly once', () => {
  const game = ready(), initial = game.stockValue(), noodles = game.state.stock.noodle;
  add(game, 'noodle', 2);
  assert.equal(game.state.stock.noodle, noodles - 2);
  assert.equal(game.bowl.cost, 3000);
  assert.equal(game.stockValue(), initial);
  assert.equal(game.discard().ok, true);
  assert.equal(game.state.stock.noodle, noodles - 2);
  assert.equal(game.state.ledger.waste, 3000);
  assert.equal(game.discard().ok, true);
  assert.equal(game.state.ledger.waste, 3000);
  checkBooks(game);
});

test('a rejected unfinished bowl can be repaired and paid only once', () => {
  const game = ready(), order = game.state.orders[0]!;
  add(game, 'noodle', 2); game.startBlanch(); game.tick(4); game.liftBlanch();
  add(game, 'tai', 2);
  assert.equal(game.serve().ok, false);
  assert.equal(order.status, 'repair');
  assert.equal(game.state.ledger.failed, 0);
  assert.equal(game.state.ledger.revenue, 0);
  add(game, 'broth', 2); add(game, 'scallion'); add(game, 'onion'); add(game, 'herbs');
  assert.equal(game.serve().ok, true);
  assert.equal(game.state.ledger.revenue, 32000);
  assert.equal(game.state.lastResult?.score, 100);
  const snapshot = { cash: game.state.cash, cogs: game.state.ledger.cogs, served: game.state.servedTotal };
  assert.equal(game.serve(order.id).ok, false);
  assert.deepEqual({ cash: game.state.cash, cogs: game.state.ledger.cogs, served: game.state.servedTotal }, snapshot);
  checkBooks(game);
});

test('a second rejection fails once and leaves the bowl available to discard', () => {
  const game = ready(), order = game.state.orders[0]!;
  add(game, 'noodle');
  assert.equal(game.serve().ok, false);
  assert.equal(game.serve().ok, false);
  assert.equal(order.status, 'failed');
  const reputation = game.state.reputation;
  game.serve(order.id);
  assert.equal(game.state.ledger.failed, 1);
  assert.equal(game.state.reputation, reputation);
  assert.equal(game.bowl.cost, 1500);
  game.discard();
  assert.equal(game.state.ledger.waste, 1500);
  checkBooks(game);
});

test('missing meat reduces payment enough that underserving is not more profitable', () => {
  const game = ready();
  add(game, 'noodle', 2); game.startBlanch(); game.tick(4); game.liftBlanch();
  add(game, 'tai'); add(game, 'broth', 2); add(game, 'scallion'); add(game, 'onion'); add(game, 'herbs');
  assert.equal(game.serve().ok, true);
  assert.equal(game.state.lastResult?.score, 80);
  assert.equal(game.state.lastResult?.payment, 25600);
  assert.equal(game.state.ledger.cogs, 10000);
  assert.ok(game.state.ledger.revenue - game.state.ledger.cogs < 32000 - 14000);
  checkBooks(game);
});

test('insufficient inventory and malformed purchase quantities never make stock negative', () => {
  const game = new GameEngine(), before = game.export();
  assert.equal(game.buy('tai', -2).ok, false);
  assert.equal(game.buy('tai', 0.5).ok, false);
  assert.equal(game.buy('tai', Number.NaN).ok, false);
  assert.equal(game.buy('tai', 1000).ok, false);
  assert.equal(game.state.cash, before.cash);
  assert.deepEqual(game.state.stock, before.stock);
  assert.equal(game.prepareBroth(1).ok, false);
  assert.equal(game.openShop().ok, false);
  const live = ready();
  add(live, 'noodle'); live.startBlanch(); live.tick(4); live.liftBlanch();
  assert.equal(live.add('chili').ok, false);
  assert.equal(live.state.stock.chili, 0);
  assert.equal(live.bowl.ingredients.chili, 0);
  checkBooks(game); checkBooks(live);
});

test('pausing freezes cooking, arrivals and patience, with one work bowl', () => {
  const game = ready();
  add(game, 'noodle'); game.startBlanch(); game.tick(2);
  assert.equal(game.takeBowl().ok, false);
  assert.equal(game.startBlanch().ok, false);
  game.setPaused(true);
  const elapsed = game.state.elapsed;
  game.tick(200);
  assert.equal(game.state.elapsed, elapsed);
  assert.equal(game.state.bowls[0].cookSeconds, 2);
  assert.equal(game.state.orders[0]!.status, 'waiting');
  assert.equal(game.add('noodle').ok, false);
  game.setPaused(false); game.tick(2); game.liftBlanch();
  assert.equal(game.state.bowls[0].cookScore, 15);
  assert.equal(game.startBlanch().ok, false);
});

test('closing gives pending orders 30 seconds and accounts unfinished ingredients', () => {
  const game = ready();
  add(game, 'noodle');
  const spawned = game.state.spawned;
  assert.equal(game.closeShop().ok, true);
  assert.equal(game.state.phase, 'closing');
  game.tick(29);
  assert.equal(game.state.phase, 'closing');
  assert.equal(game.state.spawned, spawned);
  game.tick(1);
  assert.equal(game.state.phase, 'summary');
  assert.equal(game.state.ledger.failed, 1);
  assert.equal(game.state.ledger.waste, 19500);
  assert.equal(game.state.ledger.opex, 30000);
  game.tick(1000); game.closeShop();
  assert.equal(game.state.ledger.opex, 30000);
  checkBooks(game);
});

test('perishable stock lasts through the following day then expires at closing', () => {
  const game = ready();
  game.closeShop(); game.tick(30);
  assert.equal(game.state.stock.tai, 10);
  game.nextDay();
  assert.equal(game.state.stock.tai, 10);
  assert.equal(game.buy('broth', 2).ok, true);
  assert.equal(game.prepareBroth(2).ok, true);
  assert.equal(game.openShop().ok, true);
  game.closeShop(); game.tick(30);
  for (const id of ['noodle', 'tai', 'chin', 'scallion', 'onion', 'herbs', 'quay'] as IngredientId[]) assert.equal(game.state.stock[id], 0);
  assert.equal(game.state.ledger.waste, 111000);
  checkBooks(game);
});

test('refilling in service reserves raw stock and completes after 15 seconds', () => {
  const game = new GameEngine();
  game.buyRecommended(); game.prepareBroth(2); game.openShop();
  const stock = game.state.stock.broth, total = game.stockValue();
  assert.equal(game.prepareBroth(10).ok, true);
  assert.equal(game.state.stock.broth, stock - 10);
  assert.equal(game.state.hotBroth, 2);
  assert.equal(game.stockValue(), total);
  assert.equal(game.prepareBroth(1).ok, false);
  game.tick(14);
  assert.equal(game.state.hotBroth, 2);
  game.tick(1);
  assert.equal(game.state.hotBroth, 12);
  assert.equal(game.state.brothBatch, null);
  checkBooks(game);
});

test('refill uses a small amount of existing broth, pauses and survives reload', () => {
  const game = new GameEngine();
  game.buyRecommended(); game.prepareBroth(15); game.openShop();
  const cash = game.state.cash;
  assert.deepEqual(game.brothRefillPlan, { units: 3, cost: 0 });
  assert.equal(game.refillBroth().ok, true);
  assert.equal(game.state.stock.broth, 0);
  assert.equal(game.state.cash, cash);
  game.tick(5); game.setPaused(true); game.tick(30);
  assert.equal(game.state.brothBatch?.remaining, 10);
  const restored = new GameEngine(game.export());
  assert.equal(restored.loadError, null);
  restored.setPaused(false); restored.tick(10);
  assert.equal(restored.state.hotBroth, 18);
  assert.equal(restored.state.brothBatch, null);
  checkBooks(restored);
});

test('running out of broth keeps the shop open for a paid refill before new guests arrive', () => {
  const game = new GameEngine();
  for (const [id, units] of Object.entries(game.recommendedShopping()) as [IngredientId, number][]) {
    if (units) game.buy(id, id === 'broth' ? 2 : units);
  }
  game.prepareBroth(2); game.openShop();
  makeBowl(game, game.state.orders[0]!); game.serve();
  assert.equal(game.state.hotBroth, 0);
  assert.equal(game.state.stock.broth, 0);
  assert.equal(game.state.phase, 'open');
  game.tick(28);
  assert.equal(game.state.spawned, 1, 'Do not accept orders using broth that has not been purchased.');
  const cash = game.state.cash, purchases = game.state.ledger.purchases;
  assert.deepEqual(game.brothRefillPlan, { units: 10, cost: 10000 });
  assert.equal(game.refillBroth().ok, true);
  assert.equal(game.state.cash, cash - 10000);
  assert.equal(game.state.ledger.purchases, purchases + 10000);
  assert.equal(game.state.stock.broth, 0);
  assert.equal(game.state.hotBroth, 0);
  assert.equal(game.refillBroth().ok, false, 'A second tap cannot buy a duplicate batch.');
  assert.equal(game.state.cash, cash - 10000);
  game.tick(14);
  assert.equal(game.state.hotBroth, 0);
  game.tick(1);
  assert.equal(game.state.hotBroth, 10);
  assert.ok(game.state.spawned > 1);
  assert.equal(new GameEngine(game.export()).loadError, null);
  checkBooks(game);
});

test('paid refills respect remaining pot space, funds, pause and day boundaries', () => {
  const nearFull = new GameEngine(); nearFull.buyRecommended(); nearFull.buy('broth', 11); nearFull.prepareBroth(29); nearFull.openShop();
  assert.deepEqual(nearFull.brothRefillPlan, { units: 1, cost: 1000 });
  assert.equal(nearFull.refillBroth().ok, true);
  nearFull.tick(15);
  const fullCash = nearFull.state.cash;
  assert.equal(nearFull.refillBroth().ok, false);
  assert.equal(nearFull.state.cash, fullCash);
  assert.equal(nearFull.state.hotBroth, 30);
  checkBooks(nearFull);

  const poor = new GameEngine(); poor.buyRecommended(); poor.buy('sauce', (poor.state.cash - 500) / 500); poor.prepareBroth(18); poor.openShop();
  assert.equal(poor.state.cash, 500);
  const before = poor.export();
  assert.equal(poor.refillBroth().ok, false);
  assert.equal(poor.state.cash, before.cash);
  assert.equal(poor.state.ledger.purchases, before.ledger.purchases);
  assert.deepEqual(poor.state.stock, before.stock);
  assert.equal(poor.state.brothBatch, null);
  checkBooks(poor);

  const lean = new GameEngine(); lean.buyRecommended(); lean.buy('sauce', (lean.state.cash - 1500) / 500); lean.prepareBroth(18); lean.openShop();
  assert.deepEqual(lean.brothRefillPlan, { units: 1, cost: 1000 });
  assert.equal(lean.refillBroth().ok, true);
  assert.equal(lean.state.cash, 500);
  checkBooks(lean);

  const live = ready(); live.setPaused(true);
  const pausedCash = live.state.cash;
  assert.equal(live.refillBroth().ok, false);
  assert.equal(live.state.cash, pausedCash);
  live.setPaused(false); live.closeShop();
  assert.equal(live.refillBroth().ok, true, 'Pending customers can still get broth during closing.');
  live.tick(30);
  const closedCash = live.state.cash;
  assert.equal(live.refillBroth().ok, false);
  assert.equal(live.state.cash, closedCash);
  assert.equal(live.state.brothBatch, null);
  assert.equal(live.buy('broth', 1).ok, false);
  checkBooks(live);
  assert.equal(new GameEngine().refillBroth().ok, false);
});

test('save restore preserves active cooking and rejects incompatible or corrupted saves', () => {
  const game = ready(); add(game, 'noodle', 2); game.startBlanch(); game.tick(3);
  const snapshot = game.export(), restored = new GameEngine(snapshot);
  assert.equal(restored.loadError, null);
  assert.deepEqual(restored.export(), snapshot);
  restored.tick(1); restored.liftBlanch();
  assert.equal(restored.bowl.cookScore, 15);
  assert.equal(game.bowl.cookState, 'cooking', 'restore must not retain references');
  const wrongVersion = new GameEngine({ ...snapshot, version: 900 });
  assert.match(wrongVersion.loadError!, /phiên bản/);
  const corrupted = game.export(); corrupted.cash += 1000;
  assert.match(new GameEngine(corrupted).loadError!, /đối soát/);
  const wrongStock = game.export(); wrongStock.stock.tai = -1;
  assert.ok(new GameEngine(wrongStock).loadError);
  const wrongOrder = game.export(); wrongOrder.orders[0]!.quotedPrice = 1;
  assert.ok(new GameEngine(wrongOrder).loadError);
});

test('day two introduces modifiers and the upgraded strainer extends perfect timing', () => {
  const game = ready(); playDay(game); game.nextDay();
  game.buyRecommended(); game.prepareBroth(Math.min(game.state.stock.broth, game.potCapacity)); game.openShop();
  assert.equal(game.buyUpgrade('basket').ok, false);
  playDay(game);
  assert.ok(game.state.orders.some(order => order.noOnion));
  assert.ok(game.state.orders.some(order => order.noodleUnits === 1));
  assert.equal(game.state.servedTotal, 18);
  assert.equal(game.buyUpgrade('basket').ok, true);
  assert.equal(game.perfectBlanchEnd, 7);
  checkBooks(game);
  game.nextDay(); game.buyRecommended(); game.prepareBroth(Math.min(game.state.stock.broth, game.potCapacity)); game.openShop();
  add(game, 'noodle'); assert.equal(game.startBlanch().ok, true);
  assert.equal(game.takeBowl().ok, false);
  game.tick(6.5);
  assert.equal(game.liftBlanch().ok, true);
  assert.equal(game.bowl.cookScore, 15);
  assert.equal(game.state.bowls.length, 1);
  checkBooks(game);
});

test('recovery grants are visible in ledger and cannot be collected repeatedly', () => {
  const game = new GameEngine();
  // Spend down on a non-meal item; this leaves insufficient food to reopen.
  assert.equal(game.buy('lime', 300).ok, true);
  assert.equal(game.recover().ok, true);
  assert.equal(game.state.cash, 120000);
  assert.equal(game.state.ledger.support, 70000);
  assert.equal(game.recover().ok, false);
  assert.equal(game.state.ledger.support, 70000);
  assert.equal(game.buy('lime', 150).ok, true);
  assert.equal(game.recover().ok, false, 'spending the grant cannot unlock a second grant in the same day');
  assert.equal(game.state.stock.lime * INGREDIENTS.lime.cost, 225000);
  checkBooks(game);
});

test('sold-out recipes stop accepting orders and a fully served small batch closes cleanly', () => {
  const game = new GameEngine();
  for (const [id, amount] of Object.entries({ noodle: 2, tai: 2, broth: 2, scallion: 1, onion: 1, herbs: 1 }) as [IngredientId, number][]) game.buy(id, amount);
  game.prepareBroth(2); game.openShop();
  game.tick(40);
  assert.equal(game.state.spawned, 1, 'ingredients promised to an existing order cannot be promised twice');
  makeBowl(game, game.state.orders[0]!);
  assert.equal(game.serve().ok, true);
  assert.equal(game.state.phase, 'summary');
  assert.equal(game.state.ledger.served, 1);
  assert.equal(game.state.ledger.failed, 0);
  checkBooks(game);
});

test('explicitly canceling an unavailable order settles it once and preserves WIP', () => {
  const game = ready(), order = game.state.orders[0]!;
  add(game, 'noodle', 2);
  assert.equal(game.cancelOrder(order.id).ok, true);
  assert.equal(game.state.ledger.failed, 1);
  assert.equal(game.bowl.cost, 3000);
  assert.equal(game.state.ledger.waste, 0);
  assert.equal(game.cancelOrder(order.id).ok, false);
  assert.equal(game.state.ledger.failed, 1);
  checkBooks(game);
});

test('fractional frames finish closing at exactly 30 seconds and produce restorable saves', () => {
  const game = ready(); game.tick(0.4); game.closeShop(); game.tick(29.9); game.tick(0.2);
  assert.equal(game.state.closingElapsed, 30);
  assert.equal(game.state.phase, 'summary');
  assert.equal(new GameEngine(game.export()).loadError, null);
});

test('small batch costs 54k, counts hot broth, and plays all four orders before selling out', () => {
  const game = new GameEngine();
  assert.equal(game.buySmallBatch().ok, true);
  assert.equal(game.state.ledger.purchases, 54000);
  assert.equal(game.prepareBroth(8).ok, true);
  assert.equal(game.smallShopping().broth, 0);
  assert.equal(game.buySmallBatch().ok, true);
  assert.equal(game.state.ledger.purchases, 54000);
  assert.equal(game.openShop().ok, true);
  playDay(game);
  assert.equal(game.state.ledger.served, 4);
  assert.equal(game.state.ledger.failed, 0);
  assert.equal(game.state.ledger.waste, 0);
  checkBooks(game);
});

test('unaffordable small batch is atomic and the recovery grant can fund it', () => {
  const game = new GameEngine(); game.buy('lime', 300);
  const before = game.export();
  assert.equal(game.buySmallBatch().ok, false);
  assert.equal(game.state.cash, before.cash);
  assert.deepEqual(game.state.stock, before.stock);
  assert.equal(game.recover().ok, true);
  assert.equal(game.buySmallBatch().ok, true);
  assert.equal(game.state.cash, 66000);
  checkBooks(game);
});

test('garnish stock is promised only once and missing garnish prevents opening', () => {
  const game = new GameEngine();
  for (const [id, amount] of Object.entries({ noodle: 4, tai: 4, broth: 4, scallion: 1, onion: 1 }) as [IngredientId, number][]) game.buy(id, amount);
  game.prepareBroth(4);
  assert.equal(game.openShop().ok, false);
  game.buy('herbs');
  assert.equal(game.openShop().ok, true);
  game.tick(40);
  assert.equal(game.state.spawned, 1);
  makeBowl(game, game.state.orders[0]!); game.serve();
  assert.equal(game.state.phase, 'summary');
  assert.equal(game.state.ledger.served, 1);
  checkBooks(game);
});

test('upgrade milestones count served guests, unlock once, and keep buying outside service', () => {
  const game = ready();
  assert.deepEqual(game.upgradeProgress('menu'), { current: 0, target: 5, unlocked: false, owned: false });
  for (let count = 0; count < 5; count++) {
    while (!game.state.orders.some(o => o.status === 'waiting')) game.tick(1);
    const order = game.state.orders.find(o => o.status === 'waiting')!;
    game.chooseOrder(order.id); makeBowl(game, order); game.serve();
    assert.equal(game.upgradeProgress('menu').unlocked, count === 4);
  }
  assert.equal(game.shopRank.name, 'Bếp bắt đầu đỏ lửa');
  const inServiceCash = game.state.cash;
  assert.equal(game.buyUpgrade('menu').ok, false);
  assert.equal(game.state.cash, inServiceCash);
  game.closeShop(); game.tick(30);
  const cash = game.state.cash;
  assert.equal(game.buyUpgrade('menu').ok, true);
  assert.equal(game.state.cash, cash - 40000);
  assert.equal(game.upgradeProgress('menu').owned, true);
  assert.equal(game.buyUpgrade('menu').ok, false);
  assert.equal(game.state.cash, cash - 40000);
  checkBooks(game);
  assert.equal(new GameEngine(game.export()).loadError, null);
  game.nextDay(); game.buyRecommended(); game.prepareBroth(10); game.openShop();
  assert.equal(game.state.orders[0]!.patience, 100);
  assert.equal(game.patienceBonus, 5);
  assert.equal(game.buyUpgrade('tea').ok, false);
});

test('old saves keep bought equipment and add new upgrades without changing funds or orders', () => {
  const game = ready(); playDay(game); game.nextDay();
  game.buyRecommended(); game.prepareBroth(20); game.openShop(); playDay(game);
  assert.equal(game.buyUpgrade('basket').ok, true);
  const legacy = JSON.parse(JSON.stringify(game.export()));
  delete legacy.upgrades.menu; delete legacy.upgrades.stove; delete legacy.upgrades.tea;
  const restored = new GameEngine(legacy);
  assert.equal(restored.loadError, null);
  assert.equal(restored.state.cash, legacy.cash);
  assert.deepEqual(restored.state.orders, legacy.orders);
  assert.equal(restored.perfectBlanchEnd, 7);
  assert.deepEqual(restored.state.upgrades, { basket: true, pot: false, menu: false, stove: false, tea: false });
  assert.equal(legacy.upgrades.menu, undefined, 'Migration does not mutate its input.');
  assert.equal(restored.upgradeProgress('menu').unlocked, true);
  const malformed = restored.export();
  (malformed.upgrades as unknown as Record<string, unknown>).stove = 'yes';
  assert.ok(new GameEngine(malformed).loadError);
  checkBooks(restored);
});

test('all progression goals are reachable through normal play and equipment effects persist', () => {
  const game = new GameEngine();
  for (let day = 0; game.state.servedTotal < 100 && day < 12; day++) {
    assert.equal(game.buyRecommended().ok, true);
    game.prepareBroth(Math.min(game.state.stock.broth, game.potCapacity));
    assert.equal(game.openShop().ok, true);
    playDay(game);
    for (const upgrade of Object.values(UPGRADES)) {
      if (!game.state.upgrades[upgrade.id] && game.upgradeProgress(upgrade.id).unlocked && game.state.cash >= upgrade.price + 350000) {
        assert.equal(game.buyUpgrade(upgrade.id).ok, true);
        checkBooks(game);
      }
    }
    if (game.state.servedTotal < 100) game.nextDay();
  }
  assert.ok(game.state.servedTotal >= 100);
  assert.ok(Object.values(game.state.upgrades).every(Boolean));
  assert.equal(game.shopRank.name, 'Quán ruột của phố');
  assert.equal(game.potCapacity, 50);
  assert.equal(game.perfectBlanchEnd, 7);
  assert.equal(game.brothCookDuration, 10);
  assert.equal(game.patienceBonus, 15);
  const restored = new GameEngine(game.export());
  assert.equal(restored.loadError, null);
  assert.equal(restored.shopRank.name, game.shopRank.name);
  assert.equal(restored.patienceBonus, 15);
  restored.nextDay(); restored.buyRecommended(); restored.prepareBroth(2); restored.openShop();
  assert.equal(restored.state.orders[0]!.patience, 110);
  assert.equal(restored.prepareBroth(10).ok, true);
  restored.tick(9);
  assert.equal(restored.state.hotBroth, 2);
  assert.equal(new GameEngine(restored.export()).loadError, null);
  restored.tick(1);
  assert.equal(restored.state.hotBroth, 12);
  checkBooks(restored);
});

test('taking one clean bowl is required, free, atomic, and repeated after serving or discarding', () => {
  const game = ready();
  const initial = game.export();
  assert.equal(game.state.bowlReady, false);
  assert.equal(game.add('noodle').ok, false);
  assert.equal(game.serve().ok, false);
  assert.equal(game.state.orders[0].repairs, 0);
  game.setPaused(true); assert.equal(game.takeBowl().ok, false); game.setPaused(false);
  assert.equal(game.takeBowl().ok, true);
  assert.equal(game.takeBowl().ok, false);
  assert.equal(game.state.cash, initial.cash);
  assert.deepEqual(game.state.stock, initial.stock);
  const emptyReload = new GameEngine(game.export());
  assert.equal(emptyReload.loadError, null);
  assert.equal(emptyReload.state.bowlReady, true);
  makeBowl(game, game.state.orders[0]);
  const dish = structuredClone(game.bowl);
  assert.equal(game.takeBowl().ok, false);
  assert.deepEqual(game.bowl, dish);
  assert.equal(game.serve().ok, true);
  assert.equal(game.state.bowlReady, false);
  assert.equal(game.add('noodle').ok, false);
  assert.equal(game.takeBowl().ok, true);
  add(game, 'noodle');
  assert.equal(game.discard().ok, true);
  assert.equal(game.state.bowlReady, false);
  assert.equal(game.state.ledger.waste, 1500);
  assert.equal(game.add('noodle').ok, false);
  assert.equal(new GameEngine(game.export()).loadError, null);
  checkBooks(game);
});

test('version 1 two-dish migration keeps the chosen dish and returns the other paid ingredients once', () => {
  const game = ready();
  makeBowl(game, game.state.orders[0]);
  const legacy = JSON.parse(JSON.stringify(game.export()));
  legacy.version = 1; delete legacy.bowlReady;
  legacy.bowls.push(structuredClone(legacy.bowls[0]));
  legacy.bowls[1].id = 1; legacy.selectedBowl = 1;
  // A second paid legacy dish, while keeping the original books balanced.
  for (const [id, quantity] of Object.entries(legacy.bowls[1].ingredients) as [IngredientId, number][]) {
    if (id === 'broth') legacy.hotBroth -= quantity;
    else {
      legacy.stock[id] -= quantity;
      const lot = legacy.stockLots.find((lot: {ingredient: string}) => lot.ingredient === id);
      if (quantity) lot.quantity -= quantity;
    }
  }
  legacy.stockLots = legacy.stockLots.filter((lot: {quantity: number}) => lot.quantity > 0);
  legacy.upgrades.basket = true;
  const original = structuredClone(legacy);
  const restored = new GameEngine(legacy);
  assert.equal(restored.loadError, null);
  assert.equal(restored.state.version, 5);
  assert.equal(restored.state.bowlReady, true);
  assert.equal(restored.state.bowls.length, 1);
  assert.deepEqual(restored.bowl, { ...legacy.bowls[1], id: 0 });
  assert.equal(restored.state.cash, legacy.cash);
  assert.deepEqual(restored.state.ledger, legacy.ledger);
  assert.equal(restored.state.stock.broth, legacy.stock.broth + 2);
  assert.equal(restored.perfectBlanchEnd, 7);
  assert.deepEqual(legacy, original, 'Do not mutate the source save.');
  checkBooks(restored);
  assert.deepEqual(validateSave(restored.export()), restored.export(), 'Migration must not return ingredients twice.');
  assert.equal(restored.serve().ok, true);
  checkBooks(restored);
  const corrupted = structuredClone(legacy);
  corrupted.bowls[0].cost++;
  assert.ok(new GameEngine(corrupted).loadError, 'Validate legacy cost before returning inventory.');
});

test('legacy single unfinished dish survives either selection, while empty saves require a clean bowl', () => {
  for (const selected of [0, 1]) {
    const game = ready();
    const empty = structuredClone(game.bowl);
    add(game, 'noodle'); game.startBlanch(); game.tick(3.5);
    const legacy = JSON.parse(JSON.stringify(game.export()));
    legacy.version = 1; delete legacy.bowlReady;
    legacy.bowls = [empty, { ...legacy.bowls[0], id: 1 }];
    legacy.selectedBowl = selected;
    const restored = new GameEngine(legacy);
    assert.equal(restored.loadError, null);
    assert.equal(restored.state.bowlReady, true);
    assert.equal(restored.bowl.cookSeconds, 3.5);
    assert.equal(restored.liftBlanch().ok, true);
    checkBooks(restored);
  }
  for (const phase of ['prep', 'open', 'summary'] as const) {
    const game = phase === 'prep' ? new GameEngine() : ready();
    if (phase === 'summary') { game.closeShop(); game.tick(30); }
    const legacy = JSON.parse(JSON.stringify(game.export()));
    legacy.version = 1; delete legacy.bowlReady;
    legacy.bowls.push({ ...structuredClone(legacy.bowls[0]), id: 1 });
    legacy.selectedBowl = 1;
    const restored = new GameEngine(legacy);
    assert.equal(restored.loadError, null);
    assert.equal(restored.state.bowlReady, false);
    assert.equal(restored.state.phase, phase);
    checkBooks(restored);
  }
});

test('perfect timing honors normal and upgraded limits, including after reload', () => {
  for (const upgraded of [false, true]) for (const time of [2.9, 3, 5, 5.1, 7, 7.1]) {
    const game = ready(); game.state.upgrades.basket = upgraded;
    add(game, 'noodle'); game.startBlanch(); game.tick(time);
    const restored = new GameEngine(game.export());
    assert.equal(restored.loadError, null);
    restored.liftBlanch();
    assert.equal(restored.bowl.cookScore === 15, time >= 3 && time <= (upgraded ? 7 : 5));
  }
  const invalid = ready().export(); invalid.bowls[0].cookState = 'raw';
  assert.ok(new GameEngine(invalid).loadError);
});
