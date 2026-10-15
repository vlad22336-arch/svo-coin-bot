/* Казино — однорукий бандит */

export const MIN_BET = 10;
export const MAX_BET = 1_000_000_000; // 1 миллиард

/* Символы и веса */
export const SYMBOLS = [
  { id: 'seven',   char: '7️⃣',  weight: 2,  payout3: 10 },
  { id: 'diamond', char: '💎',  weight: 4,  payout3: 7 },
  { id: 'grape',   char: '🍇',  weight: 8,  payout3: 5 },
  { id: 'cherry',  char: '🍒',  weight: 15, payout3: 3 },
  { id: 'lemon',   char: '🍋',  weight: 20, payout3: 0 },
  { id: 'bell',    char: '🔔',  weight: 12, payout3: 0 },
  { id: 'orange',  char: '🍊',  weight: 18, payout3: 0 },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((s, x) => s + x.weight, 0);

/* Выбрать символ по весу */
function pickSymbol() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const s of SYMBOLS) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return SYMBOLS[0];
}

/* Рассчитать выигрыш */
export function calculatePayout(reels, bet) {
  const [a, b, c] = reels;

  /* Все три одинаковые */
  if (a.id === b.id && b.id === c.id) {
    if (a.payout3 > 0) {
      return {
        win: true,
        multiplier: a.payout3,
        gain: Math.floor(bet * a.payout3),
        combo: `${a.char}${a.char}${a.char}`,
        jackpot: a.id === 'seven',
      };
    }
    /* Три одинаковых редких без выигрыша (lemon/bell/orange) — считаем парой */
  }

  /* Любая пара — ×1.5 */
  const counts = {};
  for (const r of reels) counts[r.id] = (counts[r.id] || 0) + 1;
  const hasPair = Object.values(counts).some(v => v >= 2);

  if (hasPair) {
    return {
      win: true,
      multiplier: 1.5,
      gain: Math.floor(bet * 1.5),
      combo: 'Пара',
    };
  }

  return {
    win: false,
    multiplier: 0,
    gain: 0,
    combo: 'Мимо',
  };
}

/* Сделать спин */
export function spin(user, bet) {
  bet = Math.floor(Number(bet));

  if (!Number.isFinite(bet) || bet < MIN_BET) {
    return { ok: false, msg: `Минимальная ставка — ${MIN_BET} SC` };
  }
  if (bet > MAX_BET) {
    return { ok: false, msg: `Максимальная ставка — 1B SC` };
  }
  if (user.money < bet) {
    return { ok: false, msg: `Не хватает ${bet - Math.floor(user.money)} SC` };
  }

  /* Списываем ставку */
  user.money -= bet;

  /* Крутим 3 барабана */
  const reels = [pickSymbol(), pickSymbol(), pickSymbol()];
  const result = calculatePayout(reels, bet);

  /* Выплата */
  if (result.win) {
    user.money += result.gain;
    user.totalEarned = (user.totalEarned || 0) + result.gain;
  }

  /* Статистика */
  user.stats = user.stats || {};
  user.stats.spins = (user.stats.spins || 0) + 1;
  if (result.win) user.stats.wins = (user.stats.wins || 0) + 1;
  user.stats.totalBets = (user.stats.totalBets || 0) + bet;
  if (result.win) user.stats.totalPayout = (user.stats.totalPayout || 0) + result.gain;
  if (result.jackpot) user.stats.jackpots = (user.stats.jackpots || 0) + 1;
  if (result.multiplier > (user.stats.maxSpinWin || 0)) {
    user.stats.maxSpinWin = result.multiplier;
  }

  return {
    ok: true,
    reels: reels.map(r => r.char),
    ...result,
    bet,
    newBalance: user.money,
  };
}

/* Красивое поле слотов */
export function renderReels(reels) {
  return (
    `┌─────────────┐\n` +
    `│  ${reels[0]}  │  ${reels[1]}  │  ${reels[2]}  │\n` +
    `└─────────────┘`
  );
}