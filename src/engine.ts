import { retireDrinks } from './legacy-save-v3.ts';

export type IngredientId = 'noodle' | 'tai' | 'chin' | 'broth' | 'scallion' | 'onion' | 'herbs' | 'chili' | 'lime' | 'sauce' | 'quay';
export type RecipeId = 'tai' | 'chin';
export type Phase = 'prep' | 'open' | 'closing' | 'summary';
export type Stock = Record<IngredientId, number>;
export interface Ingredient { id: IngredientId; name: string; unit: string; cost: number }
export const INGREDIENTS: Record<IngredientId, Ingredient> = {
  noodle: { id: 'noodle', name: 'Bánh phở', unit: '50 g', cost: 1500 },
  tai: { id: 'tai', name: 'Bò tái', unit: '25 g', cost: 4000 },
  chin: { id: 'chin', name: 'Bò chín', unit: '25 g', cost: 3500 },
  broth: { id: 'broth', name: 'Nền nước dùng', unit: '150 ml', cost: 1000 },
  scallion: { id: 'scallion', name: 'Hành lá', unit: '1 phần', cost: 250 },
  onion: { id: 'onion', name: 'Hành tây', unit: '1 phần', cost: 250 },
  herbs: { id: 'herbs', name: 'Rau thơm', unit: '1 phần', cost: 500 },
  chili: { id: 'chili', name: 'Ớt', unit: '1 phần', cost: 500 },
  lime: { id: 'lime', name: 'Chanh', unit: '1 miếng', cost: 500 },
  sauce: { id: 'sauce', name: 'Tương', unit: '1 phần', cost: 500 },
  quay: { id: 'quay', name: 'Quẩy', unit: '2 cái', cost: 2500 },
};
export const QUAY_PRICE = 5000;
export const RECIPES = {
  tai: { id: 'tai', name: 'Phở tái', price: 32000 },
  chin: { id: 'chin', name: 'Phở chín', price: 30000 },
} as const;
export const UPGRADES = {
  menu: { id: 'menu', name: 'Bảng thực đơn rõ ràng', price: 40000, description: 'Khách mới chờ thêm 5 giây, cho bạn thong thả chuẩn bị món.', metric: 'served', target: 5, icon: 'book' },
  basket: { id: 'basket', name: 'Giỏ trụng giữ nhiệt', price: 180000, description: 'Bánh vừa ngon trong khoảng 3–7 giây, thêm thời gian để nhấc giỏ.', metric: 'served', target: 18, icon: 'bowl' },
  pot: { id: 'pot', name: 'Nồi nước dùng lớn', price: 260000, description: 'Tăng dung tích từ 4,5 lên 7,5 lít, ít phải nấu thêm giữa ca.', metric: 'day', target: 4, icon: 'bowl' },
  stove: { id: 'stove', name: 'Bếp lửa đều', price: 160000, description: 'Nấu thêm nước dùng trong 10 giây, nhanh hơn 5 giây mỗi mẻ.', metric: 'served', target: 35, icon: 'flame' },
  tea: { id: 'tea', name: 'Góc trà đá mời khách', price: 220000, description: 'Khách mới chờ thêm 10 giây. Cộng dồn với bảng thực đơn thành 15 giây.', metric: 'served', target: 60, icon: 'leaf' },
} as const;
export type UpgradeId = keyof typeof UPGRADES;
export const SHOP_RANKS = [
  { target: 0, name: 'Quán nhỏ đầu ngõ' },
  { target: 5, name: 'Bếp bắt đầu đỏ lửa' },
  { target: 18, name: 'Quán quen của xóm' },
  { target: 35, name: 'Bếp đỏ mỗi sáng' },
  { target: 60, name: 'Quán được truyền tai' },
  { target: 100, name: 'Quán ruột của phố' },
] as const;
export interface Order {
  id: string; name: string; avatar: number; recipeId: RecipeId;
  noodleUnits: 1 | 2; noOnion: boolean; chili: boolean; lime: boolean; quay: boolean; createdAt: number;
  patience: number; status: 'waiting' | 'repair' | 'served' | 'failed';
  repairs: number; quotedPrice: number;
}
export interface Bowl {
  id: number; ingredients: Stock; cookState: 'empty' | 'raw' | 'cooking' | 'cooked';
  cookSeconds: number; cookScore: number; cost: number;
}
export interface Ledger {
  openingCash: number; openingStock: number; purchases: number; revenue: number;
  tips: number; cogs: number; waste: number; opex: number; upgrades: number;
  support: number; refunds: number; served: number; failed: number; scoreTotal: number;
  closingCash: number | null; closingStock: number | null;
}
export interface ServeResult {
  orderId: string; status: 'served' | 'repair' | 'failed'; score: number;
  payment: number; tip: number; issues: string[]; message: string;
}
interface StockLot { ingredient: IngredientId; quantity: number; expiresOn: number }
export interface GameState {
  version: 5; day: number; phase: Phase; cash: number; stock: Stock;
  stockLots: StockLot[]; hotBroth: number; brothBatch: { units: number; remaining: number } | null;
  orders: Order[]; bowls: [Bowl]; bowlReady: boolean; selectedOrderId: string | null;
  selectedBowl: 0; elapsed: number; closingElapsed: number; spawned: number;
  servedTotal: number; reputation: number; upgrades: Record<UpgradeId, boolean>;
  paused: boolean; recoveryUsed: boolean; ledger: Ledger; lastResult: ServeResult | null; notice: string;
}
export interface ActionResult { ok: boolean; message: string }
const IDS = Object.keys(INGREDIENTS) as IngredientId[];
const PERISHABLE = new Set<IngredientId>(['noodle', 'tai', 'chin', 'scallion', 'onion', 'herbs', 'quay']);
const ACTIVE = new Set(['waiting', 'repair']);
const zeroStock = (): Stock => Object.fromEntries(IDS.map(id => [id, 0])) as Stock;
const newBowl = (id: number): Bowl => ({ id, ingredients: zeroStock(), cookState: 'empty', cookSeconds: 0, cookScore: 0, cost: 0 });
const newLedger = (cash: number, stock: number): Ledger => ({ openingCash: cash, openingStock: stock, purchases: 0, revenue: 0, tips: 0, cogs: 0, waste: 0, opex: 0, upgrades: 0, support: 0, refunds: 0, served: 0, failed: 0, scoreTotal: 0, closingCash: null, closingStock: null });
const value = (stock: Stock): number => IDS.reduce((sum, id) => sum + stock[id] * INGREDIENTS[id].cost, 0);
const freshState = (): GameState => ({ version: 5, day: 1, phase: 'prep', cash: 200000, stock: zeroStock(), stockLots: [], hotBroth: 0, brothBatch: null, orders: [], bowls: [newBowl(0)], bowlReady: false, selectedOrderId: null, selectedBowl: 0, elapsed: 0, closingElapsed: 0, spawned: 0, servedTotal: 0, reputation: 5, upgrades: { menu: false, basket: false, pot: false, stove: false, tea: false }, paused: false, recoveryUsed: false, ledger: newLedger(200000, 0), lastResult: null, notice: 'Chào mừng đến Phở Đầu Ngõ! Nhập hàng, nấu nước dùng rồi mở quán nhé.' });
export const formatMoney = (amount: number): string => `${Math.round(amount).toLocaleString('vi-VN')}đ`;

