/* =========================================================
   Казино — точная логика Telegram Dice 🎰
   
   Основано на исходном коде Telegram Desktop:
   telegramdesktop/tdesktop — history_view_slot_machine.cpp
   
   Формула: partValue = ((value - 1) >> (partIndex * 2)) & 0x03
   Символы: 0=BAR, 1=🍒, 2=🍋, 3=7️⃣
   Особый случай: value 64 → 7️⃣7️⃣7️⃣ (ДЖЕКПОТ)
   ========================================================= */

export const MIN_BET = 10;
export const MAX_BET = 1_000_000_000;

/* Символы по коду (0-3) */
const SYMBOL_MAP = {
  0: { id: 'bar',    char: 'BAR' },   // BAR (полоса)
  1: { id: 'cherry', char: '🍒' },    // вишня
  2: { id: 'lemon',  char: '🍋' },    // лимон
  3: { id: 'seven',  char: '7️⃣' },   // семь
};

/* =========================================================
   ДЕКОДИРОВАНИЕ
   Извлекаем 3 символа из значения dice (1-64)
   ========================================================= */
export function decodeReels(value) {
  if (value < 1 || value > 64) return null;

  /* Особый случай: 64 = три семёрки (ДЖЕКПОТ) */
  if (value === 64) {
    return [
      SYMBOL_MAP[3],
      SYMBOL_MAP[3],
      SYMBOL_MAP[3],
    ];
  }

  const v = value - 1;                          // 0..63
  const part0 = (v >> 0) & 0b11;                // левая ячейка
  const part1 = (v >> 2) & 0b11;                // средняя ячейка
  const part2 = (v >> 4) & 0b11;                // правая ячейка

  return [
    SYMBOL_MAP[part0],
    SYMBOL_MAP[part1],
    SYMBOL_MAP[part2],
  ];
}

/* =========================================================
   ОПРЕДЕЛЕНИЕ РЕЗУЛЬТАТА
   ========================================================= */
export function getResultByDice(value) {
  const reels = decodeReels(value);
  if (!reels) {
    return {
      win: false,
      multiplier: 0,
      label: 'Ошибка',
      reels: [],
    };
  }

  const [a, b, c] = reels;

  /* ----- Тройка ----- */
  if (a.id === b.id && b.id === c.id) {
    /* 7️⃣7️⃣7️⃣ — ДЖЕКПОТ */
    if (a.id === 'seven') {
      return {
        win: true,
        multiplier: 10,
        jackpot: true,
        label: '🎉🎉🎉 ДЖЕКПОТ 7️⃣7️⃣7️⃣',
        reels,
      };
    }

    /* BAR BAR BAR / 🍒🍒🍒 / 🍋🍋🍋 — крупный выигрыш */
    return {
      win: true,
      multiplier: 5,
      label: `🏆 Крупный ${a.char}${a.char}${a.char}!`,
      reels,
    };
  }

  /* ----- Пара ----- */
  const counts = {};
  for (const r of reels) counts[r.id] = (counts[r.id] || 0) + 1;
  const hasPair = Object.values(counts).some(v => v >= 2);

  if (hasPair) {
    return {
      win: true,
      multiplier: 1.5,
      label: 'Пара!',
      reels,
    };
  }

  /* ----- Мимо ----- */
  return {
    win: false,
    multiplier: 0,
    label: 'Мимо',
    reels,
  };
}

/* =========================================================
   ФОРМАТ ПОЛЯ ДЛЯ ТЕКСТА
   ========================================================= */
export function renderReels(reels) {
  if (!reels || reels.length !== 3) return '??? | ??? | ???';
  return `${reels[0].char} | ${reels[1].char} | ${reels[2].char}`;
}

/* =========================================================
   ПОДГОТОВКА СПИНА (списываем ставку)
   ========================================================= */
export function prepareSpin(user, bet) {
  bet = Math.floor(Number(bet));

  if (!Number.isFinite(bet) || bet < MIN_BET) {
    return { ok: false, msg: `Минимальная ставка — ${MIN_BET} SC` };
  }
  if (bet > MAX_BET) {
    return { ok: false, msg: `Максимум 1 000 000 000 SC` };
  }
  if (user.money < bet) {
    return { ok: false, msg: `Не хватает ${Math.floor(bet - user.money)} SC` };
  }

  /* Списываем ставку сразу */
  user.money -= bet;

  return { ok: true, bet };
}

/* =========================================================
   ОБРАБОТКА РЕЗУЛЬТАТА DICE
   ========================================================= */
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
  if (result.win) {
    user.stats.totalPayout = (user.stats.totalPayout || 0) + result.gain;
  }
  if (result.jackpot) {
    user.stats.jackpots = (user.stats.jackpots || 0) + 1;
  }
  if (result.multiplier > (user.stats.maxSpinWin || 0)) {
    user.stats.maxSpinWin = result.multiplier;
  }

  result.newBalance = user.money;
  result.diceValue = diceValue;
  result.bet = bet;

  return result;
}