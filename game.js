/* Игровая логика: 20 бизнесов, доход, апгрейды */

export const BUSINESSES = [
  { id: 'lemonade',   name: 'Лимонадный ларёк',        emoji: '🍋', basePrice: 50,   baseIncome: 1 },
  { id: 'coffee',     name: 'Кофейня',                 emoji: '☕', basePrice: 500,  baseIncome: 8 },
  { id: 'pizza',      name: 'Пиццерия',                emoji: '🍕', basePrice: 5e3,  baseIncome: 65 },
  { id: 'bar',        name: 'Бар',                     emoji: '🍺', basePrice: 5e4,  baseIncome: 500 },
  { id: 'hotel',      name: 'Отель',                   emoji: '🏨', basePrice: 5e5,  baseIncome: 4.2e3 },
  { id: 'factory',    name: 'Завод',                   emoji: '🏭', basePrice: 5e6,  baseIncome: 3.5e4 },
  { id: 'bank',       name: 'Банк',                    emoji: '🏦', basePrice: 5e7,  baseIncome: 3e5 },
  { id: 'oil',        name: 'Нефтевышка',              emoji: '🛢️', basePrice: 5e8,  baseIncome: 2.5e6 },
  { id: 'space',      name: 'Космо-станция',           emoji: '🚀', basePrice: 5e9,  baseIncome: 2e7 },
  { id: 'quantum',    name: 'Квант-корпорация',        emoji: '🧬', basePrice: 5e10, baseIncome: 1.5e8 },
  { id: 'ai',         name: 'AI-лаборатория',          emoji: '🤖', basePrice: 5e11, baseIncome: 1.2e9 },
  { id: 'fusion',     name: 'Термоядерный реактор',    emoji: '⚛️', basePrice: 5e12, baseIncome: 1e10 },
  { id: 'metaverse',  name: 'Метавселенная',           emoji: '🌐', basePrice: 5e13, baseIncome: 8e10 },
  { id: 'moon',       name: 'Лунная база',             emoji: '🌙', basePrice: 5e14, baseIncome: 7e11 },
  { id: 'mars',       name: 'Марс-колония',            emoji: '🔴', basePrice: 5e15, baseIncome: 6e12 },
  { id: 'dyson',      name: 'Сфера Дайсона',           emoji: '☀️', basePrice: 5e16, baseIncome: 5e13 },
  { id: 'wormhole',   name: 'Червоточина',             emoji: '🌀', basePrice: 5e17, baseIncome: 4e14 },
  { id: 'galaxy',     name: 'Галактическая империя',   emoji: '🌌', basePrice: 5e18, baseIncome: 3.5e15 },
  { id: 'multiverse', name: 'Мультивселенная',         emoji: '♾️', basePrice: 5e19, baseIncome: 3e16 },
  { id: 'god',        name: 'Божественная корпорация', emoji: '✨', basePrice: 5e20, baseIncome: 2.5e17 },
];

export const MAX_LEVEL = 50;
export const OFFLINE_MAX_MS = 3 * 24 * 60 * 60 * 1000;
export const SELL_RATIO = 0.6;

/* ---------- Форматирование ---------- */
export function fmt(n, { full = false } = {}) {
  if (!isFinite(n)) return '∞ SC';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const unit = full ? ' СвойCoint' : ' SC';

  if (abs < 1000) return sign + Math.floor(abs) + unit;

  const units = [
    { v: 1e15, s: 'Q' }, { v: 1e12, s: 'T' },
    { v: 1e9,  s: 'B' }, { v: 1e6,  s: 'M' }, { v: 1e3, s: 'K' },
  ];
  for (const u of units) {
    if (abs >= u.v) {
      const val = abs / u.v;
      return sign + (val >= 100 ? val.toFixed(0) : val.toFixed(2)) + u.s + unit;
    }
  }
  return sign + Math.floor(abs) + unit;
}

/* ---------- Пользователь ---------- */
export function createUser(id) {
  return {
    id,
    money: 100,
    totalEarned: 0,
    businesses: {},
    daily: { lastClaim: 0, streak: 0 },
    achievements: {},
    lastSeen: Date.now(),
    createdAt: Date.now(),
  };
}

