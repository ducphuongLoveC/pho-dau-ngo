import './style.css';
import { GameEngine, INGREDIENTS, RECIPES, QUAY_PRICE, UPGRADES, SHOP_RANKS } from './engine';
import type { UpgradeId, IngredientId } from './engine';
import { createKitchen } from './kitchen';
import { COUNTER_HEIGHT, COUNTER_INGREDIENTS, COUNTER_WIDTH } from './counter-layout';
import { icon, ingredientArt, avatarArt } from './icons';

const SAVE_KEY = 'pho-dau-ngo.save.v1';
const SOUND_KEY = 'pho-dau-ngo.sound';
const currencyFormatter = new Intl.NumberFormat('vi-VN');
const money = (n: number) => currencyFormatter.format(Math.round(n)) + 'đ';
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const nodes = new Map<string, HTMLElement>();
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const cached = nodes.get(selector);
  if (cached?.isConnected) return cached as T;
  const node = document.querySelector<T>(selector)!;
  if (node) nodes.set(selector, node);
  return node;
};
const renderedHTML = new WeakMap<HTMLElement, string>();
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const tapAnimations = new WeakMap<Element, Animation>();
const CHECK_ICON = icon('check', 12);
function setText(selector: string, value: string) {
  const el = $(selector);
  if (el.textContent !== value) el.textContent = value;
}
function setAttribute(el: HTMLElement, name: string, value: string) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function setNodeHTML(el: HTMLElement, html: string) {
  if (renderedHTML.get(el) === html) return;
  el.innerHTML = html;
  renderedHTML.set(el, html);
}
function tapFeedback(el: HTMLElement | null, label?: string) {
  if (!el || motionPreference.matches) return;
  const art = el.querySelector('svg, .tray-name') || el;
  tapAnimations.get(art)?.cancel();
  const animation = art.animate([{transform:'scale(.88)'},{transform:'scale(1.09)',offset:.5},{transform:'scale(1)'}], {duration:240,easing:'cubic-bezier(.2,.8,.3,1)'});
  tapAnimations.set(art, animation);
  if (label) {
    el.querySelector('.tap-label')?.remove();
    const bubble = document.createElement('span');
    bubble.className = 'tap-label'; bubble.textContent = label; bubble.setAttribute('aria-hidden','true');
    el.append(bubble);
    const float = bubble.animate([{opacity:0,transform:'translateY(3px)'},{opacity:1,offset:.2},{opacity:0,transform:'translateY(-22px)'}],{duration:650,easing:'ease-out'});
    void float.finished.then(()=>bubble.remove(),()=>bubble.remove());
  }
}
let saved: unknown;
let storageAvailable = true;
let originalSave: string | null = null;
let damagedSave = false;
let allowSave = true;
try { originalSave = localStorage.getItem(SAVE_KEY); if (originalSave) saved = JSON.parse(originalSave); } catch { damagedSave = !!originalSave; storageAvailable = false; }
let game = new GameEngine(saved);
let knownUnlocks = new Set(Object.values(UPGRADES).filter(u => game.upgradeProgress(u.id).unlocked).map(u => u.id));
let knownRankTarget = game.shopRank.target;
if (originalSave && (game.loadError || damagedSave)) {
  try { localStorage.setItem(SAVE_KEY + '.backup', originalSave); }
  catch { allowSave = false; storageAvailable = false; }
}
let activeTab = 'kitchen';
let manualPause = false;
let modal = '';
let ticketDetailsOpen = false;
let lastFocus: HTMLElement | null = null;
let soundEnabled = true;
try { soundEnabled = localStorage.getItem(SOUND_KEY) !== 'off'; } catch { /* Storage is optional. */ }
let audio: AudioContext | undefined;
let toastTimeout = 0;
let unlockAnnouncementUntil = 0;
let lastPhase = game.state.phase;
let clockElapsed = 0;
let saveElapsed = 0;
let lastStructure = '';
let pendingSave = 0;
let lastSavedValue = '';

function sound(kind = 'tap') {
  if (!soundEnabled) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.connect(gain); gain.connect(audio.destination);
    osc.type = kind === 'error' ? 'triangle' : 'sine';
    const now = audio.currentTime;
    const frequencies = kind === 'serve' ? [523, 659, 784] : kind === 'error' ? [220, 160] : [620, 450];
    frequencies.forEach((f, i) => osc.frequency.setValueAtTime(f, now + i * 0.08));
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.start(); osc.stop(now + 0.3);
  } catch { /* A device without audio can still play. */ }
}

function save() {
  clearTimeout(pendingSave); pendingSave = 0;
  try {
    if (!allowSave) throw new Error('Preserving damaged save');
    // Serialize once, outside the input handler. pagehide always flushes synchronously.
    const serialized = JSON.stringify(game.state);
    if (serialized !== lastSavedValue) {
      localStorage.setItem(SAVE_KEY, serialized);
      lastSavedValue = serialized;
    }
    storageAvailable = true;
  } catch { storageAvailable = false; }
  setHTML('#save-status', icon(storageAvailable ? 'check' : 'help', 13) + (storageAvailable ? ' Đã lưu trên máy' : ' Không thể lưu trên máy'));
}
function queueSave() {
  clearTimeout(pendingSave);
  pendingSave = window.setTimeout(save, 250);
}
function toast(message: string, error = false, durationMs?: number) {
  const el = $('#toast');
  clearTimeout(toastTimeout);
  el.innerHTML = icon(error ? 'help' : 'check', 18) + `<span>${esc(message)}</span>`;
  el.className = `toast visible ${error ? 'error' : ''}`;
  const duration = durationMs ?? (window.matchMedia('(max-width: 640px)').matches && !error ? 2200 : 4200);
  toastTimeout = window.setTimeout(() => el.classList.remove('visible'), duration);
}
function setHTML(selector: string, html: string) {
  const el = $(selector);
  if (renderedHTML.get(el) === html) return;
  const focus = el.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.id : '';
  el.innerHTML = html;
  renderedHTML.set(el, html);
  if (focus) document.getElementById(focus)?.focus({preventScroll: true});
}
function syncPause() {
  const paused = manualPause || !!modal || activeTab !== 'kitchen' || document.hidden;
  if (game.state.paused !== paused) game.setPaused(paused);
}
function result(action: {ok: boolean; message: string}, quiet = false, soundKind = 'tap') {
  const unlocked = Object.values(UPGRADES).filter(u => game.upgradeProgress(u.id).unlocked && !knownUnlocks.has(u.id));
  unlocked.forEach(u => knownUnlocks.add(u.id));
  const newRank = game.shopRank.target > knownRankTarget;
  knownRankTarget = game.shopRank.target;
  if (unlocked.length || newRank) unlockAnnouncementUntil=performance.now()+4200;
  if (unlocked.length) toast(`${action.message} Mở khóa ${unlocked.map(u=>u.name).join(', ')}! Xem mục Nâng cấp.`,false,4200);
  else if (newRank) toast(`${action.message} Quán đạt danh hiệu “${game.shopRank.name}”!`,false,4200);
  else if (!quiet || !action.ok) toast(action.message, !action.ok);
  render();
  sound(action.ok ? soundKind : 'error');
  queueSave();
}
function recipeName(id: 'tai'|'chin') { return RECIPES[id].name; }
function quote(order: GameEngine['state']['orders'][number]) {
  const parts: string[] = [];
  if (order.noodleUnits === 1) parts.push('ít bánh');
  if (order.noOnion) parts.push('không hành');
  if (order.chili) parts.push('thêm ớt');
  if (order.lime) parts.push('thêm chanh');
  if (order.quay) parts.push('kèm một phần quẩy');
  const address = /^(Cô|Anh|Chị|Bác|Chú)(?=\s)/u.exec(order.name)?.[1]?.toLocaleLowerCase('vi-VN') || 'mình';
  const dish = order.recipeId === 'tai' ? 'tái' : 'chín';
  const extra = parts.length ? `, ${parts.join(', ')}` : '';
  if (order.noOnion) return `Cho ${address} bát ${dish}${extra} nhé.`;
  const greetings = [
    `Cho ${address} một bát ${dish}${extra} nhé!`,
    `${address === 'mình' ? 'Mình' : address.charAt(0).toLocaleUpperCase('vi-VN') + address.slice(1)} ăn bát ${dish}${extra} nhé.`,
    `Làm giúp ${address} bát ${dish}${extra} với nhé!`,
  ];
  return greetings[order.avatar % greetings.length];
}
function clockLabel(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}
function grade() {
  const n = game.state.reputation;
  return (n > 5 ? Math.max(1, Math.min(5, 1 + n / 25)) : Math.max(1, n)).toFixed(1).replace('.', ',');
}
const app = $('#app');
app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="#" aria-label="Phở Đầu Ngõ, về gian bếp" data-action="tab" data-tab="kitchen"><span class="brand-mark">${icon('bowl',29)}</span><span class="brand-name">phở đầu ngõ<span id="shop-rank-label">MỘT QUÁN NHỎ CỦA BẠN</span></span></a>
    <div class="header-actions"><span class="save-status" id="save-status"></span><button class="icon-button" id="sound-button" data-action="sound" aria-label="Tắt âm thanh" title="Bật / tắt âm thanh">${icon('sound')}</button><button class="icon-button" data-action="help" aria-label="Hướng dẫn chơi" title="Hướng dẫn chơi">${icon('help')}</button></div>
  </header>
  <main class="app-main">
    <section class="page-intro"><div><p class="eyebrow">MÙI PHỞ THƠM, MỘT NGÀY LÀNH</p><h1>Góc bếp thân quen<span>.</span></h1><p class="intro-copy">Một chút khéo tay. Một bát phở ấm lòng.</p></div><div class="day-stamp"><span class="day-icon">${icon('sun',25)}</span><div><span class="tiny-label">HÔM NAY</span><strong id="day-label">Ngày 01</strong></div><span class="day-weather">Trời đẹp<br>Khách thương ghé chơi</span></div></section>
    <div class="navigation-row"><nav class="tabs" aria-label="Các khu vực trong quán"><button class="tab active" data-action="tab" data-tab="kitchen">${icon('bowl',18)} Gian bếp</button><button class="tab" data-action="tab" data-tab="ledger">${icon('book',18)} Sổ thu chi</button><button class="tab" data-action="tab" data-tab="upgrades">${icon('shop',18)} Nâng cấp <span id="upgrade-badge" class="upgrade-badge" hidden></span></button></nav><button class="cozy-note goal-shortcut" data-action="tab" data-tab="upgrades" id="next-goal-shortcut"></button></div>
    <section class="stats-row" aria-label="Tình hình quán">
      <div class="stat"><span class="stat-icon">${icon('wallet',21)}</span><div><span>Tiền trong két</span><strong id="cash-stat"></strong></div></div>
      <div class="stat"><span class="stat-icon gold">${icon('bowl',22)}</span><div><span>Đã phục vụ</span><strong id="served-stat"></strong></div></div>
      <div class="stat"><span class="stat-icon rose">${icon('star',21)}</span><div><span>Khách yêu quán</span><strong id="rating-stat"></strong></div></div>
      <div class="stat"><span class="stat-icon blue">${icon('clock',21)}</span><div><span id="time-caption">Thời gian mở cửa</span><strong id="time-stat"></strong></div><button id="pause-button" class="small-icon" data-action="pause" aria-label="Tạm dừng">${icon('pause',16)}</button></div>
    </section>
    <section id="kitchen-view" class="game-grid">
      <div class="workspace">
        <div class="kitchen-card">
          <div class="panel-heading"><div><span class="status-dot"></span><h2>Gian bếp của bạn</h2></div><div class="counter-tools"><span id="shop-status" class="status-label">CHUẨN BỊ MỞ QUÁN</span><button class="text-button counter-stock-link" data-action="stock">${icon('bag',14)} Xem kho</button></div></div>
          <div id="customers" class="customer-dock"></div>
          <div class="kitchen-wrap"><div id="counter-stage" class="counter-stage" style="aspect-ratio:${COUNTER_WIDTH}/${COUNTER_HEIGHT}"><div id="kitchen-canvas" aria-label="Quầy phở có kệ kính ba tầng: bát đũa ở tầng trên, bánh và thịt ở tầng giữa, hành rau và gia vị ở tầng dưới"></div><div id="ingredients" class="counter-ingredients" role="group" aria-label="Nguyên liệu trên mặt quầy. Chạm khay để thêm một phần vào bát trên quầy."></div></div><div id="pause-shade" class="pause-shade" hidden><span>${icon('pause',32)}</span><h3>Nghỉ tay một chút</h3><p>Khách và nồi phở đều đang đợi bạn.</p><button class="button primary" data-action="pause">Tiếp tục nấu ${icon('play',16)}</button></div></div>
          <div id="cooking-controls" class="cooking-controls"></div>
          <div id="mobile-serving" class="mobile-serving" hidden></div>
        </div>
      </div>
      <aside class="side-column"><section class="order-ticket" id="order-ticket"></section><section class="daily-note" id="daily-note"></section><button class="close-shop-button" data-action="close-shop" id="close-shop-button">${icon('shop',16)} Đóng quán sớm</button></aside>
    </section>
    <section id="ledger-view" class="alternate-view" hidden></section>
    <section id="upgrades-view" class="alternate-view" hidden></section>
    <footer class="site-footer"><span>${icon('bowl',16)} Nấu chậm một chút. Thương nhiều một chút.</span><div><span id="footer-progress">Bản chơi thử · Phở tái & phở chín</span><button class="text-button" data-action="restart-prompt">Chơi lại từ đầu</button></div></footer>
  </main>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <div id="modal-root"></div>
