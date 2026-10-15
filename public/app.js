/* =========================================================
   SVOcoin Mini App — логика
   ========================================================= */

const tg = window.Telegram?.WebApp;
const initData = tg?.initData || '';

/* ============ State ============ */
const State = {
  money: 0,
  totalEarned: 0,
  incomePerSec: 0,
  incomePerHour: 0,
  businesses: [],
  daily: null,
  achievements: [],
  profile: {
    name: '',
    age: null,
    city: '',
    bio: '',
  },
  activeScreen: 'home',
  lastLocalTick: Date.now(),
};

/* ============ Утилиты ============ */
function fmt(n) {
  if (!isFinite(n)) return '∞ SC';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) return sign + Math.floor(abs) + ' SC';
  const units = [
    { v: 1e15, s: 'Q' }, { v: 1e12, s: 'T' },
    { v: 1e9,  s: 'B' }, { v: 1e6,  s: 'M' }, { v: 1e3, s: 'K' },
  ];
  for (const u of units) {
    if (abs >= u.v) {
      const val = abs / u.v;
      return sign + (val >= 100 ? val.toFixed(0) : val.toFixed(2)) + u.s + ' SC';
    }
  }
  return sign + Math.floor(abs) + ' SC';
}

function fmtBig(n) {
  if (n < 1000) return Math.floor(n).toString();
  const units = [
    { v: 1e15, s: 'Q' }, { v: 1e12, s: 'T' },
    { v: 1e9,  s: 'B' }, { v: 1e6,  s: 'M' }, { v: 1e3, s: 'K' },
  ];
  for (const u of units) {
    if (n >= u.v) {
      const val = n / u.v;
      return (val >= 100 ? val.toFixed(0) : val.toFixed(2)) + u.s;
    }
  }
  return Math.floor(n).toString();
}

/* ============ API ============ */
async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ============ Toast ============ */
let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = 'toast ' + type, 2400);
}

/* ============ Навигация ============ */
function showScreen(name) {
  State.activeScreen = name;

  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('active', s.dataset.screen === name);
  });

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.nav === name);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Нижние табы */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.onclick = () => showScreen(btn.dataset.nav);
});

/* Разделы на главном */
document.querySelectorAll('[data-nav]').forEach(el => {
  if (el.classList.contains('nav-item')) return;
  el.onclick = () => {
    const nav = el.dataset.nav;
    if (nav === 'businesses') showScreen('shop');
    else if (nav === 'job') {
      showScreen('job');
      loadJobScreen();
    }
    else if (nav === 'casino') toast('🎰 Казино — используй /рулетка в боте', '');
    else if (nav === 'achievements') toast('🏆 Достижения — в разработке', '');
  };
});

/* ============ Профиль ============ */
function renderProfile() {
  const user = tg?.initDataUnsafe?.user;

  const tgName = user
    ? (user.first_name + (user.last_name ? ' ' + user.last_name : '')).toUpperCase()
    : 'ИГРОК';

  document.getElementById('profileName').textContent = tgName;

  const username = user?.username ? '@' + user.username : 'ID ' + (user?.id || '—');
  document.getElementById('profileUsername').textContent = username;

  const avatarImg = document.getElementById('profileAvatar');
  const avatarInitial = document.getElementById('profileInitial');

  if (user?.photo_url) {
    avatarImg.src = user.photo_url;
    avatarImg.style.display = 'block';
    avatarInitial.style.display = 'none';
  } else {
    avatarImg.style.display = 'none';
    avatarInitial.style.display = 'grid';
    avatarInitial.textContent = (user?.first_name || 'U')[0].toUpperCase();
  }

  const p = State.profile;
  document.getElementById('infoName').textContent = p.name || '—';
  document.getElementById('infoAge').textContent = p.age || '—';
  document.getElementById('infoCity').textContent = p.city || '—';

  const bioField = document.getElementById('bioField');
  if (p.bio) {
    bioField.textContent = p.bio;
    bioField.style.color = 'var(--text-soft)';
    bioField.style.fontStyle = 'normal';
  } else {
    bioField.textContent = 'Расскажи о себе...';
    bioField.style.color = 'var(--muted)';
    bioField.style.fontStyle = 'italic';
  }
}

