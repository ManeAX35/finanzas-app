import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES, DATABASE_VERSION } from './schema';

const DB_NAME = 'finanzas.db';

let db: SQLite.SQLiteDatabase;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(DB_NAME);
  patchRunAsync(db);
  await initDatabase(db);
  return db;
}

function patchRunAsync(database: SQLite.SQLiteDatabase): void {
  const orig = database.runAsync.bind(database);
  (database as any).runAsync = (sql: string, params?: any) => {
    if (Array.isArray(params)) {
      const sanitized = params.map((p: any, i: number) => {
        if (p === undefined) {
          console.warn(`[DB] param[${i}] es undefined en: ${sql.trim().slice(0, 80)}`);
          return null;
        }
        return p;
      });
      return orig(sql, sanitized);
    }
    return orig(sql, params);
  };
}

async function initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const statements = CREATE_TABLES
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    await db.execAsync(statement + ';');
  }

  await checkMigrations(db);
}

async function checkMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS db_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const result = await db.getFirstAsync<{ version: number }>(
    'SELECT MAX(version) as version FROM db_version'
  );

  const currentVersion = result?.version ?? 0;

  if (currentVersion < DATABASE_VERSION) {
    await db.runAsync(
      'INSERT INTO db_version (version) VALUES (?)',
      [DATABASE_VERSION]
    );
  }
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatMXN(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}