// Read-only compatibility for the retired version-3 drinks feature.
// Validate the original ledger before converting any inventory into a refund.
import type { GameState, Bowl, Order, Ledger as CurrentLedger, IngredientId as CurrentFoodId } from './engine.ts';
type FoodId = Exclude<CurrentFoodId, 'quay'>;
type FoodStock = Record<FoodId, number>;
type FoodOrder = Omit<Order, 'lime' | 'quay'>;
type RetiredState = Omit<GameState, 'version' | 'stock' | 'bowls' | 'orders'> & { version: 4; stock: FoodStock; bowls: [Omit<Bowl, 'ingredients'> & {ingredients: FoodStock}]; orders: FoodOrder[] };
type DrinkId = 'sting' | 'coca' | 'redbull';
type IngredientId = FoodId | DrinkId;
type Stock = Record<IngredientId, number>;
type LegacyBowl = Omit<Bowl, 'ingredients'> & { ingredients: Stock; drinkExpiresOn?: number };
type Ledger = Omit<CurrentLedger, 'refunds'> & { drinkRevenue: number; drinkCogs: number; drinksSold: number };
type LegacyState = Omit<RetiredState, 'version' | 'stock' | 'stockLots' | 'bowls' | 'orders' | 'ledger'> & {
  version: 3; stock: Stock; stockLots: {ingredient: IngredientId; quantity: number; expiresOn: number}[];
  bowls: [LegacyBowl]; orders: (FoodOrder & {drink: DrinkId | null})[]; ledger: Ledger;
};
const COSTS = {noodle:1500,tai:4000,chin:3500,broth:1000,scallion:250,onion:250,herbs:500,chili:500,lime:500,sauce:500,sting:6000,coca:5000,redbull:7000};
const INGREDIENTS = Object.fromEntries(Object.entries(COSTS).map(([id,cost])=>[id,{cost}])) as Record<IngredientId,{cost:number}>;
const IDS = Object.keys(COSTS) as IngredientId[];
const DRINK_IDS: DrinkId[] = ['sting','coca','redbull'];
const DRINKS = {sting:{price:12000},coca:{price:12000},redbull:{price:15000}};
const RECIPES = {tai:{price:32000},chin:{price:30000}};
const ACTIVE = new Set(['waiting','repair']);
const zeroStock = (): Stock => Object.fromEntries(IDS.map(id=>[id,0])) as Stock;
const value = (stock: Stock) => IDS.reduce((total,id)=>total+stock[id]*COSTS[id],0);