/* Открытие модалки */
document.getElementById('editProfileBtn').onclick = () => {
  const p = State.profile;
  document.getElementById('editName').value = p.name || '';
  document.getElementById('editAge').value = p.age || '';
  document.getElementById('editCity').value = p.city || '';
  document.getElementById('editBio').value = p.bio || '';

  document.getElementById('editModal').classList.add('open');
};

/* Закрытие */
document.querySelectorAll('[data-close]').forEach(el => {
  el.onclick = () => document.getElementById('editModal').classList.remove('open');
});

/* Сохранение профиля */
document.getElementById('saveProfile').onclick = async () => {
  const btn = document.getElementById('saveProfile');
  btn.disabled = true;
  btn.textContent = '⏳ Сохранение...';

  const patch = {
    name: document.getElementById('editName').value.trim(),
    age: Number(document.getElementById('editAge').value) || null,
    city: document.getElementById('editCity').value.trim(),
    bio: document.getElementById('editBio').value.trim(),
  };

  if (!patch.name) {
    toast('Введите имя', 'error');
    btn.disabled = false;
    btn.textContent = '💾 Сохранить';
    return;
  }

  try {
    const r = await api('/api/profile/save', 'POST', patch);

    if (r.ok) {
      State.profile = r.profile || patch;
      renderProfile();
      document.getElementById('editModal').classList.remove('open');
      toast('✅ Профиль сохранён', 'success');

      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
      toast(r.msg || 'Ошибка', 'error');
    }
  } catch (e) {
    console.error(e);
    toast('Ошибка соединения', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Сохранить';
  }
};

/* ============ Render ============ */
function render() {
  document.getElementById('homeBalance').textContent = fmtBig(State.money);
  document.getElementById('homeIncome').textContent = fmt(State.incomePerSec) + '/сек';
  document.getElementById('homeIncomeHour').textContent = fmt(State.incomePerHour) + '/час';
  document.getElementById('shopBalance').textContent = fmt(State.money);
  document.getElementById('familyBalance').textContent = fmtBig(State.money);

  /* Ежедневка */
  const dailyBlock = document.getElementById('dailyBlock');
  if (State.daily && State.daily.canClaim) {
    dailyBlock.style.display = 'flex';
    document.getElementById('dailySub').textContent =
      `День ${State.daily.nextDay} / 7 · +${State.daily.nextReward} SC`;
  } else {
    dailyBlock.style.display = 'none';
  }

  /* Достижения */
  const achUnlocked = State.achievements.filter(a => a.unlocked).length;
  document.getElementById('achSub').textContent =
    `${achUnlocked} из ${State.achievements.length || 8} получено`;

  renderBusinesses();
  updateJobSub();
}

function renderBusinesses() {
  const list = document.getElementById('businessList');
  if (!list) return;

  list.innerHTML = '';

  State.businesses.forEach(b => {
    const card = document.createElement('div');
    const isMax = b.level >= b.maxLevel;
    const pct = Math.min(100, (b.level / b.maxLevel) * 100);

    card.className = 'biz' + (b.level > 0 ? ' owned' : (b.unlocked ? '' : ' locked'));

    const header = document.createElement('div');
    header.className = 'biz-header';
    header.innerHTML = `
      <div class="biz-emoji">${b.emoji}</div>
      <div class="biz-info">
        <div class="biz-name">${b.name}</div>
        <div class="biz-sub">
          ${b.level === 0
            ? (b.unlocked ? `Цена: ${fmt(b.price)}` : '🔒 Заблокировано')
            : `${fmt(b.income)}/сек`}
        </div>
      </div>
      <div class="biz-badge ${isMax ? 'max' : ''} ${!b.unlocked && b.level === 0 ? 'locked-badge' : ''}">
        ${b.level === 0
          ? (b.unlocked ? 'Доступно' : 'Закрыто')
          : (isMax ? 'MAX' : 'Lv ' + b.level)}
      </div>
    `;
    card.appendChild(header);

    if (b.level > 0) {
      const prog = document.createElement('div');
      prog.className = 'biz-progress';
      prog.innerHTML = `<div class="biz-progress-fill ${isMax ? 'max' : ''}" style="width:${pct}%"></div>`;
      card.appendChild(prog);

      const stats = document.createElement('div');
      stats.className = 'biz-stats';
      stats.innerHTML = `
        <div class="biz-stat">
          <span class="biz-stat-label">Уровень</span>
          <span class="biz-stat-value">${b.level} / ${b.maxLevel}</span>
        </div>
        <div class="biz-stat">
          <span class="biz-stat-label">Продажа</span>
          <span class="biz-stat-value">${fmt(b.sellPrice)}</span>
        </div>
      `;
      card.appendChild(stats);
    }

    const actions = document.createElement('div');
    actions.className = 'biz-actions';

    if (!b.unlocked && b.level === 0) {
      actions.classList.add('single');
      actions.innerHTML = '<button class="btn btn-locked" disabled>🔒 Заблокировано</button>';
    } else if (b.level === 0) {
      actions.classList.add('single');
      const btn = document.createElement('button');
      btn.className = 'btn btn-buy';
      btn.textContent = `Купить — ${fmt(b.price)}`;
      btn.disabled = State.money < b.price;
      btn.onclick = () => action(api('/api/buy', 'POST', { id: b.id }));
      actions.appendChild(btn);
    } else {
      const up = document.createElement('button');
      up.className = 'btn btn-upgrade';
      if (isMax) {
        up.textContent = 'MAX';
        up.disabled = true;
      } else {
        up.textContent = `⬆ ${fmt(b.nextPrice)}`;
        up.disabled = State.money < b.nextPrice;
        up.onclick = () => action(api('/api/upgrade', 'POST', { id: b.id }));
      }
      actions.appendChild(up);

      const sell = document.createElement('button');
      sell.className = 'btn btn-sell';
      sell.textContent = `Продать +${fmt(b.sellPrice)}`;
      sell.onclick = () => {
        if (!confirm(`Продать «${b.name}»?`)) return;
        action(api('/api/sell', 'POST', { id: b.id }));
      };
      actions.appendChild(sell);
    }

    card.appendChild(actions);
    list.appendChild(card);
  });
}

/* ============ Действия ============ */
async function action(promise) {
  try {
    const r = await promise;
    if (r.ok === false) {
      toast(r.msg || 'Ошибка', 'error');
      return;
    }
    if (r.state) applyState(r.state);
    if (r.daily) State.daily = r.daily;

    render();

    if (r.achievementsUnlocked?.length) {
      r.achievementsUnlocked.forEach((a, i) => {
        setTimeout(() => toast(`🏆 ${a.emoji} ${a.title}`, 'success'), i * 500);
      });
    }

    if (r.msg) toast(r.msg, 'success');

    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    console.error(e);
    toast('Ошибка соединения', 'error');
  }
}

function applyState(s) {
  if (!s) return;
  State.money = s.money ?? State.money;
  State.totalEarned = s.totalEarned ?? State.totalEarned;
  State.incomePerSec = s.incomePerSec ?? State.incomePerSec;
  State.incomePerHour = State.incomePerSec * 3600;
  State.businesses = s.businesses ?? State.businesses;
  State.lastLocalTick = Date.now();
}

/* ============ Ежедневка ============ */
document.getElementById('dailyBtn').onclick = () => {
  action(api('/api/daily/claim', 'POST'));
};

/* ============ Локальный тик ============ */
function localTick() {
  const now = Date.now();
  const dt = (now - State.lastLocalTick) / 1000;
  State.lastLocalTick = now;
  if (State.incomePerSec > 0) {
    State.money += State.incomePerSec * dt;
    State.totalEarned += State.incomePerSec * dt;
  }
}

/* =========================================================
   💼 РАБОТА
   ========================================================= */

const JobState = {
  currentJob: null,
  availableJobs: [],
  energy: { current: 100, max: 100 },
  level: { level: 1, toNext: 0, progress: 0 },
};

async function loadJobScreen() {
  try {
    const r = await api('/api/jobs');
    JobState.currentJob = r.currentJob;
    JobState.availableJobs = r.availableJobs;
    JobState.energy = r.energy;
    JobState.level = r.level;
    renderJobScreen();
  } catch (e) {
    console.error(e);
    toast('Ошибка загрузки', 'error');
  }
}

function renderJobScreen() {
  document.getElementById('jobLevel').textContent = `Lv ${JobState.level.level}`;

  const energyPct = (JobState.energy.current / JobState.energy.max) * 100;
  document.getElementById('jobEnergyText').textContent =
    `${JobState.energy.current} / ${JobState.energy.max}`;

  const fill = document.getElementById('jobEnergyFill');
  fill.style.width = energyPct + '%';
  fill.className = 'energy-fill';
  if (energyPct > 60) fill.classList.add('high');
  else if (energyPct < 30) fill.classList.add('low');

  const container = document.getElementById('jobContent');
  container.innerHTML = '';

  if (JobState.currentJob) {
    renderCurrentJob(container);
  } else {
    renderJobList(container);
  }
}

function renderCurrentJob(container) {
  const j = JobState.currentJob;
  const canWork = j.cooldownLeft === 0 && JobState.energy.current >= j.energyCost;

  const card = document.createElement('div');
  card.className = 'job-card';

  card.innerHTML = `
    <div class="job-current">
      <div class="job-emoji-big">${j.emoji}</div>
      <div class="job-current-info">
        <div class="job-current-name">${j.name}</div>
        <div class="job-current-salary">${fmt(j.salaryPerHour)}/час</div>
      </div>
    </div>

    <div class="job-stats">
      <div class="job-stat">
        <div class="job-stat-value">${j.shiftsDone}</div>
        <div class="job-stat-label">Смен</div>
      </div>
      <div class="job-stat">
        <div class="job-stat-value">${fmt(j.totalEarned)}</div>
        <div class="job-stat-label">Заработано</div>
      </div>
      <div class="job-stat">
        <div class="job-stat-value">${JobState.energy.current}</div>
        <div class="job-stat-label">Энергия</div>
      </div>
    </div>

    <button class="btn-work" ${!canWork ? 'disabled' : ''} id="workBtn">
      ${
        !canWork
          ? (j.cooldownLeft > 0
              ? `⏰ Отдых ${j.cooldownLeft} мин.`
              : `⚡ Нужно ${j.energyCost} энергии`)
          : `🔥 Работать (${j.workDurationMin} мин)`
      }
    </button>

    <button class="btn-quit" id="quitJobBtn">🚪 Уволиться</button>
  `;

  container.appendChild(card);

  const workBtn = document.getElementById('workBtn');
  if (canWork) workBtn.onclick = doWork;

  document.getElementById('quitJobBtn').onclick = quitJob;
}

function renderJobList(container) {
  const lvl = JobState.level;

  const levelBlock = document.createElement('div');
  levelBlock.className = 'level-block';
  levelBlock.innerHTML = `
    <div class="level-head">
      <span>⭐ Уровень <span class="level-current">${lvl.level}</span></span>
      <span style="color:var(--muted);font-size:11px;">
        до ${lvl.level + 1} — ${fmt(lvl.toNext)}
      </span>
    </div>
    <div class="level-bar">
      <div class="level-fill" style="width:${lvl.progress * 100}%"></div>
    </div>
  `;
  container.appendChild(levelBlock);

  const title = document.createElement('div');
  title.className = 'job-list-title';
  title.textContent = 'Доступные вакансии';
  container.appendChild(title);

  const list = document.createElement('div');
  list.className = 'job-list';

  JobState.availableJobs.forEach(j => {
    const el = document.createElement('div');
    el.className = 'job-item ' + (j.available ? 'available' : 'locked');

    el.innerHTML = `
      <div class="job-item-emoji">${j.emoji}</div>
      <div class="job-item-info">
        <div class="job-item-name">${j.name}${!j.available ? ' 🔒' : ''}</div>
        <div class="job-item-meta">
          ⚡ ${j.energyCost} · Lv ${j.minLevel}+
        </div>
      </div>
      <div class="job-item-salary">${fmt(j.salaryPerHour)}/ч</div>
    `;

    if (j.available) {
      el.onclick = () => {
        if (!confirm(`Устроиться на работу «${j.name}»?`)) return;
        applyJob(j.id);
      };
    }

    list.appendChild(el);
  });

  container.appendChild(list);
}

async function applyJob(jobId) {
  try {
    const r = await api('/api/jobs/apply', 'POST', { jobId });
    if (r.ok) {
      toast(`✅ ${r.msg}`, 'success');
      JobState.currentJob = r.status.currentJob;
      JobState.availableJobs = r.status.availableJobs;
      renderJobScreen();
      updateJobSub();
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
      toast(r.msg || 'Ошибка', 'error');
    }
  } catch (e) {
    toast('Ошибка соединения', 'error');
  }
}

async function doWork() {
  try {
    const r = await api('/api/jobs/work', 'POST');
    if (r.ok) {
      let msg = `💰 +${fmt(r.salary)}`;
      if (r.multiplier > 1) msg += ` (×${r.multiplier}!)`;
      toast(msg, 'success');

      JobState.currentJob = r.status.currentJob;
      JobState.energy = r.status.energy;
      JobState.level = r.status.level;

      if (r.state) applyState(r.state);

      renderJobScreen();
      render();

      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
      toast(r.msg || 'Ошибка', 'error');
    }
  } catch (e) {
    toast('Ошибка соединения', 'error');
  }
}

async function quitJob() {
  if (!confirm('Уволиться с работы?')) return;
  try {
    const r = await api('/api/jobs/quit', 'POST');
    if (r.ok) {
      toast('🚪 Уволились', '');
      JobState.currentJob = null;
      renderJobScreen();
      updateJobSub();
    }
  } catch (e) {
    toast('Ошибка', 'error');
  }
}

function updateJobSub() {
  const sub = document.getElementById('jobSubInfo');
  if (!sub) return;
  if (JobState.currentJob) {
    sub.textContent = `${JobState.currentJob.emoji} ${JobState.currentJob.name}`;
  } else {
    sub.textContent = 'Устройся и зарабатывай';
  }
}

/* ============ Инициализация ============ */
async function init() {
  if (tg) {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor('#0a0c12');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#0a0c12');
    if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
  }

  try {
    const data = await api('/api/load');

    State.money = data.money;
    State.totalEarned = data.totalEarned;
    State.incomePerSec = data.incomePerSec;
    State.incomePerHour = data.incomePerHour;
    State.businesses = data.businesses;
    State.daily = data.daily;
    State.achievements = data.achievements || [];
    State.profile = data.profile || { name: '', age: null, city: '', bio: '' };
    State.lastLocalTick = Date.now();

    /* Загружаем статус работы */
    if (data.job) {
      JobState.currentJob = data.job.currentJob;
      JobState.availableJobs = data.job.availableJobs;
      JobState.energy = data.job.energy;
      JobState.level = data.job.level;
    }

    renderProfile();
    render();

    document.getElementById('loading').classList.add('hide');

    if (data.offlineEarned > 0) {
      setTimeout(() => toast(`💤 Пока вас не было: +${fmt(data.offlineEarned)}`, 'success'), 800);
    }

    if (data.achievementsUnlocked?.length) {
      data.achievementsUnlocked.forEach((a, i) => {
        setTimeout(() => toast(`🏆 ${a.emoji} ${a.title}`, 'success'), 1500 + i * 500);
      });
    }
  } catch (e) {
    console.error(e);
    document.getElementById('loading').classList.add('hide');
    toast('Ошибка загрузки', 'error');
  }

  setInterval(localTick, 500);
  setInterval(render, 1000);
}

init();