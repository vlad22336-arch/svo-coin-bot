import TelegramBot from 'node-telegram-bot-api';
import 'dotenv/config';
import { DB } from './db.js';
import * as G from './game.js';
import * as Daily from './daily.js';
import * as Ach from './achievements.js';
import * as Casino from './casino.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(Number).filter(Boolean);

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 @SVOcoinbot запущен...');
console.log('🌐 WEBAPP_URL:', WEBAPP_URL || '(не задан)');

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

function sync(user) {
  DB.saveUser(user);
}

function notifyNewAchievements(chatId, unlocked) {
  if (!unlocked.length) return;
  const lines = unlocked.map(a => `${a.emoji} <b>${a.title}</b> — ${a.desc}`);
  bot.sendMessage(chatId,
    `🏆 <b>Новое достижение!</b>\n\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
}

/* ============ /start ============ */
bot.onText(/^\/start/, (msg) => {
  const user = getUser(msg.from);
  sync(user);

  /* Кнопка Mini App */
  const keyboard = WEBAPP_URL
    ? {
        reply_markup: {
          inline_keyboard: [[
            { text: '🏙 Открыть Tycoon', web_app: { url: WEBAPP_URL } }
          ]]
        }
      }
    : {};

  bot.sendMessage(msg.chat.id,
    `👋 Привет, <b>${msg.from.first_name}</b>!\n\n` +
    `🪙 Добро пожаловать в <b>SVOcoin</b>!\n\n` +
    `<b>Что внутри:</b>\n` +
    `💰 Пассивный доход\n` +
    `🏢 20 бизнесов\n` +
    `🎰 Казино\n` +
    `🎁 Ежедневки\n` +
    `🏆 Достижения\n\n` +
    `👇 Открой Mini App`,
    { parse_mode: 'HTML', ...keyboard }
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
    `💵 Всего: <b>${G.fmt(user.totalEarned)}</b>`;

  if (offline > 0) text += `\n\n💤 Оффлайн: <b>+${G.fmt(offline)}</b>`;

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
    if (!unlocked) return `🔒 ${tpl.emoji} <b>${tpl.name}</b>`;

    const price = G.getBuyPrice(tpl);
    const canAfford = user.money >= price;
    return (
      `${tpl.emoji} <b>${tpl.name}</b>\n` +
      `   💰 ${G.fmt(price)} · 📈 ${G.fmt(G.getIncome(tpl, 1))}/сек\n` +
      `   ${canAfford ? `👉 /купить ${tpl.id}` : `❌ Ещё ${G.fmt(price - user.money)}`}`
    );
  });

  bot.sendMessage(msg.chat.id,
    `🛒 <b>Магазин</b>\n\n${lines.join('\n\n')}\n\n💰 <b>${G.fmt(user.money)}</b>`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /купить ============ */
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
    `✅ Куплено: ${r.tpl.emoji} <b>${r.tpl.name}</b>\n💰 ${G.fmt(user.money)}`,
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
    return bot.sendMessage(msg.chat.id, '🏢 Пусто. /магазин');
  }

  const lines = owned.map(([id, b]) => {
    const tpl = G.BUSINESSES.find(t => t.id === id);
    if (!tpl) return '';
    return `${tpl.emoji} <b>${tpl.name}</b> Lv${b.level} · ${G.fmt(G.getIncome(tpl, b.level))}/сек`;
  });

  bot.sendMessage(msg.chat.id,
    `🏢 <b>Твоя империя</b>\n\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /апгрейд ============ */
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
    `⬆️ Уровень <b>${r.level}</b>: ${r.tpl.emoji} ${r.tpl.name}\n📈 ${G.fmt(G.getIncome(r.tpl, r.level))}/сек`,
    { parse_mode: 'HTML' }
  );
  notifyNewAchievements(msg.chat.id, unlocked);
});

/* ============ /продать ============ */
bot.onText(/^\/(продать|sell)\s+(\w+)$/i, (msg, match) => {
  const user = getUser(msg.from);
  G.applyOffline(user);
  const r = G.sell(user, match[2]);
  sync(user);
  if (!r.ok) return bot.sendMessage(msg.chat.id, `❌ ${r.msg}`);
  bot.sendMessage(msg.chat.id, `💸 ${r.msg}\n💰 ${G.fmt(user.money)}`);
});

