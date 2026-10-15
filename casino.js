export function getResultByDice(value) {
  /* 🎰 Максимальные выигрыши */

  // 64 = 7️⃣7️⃣7️⃣ — ДЖЕКПОТ
  if (value === 64) {
    return { win: true, multiplier: 10, jackpot: true, label: 'ДЖЕКПОТ 7️⃣7️⃣7️⃣' };
  }

  // 1 = 🍒🍒🍒 — большая вишня
  if (value === 1) {
    return { win: true, multiplier: 10, jackpot: true, label: 'ДЖЕКПОТ 🍒🍒🍒' };
  }

  // 60 = 🍇🍇🍇 — крупный
  // 22 = 🔔🔔🔔 — крупный
  if (value === 60 || value === 22) {
    return { win: true, multiplier: 5, label: 'Крупный выигрыш!' };
  }

  // 61-63 = BAR BAR X — средний
  if (value >= 61 && value <= 63) {
    return { win: true, multiplier: 3, label: 'Три в ряд!' };
  }

  // 43 = 🍋 BAR BAR — особый BAR
  if (value === 43) {
    return { win: true, multiplier: 2, label: 'БАР-БАР!' };
  }

  // Остальные с парой
  const pairValues = [2,3,4,5,6,9,11,13,16,17,18,21,23,24,26,27,30,32,33,35,38,39,41,42,44,47,48,49,52,54,56,57,58,59];
  if (pairValues.includes(value)) {
    return { win: true, multiplier: 1.5, label: 'Пара!' };
  }

  // Проигрыш
  return { win: false, multiplier: 0, label: 'Мимо' };
}

/* Описание что выпало */
export function describeDice(value) {
  const table = {
    1:  '🍒 | 🍒 | 🍒',
    2:  '🍒 | 🍒 | 🔔',
    3:  '🍒 | 🍒 | 🍋',
    4:  '🍒 | 🍒 | 🍇',
    5:  '🍒 | 🔔 | 🍒',
    6:  '🍒 | 🔔 | 🔔',
    22: '🔔 | 🔔 | 🔔',
    43: '🍋 | BAR | BAR',
    60: '🍇 | 🍇 | 🍇',
    61: 'BAR | BAR | 🍒',
    62: 'BAR | BAR | 🔔',
    63: 'BAR | BAR | 🍋',
    64: '7️⃣ | 7️⃣ | 7️⃣',
  };

  if (table[value]) return table[value];

  // Для остальных — упрощённое описание
  const groups = {
    win:    '✨ Совпадение',
    lose:   '😔 Мимо',
  };
  return groups.lose;
}