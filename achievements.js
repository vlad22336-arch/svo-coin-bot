/* Достижения — 8 штук, открываются автоматически */

import { BUSINESSES, getIncome } from './game.js';

export const ACHIEVEMENTS = [
  {
    id: 'first_buy',
    emoji: '🥇',
    title: 'Первый бизнес',
    desc: 'Купить первый бизнес',
    check: (u) => Object.keys(u.businesses).length >= 1,
  },
  {
    id: 'three_biz',
    emoji: '🏢',
    title: 'Три бизнеса',
    desc: 'Владеть 3 бизнесами',
    check: (u) => Object.keys(u.businesses).length >= 3,
  },
  {
    id: 'all_biz',
    emoji: '👑',
    title: 'Империя',
    desc: 'Владеть всеми 20 бизнесами',
    check: (u) => Object.keys(u.businesses).length >= BUSINESSES.length,
  },
  {
    id: 'lvl10',
    emoji: '⬆️',
    title: 'Прокачка',
    desc: 'Довести бизнес до 10 уровня',
    check: (u) => Object.values(u.businesses).some(b => b.level >= 10),
  },
  {
    id: 'lvl25',
    emoji: '💪',
    title: 'Мастер',
    desc: 'Довести бизнес до 25 уровня',
    check: (u) => Object.values(u.businesses).some(b => b.level >= 25),
  },
  {
    id: 'rich',
    emoji: '💰',
    title: 'Богач',
    desc: 'Накопить 100K SC',
    check: (u) => u.money >= 1e5,
  },
  {
    id: 'millionaire',
    emoji: '💎',
    title: 'Миллионер',
    desc: 'Накопить 1M SC',
    check: (u) => u.money >= 1e6,
  },
  {
    id: 'streak7',
    emoji: '🔥',
    title: 'Преданный',
    desc: 'Серия 7 дней ежедневок',
    check: (u) => (u.daily?.streak || 0) >= 7,
  },
];

/* Проверить и выдать новые */
export function checkAchievements(user) {
  user.achievements ??= {};
  const unlocked = [];

  for (const a of ACHIEVEMENTS) {
    if (user.achievements[a.id]) continue;
    try {
      if (a.check(user)) {
        user.achievements[a.id] = { at: Date.now() };
        unlocked.push(a);
      }
    } catch {}
  }

  return unlocked;
}

/* Все достижения с прогрессом */
export function listAchievements(user) {
  user.achievements ??= {};

  return ACHIEVEMENTS.map(a => ({
    id: a.id,
    emoji: a.emoji,
    title: a.title,
    desc: a.desc,
    unlocked: !!user.achievements[a.id],
    at: user.achievements[a.id]?.at || null,
  }));
}