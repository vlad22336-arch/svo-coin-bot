import TelegramBot from 'node-telegram-bot-api';
import 'dotenv/config';
import { DB } from './db.js';
import * as G from './game.js';
import * as Daily from './daily.js';
import * as Ach from './achievements.js';
import * as Casino from './casino.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(Number).filter(Boolean);

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 @SVOcoinbot запущен...');

/* ============ Хелперы ============ */
function getUser(tgUser) {
  let user = DB.getUser(tgUser.id);
  if (!user) {
    user = G.createUser(tgUser.id);
    user.firstName = tgUser.first_name;
    user.username = tgUser.username;
    DB.saveUser(user);
  } else {
    user = G.normalizeUser(user);
    user.firstName = tgUser.first_name;
    user.username = tgUser.username;
  }
  return user;
}

function sync(user) { DB.saveUser(user); }

function notifyNewAchievements(chatId, unlocked) {
  if (!unlocked.length) return;
  const lines = unlocked.map(a => `${a.emoji} <b>${a.title}</b> — ${a.desc}`);
  bot.sendMessage(chatId, `🏆 <b>Новое достижение!</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' }).catch(() => {});
}

/* ============ /start ============ */
bot.onText(/^\/start/, (msg) => {
  const user = getUser(msg.from);
  sync(user);

  bot.sendMessage(msg.chat.id,
    `👋 Привет, <b>${msg.from.first_name}</b>!\n\n` +
    `🪙 Добро пожаловать в <b>SVOcoin</b>!\n\n` +
    `<b>Команды:</b>\n` +
    `💰 /баланс — баланс\n` +
    `🛒 /магазин — бизнесы\n` +
    `🎰 /рулетка 100 — казино\n` +
    `🎁 /бонус — ежедневка\n` +
    `🏆 /достижения — ачивки\n` +
    `📖 /помощь — справка`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /баланс ============ */
bot.onText(/^\/(баланс|бал|balance)/i, (msg) => {
  const user = getUser(msg.from);
  const offline = G.applyOffline(user);
  sync(user);

  const income = G.totalIncomePerSec(user);
  const bizCount = Object.keys(user.businesses).length;

  let text =
    `🪙 <b>${msg.from.first_name}</b>\n\n` +
    `💰 Баланс: <b>${G.fmt(user.money, { full: true })}</b>\n` +
    `📈 Доход: <b>${G.fmt(income)}/сек</b>\n` +
    `💎 В час: <b>${G.fmt(income * 3600)}</b>\n` +
    `🏢 Бизнесов: <b>${bizCount} / ${G.BUSINESSES.length}</b>\n` +
    `💵 Всего заработано: <b>${G.fmt(user.totalEarned)}</b>`;

  if (offline > 0) text += `\n\n💤 Пока вас не было: <b>+${G.fmt(offline)}</b>`;

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
});

/* ============ /магазин ============ */
bot.onText(/^\/(магазин|shop)/i, (msg) => {
  const user = getUser(msg.from);
  G.applyOffline(user);
  sync(user);

  const lines = G.BUSINESSES.map(tpl => {
    const owned = user.businesses[tpl.id];
    const unlocked = G.canBuy(user, tpl.id);

    if (owned) return `✅ ${tpl.emoji} <b>${tpl.name}</b> — Lv ${owned.level}`;
    if (!unlocked) return `🔒 ${tpl.emoji} <b>${tpl.name}</b> — заблокировано`;

    const price = G.getBuyPrice(tpl);
    const canAfford = user.money >= price;
    return (
      `${tpl.emoji} <b>${tpl.name}</b>\n` +
      `   💰 ${G.fmt(price)} · 📈 ${G.fmt(G.getIncome(tpl, 1))}/сек\n` +
      `   ${canAfford ? `👉 /купить ${tpl.id}` : `❌ Нужно ещё ${G.fmt(price - user.money)}`}`
    );
  });

  bot.sendMessage(msg.chat.id,
    `🛒 <b>Магазин бизнесов</b>\n\n${lines.join('\n\n')}\n\n` +
    `💰 Баланс: <b>${G.fmt(user.money, { full: true })}</b>`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /купить [id] ============ */
bot.onText(/^\/купить\s+(\w+)$/i, (msg, match) => {
  const user = getUser(msg.from);
  G.applyOffline(user);

  const r = G.buy(user, match[1]);
  if (!r.ok) {
    sync(user);
    return bot.sendMessage(msg.chat.id, `❌ ${r.msg}`);
  }

  const unlocked = Ach.checkAchievements(user);
  sync(user);

  bot.sendMessage(msg.chat.id,
    `✅ <b>Куплено!</b>\n\n` +
    `${r.tpl.emoji} <b>${r.tpl.name}</b>\n` +
    `💰 Потрачено: ${G.fmt(G.getBuyPrice(r.tpl))}\n` +
    `📈 Доход: ${G.fmt(G.getIncome(r.tpl, 1))}/сек`,
    { parse_mode: 'HTML' }
  );

  notifyNewAchievements(msg.chat.id, unlocked);
});

/* ============ /бизнесы ============ */
bot.onText(/^\/(бизнесы|мои бизнесы)/i, (msg) => {
  const user = getUser(msg.from);
  G.applyOffline(user);
  sync(user);

  const owned = Object.entries(user.businesses);
  if (!owned.length) {
    return bot.sendMessage(msg.chat.id, '🏢 У вас пока нет бизнесов.\n\nОткройте /магазин', { parse_mode: 'HTML' });
  }

  const lines = owned.map(([id, b]) => {
    const tpl = G.BUSINESSES.find(t => t.id === id);
    if (!tpl) return '';
    const inc = G.getIncome(tpl, b.level);
    const nextPrice = G.getUpgradePrice(tpl, b.level);
    return (
      `${tpl.emoji} <b>${tpl.name}</b> — Lv ${b.level}\n` +
      `   💰 ${G.fmt(inc)}/сек · Апгрейд: ${G.fmt(nextPrice)}\n` +
      `   <i>/апгрейд ${id}</i>`
    );
  }).filter(Boolean);

  bot.sendMessage(msg.chat.id, `🏢 <b>Твоя империя</b>\n\n${lines.join('\n\n')}`, { parse_mode: 'HTML' });
});

/* ============ /апгрейд [id] ============ */
bot.onText(/^\/(апгрейд|прокачать)\s+(\w+)$/i, (msg, match) => {
  const user = getUser(msg.from);
  G.applyOffline(user);

  const r = G.upgrade(user, match[2]);
  if (!r.ok) {
    sync(user);
    return bot.sendMessage(msg.chat.id, `❌ ${r.msg}`);
  }

  const unlocked = Ach.checkAchievements(user);
  sync(user);

  bot.sendMessage(msg.chat.id,
    `⬆️ <b>Уровень ${r.level}!</b>\n\n` +
    `${r.tpl.emoji} <b>${r.tpl.name}</b>\n` +
    `📈 Доход: <b>${G.fmt(G.getIncome(r.tpl, r.level))}/сек</b>`,
    { parse_mode: 'HTML' }
  );

  notifyNewAchievements(msg.chat.id, unlocked);
});

/* ============ /продать [id] ============ */
bot.onText(/^\/(продать|sell)\s+(\w+)$/i, (msg, match) => {
  const user = getUser(msg.from);
  G.applyOffline(user);
  const r = G.sell(user, match[2]);
  sync(user);

  if (!r.ok) return bot.sendMessage(msg.chat.id, `❌ ${r.msg}`);
  bot.sendMessage(msg.chat.id, `💸 <b>Продано!</b>\n\n${r.msg}`, { parse_mode: 'HTML' });
});

/* ============ 🎰 /рулетка [ставка] ============ */
bot.onText(/^\/(рулетка|слоты|slot|spin)(?:\s+(\d+))?$/i, (msg, match) => {
  const user = getUser(msg.from);
  G.applyOffline(user);

  const bet = Number(match[2] || 0);

  if (!bet) {
    return bot.sendMessage(msg.chat.id,
      `🎰 <b>Однорукий бандит</b>\n\n` +
      `<b>Символы:</b>\n` +
      `7️⃣ ×10 · 💎 ×7 · 🍇 ×5 · 🍒 ×3 · пара ×1.5\n\n` +
      `<b>Ставки:</b>\n` +
      `/рулетка 100\n` +
      `/рулетка 1000\n` +
      `/рулетка 10000\n\n` +
      `💰 Баланс: <b>${G.fmt(user.money)}</b>`,
      { parse_mode: 'HTML' }
    );
  }

  const r = Casino.spin(user, bet);

  if (!r.ok) {
    sync(user);
    return bot.sendMessage(msg.chat.id, `❌ ${r.msg}`);
  }

  /* Проверка достижений (везунчик) */
  const unlocked = Ach.checkAchievements(user);
  sync(user);

  /* Красивое сообщение */
  let text = `🎰 <b>Однорукий бандит</b>\n\n`;
  text += `<code>${Casino.renderReels(r.reels)}</code>\n\n`;
  text += `🎯 Ставка: <b>${G.fmt(r.bet)}</b>\n`;

  if (r.win) {
    if (r.jackpot) {
      text += `🎉🎉🎉 <b>ДЖЕКПОТ!</b> ×10\n`;
    } else if (r.multiplier > 1.5) {
      text += `🎉 <b>${r.combo}</b> ×${r.multiplier}\n`;
    } else {
      text += `✨ <b>${r.combo}</b> ×${r.multiplier}\n`;
    }
    text += `💰 Выигрыш: <b>+${G.fmt(r.gain)}</b>`;
  } else {
    text += `😔 <b>Мимо</b>\n`;
    text += `💸 Потеряно: <b>-${G.fmt(r.bet)}</b>`;
  }

  text += `\n\n💰 Баланс: <b>${G.fmt(r.newBalance)}</b>`;

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });

  notifyNewAchievements(msg.chat.id, unlocked);
});

/* ============ /бонус ============ */
bot.onText(/^\/(бонус|ежедневка|daily|bonus)/i, (msg) => {
  const user = getUser(msg.from);
  G.applyOffline(user);

  const info = Daily.getDailyInfo(user);

  if (!info.canClaim) {
    return bot.sendMessage(msg.chat.id,
      `⏰ <b>Бонус уже получен</b>\n\n` +
      `🔥 Серия: <b>${info.streak} дн.</b>\n` +
      `⏳ Следующий через: <b>${info.hoursToNext} ч.</b>`,
      { parse_mode: 'HTML' }
    );
  }

  const r = Daily.claimDaily(user);
  const unlocked = Ach.checkAchievements(user);
  sync(user);

  bot.sendMessage(msg.chat.id,
    `🎁 <b>Ежедневный бонус!</b>\n\n` +
    `🔥 День серии: <b>${r.day} / 7</b>\n` +
    `💰 Получено: <b>+${r.reward} SC</b>\n\n` +
    `💰 Баланс: <b>${G.fmt(user.money)}</b>`,
    { parse_mode: 'HTML' }
  );

  notifyNewAchievements(msg.chat.id, unlocked);
});

/* ============ /достижения ============ */
bot.onText(/^\/(достижения|ачивки|achievements)/i, (msg) => {
  const user = getUser(msg.from);
  sync(user);

  const list = Ach.listAchievements(user);
  const unlocked = list.filter(a => a.unlocked).length;

  const lines = list.map(a => {
    const status = a.unlocked ? '✅' : '🔒';
    return `${status} ${a.emoji} <b>${a.title}</b> — ${a.desc}`;
  });

  bot.sendMessage(msg.chat.id,
    `🏆 <b>Достижения (${unlocked}/${list.length})</b>\n\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /топ ============ */
bot.onText(/^\/топ/i, (msg) => {
  const users = DB.getAllUsers().sort((a, b) => (b.money || 0) - (a.money || 0)).slice(0, 10);
  if (!users.length) return bot.sendMessage(msg.chat.id, '📊 Пока нет игроков');

  const lines = users.map((u, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    return `${medal} <b>${u.firstName || 'Аноним'}</b> — ${G.fmt(u.money)}`;
  });

  bot.sendMessage(msg.chat.id, `🏆 <b>Топ игроков</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
});

/* ============ /профиль ============ */
bot.onText(/^\/(профиль|profile|я|me)/i, (msg) => {
  const user = getUser(msg.from);
  G.applyOffline(user);
  sync(user);

  const income = G.totalIncomePerSec(user);
  const bizCount = Object.keys(user.businesses).length;
  const achCount = Object.keys(user.achievements).length;
  const daily = Daily.getDailyInfo(user);
  const stats = user.stats || {};

  bot.sendMessage(msg.chat.id,
    `👤 <b>${msg.from.first_name}</b>\n` +
    (msg.from.username ? `@${msg.from.username}\n` : '') +
    `\n💰 Баланс: <b>${G.fmt(user.money, { full: true })}</b>\n` +
    `📈 Доход: <b>${G.fmt(income)}/сек</b>\n` +
    `🏢 Бизнесов: <b>${bizCount} / ${G.BUSINESSES.length}</b>\n` +
    `🏆 Достижений: <b>${achCount} / ${Ach.ACHIEVEMENTS.length}</b>\n` +
    `🔥 Серия: <b>${daily.streak} дн.</b>\n` +
    `🎰 Спинов: <b>${stats.spins || 0}</b>\n` +
    `💵 Заработано: <b>${G.fmt(user.totalEarned)}</b>`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /помощь ============ */
bot.onText(/^\/(помощь|help|хелп)/i, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 <b>Команды SVOcoin</b>\n\n` +
    `<b>💰 Экономика</b>\n` +
    `/баланс — баланс и доход\n` +
    `/магазин — купить бизнес\n` +
    `/бизнесы — мои бизнесы\n` +
    `/купить <id> — купить\n` +
    `/апгрейд <id> — прокачать\n` +
    `/продать <id> — продать\n\n` +
    `<b>🎰 Казино</b>\n` +
    `/рулетка <ставка> — слоты\n\n` +
    `<b>🎁 Бонусы</b>\n` +
    `/бонус — ежедневка\n` +
    `/достижения — ачивки\n\n` +
    `<b>📊 Прочее</b>\n` +
    `/топ — топ игроков\n` +
    `/профиль — профиль`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /стата (админ) ============ */
bot.onText(/^\/стата/i, (msg) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  const users = DB.getAllUsers();
  const totalMoney = users.reduce((s, u) => s + (u.money || 0), 0);
  const totalEarned = users.reduce((s, u) => s + (u.totalEarned || 0), 0);

  bot.sendMessage(msg.chat.id,
    `👑 <b>Статистика</b>\n\n` +
    `👥 Игроков: <b>${users.length}</b>\n` +
    `💰 Всего денег: <b>${G.fmt(totalMoney)}</b>\n` +
    `📈 Заработано: <b>${G.fmt(totalEarned)}</b>`,
    { parse_mode: 'HTML' }
  );
});

/* ============ Ошибки ============ */
bot.on('polling_error', (err) => {
  if (err.message.includes('409')) {
    console.warn('⚠️ 409 конфликт');
  } else {
    console.error('⚠️', err.message);
  }
});

process.on('SIGINT', () => {
  console.log('\n👋 Остановка...');
  bot.stopPolling().then(() => process.exit(0));
});