export function normalizeUser(user) {
  user.money ??= 100;
  user.totalEarned ??= 0;
  user.businesses ??= {};
  user.daily ??= { lastClaim: 0, streak: 0 };
  user.achievements ??= {};
  user.lastSeen ??= Date.now();
  user.createdAt ??= Date.now();
  return user;
}

/* ---------- Цены ---------- */
export const getBuyPrice     = tpl => Math.floor(tpl.basePrice);
export const getUpgradePrice = (tpl, lvl) => Math.floor(tpl.basePrice * Math.pow(1.18, lvl));
export const getSellPrice    = inv => Math.floor(inv * SELL_RATIO);
export const getIncome = (tpl, lvl) =>
  lvl <= 0 ? 0 : tpl.baseIncome * lvl * (1 + 0.05 * (lvl - 1));

/* ---------- Разблокировка ---------- */
export function canBuy(user, id) {
  const idx = BUSINESSES.findIndex(t => t.id === id);
  if (idx <= 0) return true;
  const prev = BUSINESSES[idx - 1];
  return !!(user.businesses[prev.id] && user.businesses[prev.id].level > 0);
}

/* ---------- Общий доход ---------- */
export function totalIncomePerSec(user) {
  let sum = 0;
  for (const tpl of BUSINESSES) {
    const b = user.businesses[tpl.id];
    if (b && b.level > 0) sum += getIncome(tpl, b.level);
  }
  return sum;
}

/* ---------- Оффлайн ---------- */
export function applyOffline(user) {
  const now = Date.now();
  const elapsed = Math.min(now - (user.lastSeen || now), OFFLINE_MAX_MS);
  const income = totalIncomePerSec(user);

  if (elapsed < 5000 || income <= 0) {
    user.lastSeen = now;
    return 0;
  }

  const earned = income * (elapsed / 1000);
  user.money += earned;
  user.totalEarned += earned;
  user.lastSeen = now;
  return earned;
}

/* ---------- Действия ---------- */
export function buy(user, id) {
  const tpl = BUSINESSES.find(t => t.id === id);
  if (!tpl) return { ok: false, msg: 'Бизнес не найден' };
  if (user.businesses[id]) return { ok: false, msg: 'Уже куплено' };
  if (!canBuy(user, id)) return { ok: false, msg: 'Сначала купите предыдущий бизнес' };

  const price = getBuyPrice(tpl);
  if (user.money < price) {
    return { ok: false, msg: `Не хватает ${fmt(price - user.money)}` };
  }

  user.money -= price;
  user.businesses[id] = { level: 1, invested: price };
  return { ok: true, msg: `Куплено: ${tpl.emoji} ${tpl.name}`, tpl };
}

export function upgrade(user, id) {
  const tpl = BUSINESSES.find(t => t.id === id);
  if (!tpl) return { ok: false, msg: 'Бизнес не найден' };

  const b = user.businesses[id];
  if (!b) return { ok: false, msg: 'Сначала купите' };
  if (b.level >= MAX_LEVEL) return { ok: false, msg: 'Максимальный уровень' };

  const price = getUpgradePrice(tpl, b.level);
  if (user.money < price) {
    return { ok: false, msg: `Не хватает ${fmt(price - user.money)}` };
  }

  user.money -= price;
  b.level += 1;
  b.invested += price;
  return { ok: true, msg: `Уровень ${b.level}`, level: b.level, tpl };
}

export function sell(user, id) {
  const tpl = BUSINESSES.find(t => t.id === id);
  if (!tpl) return { ok: false, msg: 'Бизнес не найден' };

  const b = user.businesses[id];
  if (!b) return { ok: false, msg: 'Нечего продавать' };

  const refund = getSellPrice(b.invested);
  user.money += refund;
  user.totalEarned += refund;
  delete user.businesses[id];
  return { ok: true, msg: `Продано: ${tpl.name} за ${fmt(refund)}`, refund };
}