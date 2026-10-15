/* База данных: сохранение игроков */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

const DB_FILE = process.env.DB_FILE || './tycoon.db';
const dbDir = path.dirname(path.resolve(DB_FILE));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.resolve(DB_FILE));
db.pragma('journal_mode = WAL');

/* Схема */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY,
    data        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
`);

const stmtGet    = db.prepare('SELECT data FROM users WHERE id = ?');
const stmtUpsert = db.prepare(`
  INSERT INTO users (id, data, created_at, updated_at)
  VALUES (@id, @data, @created_at, @updated_at)
  ON CONFLICT(id) DO UPDATE SET
    data = @data,
    updated_at = @updated_at
`);
const stmtAll = db.prepare('SELECT data FROM users');
const stmtCount = db.prepare('SELECT COUNT(*) AS n FROM users');

function parse(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export const DB = {
  getUser(id) {
    const row = stmtGet.get(id);
    return row ? parse(row.data) : null;
  },

  saveUser(user) {
    const now = Date.now();
    stmtUpsert.run({
      id: user.id,
      data: JSON.stringify(user),
      created_at: user.createdAt || now,
      updated_at: now,
    });
  },

  getAllUsers() {
    return stmtAll.all().map(r => parse(r.data)).filter(Boolean);
  },

  getUserByUsername(username) {
    const clean = String(username || '').replace(/^@/, '').toLowerCase();
    return this.getAllUsers().find(u =>
      String(u.username || '').toLowerCase() === clean
    ) || null;
  },

  count() {
    return stmtCount.get().n;
  },
};