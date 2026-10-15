import TelegramBot from 'node-telegram-bot-api';
import 'dotenv/config';

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(Number).filter(Boolean);

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 @SVOcoinbot запущен...');

/* ---------- Утилиты ---------- */
function fmt(n) {
  if (n < 1000) return Math.floor(n) + ' SC';
  const units = [
    { v: 1e12, s: 'T' }, { v: 1e9, s: 'B' },
    { v: 1e6, s: 'M' }, { v: 1e3, s: 'K' },
  ];
  for (const u of units) {
    if (n >= u.v) return (n / u.v).toFixed(2) + u.s + ' SC';
  }
  return Math.floor(n) + ' SC';
}

/* ---------- Команды ---------- */

/* /start */
bot.onText(/^\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `👋 Привет, <b>${msg.from.first_name}</b>!\n\n` +
    `🪙 Добро пожаловать в <b>SVOcoin</b> — экономическую игру!\n\n` +
    `<b>Команды:</b>\n` +
    `💰 /баланс — показать баланс\n` +
    `🏢 /бизнесы — список бизнесов\n` +
    `🏆 /топ — топ игроков\n` +
    `👤 /профиль — профиль\n` +
    `📖 /помощь — все команды`,
    { parse_mode: 'HTML' }
  );
});

/* /баланс */
bot.onText(/^\/(баланс|бал|balance)/i, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🪙 <b>${msg.from.first_name}</b>\n\n` +
    `💰 Баланс: <b>100 SC</b>\n` +
    `📈 Доход: <b>0 SC/сек</b>`,
    { parse_mode: 'HTML' }
  );
});

/* /бизнесы */
bot.onText(/^\/(бизнесы|мои бизнесы)/i, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🏢 У вас пока нет бизнесов.\n\n` +
    `<i>Скоро здесь появятся покупки и апгрейды!</i>`,
    { parse_mode: 'HTML' }
  );
});

/* /топ */
bot.onText(/^\/топ/i, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🏆 <b>Топ игроков</b>\n\n` +
    `Пока пусто — стань первым!`,
    { parse_mode: 'HTML' }
  );
});

/* /профиль */
bot.onText(/^\/(профиль|profile|я)/i, (msg) => {
  bot.sendMessage(msg.chat.id,
    `👤 <b>${msg.from.first_name}</b>\n` +
    (msg.from.username ? `@${msg.from.username}\n` : '') +
    `\n💰 Баланс: <b>100 SC</b>\n` +
    `🏢 Бизнесов: <b>0</b>\n` +
    `📅 С нами с: <b>${new Date().toLocaleDateString('ru-RU')}</b>`,
    { parse_mode: 'HTML' }
  );
});

/* /помощь */
bot.onText(/^\/(помощь|help|хелп)/i, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 <b>Команды SVOcoin</b>\n\n` +
    `💰 /баланс\n` +
    `🏢 /бизнесы\n` +
    `🏆 /топ\n` +
    `👤 /профиль\n` +
    `📖 /помощь`,
    { parse_mode: 'HTML' }
  );
});

/* /стата — только для админа */
bot.onText(/^\/стата/i, (msg) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;
  bot.sendMessage(msg.chat.id, '👑 Ты админ! Бот работает.');
});

/* ---------- Обработка ошибок ---------- */
bot.on('polling_error', (err) => {
  console.error('⚠️', err.message);
});

process.on('SIGINT', () => {
  console.log('\n👋 Остановка...');
  bot.stopPolling().then(() => process.exit(0));
});