/** All stock, time, scoring and money transitions live here, independent of the UI. */
export class GameEngine {
  state: GameState;
  loadError: string | null = null;
  constructor(saved?: unknown) {
    this.state = freshState();
    if (saved !== undefined) {
      try { this.state = validateSave(saved); }
      catch (error) { this.loadError = error instanceof Error ? error.message : 'Không đọc được bản lưu.'; this.state.notice = this.loadError; }
    }
  }
  get maxGuests(): number { return Math.min(20, 8 + (this.state.day - 1) * 2); }
  get dayDuration(): number { return 240; }
  get potCapacity(): number { return this.state.upgrades.pot ? 50 : 30; }
  get perfectBlanchEnd(): number { return this.state.upgrades.basket ? 7 : 5; }
  get brothCookDuration(): number { return this.state.upgrades.stove ? 10 : 15; }
  get patienceBonus(): number { return (this.state.upgrades.menu ? 5 : 0) + (this.state.upgrades.tea ? 10 : 0); }
  get shopRank() { return SHOP_RANKS.filter(rank => this.state.servedTotal >= rank.target).at(-1)!; }
  upgradeProgress(id: UpgradeId) {
    const upgrade = UPGRADES[id];
    const current = upgrade.metric === 'day' ? this.state.day : this.state.servedTotal;
    return { current, target: upgrade.target, unlocked: current >= upgrade.target, owned: this.state.upgrades[id] };
  }
  get bowl(): Bowl { return this.state.bowls[this.state.selectedBowl]; }
  get brothRefillPlan(): { units: number; cost: number } {
    const available = this.state.stock.broth || Math.max(0, Math.floor(this.state.cash / INGREDIENTS.broth.cost));
    const space = Math.max(0, this.potCapacity - this.state.hotBroth - (this.state.brothBatch?.units ?? 0));
    const units = Math.min(10, space, available);
    return { units, cost: this.state.stock.broth ? 0 : units * INGREDIENTS.broth.cost };
  }
  export(): GameState { return JSON.parse(JSON.stringify(this.state)) as GameState; }
  private result(ok: boolean, message: string): ActionResult { this.state.notice = message; return { ok, message }; }
  private canCook(): boolean { return !this.state.paused && (this.state.phase === 'open' || this.state.phase === 'closing'); }
  private consume(id: IngredientId, quantity: number): boolean {
    if (this.state.stock[id] < quantity) return false;
    this.state.stock[id] -= quantity;
    let remaining = quantity;
    for (const lot of this.state.stockLots) {
      if (lot.ingredient !== id || !remaining) continue;
      const used = Math.min(lot.quantity, remaining); lot.quantity -= used; remaining -= used;
    }
    this.state.stockLots = this.state.stockLots.filter(lot => lot.quantity > 0);
    return true;
  }
  stockValue(): number {
    return value(this.state.stock) + (this.state.hotBroth + (this.state.brothBatch?.units ?? 0)) * 1000 + this.state.bowls.reduce((sum, bowl) => sum + bowl.cost, 0);
  }
  reconciliation() {
    const s = this.state, l = s.ledger;
    const cashExpected = l.openingCash + l.revenue + l.tips + l.support + l.refunds - l.purchases - l.opex - l.upgrades;
    const stockExpected = l.openingStock + l.purchases - l.cogs - l.waste - l.refunds;
    const stockActual = this.stockValue();
    return { cashExpected, cashActual: s.cash, stockExpected, stockActual, cashBalanced: cashExpected === s.cash, stockBalanced: stockExpected === stockActual };
  }
  buy(id: IngredientId, quantity = 1): ActionResult {
    if (this.state.phase !== 'prep' && !(id === 'broth' && this.canCook()) && !(['quay','lime'].includes(id) && ['open','closing'].includes(this.state.phase))) return this.result(false, 'Nhập hàng trước khi mở cửa.');
    if (!IDS.includes(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return this.result(false, 'Số lượng nhập không hợp lệ.');
    const total = INGREDIENTS[id].cost * quantity;
    if (this.state.cash < total) return this.result(false, 'Chưa đủ tiền nhập nguyên liệu này.');
    this.state.cash -= total; this.state.ledger.purchases += total; this.state.stock[id] += quantity;
    this.state.stockLots.push({ ingredient: id, quantity, expiresOn: PERISHABLE.has(id) ? this.state.day + 1 : this.state.day + 30 });
    this.state.stockLots.sort((a, b) => a.expiresOn - b.expiresOn);
    return this.result(true, `Đã nhập ${quantity} phần ${INGREDIENTS[id].name.toLowerCase()}.`);
  }
  recommendedShopping(): Stock {
    const bowls = this.maxGuests + 1, target = zeroStock();
    target.noodle = bowls * 2; target.tai = Math.ceil(bowls / 2) * 2; target.chin = Math.floor(bowls / 2) * 2;
    target.broth = bowls * 2; target.scallion = bowls; target.onion = bowls; target.herbs = bowls;
    target.lime = Math.floor(this.maxGuests / 2); target.quay = Math.floor(this.maxGuests / 3);
    if (this.state.day >= 3) target.chili = Math.ceil(this.maxGuests / 4);
    for (const id of IDS) target[id] = Math.max(0, target[id] - this.state.stock[id] - (id === 'broth' ? this.state.hotBroth : 0));
    return target;
  }
  buyRecommended(): ActionResult {
    if (this.state.phase !== 'prep') return this.result(false, 'Nhập hàng trước khi mở cửa.');
    const shopping = this.recommendedShopping(), total = value(shopping);
    if (total > this.state.cash) return this.result(false, `Cần ${formatMoney(total)} cho gói dự kiến. Bạn có thể nhập từng loại hoặc nhận vốn phục hồi khi đủ điều kiện.`);
    for (const id of IDS) if (shopping[id]) this.buy(id, shopping[id]);
    return this.result(true, total ? `Đã nhập hàng ${formatMoney(total)}, gồm một bát dự phòng.` : 'Nguyên liệu đã đủ cho ca hôm nay.');
  }
  smallShopping(): Stock {
    const target: Stock = { noodle: 8, tai: 4, chin: 4, broth: 8, scallion: 4, onion: 4, herbs: 4, chili: 0, lime: 0, sauce: 0, quay: 0 };
    for (const id of IDS) target[id] = Math.max(0, target[id] - this.state.stock[id] - (id === 'broth' ? this.state.hotBroth : 0));
    return target;
  }
  buySmallBatch(): ActionResult {
    if (this.state.phase !== 'prep') return this.result(false, 'Nhập hàng trước khi mở cửa.');
    const shopping = this.smallShopping(), total = value(shopping);
    if (total > this.state.cash) return this.result(false, `Cần ${formatMoney(total)} để nhập mẻ nhỏ bốn bát.`);
    for (const id of IDS) if (shopping[id]) this.buy(id, shopping[id]);
    return this.result(true, total ? `Đã nhập mẻ nhỏ bốn bát, ${formatMoney(total)}. Quán sẽ kết ca khi hết món.` : 'Kho đã đủ cho mẻ nhỏ bốn bát.');
  }
  prepareBroth(units = 10): ActionResult {
    if (!['prep', 'open', 'closing'].includes(this.state.phase) || (this.state.paused && this.state.phase !== 'prep')) return this.result(false, 'Hiện chưa thể nấu nước dùng.');
    if (!Number.isInteger(units) || units < 1) return this.result(false, 'Lượng nước dùng không hợp lệ.');
    if (this.state.brothBatch) return this.result(false, 'Đang nấu thêm nước dùng, chờ một chút nhé.');
    if (this.state.hotBroth + units > this.potCapacity) return this.result(false, 'Nồi không đủ chỗ cho mẻ nước dùng này.');
    if (!this.consume('broth', units)) return this.result(false, 'Chưa đủ nền nước dùng trong kho.');
    if (this.state.phase === 'prep') this.state.hotBroth += units;
    else this.state.brothBatch = { units, remaining: this.brothCookDuration };
    return this.result(true, this.state.phase === 'prep' ? `Đã nấu ${(units * 0.15).toLocaleString('vi-VN')} lít nước dùng.` : `Nước dùng mới sẽ sẵn sàng sau ${this.brothCookDuration} giây.`);
  }
  refillBroth(): ActionResult {
    if (!this.canCook()) return this.result(false, 'Tiếp tục ca bán để nấu thêm nước dùng.');
    if (this.state.brothBatch) return this.result(false, 'Đang nấu thêm nước dùng, chờ một chút nhé.');
    if (this.state.hotBroth >= this.potCapacity) return this.result(false, 'Nồi nước dùng đang đầy.');
    const plan = this.brothRefillPlan;
    if (!plan.units) return this.result(false, 'Kho hết nền nước dùng. Cần ít nhất 1.000đ để nhập và nấu thêm 150 ml.');
    // Validate the whole batch before charging. Stock is reserved immediately,
    // then the normal cooking timer and inventory accounting take over.
    if (plan.cost) {
      const purchase = this.buy('broth', plan.units);
      if (!purchase.ok) return purchase;
    }
    return this.prepareBroth(plan.units);
  }
  openShop(): ActionResult {
    if (this.state.phase !== 'prep') return this.result(false, 'Quán đã mở rồi.');
    if (this.state.stock.noodle < 2 || this.state.hotBroth < 2 || (this.state.stock.tai < 2 && this.state.stock.chin < 2)) return this.result(false, 'Cần đủ bánh, thịt và nước dùng nóng cho ít nhất một bát.');
    // The tutorial guest always orders tái, so accepting the first order must be possible.
    if (this.state.stock.tai < 2) return this.result(false, 'Khách đầu tiên gọi phở tái. Nhập ít nhất hai phần tái nhé.');
    if (!this.canAccept('tai', 2)) return this.result(false, 'Cần thêm đủ hành lá, hành tây và rau thơm cho bát đầu tiên.');
    this.state.phase = 'open'; this.state.paused = false; this.spawnGuest();
    return this.result(true, 'Quán đã mở! Cô Hạnh gọi một tô phở tái đầy đủ.');
  }
  chooseOrder(id: string): ActionResult {
    const order = this.state.orders.find(order => order.id === id && ACTIVE.has(order.status));
    if (!order) return this.result(false, 'Đơn này đã kết thúc.');
    this.state.selectedOrderId = id; return this.result(true, `Đang xem đơn của ${order.name}.`);
  }
  takeBowl(): ActionResult {
    if (!this.canCook()) return this.result(false, 'Mở quán và tiếp tục ca để lấy bát.');
    if (this.state.bowlReady) return this.result(false, 'Đã có bát trên quầy. Làm xong và mời khách trước nhé.');
    this.state.bowlReady = true;
    return this.result(true, 'Đã lấy bát sạch. Thêm bánh theo phiếu gọi món nhé!');
  }
  add(id: IngredientId): ActionResult {
    if (!this.canCook()) return this.result(false, 'Mở quán và tiếp tục ca để chế biến.');
    if (!IDS.includes(id)) return this.result(false, 'Nguyên liệu không hợp lệ.');
    if (!this.state.bowlReady) return this.result(false, 'Chạm chồng bát ở tầng trên của kệ kính để lấy một bát sạch trước nhé.');
    const bowl = this.bowl;
    if (id === 'noodle') {
      if (!['empty', 'raw'].includes(bowl.cookState)) return this.result(false, 'Bánh đã vào giỏ trụng, không thêm bánh sống nữa.');
      if (bowl.ingredients.noodle >= 2) return this.result(false, 'Bát thường có tối đa hai phần bánh.');
    } else if (bowl.cookState !== 'cooked') return this.result(false, 'Lấy bánh và trụng xong trước khi ráp bát nhé.');
    if ((id === 'tai' || id === 'chin') && bowl.ingredients.broth) return this.result(false, 'Thêm thịt trước khi chan nước dùng.');
    if (id === 'broth' && !bowl.ingredients.tai && !bowl.ingredients.chin) return this.result(false, 'Thêm thịt trước khi chan nước dùng.');
    if (id === 'quay' && bowl.ingredients.quay) return this.result(false, 'Đã lấy một phần quẩy (2 cái) cho bát này.');
    if (bowl.ingredients[id] >= (id === 'tai' || id === 'chin' ? 4 : id === 'broth' ? 3 : 2)) return this.result(false, 'Bát đã đủ chỗ cho nguyên liệu này.');
    if (id === 'broth') {
      if (!this.state.hotBroth) return this.result(false, 'Nồi hết nước dùng. Nấu thêm một mẻ nhé.');
      this.state.hotBroth -= 1;
    } else if (!this.consume(id, 1)) return this.result(false, `Đã hết ${INGREDIENTS[id].name.toLowerCase()}.`);
    bowl.ingredients[id] += 1; bowl.cost += INGREDIENTS[id].cost;
    if (id === 'noodle') bowl.cookState = 'raw';
    if (id === 'quay') return this.result(true, 'Đã lấy một đĩa quẩy (2 cái), đặt cạnh bát phở.');
    return this.result(true, `+ ${INGREDIENTS[id].unit} ${INGREDIENTS[id].name.toLowerCase()}.`);
  }
  startBlanch(): ActionResult {
    if (!this.canCook()) return this.result(false, 'Ca đang tạm dừng hoặc chưa mở cửa.');
    if (this.bowl.cookState !== 'raw') return this.result(false, 'Lấy bánh phở vào bát trước nhé.');
    this.bowl.cookState = 'cooking'; this.bowl.cookSeconds = 0;
    return this.result(true, `Đang trụng bánh. Nhấc giỏ khi đồng hồ nằm trong khoảng 3–${this.perfectBlanchEnd} giây.`);
  }
  liftBlanch(): ActionResult {
    if (!this.canCook() || this.bowl.cookState !== 'cooking') return this.result(false, 'Chưa có giỏ bánh để nhấc.');
    const bowl = this.bowl, t = bowl.cookSeconds;
    bowl.cookState = 'cooked'; bowl.cookScore = t >= 3 && t <= this.perfectBlanchEnd ? 15 : t >= 2 && t <= this.perfectBlanchEnd + 2 ? 7 : 0;
    return this.result(true, bowl.cookScore === 15 ? 'Bánh vừa tới, mềm mà vẫn dai!' : t < 3 ? 'Bánh hơi non. Lần sau đợi thêm một chút nhé.' : 'Bánh đã trụng quá lâu.');
  }
  private score(order: Order, bowl: Bowl): { score: number; hard: boolean; issues: string[] } {
    const i = bowl.ingredients, issues: string[] = [];
    let hard = false, score = 100;
    if (bowl.cookState !== 'cooked' || !i.noodle || !i.broth) { hard = true; issues.push('Bát chưa đủ bánh đã trụng và nước dùng.'); }
    if (!i[order.recipeId] || i[order.recipeId === 'tai' ? 'chin' : 'tai']) { hard = true; issues.push(`Khách gọi ${RECIPES[order.recipeId].name.toLowerCase()}.`); }
    if (order.noOnion && (i.scallion || i.onion)) { hard = true; issues.push('Khách dặn không hành: bỏ cả hành lá và hành tây.'); }
    const meatDiff = Math.abs(i[order.recipeId] - 2);
    if (meatDiff) { score -= meatDiff === 1 ? 20 : 40; issues.push(i[order.recipeId] < 2 ? 'Thiếu thịt: cần hai phần.' : 'Thừa thịt so với yêu cầu.'); }
    const noodleDiff = Math.abs(i.noodle - order.noodleUnits);
    if (noodleDiff) { score -= noodleDiff === 1 ? 8 : 15; issues.push(`Khách muốn ${order.noodleUnits === 1 ? 'ít bánh (50 g)' : 'bánh thường (100 g)'}.`); }
    const brothDiff = Math.abs(i.broth - 2);
    if (brothDiff) { score -= brothDiff === 1 ? 5 : 10; issues.push('Lượng nước chuẩn là hai vá (300 ml).'); }
    const toppingTargets = { scallion: order.noOnion ? 0 : 1, onion: order.noOnion ? 0 : 1, herbs: 1, chili: order.chili ? 1 : 0, lime: order.lime ? 1 : 0, sauce: 0 };
    let toppingErrors = 0;
    for (const [id, wanted] of Object.entries(toppingTargets) as [IngredientId, number][]) {
      if (order.noOnion && (id === 'onion' || id === 'scallion')) continue;
      if (i[id] !== wanted) { toppingErrors++; issues.push(`${INGREDIENTS[id].name}: cần ${wanted} phần.`); }
    }
    if (i.quay !== (order.quay ? 1 : 0)) { hard = true; issues.push(order.quay ? 'Khách gọi một phần quẩy (2 cái). Lấy quẩy từ rổ trên kệ.' : 'Khách không gọi quẩy.'); }
    score -= Math.min(15, toppingErrors * 5);
    score -= 15 - bowl.cookScore;
    if (bowl.cookScore < 15) issues.push(`Bánh cần trụng trong khoảng 3–${this.perfectBlanchEnd} giây.`);
    return { score: Math.max(0, score), hard, issues };
  }
  serve(orderId = this.state.selectedOrderId): ActionResult {
    if (!this.canCook()) return this.result(false, 'Tiếp tục ca trước khi giao món.');
    if (!this.state.bowlReady || !this.bowl.cost) return this.result(false, 'Lấy bát và nấu phở trước khi mời khách nhé.');
    const order = this.state.orders.find(order => order.id === orderId);
    if (!order || !ACTIVE.has(order.status)) return this.result(false, 'Chọn một khách đang chờ để giao món.');
    const assessment = this.score(order, this.bowl), { score, issues } = assessment;
    if (assessment.hard || score < 60) {
      if (order.repairs === 0) {
        order.repairs = 1; order.status = 'repair';
        this.state.lastResult = { orderId: order.id, status: 'repair', score, payment: 0, tip: 0, issues, message: `${order.name} nhờ sửa lại món. Bạn còn một lượt giao lại.` };
      } else {
        this.failOrder(order);
        this.state.lastResult = { orderId: order.id, status: 'failed', score, payment: 0, tip: 0, issues, message: `${order.name} chưa nhận được món đúng yêu cầu và đã rời quán.` };
        this.finishIfDone();
      }
      return this.result(false, this.state.lastResult.message);
    }
    const payment = Math.round(RECIPES[order.recipeId].price * (score === 100 ? 1 : score >= 80 ? 0.8 : 0.5)) + (order.quay ? QUAY_PRICE : 0);
    const waited = this.state.elapsed + this.state.closingElapsed - order.createdAt;
    const tip = waited <= order.patience * 0.4 ? 2000 : waited <= order.patience * 0.8 ? 1000 : 0;
    order.status = 'served'; this.state.cash += payment + tip;
    const l = this.state.ledger; l.revenue += payment; l.tips += tip; l.cogs += this.bowl.cost; l.served++; l.scoreTotal += score;
    this.state.servedTotal++;
    const satisfaction = (score * 0.8 + Math.max(0, 100 * (1 - waited / order.patience)) * 0.2) / 20;
    this.state.reputation = Math.round((this.state.reputation * 0.9 + satisfaction * 0.1) * 100) / 100;
    this.state.bowls[0] = newBowl(0); this.state.bowlReady = false;
    this.selectNextOrder();
    this.state.lastResult = { orderId: order.id, status: 'served', score, payment, tip, issues, message: score === 100 ? `${order.name}: “Phở ngon quá, cảm ơn nhé!”` : `${order.name} nhận món, nhưng có vài chỗ cần chỉnh.` };
    this.finishIfDone();
    return this.result(true, `Đã giao món ${score}/100 · ${formatMoney(payment)} + tip ${formatMoney(tip)}.`);
  }
  discard(): ActionResult {
    if (!this.canCook()) return this.result(false, 'Chỉ bỏ bát trong ca đang mở.');
    const cost = this.bowl.cost; this.state.ledger.waste += cost;
    this.state.bowls[0] = newBowl(0); this.state.bowlReady = false;
    return this.result(true, cost ? `Đã bỏ bát. Lấy bát sạch để làm lại. Hao hụt ${formatMoney(cost)}.` : 'Bát đang trống.');
  }
  cancelOrder(orderId = this.state.selectedOrderId): ActionResult {
    if (!this.canCook()) return this.result(false, 'Tiếp tục ca trước khi báo hết món.');
    const order = this.state.orders.find(order => order.id === orderId && ACTIVE.has(order.status));
    if (!order) return this.result(false, 'Đơn này đã kết thúc.');
    this.failOrder(order);
    const message = `Đã báo hết món với ${order.name}. Đơn không thu tiền; nguyên liệu trong bát vẫn được giữ.`;
    this.state.lastResult = { orderId: order.id, status: 'failed', score: 0, payment: 0, tip: 0, issues: ['Quán không thể hoàn thành đơn.'], message };
    this.finishIfDone();
    return this.result(true, message);
  }
  setPaused(paused: boolean): ActionResult { this.state.paused = paused; return this.result(true, paused ? 'Ca đã tạm dừng.' : 'Tiếp tục phục vụ nhé!'); }
  private canAccept(recipeId: RecipeId, noodleUnits: number, noOnion = false, chili = false, extraBroth = 0): boolean {
    // Include work in progress, then reserve the ingredients already promised to waiting guests.
    const available = { ...this.state.stock };
    available.broth += this.state.hotBroth + (this.state.brothBatch?.units ?? 0) + extraBroth;
    for (const bowl of this.state.bowls) for (const id of IDS) available[id] += bowl.ingredients[id];
    for (const order of this.state.orders) if (ACTIVE.has(order.status)) {
      available.noodle -= order.noodleUnits; available[order.recipeId] -= 2; available.broth -= 2;
      available.herbs -= 1;
      if (!order.noOnion) { available.scallion -= 1; available.onion -= 1; }
      if (order.chili) available.chili -= 1;
    }
    return available.noodle >= noodleUnits && available[recipeId] >= 2 && available.broth >= 2 && available.herbs >= 1 && (noOnion || (available.scallion >= 1 && available.onion >= 1)) && (!chili || available.chili >= 1);
  }
  private spawnGuest(): void {
    const s = this.state, index = s.spawned;
    const names = ['Cô Hạnh', 'Anh Minh', 'Chị Linh', 'Bác Tư', 'Bạn An', 'Chú Bình', 'Cô Mai', 'Anh Tuấn', 'Chị Hà', 'Bạn Nam'];
    const noodleUnits = s.day >= 2 && index % 4 === 1 ? 1 : 2;
    const noOnion = s.day >= 2 && index % 4 === 2;
    const freeChili = s.stock.chili + s.bowls.reduce((sum, bowl) => sum + bowl.ingredients.chili, 0) - s.orders.filter(order => ACTIVE.has(order.status) && order.chili).length;
    const chili = s.day >= 3 && index % 4 === 3 && freeChili > 0;
    const availableSide = (id: 'lime' | 'quay') => s.stock[id] + this.bowl.ingredients[id] - s.orders.filter(o => ACTIVE.has(o.status) && o[id]).length;
    const lime = index % 2 === 1 && availableSide('lime') > 0;
    const quay = index % 3 === 2 && availableSide('quay') > 0;
    let recipeId: RecipeId = index % 2 ? 'chin' : 'tai';
    if (!this.canAccept(recipeId, noodleUnits, noOnion, chili)) recipeId = recipeId === 'tai' ? 'chin' : 'tai';
    if (!this.canAccept(recipeId, noodleUnits, noOnion, chili)) return;
    s.orders.push({ id: `day-${s.day}-order-${index + 1}`, name: names[index % names.length]!, avatar: index % 6, recipeId, noodleUnits, noOnion, chili, lime, quay, createdAt: s.elapsed, patience: (s.day === 1 && index === 0 ? 120 : s.day >= 6 && index % 3 === 1 ? 65 : 95) + this.patienceBonus, status: 'waiting', repairs: 0, quotedPrice: RECIPES[recipeId].price + (quay ? QUAY_PRICE : 0) });
    s.spawned++;
    if (!s.selectedOrderId) s.selectedOrderId = s.orders[s.orders.length - 1]!.id;
  }
  private selectNextOrder(): void { this.state.selectedOrderId = this.state.orders.find(order => ACTIVE.has(order.status))?.id ?? null; }
  private failOrder(order: Order): void {
    if (!ACTIVE.has(order.status)) return;
    order.status = 'failed'; this.state.ledger.failed++;
    this.state.reputation = Math.round(Math.max(1, this.state.reputation - 0.15) * 100) / 100;
    if (this.state.selectedOrderId === order.id) this.selectNextOrder();
  }
  tick(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0 || this.state.paused || !['open', 'closing'].includes(this.state.phase)) return;
    // Small steps keep arrivals and timeout behavior identical at different frame rates.
    let remaining = Math.min(seconds, 86400);
    while (remaining > 0 && ['open', 'closing'].includes(this.state.phase)) {
      const dt = Math.min(1, remaining); remaining -= dt;
      if (this.state.phase === 'open') this.state.elapsed = Math.min(this.dayDuration, this.state.elapsed + dt);
      else this.state.closingElapsed = Math.min(30, this.state.closingElapsed + dt);
      for (const bowl of this.state.bowls) if (bowl.cookState === 'cooking') bowl.cookSeconds = Math.min(999, bowl.cookSeconds + dt);
      if (this.state.brothBatch) {
        this.state.brothBatch.remaining -= dt;
        if (this.state.brothBatch.remaining <= 0) { this.state.hotBroth += this.state.brothBatch.units; this.state.brothBatch = null; }
      }
      const now = this.state.elapsed + this.state.closingElapsed;
      for (const order of this.state.orders) if (ACTIVE.has(order.status) && now - order.createdAt >= order.patience) {
        this.failOrder(order); this.state.notice = `${order.name} đợi lâu quá và đã rời quán.`;
      }
      const spacing = 210 / this.maxGuests;
      if (this.state.phase === 'open' && this.state.elapsed < this.dayDuration && this.state.spawned < this.maxGuests && this.state.elapsed >= this.state.spawned * spacing && this.state.orders.filter(order => ACTIVE.has(order.status)).length < 3) this.spawnGuest();
      if (this.state.phase === 'open' && this.state.elapsed >= this.dayDuration) { this.state.phase = 'closing'; this.state.notice = 'Ngừng nhận khách mới. Còn tối đa 30 giây hoàn thành đơn đang chờ.'; }
      if (this.state.phase === 'closing' && this.state.closingElapsed >= 30) this.finishDay();
      else this.finishIfDone();
    }
  }
  closeShop(): ActionResult {
    if (this.state.phase !== 'open') return this.result(false, 'Quán chưa mở hoặc đang kết ca.');
    this.state.phase = 'closing'; this.state.closingElapsed = 0; this.finishIfDone();
    return this.result(true, (this.state.phase as Phase) === 'summary' ? 'Đã kết ca hôm nay.' : 'Ngừng nhận khách mới. Hoàn thành khách đang chờ trong 30 giây nhé.');
  }
  private finishIfDone(): void {
    const noWaiting = this.state.orders.every(order => !ACTIVE.has(order.status));
    const index = this.state.spawned, noOnion = this.state.day >= 2 && index % 4 === 2, noodleUnits = this.state.day >= 2 && index % 4 === 1 ? 1 : 2;
    // A dry pot can be restocked mid-shift. Keep the shop open for that action,
    // but only accept new customers once their broth has actually been bought.
    const affordableBroth = Math.max(0, Math.floor(this.state.cash / INGREDIENTS.broth.cost));
    const soldOut = !this.canAccept('tai', noodleUnits, noOnion, false, affordableBroth) && !this.canAccept('chin', noodleUnits, noOnion, false, affordableBroth);
    if (noWaiting && (this.state.phase === 'closing' || (this.state.phase === 'open' && (this.state.spawned >= this.maxGuests || soldOut)))) this.finishDay();
  }
  private finishDay(): void {
    if (this.state.phase === 'summary') return;
    const s = this.state;
    for (const order of s.orders) this.failOrder(order);
    for (const bowl of s.bowls) s.ledger.waste += bowl.cost;
    s.bowls = [newBowl(0)]; s.bowlReady = false;
    s.ledger.waste += (s.hotBroth + (s.brothBatch?.units ?? 0)) * 1000; s.hotBroth = 0; s.brothBatch = null;
    for (const lot of s.stockLots) if (lot.expiresOn <= s.day) { s.stock[lot.ingredient] -= lot.quantity; s.ledger.waste += lot.quantity * INGREDIENTS[lot.ingredient].cost; }
    s.stockLots = s.stockLots.filter(lot => lot.expiresOn > s.day);
    s.cash -= 30000; s.ledger.opex += 30000; s.ledger.closingCash = s.cash; s.ledger.closingStock = this.stockValue();
    s.phase = 'summary'; s.paused = false; s.selectedOrderId = null;
    s.notice = 'Quán đã đóng cửa. Xem thu chi và chuẩn bị cho ngày mai nhé!';
  }
  buyUpgrade(id: keyof typeof UPGRADES): ActionResult {
    if (!['prep', 'summary'].includes(this.state.phase)) return this.result(false, 'Nâng cấp trước hoặc sau ca bán hàng.');
    if (!Object.hasOwn(UPGRADES, id)) return this.result(false, 'Nâng cấp không hợp lệ.');
    if (this.state.upgrades[id]) return this.result(false, 'Bạn đã có nâng cấp này.');
    if (!this.upgradeProgress(id).unlocked) return this.result(false, UPGRADES[id].metric === 'day' ? `Mở từ ngày ${UPGRADES[id].target}.` : `Phục vụ thành công ${UPGRADES[id].target} khách để mở khóa nâng cấp này.`);
    if (this.state.cash < UPGRADES[id].price) return this.result(false, 'Chưa đủ tiền nâng cấp.');
    this.state.cash -= UPGRADES[id].price; this.state.ledger.upgrades += UPGRADES[id].price; this.state.upgrades[id] = true;
    if (this.state.phase === 'summary') this.state.ledger.closingCash = this.state.cash;
    return this.result(true, `Đã mua ${UPGRADES[id].name.toLowerCase()}!`);
  }
  recover(): ActionResult {
    if (this.state.phase !== 'prep') return this.result(false, 'Vốn phục hồi chỉ nhận trước ca.');
    if (this.state.recoveryUsed) return this.result(false, 'Hôm nay quán đã nhận vốn phục hồi rồi.');
    const available = Math.min(Math.floor(this.state.stock.noodle / 2), Math.floor((this.state.stock.tai + this.state.stock.chin) / 2), Math.floor((this.state.stock.broth + this.state.hotBroth) / 2));
    if (this.state.cash >= 60000 || available >= 2) return this.result(false, 'Vốn phục hồi dành cho quán dưới 60.000đ và không đủ hai bát phở.');
    const grant = 120000 - this.state.cash; this.state.cash += grant; this.state.ledger.support += grant; this.state.recoveryUsed = true;
    return this.result(true, `Đã nhận ${formatMoney(grant)} vốn phục hồi miễn hoàn trả. Hãy nhập vừa đủ và mở quán lại nhé!`);
  }
  nextDay(): ActionResult {
    if (this.state.phase !== 'summary') return this.result(false, 'Kết thúc ca hiện tại trước nhé.');
    const s = this.state, openingStock = this.stockValue();
    s.day++; s.phase = 'prep'; s.elapsed = 0; s.closingElapsed = 0; s.spawned = 0; s.orders = []; s.lastResult = null; s.selectedBowl = 0; s.selectedOrderId = null; s.paused = false; s.recoveryUsed = false;
    s.ledger = newLedger(s.cash, openingStock);
    if (s.cash < 60000) { const recovery = this.recover(); if (recovery.ok) return recovery; }
    return this.result(true, `Ngày ${s.day}: dự kiến ${this.maxGuests} khách. Kiểm tra kho trước khi nhập thêm.`);
  }
}

/** Reject malformed or incompatible saves before they can corrupt money or stock. */
export function validateSave(input: unknown): GameState {
  if (input && typeof input === 'object' && 'version' in input && input.version === 3) input = retireDrinks(input);
  const bad = (detail: string): never => { throw new Error(`Bản lưu không hợp lệ (${detail}). Bản lưu cũ vẫn được giữ để khôi phục.`); };
  if (!input || typeof input !== 'object') return bad('dữ liệu');
  type SavedState = Omit<GameState, 'version' | 'bowls' | 'selectedBowl'> & { version: 1 | 2 | 4 | 5; bowls: Bowl[]; selectedBowl: number };
  let s: SavedState;
  try { s = JSON.parse(JSON.stringify(input)) as SavedState; } catch { return bad('định dạng'); }
  if (![1, 2, 4, 5].includes(s.version)) return bad('phiên bản chưa được hỗ trợ');
  if (s.version < 5) {
    if (s.stock && !Object.hasOwn(s.stock, 'quay')) s.stock.quay = 0;
    if (Array.isArray(s.bowls)) for (const bowl of s.bowls) if (bowl?.ingredients && !Object.hasOwn(bowl.ingredients, 'quay')) bowl.ingredients.quay = 0;
    if (Array.isArray(s.orders)) for (const order of s.orders) if (order) {
      if (!Object.hasOwn(order, 'lime')) order.lime = false;
      if (!Object.hasOwn(order, 'quay')) order.quay = false;
    }
  }
  if (s.version < 4 && s.ledger && !Object.hasOwn(s.ledger, 'refunds')) s.ledger.refunds = 0;
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
  if (!Array.isArray(s.bowls) || s.bowls.length !== (s.version === 1 ? 2 : 1)) return bad('bát');
  for (const [index, bowl] of s.bowls.entries()) {
    if (!bowl || bowl.id !== index || !stock(bowl.ingredients) || !['empty', 'raw', 'cooking', 'cooked'].includes(bowl.cookState) || !number(bowl.cookSeconds, 0, 999) || ![0, 7, 15].includes(bowl.cookScore) || bowl.cost !== value(bowl.ingredients)) return bad('nguyên liệu trong bát');
    if (bowl.cookState === 'empty' && bowl.cost !== 0) return bad('bát trống');
    if (bowl.cookState !== 'empty' && !bowl.ingredients.noodle) return bad('bánh trong bát');
    if (bowl.ingredients.quay > 1 || (bowl.ingredients.quay && bowl.cookState !== 'cooked')) return bad('quẩy ăn kèm');
    if (bowl.ingredients.noodle > 2 || bowl.ingredients.broth > 3 || bowl.ingredients.tai > 4 || bowl.ingredients.chin > 4) return bad('định lượng');
  }
  if (s.version !== 1 && (s.selectedBowl !== 0 || typeof s.bowlReady !== 'boolean' || (!s.bowlReady && s.bowls[0].cookState !== 'empty') || (['prep', 'summary'].includes(s.phase) && s.bowlReady))) return bad('bát trên quầy');
  if (s.bowls.filter(bowl => bowl.cookState === 'cooking').length > (s.version === 1 && s.upgrades.basket ? 2 : 1)) return bad('giỏ trụng');
  if (!Array.isArray(s.orders) || s.orders.length !== s.spawned || new Set(s.orders.map(order => order?.id)).size !== s.orders.length) return bad('đơn hàng');
  for (const order of s.orders) {
    if (!order || typeof order.id !== 'string' || typeof order.name !== 'string' || !number(order.avatar, 0, 5, true) || !['tai', 'chin'].includes(order.recipeId) || ![1, 2].includes(order.noodleUnits) || typeof order.noOnion !== 'boolean' || typeof order.chili !== 'boolean' || typeof order.lime !== 'boolean' || typeof order.quay !== 'boolean' || !number(order.createdAt, 0, s.elapsed) || !number(order.patience, 1, 1000) || !['waiting', 'repair', 'served', 'failed'].includes(order.status) || !number(order.repairs, 0, 1, true) || order.quotedPrice !== RECIPES[order.recipeId].price + (order.quay ? QUAY_PRICE : 0)) return bad('chi tiết đơn hàng');
  }
  if (s.selectedOrderId !== null && !s.orders.some(order => order.id === s.selectedOrderId && ACTIVE.has(order.status))) return bad('đơn đang chọn');
  const l = s.ledger;
  if (!l || !number(l.openingCash, -1e12) || !['openingStock', 'purchases', 'revenue', 'tips', 'cogs', 'waste', 'opex', 'upgrades', 'support', 'refunds', 'served', 'failed', 'scoreTotal'].every(key => number(l[key as keyof Ledger]))) return bad('sổ thu chi');
  if (l.served !== s.orders.filter(order => order.status === 'served').length || l.failed !== s.orders.filter(order => order.status === 'failed').length || s.servedTotal < l.served) return bad('kết quả ca');
  const closingValue = value(s.stock) + (s.hotBroth + (s.brothBatch?.units ?? 0)) * 1000 + s.bowls.reduce((total, bowl) => total + bowl.cost, 0);
  if (l.openingCash + l.revenue + l.tips + l.support + l.refunds - l.purchases - l.opex - l.upgrades !== s.cash || l.openingStock + l.purchases - l.cogs - l.waste - l.refunds !== closingValue) return bad('đối soát');
  if (s.phase === 'summary' && (l.closingCash !== s.cash || l.closingStock !== closingValue || s.orders.some(order => ACTIVE.has(order.status)) || s.bowls.some(bowl => bowl.cost) || s.hotBroth || s.brothBatch)) return bad('kết ca');
  if (s.phase !== 'summary' && (l.closingCash !== null || l.closingStock !== null)) return bad('kết dư');
  if (s.phase === 'prep' && (s.orders.length || s.bowls.some(bowl => bowl.cost) || s.elapsed || s.closingElapsed)) return bad('chuẩn bị');
  if (s.lastResult !== null && (!s.lastResult || typeof s.lastResult.orderId !== 'string' || !['served', 'repair', 'failed'].includes(s.lastResult.status) || !number(s.lastResult.score, 0, 100) || !number(s.lastResult.payment) || !number(s.lastResult.tip) || !Array.isArray(s.lastResult.issues) || !s.lastResult.issues.every(issue => typeof issue === 'string') || typeof s.lastResult.message !== 'string')) return bad('phản hồi');
  if (s.version === 1) {
    // Validate all legacy accounting first. Keep the selected dish (or the only
    // unfinished dish); return the other dish's paid ingredients to fresh lots.
    // Broth is returned as base stock, so even a full pot cannot overflow.
    const keep = s.bowls[s.selectedBowl].cost ? s.selectedBowl : s.bowls.findIndex(bowl => bowl.cost > 0);
    const active = keep >= 0 ? s.bowls[keep] : newBowl(0);
    let returned = false;
    for (const [index, bowl] of s.bowls.entries()) if (index !== keep) {
      for (const id of IDS) if (bowl.ingredients[id]) {
        const quantity = bowl.ingredients[id];
        s.stock[id] += quantity;
        s.stockLots.push({ ingredient: id, quantity, expiresOn: s.day + 1 });
        returned = true;
      }
    }
    s.stockLots.sort((a, b) => a.expiresOn - b.expiresOn);
    s.bowls = [{ ...active, id: 0 }]; s.selectedBowl = 0;
    s.bowlReady = active.cost > 0; s.version = 2;
    if (returned) s.notice = 'Quầy mới dùng một bát. Bát đang làm được giữ; nguyên liệu bát còn lại đã hoàn về kho.';
  }
  s.version = 5;
  return s as GameState;
}