`;

const kitchen = createKitchen($('#kitchen-canvas'), (action) => {
  if (modal || activeTab !== 'kitchen' || manualPause) return;
  if (action === 'take-bowl') result(game.takeBowl(), true);
  else if (action === 'broth') pourBroth();
  else if (action === 'blanch') result(game.startBlanch());
  else if (action === 'lift') result(game.liftBlanch());
});

function pourBroth(target?: HTMLElement) {
  if (!game.state.hotBroth && ['open','closing'].includes(game.state.phase) && !game.state.paused) {
    showModal('stock');
    return;
  }
  const added=game.add('broth');
  result(added,true);
  if(added.ok && target)tapFeedback(target);
}

function renderCustomers() {
  const state = game.state;
  const waiting = state.orders.filter(o => o.status === 'waiting' || o.status === 'repair');
  let html = '';
  if (state.phase === 'prep') {
    html = `<div class="morning-customers"><div class="avatar-stack">${[0,1,2].map(n=>avatarArt(n)).join('')}</div><div><strong>Hẹn bạn một buổi sáng đắt hàng</strong><span>Dự kiến ${game.maxGuests} vị khách ghé quán hôm nay</span></div><span class="morning-spark">${icon('sun',27)}</span></div>`;
  } else if (waiting.length === 0) {
    html = `<div class="waiting-empty">${icon(state.phase === 'summary' ? 'heart' : 'leaf',24)}<div><strong>${state.phase === 'summary' ? 'Cảm ơn một ngày chăm chỉ!' : state.phase === 'closing' ? 'Đang dọn những bát cuối ngày…' : 'Một thoáng yên bình trước quầy'}</strong><span>${state.phase === 'summary' ? `${state.ledger.served} bát phở đã đến tay khách.` : 'Chuẩn bị bát sạch, khách sẽ đến theo lượt.'}</span></div></div>`;
  } else {
    html = waiting.map(o => `<button class="customer" data-action="select-order" data-id="${esc(o.id)}">${avatarArt(o.avatar)}<div class="customer-details"><strong>${esc(o.name)}</strong><span>${esc(recipeName(o.recipeId))}${o.noOnion ? ' · không hành' : o.noodleUnits === 1 ? ' · ít bánh' : ''}</span><div class="patience-track"><i data-patience="${esc(o.id)}"></i></div></div><span class="customer-number">${esc(o.id.split('-').pop())}</span></button>`).join('');
  }
  setHTML('#customers', html);
  $('#customers').querySelectorAll<HTMLElement>('.customer').forEach(el => {
    const selected = el.dataset.id === state.selectedOrderId;
    el.classList.toggle('selected', selected);
    setAttribute(el, 'aria-pressed', String(selected));
  });
  updatePatience();
}
function updatePatience() {
  const s = game.state;
  for (const order of s.orders) {
    if (order.status !== 'waiting' && order.status !== 'repair') continue;
    const el = document.querySelector<HTMLElement>(`[data-patience="${CSS.escape(order.id)}"]`);
    if (!el) continue;
    const remaining = Math.max(0, order.patience - (s.elapsed + s.closingElapsed - order.createdAt));
    const ratio = remaining / order.patience;
    const transform = `scaleX(${ratio.toFixed(4)})`;
    if (el.style.transform !== transform) el.style.transform = transform;
    el.classList.toggle('low', ratio < .3);
    setAttribute(el.parentElement!, 'aria-label', `Kiên nhẫn còn ${Math.ceil(ratio*100)}%`);
    setAttribute(el.parentElement!, 'title', `Còn ${Math.ceil(remaining)} giây chờ`);
  }
}
const ingredientUnits: Record<string,string> = {noodle:'50 g / lần',tai:'25 g / lần',chin:'25 g / lần',scallion:'1 nhúm / lần',onion:'1 phần / lần',herbs:'1 nhúm / lần',chili:'1 phần / lần',lime:'1 miếng / lần',sauce:'1 phần / lần',quay:'2 cái / lần'};
function renderIngredients() {
  const s = game.state;
  const disabled = !['open','closing'].includes(s.phase) || s.paused;
  if (!$('#ingredients').children.length) {
    setHTML('#ingredients', COUNTER_INGREDIENTS.map(({id,x,y,width,height}) => `<button id="ingredient-${id}" class="ingredient counter-tray ${width > 100 ? 'wide-tray' : 'small-tray'}" data-action="ingredient" data-ingredient="${id}" style="left:${x / COUNTER_WIDTH * 100}%;top:${y / COUNTER_HEIGHT * 100}%;width:${width / COUNTER_WIDTH * 100}%;height:${height / COUNTER_HEIGHT * 100}%"><span class="stock-count" title="Số phần còn lại"></span><span class="tray-name"><strong>${esc(INGREDIENTS[id].name)}</strong>${width > 100 ? `<small>${esc(INGREDIENTS[id].unit)} / lần</small>` : ''}</span></button>`).join(''));
  }
  for (const {id} of COUNTER_INGREDIENTS) {
    const button = $<HTMLButtonElement>(`#ingredient-${id}`);
    button.disabled = disabled && !(s.phase === 'prep' && (id === 'quay' || id === 'lime'));
    button.classList.toggle('out-of-stock', s.stock[id] === 0);
    const count = button.querySelector('.stock-count')!;
    if (count.textContent !== String(s.stock[id])) count.textContent = String(s.stock[id]);
    setAttribute(button, 'aria-label', `Thêm ${INGREDIENTS[id].name}, ${ingredientUnits[id]}, còn ${s.stock[id]}`);
    setAttribute(button, 'title', `${INGREDIENTS[id].name}${id === 'quay' ? ' · Bán ' + money(QUAY_PRICE) : ''} · ${ingredientUnits[id]} · ${s.stock[id] ? `Còn ${s.stock[id]} phần` : 'Đã hết trên quầy'}`);
  }
}
function targetChecklist(order: GameEngine['state']['orders'][number]) {
  const b = game.state.bowls[game.state.selectedBowl];
  const items = [
    {label:`${order.noodleUnits * 50} g bánh phở`, sub:`${b.ingredients.noodle*50} g đã lấy · ${b.cookState === 'cooking' ? 'đang trụng' : b.cookState === 'cooked' ? 'đã trụng' : `chạm ${order.noodleUnits} lần rồi trụng`}`, done:b.ingredients.noodle === order.noodleUnits && b.cookState === 'cooked'},
    {label:`50 g ${order.recipeId === 'tai' ? 'bò tái' : 'bò chín'}`, sub:`${b.ingredients[order.recipeId]*25}/50 g · 2 lần chạm`, done:b.ingredients[order.recipeId] === 2 && b.ingredients[order.recipeId === 'tai' ? 'chin' : 'tai'] === 0},
    {label:'300 ml nước dùng', sub:`${b.ingredients.broth*150}/300 ml · 2 lần chan`, done:b.ingredients.broth === 2},
    {label:order.noOnion ? 'Không hành lá, hành tây' : 'Hành lá + hành tây',sub:order.noOnion ? 'Bỏ cả hai loại hành' : `Hành lá ${b.ingredients.scallion}/1 · hành tây ${b.ingredients.onion}/1`, done:order.noOnion ? b.ingredients.scallion === 0 && b.ingredients.onion === 0 : b.ingredients.scallion === 1 && b.ingredients.onion === 1},
    {label:'Một nhúm rau thơm',sub:`${b.ingredients.herbs}/1 phần · chạm 1 lần`,done:b.ingredients.herbs === 1},
  ];
  if (order.chili) items.push({label:'Một phần ớt',sub:`${b.ingredients.chili}/1 phần · chạm 1 lần`,done:b.ingredients.chili === 1});
  if (order.lime) items.push({label:'Một miếng chanh',sub:`${b.ingredients.lime}/1 miếng · chạm 1 lần`,done:b.ingredients.lime === 1});
  if (order.quay) items.push({label:'Một phần quẩy (2 cái)',sub:`${b.ingredients.quay}/1 phần · ăn kèm +${money(QUAY_PRICE)}`,done:b.ingredients.quay === 1});
  return items;
}
function nextCookingStep(order: GameEngine['state']['orders'][number]) {
  const b = game.state.bowls[game.state.selectedBowl], i = b.ingredients;
  if (!game.state.bowlReady) return 'Chạm chồng bát ở tầng trên của kệ kính để lấy bát.';
  const wanted: Partial<Record<IngredientId, number>> = {noodle:order.noodleUnits,[order.recipeId]:2,broth:2,scallion:order.noOnion?0:1,onion:order.noOnion?0:1,herbs:1,chili:order.chili?1:0,lime:order.lime?1:0,quay:order.quay?1:0};
  if (b.cookState === 'cooking') return `Theo dõi đồng hồ trụng bên dưới quầy; nhấc giỏ ở 3–${game.perfectBlanchEnd} giây.`;
  if ((Object.keys(i) as IngredientId[]).some(id => i[id] > (wanted[id] || 0))) return 'Bát đang thừa hoặc sai nguyên liệu. Dùng nút thùng rác để làm lại.';
  if (b.cookState === 'cooked' && i.noodle < order.noodleUnits) return 'Bát thiếu bánh đã trụng. Bỏ bát để làm lại đúng lượng.';
  if (i.broth && i[order.recipeId] < 2) return 'Đã chan nước nên không thêm thịt được nữa. Muốn đủ thịt, cần làm lại bát.';
  const add = (id: IngredientId, count: number) => {
    if (id === 'broth' && !game.state.hotBroth) return game.state.brothBatch
      ? 'Nước dùng đang nấu, theo dõi thời gian trên nút bên dưới quầy.'
      : 'Nồi đã cạn. Bấm “Nấu nước” hoặc chạm nồi bên trái để nấu thêm.';
    if (!(id === 'broth' ? game.state.hotBroth : game.state.stock[id])) return `${INGREDIENTS[id].name} đã hết. Mở “Xem kho” để kiểm tra${id === 'broth' ? ' và nấu thêm nước dùng' : ''}.`;
    return id === 'broth' ? `Chạm nồi nước bên trái thêm ${count} lần cho đủ 300 ml.` : `Chạm khay ${INGREDIENTS[id].name} thêm ${count} lần.`;
  };
  if (i.noodle < order.noodleUnits) return add('noodle',order.noodleUnits-i.noodle);
  if (b.cookState === 'raw') return `Bấm “Trụng bánh” bên dưới quầy, rồi nhấc giỏ ở 3–${game.perfectBlanchEnd} giây.`;
  if (i[order.recipeId] < 2) return add(order.recipeId,2-i[order.recipeId]);
  if (i.broth < 2) return add('broth',2-i.broth);
  if (!order.noOnion && !i.scallion) return add('scallion',1);
  if (!order.noOnion && !i.onion) return add('onion',1);
  if (!i.herbs) return add('herbs',1);
  if (order.chili && !i.chili) return add('chili',1);
  if (order.lime && !i.lime) return add('lime',1);
  if (order.quay && !i.quay) return game.state.stock.quay ? 'Chạm rổ Quẩy ở góc trên bên trái để lấy một đĩa (2 cái) ăn kèm.' : 'Đã hết quẩy. Mở Xem kho để nhập thêm.';
  if (b.cookScore < 15) return 'Đã đủ nguyên liệu; bánh trụng chưa vừa nên điểm món sẽ giảm.';
  return `Bát đã đúng yêu cầu. Mời ${order.name} ăn phở thôi!`;
}
function renderTicket() {
  const s = game.state;
  const b = s.bowls[s.selectedBowl];
  const order = s.orders.find(o => o.id === s.selectedOrderId && (o.status === 'waiting' || o.status === 'repair'));
  let html: string;
  if (s.phase === 'prep') {
    const shopping = game.recommendedShopping();
    const cost = Object.entries(shopping).reduce((sum,[id,q]) => sum + Number(q)*INGREDIENTS[id as IngredientId].cost,0);
    const ready = s.hotBroth >= 2 && s.stock.noodle >= 2 && (s.stock.tai >= 2 || s.stock.chin >= 2);
    html = `<span class="ticket-eyebrow">NGÀY MỚI, NIỀM VUI MỚI</span><div class="prep-illustration">${ingredientArt('broth')}${icon('sparkle',20)}</div><h2>Mở quán thôi!</h2><p class="ticket-description">Nước dùng thơm rồi,<br>mình chuẩn bị đón khách nhé.</p><div class="prep-facts"><span>${icon('people',17)} Khách dự kiến <strong>${game.maxGuests} người</strong></span><span>${icon('clock',17)} Một ca nhỏ <strong>4 phút</strong></span><span>${icon('bag',17)} Cần nhập thêm <strong>${money(cost)}</strong></span></div><div class="prep-checks"><span class="${s.stock.noodle >= 2 ? 'done':''}">${icon(s.stock.noodle >= 2 ? 'check':'bag',15)} Nguyên liệu ${s.stock.noodle >= 2 ? 'đã sẵn sàng':'đang chờ nhập'}</span><span class="${s.hotBroth >= 2 ? 'done':''}">${icon(s.hotBroth >= 2 ? 'check':'flame',15)} ${s.hotBroth >= 2 ? `${s.hotBroth*150} ml nước dùng đã nóng` : 'Chuẩn bị nồi nước dùng'}</span></div>${cost > 0 || s.hotBroth < 2 ? `<button class="button secondary full" data-action="stock-up">${icon('bag',17)} ${cost > s.cash ? 'Nhập ca nhỏ & nấu nước' : 'Nhập hàng & nấu nước'}</button>` : ''}<button class="button primary full" data-action="open">${ready ? 'Mở cửa đón khách' : 'Bắt đầu ngày mới'} ${icon('arrow',18)}</button><button class="text-button centered" data-action="stock">Tự chọn nguyên liệu nhập</button><p class="ticket-footnote">${icon('leaf',13)} Tiền nhập hàng được trừ khi bạn mua.</p>`;
  } else if (s.phase === 'summary') {
    html = `<span class="ticket-eyebrow">QUÁN ĐÃ NGHỈ TAY</span><div class="summary-heart">${icon('heart',42)}</div><h2>Một ngày thật ấm.</h2><p class="ticket-description">${s.ledger.served} bát phở, từng chút tận tâm.<br>Cùng xem hôm nay quán lời bao nhiêu.</p><button class="button primary full" data-action="tab" data-tab="ledger">Mở sổ cuối ngày ${icon('book',17)}</button><button class="button secondary full" data-action="next-day">Chuẩn bị ngày ${s.day + 1} ${icon('sun',17)}</button>`;
  } else if (order) {
    const checks = targetChecklist(order);
    html = `<div class="ticket-top"><span class="ticket-eyebrow">PHIẾU GỌI MÓN</span><span class="order-id">#${esc(order.id.split('-').pop())}</span></div><div class="ticket-person">${avatarArt(order.avatar)}<div><h2>${esc(order.name)}</h2><span>${order.repairs > 0 ? 'Cho quán sửa lại một lần nhé' : 'Đang đợi một bát phở ngon'}</span></div></div><blockquote>“${esc(quote(order))}”</blockquote><div class="ticket-recipe-title"><strong>${esc(recipeName(order.recipeId))}</strong><span>${money(order.quotedPrice)}</span></div><div class="ticket-divider"></div><div class="checklist-title"><span>CHUẨN BỊ MÓN</span><button class="ticket-details-toggle" data-action="ticket-details" aria-controls="ticket-recipe-checklist" aria-expanded="false">Chi tiết</button><strong>0/${checks.length}</strong></div><ul class="recipe-checklist" id="ticket-recipe-checklist">${checks.map(item=>`<li><span class="check-circle"></span><div><strong>${item.label}</strong><small></small></div></li>`).join('')}</ul><button class="button primary full serve-button" data-action="serve" disabled>${icon('bowl',18)} Mời khách ăn phở ${icon('arrow',18)}</button><p class="ticket-footnote">${icon('heart',13)} Đúng món, nhanh tay, thêm chút tiền tip.</p>`;
  } else {
    html = `<span class="ticket-eyebrow">MỘT NHỊP THẢNH THƠI</span><div class="summary-heart">${icon('leaf',42)}</div><h2>Đợi khách một chút.</h2><p class="ticket-description">Bạn có thể chuẩn bị sẵn bánh và thịt. Nhớ xem lại yêu cầu trước khi giao nhé.</p><button class="button secondary full" data-action="stock">${icon('bag',17)} Xem nguyên liệu còn lại</button>`;
  }
  setHTML('#order-ticket', html);
  $('#order-ticket').classList.toggle('recipe-details-open', ticketDetailsOpen);
  if (order && (s.phase === 'open' || s.phase === 'closing')) {
    const checks = targetChecklist(order);
    setText('.checklist-title strong', `${checks.filter(item=>item.done).length}/${checks.length}`);
    const details = $<HTMLButtonElement>('.ticket-details-toggle');
    setAttribute(details,'aria-expanded',String(ticketDetailsOpen));
    setText('.ticket-details-toggle',ticketDetailsOpen?'Thu gọn':'Chi tiết');
    const rows = $('#order-ticket').querySelectorAll<HTMLElement>('.recipe-checklist li');
    checks.forEach((item,index)=>{
      const row = rows[index];
      row.classList.toggle('complete',item.done);
      setNodeHTML(row.querySelector<HTMLElement>('.check-circle')!, item.done ? CHECK_ICON : '');
      const sub = row.querySelector('small')!;
      if (sub.textContent !== item.sub) sub.textContent = item.sub;
    });
    $<HTMLButtonElement>('.serve-button').disabled = b.cookState !== 'cooked' || b.ingredients.broth === 0 || s.paused;
  }
  const notice = s.lastResult;
  let note: string;
  if (notice && (notice.status !== 'served' || notice.issues.length > 0)) {
    note = `<span class="note-icon">${icon('help',20)}</span><div><h3>Khách nhắn quán</h3><p>${esc(notice.message)}</p>${notice.issues.length ? `<ul>${notice.issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
  } else {
    const hint = !s.bowlReady ? 'Chạm chồng bát ở tầng trên của kệ kính để lấy bát sạch, rồi thêm bánh theo lời khách.' : b.cookState === 'cooking' ? `Nhấc giỏ khi đồng hồ ở 3–${game.perfectBlanchEnd} giây. Bánh sẽ mềm vừa, không bị nát.` : b.cookState === 'empty' ? 'Tô thường dùng 2 phần bánh. Chạm khay bánh hai lần, rồi bắt đầu trụng.' : b.cookState === 'raw' ? `Bánh đã đủ chưa? Chạm “Trụng bánh”, rồi nhấc giỏ trong khoảng 3–${game.perfectBlanchEnd} giây.` : b.ingredients[order?.recipeId || 'tai'] < 2 ? 'Mỗi lần chạm khay thịt là 25 g. Một tô thường cần 2 phần thịt.' : b.ingredients.broth < 2 ? 'Chạm nồi nước dùng hai lần để chan đủ 300 ml. Sau đó thêm hành và rau.' : 'Xem các dấu tích trên phiếu trước khi giao. “Không hành” là bỏ cả hành lá lẫn hành tây.';
    note = `<span class="note-icon">${icon('leaf',20)}</span><div><h3>${s.phase === 'prep' ? 'Bí quyết của bà' : 'Một chút mách nhỏ'}</h3><p>${s.phase === 'prep' ? 'Nấu vừa đủ, nêm vừa tay. Nước dùng dư cuối ngày sẽ không giữ lại được đâu nhé.' : hint}</p></div>`;
  }
  setHTML('#daily-note',note);
}
function renderCookingControls() {
  const s = game.state, b = s.bowls[s.selectedBowl];
  const cooking = b.cookState === 'cooking';
  const enabled = ['open','closing'].includes(s.phase) && !s.paused;
  if (!$('#cooking-controls').children.length) {
    setHTML('#cooking-controls', `<div class="bowl-selector"><button id="take-bowl-action" class="bowl-tab" data-action="take-bowl">Lấy bát sạch</button></div><div class="cook-info"><span id="cook-status"></span><div id="cook-meter" class="cook-meter" hidden><i></i><span></span></div><small id="cook-help">Trụng bánh ngon nhất: 3–${game.perfectBlanchEnd} giây</small></div><button id="blanch-action" class="button small secondary" data-action="blanch"></button><button id="pour-action" class="button small secondary pour-button" data-action="broth">${icon('bowl',16)} Chan nước</button><button id="discard-action" class="small-icon discard-button" data-action="discard-prompt" aria-label="Bỏ bát trên quầy" title="Bỏ bát trên quầy">${icon('trash',18)}</button>`);
  }
  const take = $<HTMLButtonElement>('#take-bowl-action');
  take.disabled = !enabled || s.bowlReady;
  take.classList.toggle('active', !s.bowlReady && enabled);
  setText('#take-bowl-action', s.bowlReady ? 'Đã lấy bát' : 'Lấy bát sạch');
  setText('#cook-help', !s.bowlReady ? 'Chạm chồng bát ở tầng trên của kệ kính để lấy bát' : `Trụng bánh ngon nhất: 3–${game.perfectBlanchEnd} giây`);
  const range = $('#cook-meter span');
  range.style.left = `${3 / (game.perfectBlanchEnd + 2) * 100}%`;
  range.style.width = `${(game.perfectBlanchEnd - 3) / (game.perfectBlanchEnd + 2) * 100}%`;
  const blanch = $<HTMLButtonElement>('#blanch-action');
  blanch.classList.toggle('rust',cooking); blanch.classList.toggle('secondary',!cooking);
  setAttribute(blanch,'data-action',cooking ? 'lift' : 'blanch');
  setHTML('#blanch-action', `${icon(cooking?'check':'flame',16)} ${cooking?'Nhấc giỏ':'Trụng bánh'}`);
  blanch.disabled = !enabled || (!cooking && b.cookState !== 'raw');
  updateBrothControl();
  $<HTMLButtonElement>('#discard-action').disabled = b.cost === 0 || !enabled;
  $('#cook-meter').hidden = !cooking;
  $('#cook-help').hidden = cooking;
  if (!cooking) {
    setText('#cook-status', !s.bowlReady ? 'Chưa có bát trên quầy' : b.cookState === 'empty' ? 'Bát sạch, chờ nguyên liệu' : b.cookState === 'raw' ? `${b.ingredients.noodle*50} g bánh · chưa trụng` : `Bánh ${b.cookScore === 15 ? 'vừa ngon' : 'chưa đạt'} · ${money(b.cost)} giá vốn`);
    $('#cook-status').classList.remove('perfect-time');
  }
  updateCookClock();
}
function updateBrothControl() {
  const s = game.state, b = s.bowls[s.selectedBowl];
  const pour = $<HTMLButtonElement>('#pour-action');
  const empty = s.hotBroth === 0;
  const enabled = ['open','closing'].includes(s.phase) && !s.paused;
  setAttribute(pour,'data-action',empty?'refill-prompt':'broth');
  setHTML('#pour-action', empty
    ? `${icon('flame',16)} ${s.brothBatch ? `Đang nấu · ${Math.ceil(s.brothBatch.remaining)}s` : 'Nấu nước'}`
    : `${icon('bowl',16)} Chan nước`);
  pour.disabled = !enabled || (empty ? !!s.brothBatch : b.cookState !== 'cooked' || (!b.ingredients.tai && !b.ingredients.chin));
}
function updateCookClock() {
  const b = game.state.bowls[game.state.selectedBowl];
  if (b.cookState !== 'cooking') return;
  const time = Math.floor(b.cookSeconds*10)/10;
  setText('#cook-status', `Đang trụng · ${time.toFixed(1)} giây`);
  $('#cook-status').classList.toggle('perfect-time',time >= 3 && time <= game.perfectBlanchEnd);
  const scale = `scaleX(${Math.min(1,b.cookSeconds/(game.perfectBlanchEnd+2)).toFixed(4)})`;
  const meter = $('#cook-meter i');
  if (meter.style.transform !== scale) meter.style.transform = scale;
}
function financialRows() {
  const l = game.state.ledger;
  return [
    ['Doanh thu bán phở', l.revenue, 'positive'],['Tiền tip của khách',l.tips,'positive'],
    ['Giá vốn món đã giao',-l.cogs,''],['Nguyên liệu hao hụt',-l.waste,''],
    ['Mặt bằng & nhiên liệu',-l.opex,''],
  ] as const;
}
function renderLedger() {
  const s = game.state, l = s.ledger;
  const profit = l.revenue + l.tips - l.cogs - l.waste - l.opex;
  const final = s.phase === 'summary';
  const check = game.reconciliation();
  setHTML('#ledger-view', `<div class="ledger-layout"><section class="ledger-paper"><div class="ledger-head"><span class="eyebrow">SỔ TAY CỦA CHỦ QUÁN</span><span class="handwritten">ngày ${String(s.day).padStart(2,'0')}</span></div><h2>${final ? 'Hết ngày, đếm niềm vui.' : 'Chuyện thu chi hôm nay.'}</h2><p>${final ? 'Tắt bếp rồi. Cùng nhìn lại một ngày chăm chỉ của quán.' : 'Các khoản được ghi lại khi bạn mua hàng và phục vụ khách.'}</p><div class="ledger-mini-stats"><div>${icon('bowl',25)}<strong>${l.served}</strong><span>Bát đã phục vụ</span></div><div>${icon('heart',25)}<strong>${l.served ? Math.round(l.scoreTotal/l.served) : '—'}</strong><span>Điểm món trung bình</span></div><div>${icon('people',25)}<strong>${l.failed}</strong><span>Đơn chưa hoàn thành</span></div></div><div class="ledger-lines">${financialRows().map(([label,value,cls])=>`<div><span>${label}</span><strong class="${cls}">${value>0?'+':''}${money(value)}</strong></div>`).join('')}<div class="profit-line"><span>${final ? 'Lợi nhuận hoạt động':'Lợi nhuận tạm tính'}</span><strong class="${profit>=0?'positive':'negative'}">${profit>0?'+':''}${money(profit)}</strong></div></div><div class="cash-box"><span>${icon('wallet',24)} Tiền trong két</span><strong>${money(s.cash)}</strong></div><p class="ledger-explainer">Tiền nhập kho và mua thiết bị làm giảm tiền mặt. Giá vốn được ghi nhận khi món được giao hoặc nguyên liệu bị bỏ.</p>${!final ? '<p class="inline-note">Chi phí vận hành 30.000đ và nước dùng thừa được chốt khi kết ca.</p>':''}</section><aside class="ledger-aside">${goalCard()}<section class="plain-card"><h3>${icon('bag',19)} Dòng tiền & tồn kho</h3><dl class="money-list"><div><dt>Tiền đầu ngày</dt><dd>${money(l.openingCash)}</dd></div><div><dt>Đã chi nhập hàng</dt><dd>${money(l.purchases)}</dd></div><div><dt>Đã mua nâng cấp</dt><dd>${money(l.upgrades)}</dd></div>${l.refunds ? `<div><dt>Hoàn tiền hàng đã bỏ</dt><dd>${money(l.refunds)}</dd></div>` : ''}${l.support ? `<div><dt>Hỗ trợ khởi nghiệp</dt><dd>${money(l.support)}</dd></div>` : ''}<div><dt>Giá trị nguyên liệu còn lại</dt><dd>${money(game.stockValue())}</dd></div></dl><span class="balance-note ${check.cashBalanced && check.stockBalanced?'':'negative'}">${icon(check.cashBalanced && check.stockBalanced?'check':'help',16)} ${check.cashBalanced && check.stockBalanced ? 'Tiền và nguyên liệu đã đối soát' : 'Có chênh lệch cần kiểm tra'}</span></section><section class="daily-note"><span class="note-icon">${icon('leaf',21)}</span><div><h3>Dành một chút cho ngày mai</h3><p>Giữ khoảng 150.000–180.000đ để nhập hàng. Nguyên liệu chưa chế biến còn dùng được sẽ được giữ lại.</p></div></section>${final ? `<button class="button primary full" data-action="next-day">Đón ngày ${s.day+1} ${icon('sun',18)}</button><button class="button secondary full" data-action="tab" data-tab="upgrades">Ghé xem nâng cấp ${icon('arrow',17)}</button>` : `<button class="button primary full" data-action="tab" data-tab="kitchen">Trở lại gian bếp ${icon('arrow',17)}</button>`}</aside></div>`);
}
function nextUpgradeGoal() {
  const remaining = Object.values(UPGRADES).filter(u => !game.state.upgrades[u.id]);
  return remaining.find(u => game.upgradeProgress(u.id).unlocked) || remaining[0];
}
function goalCard(link = true) {
  const next = nextUpgradeGoal();
  const nextRank = SHOP_RANKS.find(rank => rank.target > game.state.servedTotal);
  const title = next?.name || nextRank?.name || 'Quán ruột của phố';
  const p = next ? game.upgradeProgress(next.id) : {current:game.state.servedTotal,target:100,unlocked:game.state.servedTotal>=100};
  const progress = next?.metric === 'day' ? `Ngày ${p.current} / ${p.target}` : `${Math.min(p.current,p.target)} / ${p.target} khách đã phục vụ`;
  const detail = next && p.unlocked ? `Đã mở khóa · giá ${money(next.price)}. ${game.state.cash < next.price ? `Còn thiếu ${money(next.price-game.state.cash)}.` : 'Có thể mua trước hoặc sau ca.'}`
    : next ? (next.metric==='day' ? `Bước sang ngày ${p.target} để mở khóa.` : `Phục vụ thêm ${p.target-p.current} khách để mở khóa.`)
    : p.unlocked ? 'Bạn đã có đủ trang bị và đạt danh hiệu cao nhất. Cảm ơn một người chủ quán tận tâm!'
    : `Thêm ${p.target-p.current} khách để nhận danh hiệu cao nhất và huy hiệu vàng của quán.`;
  return `<section class="goal-card"><span class="eyebrow">${next || nextRank ? 'MỤC TIÊU TIẾP THEO' : 'MỘT QUÁN ĐÃ NÊN DUYÊN'}</span><h3>${title}</h3><div class="goal-progress-label"><span>${p.unlocked?'Mốc đã hoàn thành':progress}</span>${icon(p.unlocked?'check':'lock',15)}</div><progress max="${p.target}" value="${Math.min(p.current,p.target)}" aria-label="Tiến độ mục tiêu tiếp theo"></progress><p>${detail}</p>${link?`<button class="text-button" data-action="tab" data-tab="upgrades">Xem mục tiêu & nâng cấp ${icon('arrow',15)}</button>`:''}</section>`;
}
function renderProgress() {
  const rank = game.shopRank;
  const next = nextUpgradeGoal();
  const available = Object.values(UPGRADES).filter(u => game.upgradeProgress(u.id).unlocked && !game.state.upgrades[u.id]).length;
  setText('#shop-rank-label', rank.name);
  setText('#footer-progress', `${rank.name} · ${game.state.servedTotal} khách`);
  $('.brand-mark').classList.toggle('renowned',rank.target===100);
  $('.brand').setAttribute('aria-label',`Phở Đầu Ngõ · ${rank.name}, về gian bếp`);
  $('#upgrade-badge').hidden = available===0;
  setText('#upgrade-badge',String(available));
  $('.tab[data-tab="upgrades"]').setAttribute('aria-label',available ? `Nâng cấp, ${available} trang bị đã mở khóa chưa mua` : 'Mục tiêu và nâng cấp quán');
  const p = next && game.upgradeProgress(next.id);
  setHTML('#next-goal-shortcut', `${icon('star',15)} ${next && p ? `${next.name} · ${p.unlocked?'Đã mở khóa':`${Math.min(p.current,p.target)}/${p.target} ${next.metric==='day'?'ngày':'khách'}`}` : rank.name}`);
}
function renderUpgrades() {
  const s = game.state;
  const rank = game.shopRank;
  const owned = Object.values(s.upgrades).filter(Boolean).length;
  const cards = Object.values(UPGRADES).map(u => {
    const p = game.upgradeProgress(u.id);
    const canBuy = !p.owned && p.unlocked && ['prep','summary'].includes(s.phase) && s.cash>=u.price;
    const condition = u.metric==='day' ? `Ngày ${Math.min(p.current,p.target)} / ${p.target}` : `${Math.min(p.current,p.target)} / ${p.target} khách`;
    const state = p.owned ? 'ĐANG SỬ DỤNG' : p.unlocked ? 'ĐÃ MỞ KHÓA' : 'MỤC TIÊU PHÍA TRƯỚC';
    const button = p.owned ? 'Đã sở hữu' : !p.unlocked ? 'Chưa mở khóa' : !['prep','summary'].includes(s.phase) ? 'Mua sau ca' : s.cash<u.price ? 'Chưa đủ tiền' : 'Mua cho quán';
    const art = u.id==='basket' ? ingredientArt('noodle') : u.id==='pot' ? ingredientArt('broth') : icon(u.icon,84);
    return `<article class="upgrade-card ${p.owned?'owned':p.unlocked?'unlocked':'locked'}" id="upgrade-${u.id}"><div class="upgrade-art">${art}<span>${state}</span></div><div class="upgrade-content"><h3>${u.name}</h3><p>${u.description}</p><div class="goal-progress-label"><span>${condition}</span><strong>${p.owned?'Đã mua':p.unlocked?'Sẵn sàng':'Đang tích lũy'}</strong></div><progress max="${p.target}" value="${Math.min(p.current,p.target)}" aria-label="Tiến độ mở ${u.name}"></progress><span class="unlock-note">${icon(p.unlocked?'check':'lock',15)} ${p.owned?'Hiệu lực lâu dài qua các ngày.':p.unlocked?'Đạt mốc rồi, dùng tiền trong két để mua.':u.metric==='day'?`Mở từ ngày ${p.target}.`:`Còn ${p.target-p.current} khách nữa.`}</span><div class="upgrade-bottom"><strong>${money(u.price)}</strong><button class="button ${canBuy?'primary':'secondary'}" data-action="upgrade" data-upgrade="${u.id}" ${canBuy?'':'disabled'}>${button} ${icon(p.owned?'check':p.unlocked?'plus':'lock',16)}</button></div></div></article>`;
  }).join('');
  setHTML('#upgrades-view', `<div class="section-intro"><span class="eyebrow">QUÁN LỚN LÊN TỪ TỪNG BÁT PHỞ</span><h2>Mỗi ngày, thêm một điều để mong.</h2><p>Phục vụ khách để mở khóa trang bị. Dùng tiền trong két mua trước hoặc sau ca; nâng cấp được giữ qua các ngày.</p></div><div class="progress-overview"><section class="rank-card ${rank.target===100?'renowned':''}" aria-label="Danh hiệu của quán"><span class="rank-medal">${icon(rank.target===100?'star':'shop',32)}</span><span class="eyebrow">DANH HIỆU HIỆN TẠI</span><h3>${rank.name}</h3><p><strong>${s.servedTotal}</strong> khách đã phục vụ · <strong>${owned}/5</strong> trang bị đã mua</p><span>Danh hiệu tự nhận, không tốn tiền.</span></section>${goalCard(false)}</div><h3 class="progress-section-title">Trang bị cho những ngày đông khách</h3><div class="upgrade-grid">${cards}</div><section class="rank-journey" aria-label="Các mốc danh hiệu"><h3>Một quán nhỏ, cả phố thương</h3><p>Đạt 100 khách để nhận danh hiệu “Quán ruột của phố” và huy hiệu vàng cạnh tên quán.</p><ol>${SHOP_RANKS.map(r=>`<li class="${s.servedTotal>=r.target?'earned':''}" ${r.target===rank.target?'aria-current="step"':''}><span>${icon(s.servedTotal>=r.target?'check':'lock',15)} ${r.target} khách</span><strong>${r.name}</strong></li>`).join('')}</ol></section>`);
}

function render() {
  syncPause();
  const s = game.state;
  document.body.classList.toggle('is-playing', ['open','closing'].includes(s.phase) && activeTab === 'kitchen');
  document.body.classList.toggle('is-alternate-view', activeTab !== 'kitchen');
  setText('#day-label', `Ngày ${String(s.day).padStart(2,'0')}`);
  setText('#cash-stat', money(s.cash));
  setHTML('#served-stat', `${s.ledger.served}<small> / ${game.maxGuests} khách</small>`);
  setHTML('#rating-stat', `${grade()}<small> / 5</small>`);
  updateClock();
  setText('#time-caption', s.phase === 'closing' ? 'Dọn những đơn cuối' : 'Thời gian mở cửa');
  setHTML('#pause-button', icon(manualPause?'play':'pause',16));
  $('#pause-button').setAttribute('aria-label',manualPause?'Tiếp tục':'Tạm dừng');
  ($('#pause-button') as HTMLButtonElement).disabled = !['open','closing'].includes(s.phase);
  setHTML('#sound-button', icon(soundEnabled?'sound':'mute'));
  $('#sound-button').setAttribute('aria-label',soundEnabled?'Tắt âm thanh':'Bật âm thanh');
  setText('#shop-status', {prep:'CHUẨN BỊ MỞ QUÁN',open:'QUÁN ĐANG ĐÓN KHÁCH',closing:'ĐANG HOÀN THÀNH ĐƠN CUỐI',summary:'HẸN KHÁCH NGÀY MAI'}[s.phase]);
  $('#shop-status').classList.toggle('open',s.phase==='open');
  $('#pause-shade').hidden = !manualPause;
  $('#close-shop-button').hidden = !['open','closing'].includes(s.phase);
  ($('#close-shop-button') as HTMLButtonElement).disabled = s.phase==='closing';
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach(el => {el.classList.toggle('active',el.dataset.tab===activeTab);el.setAttribute('aria-current',el.dataset.tab===activeTab?'page':'false');});
  $('#kitchen-view').hidden = activeTab !== 'kitchen';
  $('#ledger-view').hidden = activeTab !== 'ledger';
  $('#upgrades-view').hidden = activeTab !== 'upgrades';
  renderProgress();renderCustomers();renderIngredients();renderTicket();renderCookingControls();
  const mobileOrder = s.orders.find(o => o.id === s.selectedOrderId && (o.status === 'waiting' || o.status === 'repair'));
  // Keep this in-flow panel in place while pausing/reading so the cooking buttons do not move.
  $('#mobile-serving').hidden = activeTab !== 'kitchen' || !mobileOrder;
  if (mobileOrder) {
    const checks = targetChecklist(mobileOrder);
    const bowl = s.bowls[s.selectedBowl];
    setHTML('#mobile-serving', `<div class="mobile-order-summary"><strong>${esc(mobileOrder.name)}</strong><button class="mobile-guide-link" data-action="recipe-help" aria-label="Cách làm ${esc(recipeName(mobileOrder.recipeId))}">${icon('help',14)} Cách làm <small></small></button></div><button class="button primary" data-action="serve" disabled>${icon('bowl',18)} Mời khách ăn phở ${icon('arrow',16)}</button><p class="mobile-next-step"><span>Tiếp theo</span> <span id="mobile-next-step"></span></p>`);
    setText('#mobile-serving small', `· ${checks.filter(c=>c.done).length}/${checks.length}`);
    setText('#mobile-next-step', nextCookingStep(mobileOrder));
    $<HTMLButtonElement>('#mobile-serving [data-action="serve"]').disabled = bowl.cookState !== 'cooked' || bowl.ingredients.broth === 0 || s.paused;
  }
  if (activeTab==='ledger') renderLedger();
  if (activeTab==='upgrades') renderUpgrades();
  if (modal==='stock') updateStockModal();
  syncKitchen();
  lastStructure = structureKey();
}

function syncKitchen() {
  const s = game.state;
  kitchen.update({activeBowl:s.selectedBowl,bowls:s.bowls.map(b=>({noodles:b.ingredients.noodle*50,tai:b.ingredients.tai*25,chin:b.ingredients.chin*25,broth:b.ingredients.broth*150,scallion:b.ingredients.scallion,onion:b.ingredients.onion,herbs:b.ingredients.herbs,chili:b.ingredients.chili,lime:b.ingredients.lime,sauce:b.ingredients.sauce,quay:b.ingredients.quay,cookState:b.cookState,cookElapsed:b.cookSeconds})),stock:{...s.stock},hotBroth:s.hotBroth*150,potCapacity:game.potCapacity*150,bowlReady:s.bowlReady,perfectBlanchEnd:game.perfectBlanchEnd,phase:s.phase,paused:s.paused});
}
function structureKey() {
  const s = game.state;
  return `${s.day}|${s.phase}|${s.spawned}|${s.ledger.served}|${s.ledger.failed}|${s.selectedOrderId}|${s.hotBroth}|${!!s.brothBatch}`;
}
function updateClock() {
  const s = game.state;
  setText('#time-stat', s.phase === 'prep' ? '04:00' : s.phase === 'summary' ? 'Kết ca' : s.phase === 'closing' ? clockLabel(30-s.closingElapsed) : clockLabel(240-s.elapsed));
}

function showModal(kind: string) {lastFocus=document.activeElement as HTMLElement;modal=kind;renderModal();syncPause();render();setTimeout(()=>$('#modal-root').querySelector<HTMLElement>('button')?.focus(),0);}
function hideModal() {modal='';$('#modal-root').innerHTML='';syncPause();render();lastFocus?.focus({preventScroll:true});}
function updateStockModal() {
  const s = game.state;
  for (const id of Object.keys(INGREDIENTS) as IngredientId[]) {
    setText(`#stock-quantity-${id}`, String(s.stock[id]));
  }
  setText('#stock-hot-value', `${s.hotBroth*150} / ${game.potCapacity*150} ml`);
  const refill = $('#modal-root').querySelector<HTMLButtonElement>('[data-action="refill"]');
  if (refill) {
    const plan = game.brothRefillPlan;
    refill.disabled = manualPause || !!s.brothBatch || plan.units === 0;
    const amount = currencyFormatter.format(plan.units*150);
    refill.textContent = manualPause ? 'Tiếp tục ca trước khi nấu' : s.brothBatch ? `Đang nấu · còn ${Math.ceil(s.brothBatch.remaining)} giây`
      : !plan.units ? (s.hotBroth >= game.potCapacity ? 'Nồi đang đầy' : 'Chưa đủ tiền nhập nước dùng')
      : plan.cost ? `Nhập & nấu ${amount} ml · ${money(plan.cost)}` : `Nấu thêm ${amount} ml · ${game.brothCookDuration} giây`;
    setText('#refill-description',manualPause ? 'Đóng kho và bấm “Tiếp tục” để nấu thêm nước dùng.' : s.brothBatch
      ? `Mẻ ${currencyFormatter.format(s.brothBatch.units*150)} ml đang tạm dừng khi xem kho. Trở lại quầy để nấu tiếp.`
      : !plan.units ? (s.hotBroth >= game.potCapacity ? 'Chan bớt nước trước khi nấu mẻ tiếp theo.' : 'Kho hết nền nước dùng. Cần ít nhất 1.000đ để nhập 150 ml.')
      : plan.cost ? `Kho hết nền nước dùng. Giá nhập 1.000đ / 150 ml; mẻ này mất ${game.brothCookDuration} giây để nấu.`
      : `Dùng ${plan.units} phần nền có sẵn, không tốn thêm tiền. Mẻ nước dùng sẵn sàng sau ${game.brothCookDuration} giây.`);
  }
}
function renderModal() {
  const s = game.state;
  let content='';
  if(modal==='recipe-help') {
    const order=s.orders.find(o=>o.id===s.selectedOrderId && (o.status==='waiting'||o.status==='repair'));
    if(order) {
      const meat=order.recipeId==='tai'?'Bò tái':'Bò chín';
      const steps=[
        {title:'Lấy một bát sạch',text:'Chạm chồng bát ở tầng trên của kệ kính hoặc nút “Lấy bát sạch” để lấy bát. Mỗi lần làm một bát; giao xong thì lấy bát mới.'},
        {title:`Lấy ${order.noodleUnits*50} g bánh phở`,text:`Chạm khay “Bánh phở” ${order.noodleUnits} lần, mỗi lần 50 g${order.noodleUnits===1?' — khách gọi ít bánh':''}.`},
        {title:`Trụng bánh, nhấc giỏ ở 3–${game.perfectBlanchEnd} giây`,text:`Bấm “Trụng bánh” bên dưới quầy. Theo dõi đồng hồ, rồi bấm “Nhấc giỏ” khi ở 3–${game.perfectBlanchEnd} giây.`},
        {title:`Thêm 50 g ${meat.toLocaleLowerCase('vi-VN')}`,text:`Chạm khay “${meat}” 2 lần, mỗi lần 25 g. Phải cho đủ thịt trước khi chan nước.`},
        {title:'Chan 300 ml nước dùng',text:'Chạm nồi nước bên trái 2 lần, mỗi lần 150 ml. Cũng có thể bấm nút “Chan nước” bên dưới quầy.'},
        {title:order.noOnion?'Thêm rau thơm, bỏ cả hai loại hành':'Thêm hành và rau thơm',text:`${order.noOnion?'Khách dặn không hành: không thêm hành lá, không thêm hành tây. Chạm rau thơm 1 lần.':'Chạm hành lá 1 lần, hành tây 1 lần và rau thơm 1 lần.'} ${order.chili?'Thêm ớt 1 lần theo lời khách.':'Không thêm ớt.'} ${order.lime?'Thêm chanh 1 lần theo lời khách.':'Không thêm chanh.'} Đơn này không cần tương.`},
        {title:`Giao cho ${order.name}`,text:'Xem lại các dấu tích trên phiếu và bát trên quầy, rồi bấm “Mời khách ăn phở”.'},
      ];
      if (order.quay) steps.splice(steps.length-1,0,{title:'Lấy một phần quẩy (2 cái)',text:'Chạm rổ Quẩy ở góc trên bên trái một lần. Quẩy được đặt ra đĩa cạnh bát, giao cùng phở; giá phần quẩy đã nằm trong tổng tiền trên phiếu.'});
      content=`<span class="eyebrow">CÁCH LÀM THEO PHIẾU KHÁCH</span><h2>${esc(recipeName(order.recipeId))} của ${esc(order.name)}</h2><div class="help-callout">${icon('clock',19)} Ca đang tạm dừng để bạn đọc. Món đang làm được giữ nguyên.</div><p class="recipe-current-step"><strong>Tiếp theo với bát này</strong>${esc(nextCookingStep(order))}</p><ol class="help-steps">${steps.map((step,index)=>`<li><span>0${index+1}</span><div><strong>${esc(step.title)}</strong><p>${esc(step.text)}</p></div></li>`).join('')}</ol><button class="button primary full" data-action="dismiss">Trở lại nấu tiếp ${icon('arrow',17)}</button>`;
    } else content='<h2>Khách đã rời quán.</h2><p class="modal-lead">Chọn một khách đang chờ để xem cách làm món của họ.</p><button class="button primary full" data-action="dismiss">Trở lại quầy</button>';
  }
  if(modal==='help') content=`<span class="eyebrow">MỪNG BẠN GHÉ QUÁN</span><h2>Một bát phở, từng chút thương.</h2><p class="modal-lead">Đọc phiếu của khách, rồi tự tay chuẩn bị món ở quầy.</p><ol class="help-steps"><li><span>01</span><div><strong>Nhập hàng, nấu nước dùng</strong><p>Bấm “Nhập hàng & nấu nước” trước khi mở cửa. Tiền mua nguyên liệu được trừ ngay.</p></div></li><li><span>02</span><div><strong>Lấy bát, thêm bánh rồi trụng</strong><p>Chạm chồng bát ở tầng trên của kệ kính để lấy bát sạch. Chạm bánh hai lần cho tô thường, một lần cho ít bánh. Trụng rồi nhấc giỏ ở 3–${game.perfectBlanchEnd} giây.</p></div></li><li><span>03</span><div><strong>Thêm thịt, chan nước, rắc rau</strong><p>Hai phần thịt, hai vá nước. Thêm mỗi loại hành và rau một phần. Khách dặn “không hành” thì bỏ cả hai loại.</p></div></li><li><span>04</span><div><strong>Giao đúng khách, nhận tiền</strong><p>Chọn khách rồi bấm “Mời khách ăn phở”. Giao xong thì lấy bát mới. Theo dõi các dấu tích trên phiếu. Món đã chan sai hành phải bỏ và làm lại.</p></div></li></ol><div class="help-callout">${icon('clock',19)} Khi mở hướng dẫn, sổ thu chi hoặc rời ứng dụng, ca chơi sẽ tạm dừng.</div><button class="button primary full" data-action="dismiss">Mình sẵn sàng rồi ${icon('arrow',17)}</button>`;
  if(modal==='stock') {
    const canBuy=s.phase==='prep';
    const service=s.phase==='open'||s.phase==='closing';
    const hot=`<div class="stock-hot"><span>${icon('flame',19)} Nước dùng nóng</span><strong id="stock-hot-value">${s.hotBroth*150} / ${game.potCapacity*150} ml</strong></div>`;
    const refill=service?`<section class="broth-refill" aria-label="Nấu thêm nước dùng">${hot}<p id="refill-description"></p><button class="button primary full" data-action="refill">Nấu thêm nước dùng</button></section>`:'';
    const rows=Object.values(INGREDIENTS).map(item=>`<div class="stock-row" id="stock-row-${item.id}"><span class="stock-art">${ingredientArt(item.id)}</span><div><strong>${esc(item.name)}</strong><small>${money(item.cost)} / ${esc(item.unit)}</small></div><span class="stock-quantity"><span id="stock-quantity-${item.id}">${s.stock[item.id]}</span><small>phần</small></span>${canBuy || service && (item.id === 'quay' || item.id === 'lime')?`<button class="small-icon" data-action="buy" data-ingredient="${item.id}" aria-label="Mua thêm ${esc(item.name)}">${icon('plus',17)}</button>`:''}</div>`).join('');
    content=`<span class="eyebrow">KHO NHỎ SAU BẾP</span><h2>${canBuy?'Đi chợ cho ngày mới.':'Nguyên liệu còn lại.'}</h2><p class="modal-lead">${canBuy?'Mua vừa đủ, giữ một chút tiền dự phòng.':'Có thể nhập thêm quẩy và chanh giữa ca. Khách mới chỉ gọi khi còn hàng.'}</p>${refill}<div class="stock-table">${rows}</div>${service?'':hot}${canBuy?'<button class="button primary full" data-action="stock-up">Nhập đủ theo dự báo & nấu nước</button>':''}<button class="button secondary full" data-action="dismiss">Trở lại quầy</button>`;
  }
  if(modal==='restart')content=`<span class="eyebrow">BẮT ĐẦU MỘT CÂU CHUYỆN MỚI</span><h2>Mở lại quán từ ngày đầu?</h2><p class="modal-lead">Tiến trình, tiền và nâng cấp hiện tại sẽ được thay bằng một quán mới với 200.000đ vốn.</p><button class="button rust full" data-action="restart">Chơi lại từ ngày 1</button><button class="button secondary full" data-action="dismiss">Giữ quán của mình</button>`;
  if(modal==='discard')content=`<span class="eyebrow">LÀM LẠI CHO NGON HƠN</span><h2>Bỏ bát phở này?</h2><p class="modal-lead">${money(s.bowls[s.selectedBowl].cost)} nguyên liệu trong bát sẽ được ghi vào hao hụt. Sau đó lấy một bát sạch từ tầng trên của kệ kính để nấu lại.</p><button class="button rust full" data-action="discard">Bỏ bát & làm lại</button><button class="button secondary full" data-action="dismiss">Tiếp tục với bát này</button>`;
  if(modal==='close')content=`<span class="eyebrow">NGHỈ TAY SỚM MỘT CHÚT</span><h2>Đóng cửa đón khách?</h2><p class="modal-lead">Quán dừng nhận khách mới. Bạn có tối đa 30 giây để hoàn thành các đơn đang chờ; món dở và nước dùng thừa sẽ tính hao hụt.</p><button class="button primary full" data-action="confirm-close">Ngừng nhận khách mới</button><button class="button secondary full" data-action="dismiss">Tiếp tục bán hàng</button>`;
  $('#modal-root').innerHTML=`<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${modal==='help'?'Hướng dẫn chơi':modal==='recipe-help'?'Cách làm món khách gọi':modal==='stock'?'Kho nguyên liệu':'Xác nhận thao tác'}"><button class="modal-close icon-button" data-action="dismiss" aria-label="Đóng cửa sổ">${icon('close')}</button>${content}</section></div>`;
}

function stockUp() {
  const estimated = Object.entries(game.recommendedShopping()).reduce((sum,[id,q])=>sum+q*INGREDIENTS[id as IngredientId].cost,0);
  const smallCost = () => Object.entries(game.smallShopping()).reduce((sum,[id,q])=>sum+q*INGREDIENTS[id as IngredientId].cost,0);
  if (estimated > game.state.cash && smallCost() > game.state.cash) game.recover();
  const purchase=estimated <= game.state.cash ? game.buyRecommended() : game.buySmallBatch();
  if(!purchase.ok){result(purchase);return;}
  if(game.state.hotBroth<game.maxGuests*2){
    const units=Math.min(game.state.stock.broth,game.potCapacity-game.state.hotBroth,Math.max(0,game.maxGuests*2+2-game.state.hotBroth));
    if(units>0)game.prepareBroth(units);
  }
  result({ok:true,message:'Nguyên liệu đã sẵn sàng, nồi nước dùng đang thơm. Mở quán thôi!'});
}

app.addEventListener('click',onClick);
function onClick(event: MouseEvent) {
  const target=(event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if(!target || target instanceof HTMLButtonElement && target.disabled)return;
  const action=target.dataset.action;
  if(action==='backdrop'){if(event.target===target)hideModal();return;}
  event.preventDefault();
  if(action==='tab'){activeTab=target.dataset.tab!;syncPause();render();if(activeTab==='kitchen')window.dispatchEvent(new Event('resize'));return;}
  if(action==='help'){showModal('help');return;}
  if(action==='recipe-help'){showModal('recipe-help');return;}
  if(action==='ticket-details'){
    ticketDetailsOpen=!ticketDetailsOpen;
    $('#order-ticket').classList.toggle('recipe-details-open',ticketDetailsOpen);
    target.setAttribute('aria-expanded',String(ticketDetailsOpen));
    target.textContent=ticketDetailsOpen?'Thu gọn':'Chi tiết';
    return;
  }
  if(action==='sound'){soundEnabled=!soundEnabled;try{localStorage.setItem(SOUND_KEY,soundEnabled?'on':'off');}catch{}sound();render();return;}
  if(action==='pause'){manualPause=!manualPause;syncPause();render();save();return;}
  if(action==='stock'){showModal('stock');return;}
  if(action==='dismiss'){hideModal();return;}
  if(action==='stock-up'){stockUp();return;}
  if(action==='buy'){result(game.buy(target.dataset.ingredient as IngredientId, target.dataset.ingredient==='broth'?10:1),true);return;}
  if(action==='refill-prompt'){showModal('stock');return;}
  if(action==='refill'){hideModal();result(game.refillBroth());return;}
  if(action==='open'){
    if(game.state.hotBroth<2 || game.state.stock.noodle<2){stockUp();}
    result(game.openShop());return;
  }
  if(action==='select-order'){result(game.chooseOrder(target.dataset.id!),true);return;}
  if(action==='take-bowl'){result(game.takeBowl(),true);return;}
  if(action==='ingredient'){
    const id = target.dataset.ingredient as IngredientId;
    if ((id === 'quay' || id === 'lime') && (game.state.phase === 'prep' || !game.state.stock[id])) { showModal('stock'); document.getElementById(`stock-row-${id}`)?.scrollIntoView({block:'center'}); return; }
    const added = game.add(id);
    result(added,true);
    if (added.ok) tapFeedback(target, `+ ${INGREDIENTS[id].unit}`);
    return;
  }
  if(action==='blanch'){result(game.startBlanch());return;}
  if(action==='lift'){const lifted=game.liftBlanch();result(lifted);if(lifted.ok)tapFeedback(target);return;}
  if(action==='broth'){pourBroth(target);return;}
  if(action==='serve'){
    const bowlIndex = game.state.selectedBowl;
    const response=game.serve();
    if(response.ok && game.state.lastResult?.status==='served') {
      kitchen.effect('serve',{bowl:bowlIndex});
      tapFeedback($('#cash-stat'));
    }
    result(response,false,response.ok?'serve':'error');return;
  }
  if(action==='discard-prompt'){showModal('discard');return;}
  if(action==='discard'){hideModal();result(game.discard());return;}
  if(action==='close-shop'){showModal('close');return;}
  if(action==='confirm-close'){hideModal();result(game.closeShop());return;}
  if(action==='next-day'){result(game.nextDay());activeTab='kitchen';manualPause=false;render();window.dispatchEvent(new Event('resize'));return;}
  if(action==='upgrade'){result(game.buyUpgrade(target.dataset.upgrade as UpgradeId));return;}
  if(action==='restart-prompt'){showModal('restart');return;}
  if(action==='restart'){allowSave=true;game=new GameEngine();knownUnlocks.clear();knownRankTarget=0;manualPause=false;activeTab='kitchen';lastPhase='prep';hideModal();save();render();toast('Một quán mới, một khởi đầu thật ấm.');}
}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && modal){hideModal();return;}
  if(event.key==='Tab' && modal){
    const els=[...$('#modal-root').querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)')];
    if(event.shiftKey && document.activeElement===els[0]){event.preventDefault();els.at(-1)?.focus();}
    else if(!event.shiftKey && document.activeElement===els.at(-1)){event.preventDefault();els[0]?.focus();}
  }
});
document.addEventListener('visibilitychange',()=>{syncPause();save();render();});
window.addEventListener('pagehide',save);
let previous=performance.now();
function frame(now:number){
  const dt=Math.min(.25,(now-previous)/1000);previous=now;
  const running = !game.state.paused && (game.state.phase === 'open' || game.state.phase === 'closing');
  if (running) {
    game.tick(dt); clockElapsed+=dt; saveElapsed+=dt;
  }
  // A click can finish the day synchronously, before the next running tick.
  if(lastPhase!==game.state.phase){
    const phase=game.state.phase;
    if(phase==='summary'){
      activeTab='ledger';sound('serve');
      if(now>=unlockAnnouncementUntil)toast('Hết ngày rồi! Sổ thu chi của quán đã sẵn sàng.');
    }
    lastPhase=phase;
    render();queueSave();
  }
  if (structureKey() !== lastStructure) { render(); queueSave(); }
  if(running && clockElapsed>=.1){
    clockElapsed=0; updateClock(); updatePatience(); updateCookClock();
    if(game.state.brothBatch) updateBrothControl();
    if(game.state.bowls.some(b=>b.cookState==='cooking')) syncKitchen();
  }
  if(running && saveElapsed>=2){saveElapsed=0;queueSave();}
  requestAnimationFrame(frame);
}
render();save();
if(!game.loadError && saved && typeof saved === 'object' && 'version' in saved && saved.version === 1) toast(game.state.notice.startsWith('Quầy mới') ? game.state.notice : 'Quầy mới dùng một bát. Chạm chồng bát ở tầng trên của kệ kính để bắt đầu món mới.',false,4200);
if(game.loadError || damagedSave)toast('Bản lưu bị lỗi đã được giữ để khôi phục. Một quán mới được mở cho bạn.',true);
requestAnimationFrame(frame);

if (saved && typeof saved === 'object' && 'version' in saved && saved.version === 3 && !game.loadError && game.state.ledger.refunds) toast(game.state.notice,false,5500);