function validateLegacySave(input: unknown): LegacyState {
  const bad = (detail: string): never => { throw new Error(`Bản lưu không hợp lệ (${detail}). Bản lưu cũ vẫn được giữ để khôi phục.`); };
  if (!input || typeof input !== 'object') return bad('dữ liệu');
  let s: LegacyState;
  try { s = JSON.parse(JSON.stringify(input)) as LegacyState; } catch { return bad('định dạng'); }
  if (s.version !== 3) return bad('phiên bản');
  const number = (n: unknown, min = 0, max = 1e12, integer = false): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
  const stock = (v: unknown): v is Stock => !!v && typeof v === 'object' && IDS.every(id => number((v as Stock)[id], 0, 1e6, true));
  if (!number(s.day, 1, 100000, true) || !['prep', 'open', 'closing', 'summary'].includes(s.phase) || !number(s.cash, -1e12) || !stock(s.stock)) return bad('quán');
  if (!s.upgrades || typeof s.upgrades.basket !== 'boolean' || typeof s.upgrades.pot !== 'boolean' || typeof s.paused !== 'boolean' || typeof s.recoveryUsed !== 'boolean') return bad('nâng cấp');
  // Older version-1 saves only had the basket and pot. Add new equipment without
  // changing money, orders, or previously purchased upgrades.
  for (const id of ['menu', 'stove', 'tea'] as const) {
    if (!Object.hasOwn(s.upgrades, id)) s.upgrades[id] = false;
    if (typeof s.upgrades[id] !== 'boolean') return bad('nâng cấp');
  }
  if (!number(s.elapsed, 0, 240) || !number(s.closingElapsed, 0, 30) || !number(s.spawned, 0, Math.min(20, 8 + (s.day - 1) * 2), true) || !number(s.servedTotal, 0, 1e9, true) || !number(s.reputation, 0, 5) || ![0, 1].includes(s.selectedBowl) || typeof s.notice !== 'string') return bad('tiến trình');
  if (!Array.isArray(s.stockLots) || s.stockLots.length > 10000) return bad('lô nguyên liệu');
  const counted = zeroStock();
  for (const lot of s.stockLots) {
    if (!lot || !IDS.includes(lot.ingredient) || !number(lot.quantity, 1, 1e6, true) || !number(lot.expiresOn, s.day, 1e6, true)) return bad('hạn dùng');
    counted[lot.ingredient] += lot.quantity;
  }
  if (IDS.some(id => counted[id] !== s.stock[id])) return bad('số lượng tồn kho');
  if (!number(s.hotBroth, 0, s.upgrades.pot ? 50 : 30, true)) return bad('nước dùng');
  if (s.brothBatch !== null && (!s.brothBatch || !number(s.brothBatch.units, 1, 50, true) || !number(s.brothBatch.remaining, 0, 15) || s.hotBroth + s.brothBatch.units > (s.upgrades.pot ? 50 : 30))) return bad('mẻ nước dùng');
  if (!Array.isArray(s.bowls) || s.bowls.length !== 1) return bad('bát');
  for (const [index, bowl] of s.bowls.entries()) {
    if (!bowl || bowl.id !== index || !stock(bowl.ingredients) || !['empty', 'raw', 'cooking', 'cooked'].includes(bowl.cookState) || !number(bowl.cookSeconds, 0, 999) || ![0, 7, 15].includes(bowl.cookScore) || bowl.cost !== value(bowl.ingredients)) return bad('nguyên liệu trong bát');
    if (bowl.cookState === 'empty' && bowl.cost !== 0) return bad('bát trống');
    if (bowl.cookState !== 'empty' && !bowl.ingredients.noodle) return bad('bánh trong bát');
    if (DRINK_IDS.some(id => bowl.ingredients[id] > 1) || DRINK_IDS.reduce((n, id) => n + bowl.ingredients[id], 0) > 1) return bad('nước uống trong đơn');
    if (DRINK_IDS.some(id => bowl.ingredients[id]) ? (!number(bowl.drinkExpiresOn, s.day, 1e6, true) || bowl.cookState !== 'cooked' || !bowl.ingredients.broth) : bowl.drinkExpiresOn !== undefined) return bad('hạn dùng nước uống');
    if (bowl.ingredients.noodle > 2 || bowl.ingredients.broth > 3 || bowl.ingredients.tai > 4 || bowl.ingredients.chin > 4) return bad('định lượng');
  }
  if ((s.selectedBowl !== 0 || typeof s.bowlReady !== 'boolean' || (!s.bowlReady && s.bowls[0].cookState !== 'empty') || (['prep', 'summary'].includes(s.phase) && s.bowlReady))) return bad('bát trên quầy');
  if (s.bowls.filter(bowl => bowl.cookState === 'cooking').length > 1) return bad('giỏ trụng');
  if (!Array.isArray(s.orders) || s.orders.length !== s.spawned || new Set(s.orders.map(order => order?.id)).size !== s.orders.length) return bad('đơn hàng');
  for (const order of s.orders) {
    if (!order || typeof order.id !== 'string' || typeof order.name !== 'string' || !number(order.avatar, 0, 5, true) || !['tai', 'chin'].includes(order.recipeId) || ![1, 2].includes(order.noodleUnits) || typeof order.noOnion !== 'boolean' || typeof order.chili !== 'boolean' || !number(order.createdAt, 0, s.elapsed) || !number(order.patience, 1, 1000) || !['waiting', 'repair', 'served', 'failed'].includes(order.status) || !number(order.repairs, 0, 1, true) || (order.drink !== null && !DRINK_IDS.includes(order.drink)) || order.quotedPrice !== RECIPES[order.recipeId].price + (order.drink ? DRINKS[order.drink].price : 0)) return bad('chi tiết đơn hàng');
  }
  if (s.selectedOrderId !== null && !s.orders.some(order => order.id === s.selectedOrderId && ACTIVE.has(order.status))) return bad('đơn đang chọn');
  const l = s.ledger;
  if (!l || !number(l.openingCash, -1e12) || !['openingStock', 'purchases', 'revenue', 'tips', 'cogs', 'waste', 'opex', 'upgrades', 'support', 'served', 'failed', 'scoreTotal', 'drinkRevenue', 'drinkCogs', 'drinksSold'].every(key => number(l[key as keyof Ledger]))) return bad('sổ thu chi');
  if (!number(l.drinksSold, 0, l.served, true) || l.drinkRevenue > l.revenue || l.drinkCogs > l.cogs) return bad('thu chi nước uống');
  const drinkOrders = s.orders.filter(order => order.status === 'served' && order.drink);
  if (l.drinksSold !== drinkOrders.length || l.drinkRevenue !== drinkOrders.reduce((total, order) => total + DRINKS[order.drink!].price, 0) || l.drinkCogs !== drinkOrders.reduce((total, order) => total + INGREDIENTS[order.drink!].cost, 0)) return bad('đối soát nước uống');
  if (l.served !== s.orders.filter(order => order.status === 'served').length || l.failed !== s.orders.filter(order => order.status === 'failed').length || s.servedTotal < l.served) return bad('kết quả ca');
  const closingValue = value(s.stock) + (s.hotBroth + (s.brothBatch?.units ?? 0)) * 1000 + s.bowls.reduce((total, bowl) => total + bowl.cost, 0);
  if (l.openingCash + l.revenue + l.tips + l.support - l.purchases - l.opex - l.upgrades !== s.cash || l.openingStock + l.purchases - l.cogs - l.waste !== closingValue) return bad('đối soát');
  if (s.phase === 'summary' && (l.closingCash !== s.cash || l.closingStock !== closingValue || s.orders.some(order => ACTIVE.has(order.status)) || s.bowls.some(bowl => bowl.cost) || s.hotBroth || s.brothBatch)) return bad('kết ca');
  if (s.phase !== 'summary' && (l.closingCash !== null || l.closingStock !== null)) return bad('kết dư');
  if (s.phase === 'prep' && (s.orders.length || s.bowls.some(bowl => bowl.cost) || s.elapsed || s.closingElapsed)) return bad('chuẩn bị');
  if (s.lastResult !== null && (!s.lastResult || typeof s.lastResult.orderId !== 'string' || !['served', 'repair', 'failed'].includes(s.lastResult.status) || !number(s.lastResult.score, 0, 100) || !number(s.lastResult.payment) || !number(s.lastResult.tip) || !Array.isArray(s.lastResult.issues) || !s.lastResult.issues.every(issue => typeof issue === 'string') || typeof s.lastResult.message !== 'string')) return bad('phản hồi');
  return s;
}