/* ============ 🎰 /рулетка ============ */
bot.onText(/^\/(рулетка|слоты|slot|spin)(?:\s+(\d+))?$/i, async (msg, match) => {
  const user = getUser(msg.from);
  G.applyOffline(user);
  sync(user);

  const bet = Number(match[2] || 0);

  if (!bet) {
    return bot.sendMessage(msg.chat.id,
      `🎰 <b>Однорукий бандит</b>\n\n` +
      `<b>Символы:</b>\n` +
      `7️⃣7️⃣7️⃣ — ×10 ДЖЕКПОТ\n` +
      `BAR BAR BAR — ×5\n` +
      `🍒🍒🍒 — ×5\n` +
      `🍋🍋🍋 — ×5\n` +
      `Любая пара — ×1.5\n\n` +
      `<b>Ставки:</b>\n` +
      `/рулетка 100\n` +
      `/рулетка 1000\n` +
      `/рулетка 10000\n\n` +
      `💰 Баланс: <b>${G.fmt(user.money)}</b>`,
      { parse_mode: 'HTML' }
    );
  }

  const prep = Casino.prepareSpin(user, bet);
  if (!prep.ok) {
    return bot.sendMessage(msg.chat.id, `❌ ${prep.msg}`);
  }

  sync(user);

  try {
    const diceMsg = await bot.sendDice(msg.chat.id, {
      emoji: '🎰',
      reply_to_message_id: msg.message_id,
    });

    await new Promise(r => setTimeout(r, 4200));

    const diceValue = diceMsg.dice.value;

    const freshUser = getUser(msg.from);
    const result = Casino.handleDiceResult(freshUser, prep.bet, diceValue);

    const unlocked = Ach.checkAchievements(freshUser);
    sync(freshUser);

    let text = `🎰 <b>Однорукий бандит</b>\n\n`;
    text += `🎯 Ставка: <b>${G.fmt(prep.bet)}</b>\n`;
    text += `🎲 Выпало: <b>${Casino.renderReels(result.reels)}</b>\n\n`;

    if (result.win) {
      if (result.jackpot) {
        text += `🎉🎉🎉 <b>ДЖЕКПОТ!</b> (×10)\n`;
      } else if (result.multiplier >= 5) {
        text += `🏆 <b>${result.label}</b>\n`;
      } else {
        text += `✨ <b>${result.label}</b> (×${result.multiplier})\n`;
      }
      text += `💰 <b>+${G.fmt(result.gain)} SC</b>`;
    } else {
      text += `😔 <b>Мимо</b>\n`;
      text += `💸 Потеряно: <b>${G.fmt(prep.bet)}</b>`;
    }

    text += `\n\n💰 Баланс: <b>${G.fmt(result.newBalance)}</b>`;

    await bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
    notifyNewAchievements(msg.chat.id, unlocked);

  } catch (e) {
    console.error('Casino error:', e);
    const freshUser = getUser(msg.from);
    freshUser.money += prep.bet;
    sync(freshUser);
    bot.sendMessage(msg.chat.id, '❌ Ошибка игры. Ставка возвращена.');
  }
});

/* ============ /бонус ============ */
bot.onText(/^\/(бонус|ежедневка|daily|bonus)/i, (msg) => {
  const user = getUser(msg.from);
  G.applyOffline(user);
  const info = Daily.getDailyInfo(user);

  if (!info.canClaim) {
    return bot.sendMessage(msg.chat.id,
      `⏰ Бонус получен\n🔥 Серия: <b>${info.streak} дн.</b>\n⏳ Через <b>${info.hoursToNext} ч.</b>`,
      { parse_mode: 'HTML' }
    );
  }

  const r = Daily.claimDaily(user);
  const unlocked = Ach.checkAchievements(user);
  sync(user);

  bot.sendMessage(msg.chat.id,
    `🎁 <b>Бонус!</b>\n🔥 День ${r.day}/7\n💰 <b>+${r.reward} SC</b>\n\n💰 Баланс: <b>${G.fmt(user.money)}</b>`,
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
    const s = a.unlocked ? '✅' : '🔒';
    return `${s} ${a.emoji} <b>${a.title}</b>`;
  });

  bot.sendMessage(msg.chat.id,
    `🏆 <b>Достижения (${unlocked}/${list.length})</b>\n\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /топ ============ */
bot.onText(/^\/топ/i, (msg) => {
  const users = DB.getAllUsers()
    .sort((a, b) => (b.money || 0) - (a.money || 0))
    .slice(0, 10);

  if (!users.length) return bot.sendMessage(msg.chat.id, '📊 Пусто');

  const lines = users.map((u, i) => {
    const m = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    return `${m} <b>${u.firstName || 'Аноним'}</b> — ${G.fmt(u.money)}`;
  });

  bot.sendMessage(msg.chat.id,
    `🏆 <b>Топ</b>\n\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  );
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
    `\n💰 <b>${G.fmt(user.money, { full: true })}</b>\n` +
    `📈 ${G.fmt(income)}/сек\n` +
    `🏢 ${bizCount}/${G.BUSINESSES.length}\n` +
    `🏆 ${achCount}/${Ach.ACHIEVEMENTS.length}\n` +
    `🔥 Серия: ${daily.streak} дн.\n` +
    `🎰 Спинов: ${stats.spins || 0}\n` +
    `💎 Джекпотов: ${stats.jackpots || 0}`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /помощь ============ */
bot.onText(/^\/(помощь|help|хелп)/i, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 <b>Команды SVOcoin</b>\n\n` +
    `💰 /баланс\n` +
    `🛒 /магазин\n` +
    `🏢 /бизнесы\n` +
    `⬆️ /апгрейд <id>\n` +
    `💸 /продать <id>\n` +
    `🎰 /рулетка <ставка>\n` +
    `🎁 /бонус\n` +
    `🏆 /достижения\n` +
    `📊 /топ\n` +
    `👤 /профиль`,
    { parse_mode: 'HTML' }
  );
});

/* ============ /стата ============ */
bot.onText(/^\/стата/i, (msg) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;
  const users = DB.getAllUsers();
  const totalMoney = users.reduce((s, u) => s + (u.money || 0), 0);
  const totalEarned = users.reduce((s, u) => s + (u.totalEarned || 0), 0);

  bot.sendMessage(msg.chat.id,
    `👑 <b>Статистика</b>\n\n` +
    `👥 ${users.length}\n` +
    `💰 ${G.fmt(totalMoney)}\n` +
    `📈 ${G.fmt(totalEarned)}`,
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