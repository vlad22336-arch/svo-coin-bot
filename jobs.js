/* =========================================================
   Работа и зарплаты — 9 профессий
   ========================================================= */

export const MAX_ENERGY = 100;
export const ENERGY_REGEN_PER_MIN = 1;

/* =========================================================
   Каталог профессий
   ========================================================= */
export const JOBS = [
  {
    id: 'courier',
    name: 'Курьер',
    emoji: '🛵',
    salaryPerHour: 200,
    workCooldownMin: 30,
    workDurationMin: 5,
    minLevel: 1,
    energyCost: 10,
    desc: 'Развози посылки по городу',
  },
  {
    id: 'barista',
    name: 'Бариста',
    emoji: '☕',
    salaryPerHour: 400,
    workCooldownMin: 45,
    workDurationMin: 10,
    minLevel: 3,
    energyCost: 15,
    desc: 'Готовь кофе в популярной кофейне',
  },
  {
    id: 'driver',
    name: 'Водитель такси',
    emoji: '🚕',
    salaryPerHour: 800,
    workCooldownMin: 60,
    workDurationMin: 15,
    minLevel: 6,
    energyCost: 20,
    desc: 'Возить пассажиров по городу',
  },
  {
    id: 'programmer',
    name: 'Программист',
    emoji: '💻',
    salaryPerHour: 2000,
    workCooldownMin: 90,
    workDurationMin: 30,
    minLevel: 10,
    energyCost: 25,
    desc: 'Пиши код для крупных компаний',
  },
  {
    id: 'lawyer',
    name: 'Юрист',
    emoji: '⚖️',
    salaryPerHour: 5000,
    workCooldownMin: 120,
    workDurationMin: 45,
    minLevel: 15,
    energyCost: 30,
    desc: 'Консультируй крупных бизнесменов',
  },
  {
    id: 'doctor',
    name: 'Врач',
    emoji: '👨‍⚕️',
    salaryPerHour: 8000,
    workCooldownMin: 150,
    workDurationMin: 60,
    minLevel: 20,
    energyCost: 35,
    desc: 'Спасай жизни в престижной клинике',
  },
  {
    id: 'banker',
    name: 'Банкир',
    emoji: '🏦',
    salaryPerHour: 15000,
    workCooldownMin: 180,
    workDurationMin: 90,
    minLevel: 25,
    energyCost: 40,
    desc: 'Управляй инвестициями клиентов',
  },
  {
    id: 'ceo',
    name: 'CEO корпорации',
    emoji: '💼',
    salaryPerHour: 50000,
    workCooldownMin: 240,
    workDurationMin: 120,
    minLevel: 35,
    energyCost: 50,
    desc: 'Руководи крупной международной компанией',
  },
  {
    id: 'astronaut',
    name: 'Астронавт',
    emoji: '👨‍🚀',
    salaryPerHour: 100000,
    workCooldownMin: 360,
    workDurationMin: 180,
    minLevel: 45,
    energyCost: 60,
    desc: 'Исследуй космос на МКС',
  },
];

/* =========================================================
   Уровень игрока (от totalEarned)
   ========================================================= */
export function getUserLevel(user) {
  const total = user.totalEarned || 0;
  return Math.max(1, Math.floor(Math.sqrt(total / 1000)));
}

export function getLevelProgress(user) {
  const total = user.totalEarned || 0;
  const currentLevel = getUserLevel(user);
  const currentThreshold = currentLevel * currentLevel * 1000;
  const nextThreshold = (currentLevel + 1) * (currentLevel + 1) * 1000;

  return {
    level: currentLevel,
    current: total,
    currentThreshold,
    nextThreshold,
    progress: Math.min(1, Math.max(0,
      (total - currentThreshold) / (nextThreshold - currentThreshold)
    )),
    toNext: Math.max(0, nextThreshold - total),
  };
}

/* =========================================================
   Энергия
   ========================================================= */
export function regenerateEnergy(user) {
  const now = Date.now();
  user.energy = user.energy !== undefined ? user.energy : MAX_ENERGY;
  user.energyUpdatedAt = user.energyUpdatedAt || now;

  const minutesPassed = (now - user.energyUpdatedAt) / 60000;
  if (minutesPassed >= 1) {
    const regen = Math.floor(minutesPassed * ENERGY_REGEN_PER_MIN);
    user.energy = Math.min(MAX_ENERGY, user.energy + regen);
    user.energyUpdatedAt = now;
  }

  return user.energy;
}

/* =========================================================
   Устроиться
   ========================================================= */