export function retireDrinks(input: unknown): RetiredState {
  const old = validateLegacySave(input);
  const foodStock = ({sting, coca, redbull, ...food}: Stock): FoodStock => food;
  const drinkValue = (stock: Stock) => DRINK_IDS.reduce((total,id)=>total+stock[id]*COSTS[id],0);
  const refund = drinkValue(old.stock) + drinkValue(old.bowls[0].ingredients);
  const {drinkExpiresOn, ...bowl} = old.bowls[0];
  const {drinkRevenue, drinkCogs, drinksSold, ...ledger} = old.ledger;
  return {
    ...old, version: 4, cash: old.cash + refund, stock: foodStock(old.stock),
    stockLots: old.stockLots.filter(lot=>!DRINK_IDS.includes(lot.ingredient as DrinkId)) as GameState['stockLots'],
    bowls: [{...bowl, ingredients:foodStock(bowl.ingredients), cost:bowl.cost-drinkValue(bowl.ingredients)}],
    orders: old.orders.map(({drink,...order})=>({...order,quotedPrice:RECIPES[order.recipeId].price})),
    ledger: {...ledger, refunds:refund, closingCash:ledger.closingCash === null ? null : ledger.closingCash+refund, closingStock:ledger.closingStock === null ? null : ledger.closingStock-refund},
    lastResult: old.lastResult?.status === 'served' ? old.lastResult : null,
    notice: refund ? `Đã hoàn ${refund.toLocaleString('vi-VN')}đ tiền nhập nước uống về két. Bát phở và tiến trình vẫn được giữ.` : 'Kệ mới có ba tầng. Chạm chồng bát ở tầng trên để lấy bát sạch.',
  };
}
