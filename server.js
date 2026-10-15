import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { DB } from './db.js';
import * as G from './game.js';
import * as Daily from './daily.js';
import * as Ach from './achievements.js';
import * as Casino from './casino.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

app.use(cors({ origin: '*' }));
app.use(express.json());

/* Раздача статики — frontend */
app.use(express.static(path.join(__dirname, 'public')));

/* ============ Авторизация через Telegram initData ============ */
function verifyInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();

  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computed !== hash) return null;

  try {
    const user = JSON.parse(params.get('user') || '{}');
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

function auth(req, res, next) {
  const initData =
    req.headers['x-telegram-init-data'] ||
    req.body?.initData ||
    req.query?.initData;

  const user = verifyInitData(initData);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  req.tgUser = user;
  next();
}

function ensureUser(tgUser) {
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

/* ============ API ============ */

/* Загрузка состояния */
app.get('/api/load', auth, (req, res) => {
  const user = ensureUser(req.tgUser);
  const offline = G.applyOffline(user);
  const unlocked = Ach.checkAchievements(user);
  DB.saveUser(user);

  const daily = Daily.getDailyInfo(user);
  const achievements = Ach.listAchievements(user);

  res.json({
    money: user.money,
    totalEarned: user.totalEarned,
    incomePerSec: G.totalIncomePerSec(user),
    incomePerHour: G.totalIncomePerSec(user) * 3600,
    offlineEarned: offline,
    businesses: G.BUSINESSES.map(tpl => {
      const b = user.businesses[tpl.id] || null;
      const lvl = b?.level || 0;
      const invested = b?.invested || 0;
      return {
        id: tpl.id,
        name: tpl.name,
        emoji: tpl.emoji,
        level: lvl,
        maxLevel: G.MAX_LEVEL,
        unlocked: G.canBuy(user, tpl.id),
        price: G.getBuyPrice(tpl),
        nextPrice: lvl === 0
          ? G.getBuyPrice(tpl)
          : (lvl >= G.MAX_LEVEL ? 0 : G.getUpgradePrice(tpl, lvl)),
        income: lvl > 0 ? G.getIncome(tpl, lvl) : 0,
        invested,
        sellPrice: lvl > 0 ? G.getSellPrice(invested) : 0,
      };
    }),
    daily,
    achievements,
    achievementsUnlocked: unlocked,
    user: {
      id: user.id,
      firstName: user.firstName,
      username: user.username,
      photoUrl: user.photoUrl || null,
    },
  });
});

/* Купить бизнес */
app.post('/api/buy', auth, (req, res) => {
  const user = ensureUser(req.tgUser);
  const r = G.buy(user, req.body.id);
  const unlocked = Ach.checkAchievements(user);
  DB.saveUser(user);

  res.json({
    ...r,
    achievementsUnlocked: unlocked,
    state: {
      money: user.money,
      totalEarned: user.totalEarned,
      incomePerSec: G.totalIncomePerSec(user),
      businesses: G.BUSINESSES.map(tpl => {
        const b = user.businesses[tpl.id] || null;
        const lvl = b?.level || 0;
        const invested = b?.invested || 0;
        return {
          id: tpl.id,
          name: tpl.name,
          emoji: tpl.emoji,
          level: lvl,
          maxLevel: G.MAX_LEVEL,
          unlocked: G.canBuy(user, tpl.id),
          price: G.getBuyPrice(tpl),
          nextPrice: lvl === 0
            ? G.getBuyPrice(tpl)
            : (lvl >= G.MAX_LEVEL ? 0 : G.getUpgradePrice(tpl, lvl)),
          income: lvl > 0 ? G.getIncome(tpl, lvl) : 0,
          invested,
          sellPrice: lvl > 0 ? G.getSellPrice(invested) : 0,
        };
      }),
      achievements: Ach.listAchievements(user),
    },
  });
});

/* Прокачать */
app.post('/api/upgrade', auth, (req, res) => {
  const user = ensureUser(req.tgUser);
  const r = G.upgrade(user, req.body.id);
  const unlocked = Ach.checkAchievements(user);
  DB.saveUser(user);

  res.json({
    ...r,
    achievementsUnlocked: unlocked,
    state: {
      money: user.money,
      totalEarned: user.totalEarned,
      incomePerSec: G.totalIncomePerSec(user),
      businesses: G.BUSINESSES.map(tpl => {
        const b = user.businesses[tpl.id] || null;
        const lvl = b?.level || 0;
        const invested = b?.invested || 0;
        return {
          id: tpl.id,
          name: tpl.name,
          emoji: tpl.emoji,
          level: lvl,
          maxLevel: G.MAX_LEVEL,
          unlocked: G.canBuy(user, tpl.id),
          price: G.getBuyPrice(tpl),
          nextPrice: lvl === 0
            ? G.getBuyPrice(tpl)
            : (lvl >= G.MAX_LEVEL ? 0 : G.getUpgradePrice(tpl, lvl)),
          income: lvl > 0 ? G.getIncome(tpl, lvl) : 0,
          invested,
          sellPrice: lvl > 0 ? G.getSellPrice(invested) : 0,
        };
      }),
    },
  });
});

/* Продать */
app.post('/api/sell', auth, (req, res) => {
  const user = ensureUser(req.tgUser);
  const r = G.sell(user, req.body.id);
  DB.saveUser(user);

  res.json({
    ...r,
    state: {
      money: user.money,
      totalEarned: user.totalEarned,
      incomePerSec: G.totalIncomePerSec(user),
      businesses: G.BUSINESSES.map(tpl => {
        const b = user.businesses[tpl.id] || null;
        const lvl = b?.level || 0;
        return {
          id: tpl.id,
          name: tpl.name,
          emoji: tpl.emoji,
          level: lvl,
          maxLevel: G.MAX_LEVEL,
          unlocked: G.canBuy(user, tpl.id),
          price: G.getBuyPrice(tpl),
          nextPrice: lvl === 0
            ? G.getBuyPrice(tpl)
            : (lvl >= G.MAX_LEVEL ? 0 : G.getUpgradePrice(tpl, lvl)),
          income: lvl > 0 ? G.getIncome(tpl, lvl) : 0,
          invested: b?.invested || 0,
          sellPrice: lvl > 0 ? G.getSellPrice(b.invested) : 0,
        };
      }),
    },
  });
});

/* Казино (без Dice — быстрое, для Mini App) */
app.post('/api/casino/spin', auth, (req, res) => {
  const user = ensureUser(req.tgUser);
  const bet = Number(req.body.bet);
  const prep = Casino.prepareSpin(user, bet);
  if (!prep.ok) return res.json({ ok: false, msg: prep.msg });

  /* Генерируем случайное значение 1-64 (как Dice) */
  const diceValue = Math.floor(Math.random() * 64) + 1;
  const result = Casino.handleDiceResult(user, bet, diceValue);
  const unlocked = Ach.checkAchievements(user);
  DB.saveUser(user);

  res.json({
    ...result,
    ok: true,
    achievementsUnlocked: unlocked,
    state: {
      money: user.money,
      totalEarned: user.totalEarned,
    },
  });
});

/* Ежедневка */
app.post('/api/daily/claim', auth, (req, res) => {
  const user = ensureUser(req.tgUser);
  const r = Daily.claimDaily(user);
  const unlocked = Ach.checkAchievements(user);
  DB.saveUser(user);

  res.json({
    ...r,
    achievementsUnlocked: unlocked,
    daily: Daily.getDailyInfo(user),
    state: { money: user.money },
  });
});

/* Fallback — index.html */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* Health check */
app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`🚀 Mini App API on port ${PORT}`);
});