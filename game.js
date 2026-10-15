/* Игровая логика: бизнесы, доход, покупка, апгрейд */

export const BUSINESSES = [
  { id: 'lemonade', name: 'Лимонадный ларёк', emoji: '🍋', basePrice: 50,   baseIncome: 1 },
  { id: 'coffee',   name: 'Кофейня',          emoji: '☕', basePrice: 500,  baseIncome: 8 },
  { id: 'pizza',    name: 'Пиццерия',         emoji: '🍕', basePrice: 5000, baseIncome: 65 },
];

export const MAX_LEVEL = 50;
export const OFFLINE_MAX_MS = 3 * 24 * 60 * 60 * 1000;
export const SELL_RATIO = 0.6;

/* Форматирование СвойCoint */
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

/* Новый пользователь */
export function createUser(id) {
  return {
    id,
    money: 100,
    totalEarned: 0,
    businesses: {},      // id -> { level, invested }
    lastSeen: Date.now(),
    createdAt: Date.now(),
  };
}

/* Цены */
export const getBuyPrice     = tpl => Math.floor(tpl.basePrice);
export const getUpgradePrice = (tpl, lvl) => Math.floor(tpl.basePrice * Math.pow(1.18, lvl));
export const getSellPrice    = inv => Math.floor(inv * SELL_RATIO);

/* Доход на уровне */
export const getIncome = (tpl, lvl) =>
  lvl <= 0 ? 0 : tpl.baseIncome * lvl * (1 + 0.05 * (lvl - 1));

/* Общий доход */
export function totalIncomePerSec(user) {
  let sum = 0;
  for (const tpl of BUSINESSES) {
    const b = user.businesses[tpl.id];
    if (b && b.level > 0) sum += getIncome(tpl, b.level);
  }
  return sum;
}

/* Оффлайн-доход */
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

/* Купить бизнес */
export function buy(user, id) {
  const tpl = BUSINESSES.find(t => t.id === id);
  if (!tpl) return { ok: false, msg: 'Бизнес не найден' };
  if (user.businesses[id]) return { ok: false, msg: 'Уже куплено' };

  const price = getBuyPrice(tpl);
  if (user.money < price) {
    return { ok: false, msg: `Не хватает ${fmt(price - user.money)}` };
  }

  user.money -= price;
  user.businesses[id] = { level: 1, invested: price };

  return { ok: true, msg: `Куплено: ${tpl.emoji} ${tpl.name}`, tpl };
}

/* Прокачать */
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

  return { ok: true, msg: `Уровень ${b.level}: ${tpl.name}`, level: b.level, tpl };
}

/* Продать */
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