export function applyForJob(user, jobId) {
  const job = JOBS.find(j => j.id === jobId);
  if (!job) return { ok: false, msg: 'Профессия не найдена' };

  const level = getUserLevel(user);
  if (level < job.minLevel) {
    return { ok: false, msg: `Нужен уровень ${job.minLevel}. Ваш: ${level}` };
  }

  user.job = {
    id: job.id,
    name: job.name,
    emoji: job.emoji,
    salaryPerHour: job.salaryPerHour,
    hiredAt: Date.now(),
    totalEarned: 0,
    shiftsDone: 0,
  };

  return { ok: true, msg: `Вы устроены: ${job.emoji} ${job.name}`, job };
}

/* =========================================================
   Уволиться
   ========================================================= */
export function quitJob(user) {
  if (!user.job) return { ok: false, msg: 'Вы нигде не работаете' };
  const oldJob = user.job;
  delete user.job;
  return { ok: true, msg: `Уволились с должности ${oldJob.name}` };
}

/* =========================================================
   Отработать смену
   ========================================================= */
export function workShift(user) {
  if (!user.job) return { ok: false, msg: 'Сначала устройтесь на работу' };

  const job = JOBS.find(j => j.id === user.job.id);
  if (!job) return { ok: false, msg: 'Профессия удалена' };

  /* Кулдаун */
  const now = Date.now();
  const lastWork = user.lastWorkAt || 0;
  const cooldownMs = job.workCooldownMin * 60000;
  const timePassed = now - lastWork;

  if (timePassed < cooldownMs) {
    const min = Math.ceil((cooldownMs - timePassed) / 60000);
    return { ok: false, msg: `Отдохните ${min} мин. перед новой сменой` };
  }

  /* Энергия */
  regenerateEnergy(user);
  if (user.energy < job.energyCost) {
    const minWait = Math.ceil((job.energyCost - user.energy) / ENERGY_REGEN_PER_MIN);
    return { ok: false, msg: `Мало энергии (${user.energy}). Восстановится через ${minWait} мин.` };
  }

  /* Расчёт зарплаты */
  const hoursWorked = job.workDurationMin / 60;
  let salary = Math.floor(job.salaryPerHour * hoursWorked);

  /* Бонус от уровня пользователя */
  const level = getUserLevel(user);
  const levelBonus = 1 + Math.max(0, level - job.minLevel) * 0.05;
  salary = Math.floor(salary * levelBonus);

  /* Случайный бонус */
  const luckyRoll = Math.random();
  let multiplier = 1;
  if (luckyRoll < 0.05) multiplier = 3;
  else if (luckyRoll < 0.20) multiplier = 2;
  else if (luckyRoll < 0.50) multiplier = 1.5;

  salary = Math.floor(salary * multiplier);

  /* Начисляем */
  user.money += salary;
  user.totalEarned = (user.totalEarned || 0) + salary;
  user.energy -= job.energyCost;
  user.lastWorkAt = now;
  user.job.totalEarned = (user.job.totalEarned || 0) + salary;
  user.job.shiftsDone = (user.job.shiftsDone || 0) + 1;

  /* Статистика */
  user.stats = user.stats || {};
  user.stats.shifts = (user.stats.shifts || 0) + 1;
  user.stats.earningsFromWork = (user.stats.earningsFromWork || 0) + salary;

  return {
    ok: true,
    msg: `Смена окончена! Заработано ${salary} SC`,
    salary,
    multiplier,
  };
}

/* =========================================================
   Сериализация
   ========================================================= */
export function serializeJobs(user) {
  regenerateEnergy(user);

  const level = getUserLevel(user);
  const progress = getLevelProgress(user);

  const job = user.job;
  const currentJobData = job ? JOBS.find(j => j.id === job.id) : null;

  /* Кулдаун текущей работы */
  let cooldownLeft = 0;
  if (job && currentJobData) {
    const lastWork = user.lastWorkAt || 0;
    const cooldownMs = currentJobData.workCooldownMin * 60000;
    const timePassed = Date.now() - lastWork;
    cooldownLeft = Math.max(0, Math.ceil((cooldownMs - timePassed) / 60000));
  }

  return {
    currentJob: job ? {
      ...job,
      cooldownLeft,
      energyCost: currentJobData?.energyCost || 10,
      workDurationMin: currentJobData?.workDurationMin || 5,
    } : null,

    availableJobs: JOBS.map(j => ({
      ...j,
      available: level >= j.minLevel,
    })),

    energy: {
      current: user.energy ?? MAX_ENERGY,
      max: MAX_ENERGY,
      regenPerMin: ENERGY_REGEN_PER_MIN,
      timeToFull: Math.ceil((MAX_ENERGY - (user.energy ?? MAX_ENERGY)) / ENERGY_REGEN_PER_MIN),
    },

    level: progress,
  };
}