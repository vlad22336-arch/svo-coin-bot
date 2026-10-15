/* Tycoon Mini App */

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
  toastTimer = setTimeout(() => el.className = 'toast ' + type, 2200);
}

/* ============ Render ============ */
function render() {
  document.getElementById('balance').textContent = fmt(State.money);
  document.getElementById('income').textContent = fmt(State.incomePerSec) + '/сек';
  document.getElementById('incomeHour').textContent = fmt(State.incomePerHour) + '/час';

  /* Ежедневка */
  const dailyBlock = document.getElementById('dailyBlock');
  if (State.daily && State.daily.canClaim) {
    dailyBlock.style.display = 'flex';
    document.getElementById('dailySub').textContent =
      `День ${State.daily.nextDay} / 7 · +${State.daily.nextReward} SC`;
  } else {
    dailyBlock.style.display = 'none';
  }

  /* Список бизнесов */
  const list = document.getElementById('businessList');
  list.innerHTML = '';

  State.businesses.forEach(b => {
    const card = document.createElement('div');
    const isMax = b.level >= b.maxLevel;
    const pct = Math.min(100, (b.level / b.maxLevel) * 100);

    card.className = 'biz' + (b.level > 0 ? ' owned' : (b.unlocked ? '' : ' locked'));

    /* Header */
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

    /* Прогресс */
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

    /* Кнопки */
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

  /* Достижения */
  const achGrid = document.getElementById('achievementsGrid');
  const unlocked = State.achievements.filter(a => a.unlocked).length;
  document.getElementById('achCount').textContent = `${unlocked} / ${State.achievements.length}`;

  achGrid.innerHTML = '';
  State.achievements.forEach(a => {
    const el = document.createElement('div');
    el.className = 'ach-item ' + (a.unlocked ? 'unlocked' : 'locked');
    el.innerHTML = `
      <div class="ach-emoji">${a.emoji}</div>