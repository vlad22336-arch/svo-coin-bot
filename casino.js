/* Казино — используем Telegram Dice для анимации */

export const MIN_BET = 10;
export const MAX_BET = 1_000_000_000;

/* 
  Telegram Dice 🎰 возвращает значения 1-64
  Распределение:
  1-43 (67%) → проигрыш (мелкий 1-14, 15-30, 31-43)
  44-54 (17%) → мелочь (pair, ×1.5)
  55-60 (9%)  → средний выигрыш (×3)
  61-63 (5%)  → крупный (×5)
  64  (1.5%)  → ДЖЕКПОТ (×10)
  
  Причём: 
  - 1 = 🍒🍒🍒 (три вишни)
  - 22 = 🍋🍋🍋 (три лимона)
  - 43 = 🍋🍇🍊 (без совпадений)
  - 64 = 7️⃣7️⃣7️⃣ (три семёрки!)
*/

/* Определяем результат по значению dice */
export function getResultByDice(value) {
  /* Джекпот — 7️⃣7️⃣7️⃣ */
  if (value === 64) {
    return {
      win: true,
      multiplier: 10,
      combo: '7️⃣7️⃣7️⃣',
      jackpot: true,
      label: 'ДЖЕКПОТ!',
    };
  }

  /* Крупный выигрыш — 61-63 */
  if (value >= 61) {
    return {
      win: true,
      multiplier: 5,
      combo: 'три в ряд',
      label: 'Крупный выигрыш!',
    };
  }

  /* Средний — 55-60 */
  if (value >= 55) {
    return {
      win: true,
      multiplier: 3,
      combo: 'три в ряд',
      label: 'Отлично!',
    };
  }

  /* Мелочь — 44-54 */
  if (value >= 44) {
    return {
      win: true,
      multiplier: 1.5,
      combo: 'пара',
      label: 'Пара!',
    };
  }

  /* Проигрыш */
  return {
    win: false,
    multiplier: 0,
    combo: 'мимо',
    label: 'Мимо',
  };
}

/* Описание символов по значению (для текста) */
export function describeDice(value) {
  if (value === 64) return '7️⃣ | 7️⃣ | 7️⃣';
  if (value === 1) return '🍒 | 🍒 | 🍒';
  if (value === 22) return '🍋 | 🍋 | 🍋';
  if (value === 43) return '🍇 | 🍇 | 🍇';

  /* Разные комбинации для других чисел (для визуальной части) */
  const symbols = ['🍋', '🍇', '🍊', '🔔', '🍒', '💎'];
  const a = symbols[value % symbols.length];
  const b = symbols[(value * 2) % symbols.length];
  const c = symbols[(value * 3) % symbols.length];

  /* Если все совпали — заменяем */
  if (a === b && b === c) return `${a} | ${b} | 🍋`;

  return `${a} | ${b} | ${c}`;
}

/* Сделать спин */
export function prepareSpin(user, bet) {
  bet = Math.floor(Number(bet));

  if (!Number.isFinite(bet) || bet < MIN_BET) {
    return { ok: false, msg: `Минимальная ставка — ${MIN_BET} SC` };
  }
  if (bet > MAX_BET) {
    return { ok: false, msg: `Максимум 1B SC` };
  }
  if (user.money < bet) {
    return { ok: false, msg: `Не хватает ${Math.floor(bet - user.money)} SC` };
  }

  /* Списываем ставку сразу */
  user.money -= bet;

  return { ok: true, bet };
}

/* Обработка результата dice */
export function handleDiceResult(user, bet, diceValue) {
  const result = getResultByDice(diceValue);

  if (result.win) {
    const gain = Math.floor(bet * result.multiplier);
    user.money += gain;
    user.totalEarned = (user.totalEarned || 0) + gain;
    result.gain = gain;
  } else {
    result.gain = 0;
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

  result.newBalance = user.money;
  return result;
}