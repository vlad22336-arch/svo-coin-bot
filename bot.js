import TelegramBot from 'node-telegram-bot-api';
import 'dotenv/config';
import { DB } from './db.js';
import * as G from './game.js';

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
    user.firstName = tgUser.first_name;
    user.username = tgUser.username;
  }
  return user;
}

function saveAndSync(user) {
  DB.saveUser(user);
}

/* ============ /start ============ */
bot.onText(/^\/start/, (msg) => {
  const user = getUser(msg.from);
  saveAndSync(user);

  bot.sendMessage(msg.chat.id,
    `👋 Привет, <b>${msg.from.first_name}</b>!\n\n` +
    `🪙 Добро пожаловать в <b>SVOcoin</b>!\n\n` +
    `<b>Команды:</b>\n` +
    `💰 /баланс — баланс и доход\n` +
    `🏢 /бизнесы — список бизнесов\n` +
    `🛒 /магазин — купить бизнес\n` +
    `🏆 /топ — топ игроков\n` +
    `👤 /профиль — профиль\n` +
    `📖 /помощь — все команды`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /баланс ============ */
bot.onText(/^\/(баланс|бал|balance)/i, (msg) => {
  const user = getUser(msg.from);
  const offline = G.applyOffline(user);
  saveAndSync(user);

  const income = G.totalIncomePerSec(user);
  const bizCount = Object.keys(user.businesses).length;

  let text =
    `🪙 <b>${msg.from.first_name}</b>\n\n` +
    `💰 Баланс: <b>${G.fmt(user.money, { full: true })}</b>\n` +
    `📈 Доход: <b>${G.fmt(income)}/сек</b>\n` +
    `💎 В час: <b>${G.fmt(income * 3600)}</b>\n` +
    `🏢 Бизнесов: <b>${bizCount} / ${G.BUSINESSES.length}</b>\n` +
    `💵 Всего заработано: <b>${G.fmt(user.totalEarned)}</b>`;

  if (offline > 0) {
    text += `\n\n💤 Пока вас не было: <b>+${G.fmt(offline)}</b>`;
  }

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
});

/* ============ /бизнесы ============ */
bot.onText(/^\/(бизнесы|мои бизнесы)/i, (msg) => {
  const user = getUser(msg.from);
  G.applyOffline(user);
  saveAndSync(user);

  const owned = Object.entries(user.businesses);
  if (!owned.length) {
    return bot.sendMessage(msg.chat.id,
      `🏢 У вас пока нет бизнесов.\n\n` +
      `Откройте <b>/магазин</b> чтобы купить первый!`,
      { parse_mode: 'HTML' }
    );
  }

  const lines = owned.map(([id, b]) => {
    const tpl = G.BUSINESSES.find(t => t.id === id);
    if (!tpl) return '';
    const inc = G.getIncome(tpl, b.level);
    const nextPrice = G.getUpgradePrice(tpl, b.level);
    return (
      `${tpl.emoji} <b>${tpl.name}</b> — Lv ${b.level}\n` +
      `   💰 ${G.fmt(inc)}/сек · Апгрейд: ${G.fmt(nextPrice)}\n` +
      `   <i>Прокачать: /апгрейд ${id}</i>`
    );
  }).filter(Boolean);

  bot.sendMessage(msg.chat.id,
    `🏢 <b>Твоя империя</b>\n\n${lines.join('\n\n')}`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /магазин ============ */
bot.onText(/^\/(магазин|shop|купить)/i, (msg) => {
  const user = getUser(msg.from);
  G.applyOffline(user);
  saveAndSync(user);

  const lines = G.BUSINESSES.map(tpl => {
    const owned = user.businesses[tpl.id];
    const price = G.getBuyPrice(tpl);
    const income = G.getIncome(tpl, 1);

    if (owned) {
      return `✅ ${tpl.emoji} <b>${tpl.name}</b> — Lv ${owned.level}`;
    }

    const canAfford = user.money >= price;
    return (
      `${tpl.emoji} <b>${tpl.name}</b>\n` +
      `   💰 Цена: ${G.fmt(price)} · Доход: ${G.fmt(income)}/сек\n` +
      `   ${canAfford ? `Купить: /купить ${tpl.id}` : `❌ Не хватает ${G.fmt(price - user.money)}`}`
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
    saveAndSync(user);
    return bot.sendMessage(msg.chat.id, `❌ ${r.msg}`);
  }

  saveAndSync(user);
  bot.sendMessage(msg.chat.id,
    `✅ <b>Куплено!</b>\n\n` +
    `${r.tpl.emoji} <b>${r.tpl.name}</b>\n` +
    `💰 Потрачено: ${G.fmt(G.getBuyPrice(r.tpl))}\n` +
    `📈 Доход: ${G.fmt(G.getIncome(r.tpl, 1))}/сек\n\n` +
    `💰 Баланс: <b>${G.fmt(user.money)}</b>`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /апгрейд [id] ============ */
bot.onText(/^\/(апгрейд|upgrade|прокачать)\s+(\w+)$/i, (msg, match) => {
  const user = getUser(msg.from);
  G.applyOffline(user);

  const r = G.upgrade(user, match[2]);
  saveAndSync(user);

  if (!r.ok) return bot.sendMessage(msg.chat.id, `❌ ${r.msg}`);

  bot.sendMessage(msg.chat.id,
    `⬆️ <b>Уровень ${r.level}!</b>\n\n` +
    `${r.tpl.emoji} <b>${r.tpl.name}</b>\n` +
    `📈 Новый доход: <b>${G.fmt(G.getIncome(r.tpl, r.level))}/сек</b>\n` +
    `💰 Баланс: <b>${G.fmt(user.money)}</b>`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /продать [id] ============ */
bot.onText(/^\/(продать|sell)\s+(\w+)$/i, (msg, match) => {
  const user = getUser(msg.from);
  G.applyOffline(user);

  const r = G.sell(user, match[2]);
  saveAndSync(user);

  if (!r.ok) return bot.sendMessage(msg.chat.id, `❌ ${r.msg}`);

  bot.sendMessage(msg.chat.id,
    `💸 <b>Продано!</b>\n\n${r.msg}\n💰 Баланс: <b>${G.fmt(user.money)}</b>`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /топ ============ */
bot.onText(/^\/топ/i, (msg) => {
  const users = DB.getAllUsers()
    .sort((a, b) => (b.money || 0) - (a.money || 0))
    .slice(0, 10);

  if (!users.length) return bot.sendMessage(msg.chat.id, '📊 Пока нет игроков');

  const lines = users.map((u, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    return `${medal} <b>${u.firstName || 'Аноним'}</b> — ${G.fmt(u.money)}`;
  });

  bot.sendMessage(msg.chat.id,
    `🏆 <b>Топ игроков</b>\n\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /профиль ============ */
bot.onText(/^\/(профиль|profile|я|me)/i, (msg) => {
  const user = getUser(msg.from);
  G.applyOffline(user);
  saveAndSync(user);

  const income = G.totalIncomePerSec(user);
  const bizCount = Object.keys(user.businesses).length;

  bot.sendMessage(msg.chat.id,
    `👤 <b>${msg.from.first_name}</b>\n` +
    (msg.from.username ? `@${msg.from.username}\n` : '') +
    `\n💰 Баланс: <b>${G.fmt(user.money, { full: true })}</b>\n` +
    `📈 Доход: <b>${G.fmt(income)}/сек</b>\n` +
    `🏢 Бизнесов: <b>${bizCount} / ${G.BUSINESSES.length}</b>\n` +
    `💵 Заработано: <b>${G.fmt(user.totalEarned)}</b>\n` +
    `📅 С нами с: <b>${new Date(user.createdAt).toLocaleDateString('ru-RU')}</b>`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /помощь ============ */
bot.onText(/^\/(помощь|help|хелп)/i, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 <b>Команды SVOcoin</b>\n\n` +
    `<b>💰 Экономика</b>\n` +
    `/баланс — баланс и доход\n` +
    `/бизнесы — мои бизнесы\n` +
    `/магазин — купить бизнес\n` +
    `/купить lemonade — купить конкретный\n` +
    `/апгрейд lemonade — прокачать\n` +
    `/продать lemonade — продать\n\n` +
    `<b>📊 Прочее</b>\n` +
    `/топ — топ игроков\n` +
    `/профиль — профиль\n` +
    `/помощь — эта справка`,
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

/* ============ Обработка ошибок ============ */
bot.on('polling_error', (err) => {
  if (err.message.includes('409')) {
    console.warn('⚠️ Конфликт 409 — запущен второй экземпляр бота');
  } else {
    console.error('⚠️ Polling error:', err.message);
  }
});

process.on('SIGINT', () => {
  console.log('\n👋 Остановка...');
  bot.stopPolling().then(() => process.exit(0));
});