import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
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

/* Директория для сохранения профилей */
const PROFILES_FILE = process.env.PROFILES_FILE || '/app/data/profiles.json';

/* Хранилище профилей */
function loadProfiles() {
  try {
    if (!fs.existsSync(PROFILES_FILE)) return {};
    return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
  } catch { return {}; }
}

function saveProfiles(data) {
  try {
    const dir = path.dirname(PROFILES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('Не удалось сохранить профиль:', e.message);
  }
}

function getProfile(userId) {
  const profiles = loadProfiles();
  return profiles[userId] || { name: '', age: null, city: '', bio: '' };
}

function updateProfile(userId, patch) {
  const profiles = loadProfiles();
  profiles[userId] = { ...(profiles[userId] || {}), ...patch, updatedAt: Date.now() };
  saveProfiles(profiles);
  return profiles[userId];
}

/* ============ Middleware ============ */
app.use(cors({ origin: '*' }));
app.use(express.json());

/* Статика */
app.use(express.static(path.join(__dirname, 'public')));

/* ============ Авторизация ============ */
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

  if (computed !== hash) {
    console.log('[verify] hash mismatch');
    return null;
  }

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
  const profile = getProfile(user.id);

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
    profile,
    user: {
      id: user.id,
      firstName: user.firstName,
      username: user.username,
      photoUrl: user.photoUrl || null,
    },
  });
});

/* Сохранение профиля */
app.post('/api/profile/save', auth, (req, res) => {
  const user = ensureUser(req.tgUser);
  const patch = {
    name: String(req.body.name || '').slice(0, 30).trim(),
    age: Number(req.body.age) || null,
    city: String(req.body.city || '').slice(0, 40).trim(),
    bio: String(req.body.bio || '').slice(0, 300).trim(),
  };

  if (!patch.name) {
    return res.json({ ok: false, msg: 'Имя не может быть пустым' });
  }

  if (patch.age && (patch.age < 1 || patch.age > 99)) {
    return res.json({ ok: false, msg: 'Возраст от 1 до 99' });
  }

  const profile = updateProfile(user.id, patch);
  res.json({ ok: true, profile });
});

/* Купить */
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
      businesses: G.BUSINESSES.map(tpl => buildBiz(user, tpl)),
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
      businesses: G.BUSINESSES.map(tpl => buildBiz(user, tpl)),
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
      businesses: G.BUSINESSES.map(tpl => buildBiz(user, tpl)),
    },
  });
});

/* Казино */
app.post('/api/casino/spin', auth, (req, res) => {
  const user = ensureUser(req.tgUser);
  const bet = Number(req.body.bet);
  const prep = Casino.prepareSpin(user, bet);
  if (!prep.ok) return res.json({ ok: false, msg: prep.msg });

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

/* Хелпер */
function buildBiz(user, tpl) {
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
}

/* Health */
app.get('/health', (_, res) => res.json({ ok: true }));

/* SPA fallback */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Mini App API on port ${PORT}`);
});