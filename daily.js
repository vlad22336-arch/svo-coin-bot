/* Ежедневный бонус + серия дней */

export const REWARDS = [
  { day: 1, reward: 100,   label: '100 SC' },
  { day: 2, reward: 250,   label: '250 SC' },
  { day: 3, reward: 500,   label: '500 SC' },
  { day: 4, reward: 1000,  label: '1K SC' },
  { day: 5, reward: 2500,  label: '2.5K SC' },
  { day: 6, reward: 5000,  label: '5K SC' },
  { day: 7, reward: 15000, label: '15K SC' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/* Забрать бонус */
export function claimDaily(user) {
  const now = Date.now();
  const last = user.daily?.lastClaim || 0;
  const streak = user.daily?.streak || 0;

  const since = now - last;

  // Уже забирали сегодня
  if (last && since < DAY_MS * 0.9) {
    const hoursLeft = Math.ceil((DAY_MS * 0.9 - since) / 3600000);
    return { ok: false, msg: `Уже забрали. Приходите через ${hoursLeft} ч.` };
  }

  // Пропустили день?
  let newStreak = streak;
  if (last && since > DAY_MS * 2) {
    newStreak = 0;
  }

  newStreak = Math.min(newStreak + 1, 7);
  user.daily = { lastClaim: now, streak: newStreak };

  const reward = REWARDS[newStreak - 1];
  user.money += reward.reward;
  user.totalEarned += reward.reward;

  return {
    ok: true,
    msg: `Ежедневный бонус: +${reward.label}`,
    day: newStreak,
    reward: reward.reward,
    streak: newStreak,
  };
}

/* Информация о серии */
export function getDailyInfo(user) {
  const now = Date.now();
  const last = user.daily?.lastClaim || 0;
  const streak = user.daily?.streak || 0;
  const since = now - last;

  const canClaim = !last || since >= DAY_MS * 0.9;
  const nextDay = Math.min(streak + 1, 7);
  const nextReward = REWARDS[nextDay - 1];

  const msToNext = canClaim ? 0 : Math.max(0, DAY_MS * 0.9 - since);

  return {
    streak,
    canClaim,
    nextDay,
    nextReward: nextReward.reward,
    nextLabel: nextReward.label,
    msToNext,
    hoursToNext: Math.ceil(msToNext / 3600000),
  };
}