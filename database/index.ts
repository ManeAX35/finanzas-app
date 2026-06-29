import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES, DATABASE_VERSION } from './schema';

const DB_NAME = 'finanzas.db';

let db: SQLite.SQLiteDatabase | undefined;
let dbPromise: Promise<SQLite.SQLiteDatabase> | undefined;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (dbPromise) return dbPromise;
  dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (database) => {
    patchRunAsync(database);
    try {
      await initDatabase(database);
    } catch (e) {
      console.error('[DB] initDatabase falló:', e);
    }
    db = database;
    return database;
  });
  return dbPromise;
}

function sanitizeParams(sql: string, params: any[]): (string | number | null)[] {
  return params.map((p, i) => {
    if (p === undefined) { console.warn(`[DB] param[${i}] undefined en: ${sql.trim().slice(0, 60)}`); return null; }
    if (p === null) return null;
    if (typeof p === 'boolean') { console.warn(`[DB] param[${i}] boolean → ${p ? 1 : 0}`); return p ? 1 : 0; }
    if (typeof p === 'number' && isNaN(p)) { console.warn(`[DB] param[${i}] NaN → 0`); return 0; }
    if (typeof p === 'string') return p;
    if (typeof p === 'number') return p;
    console.warn(`[DB] param[${i}] tipo inesperado ${typeof p} → null`);
    return null;
  });
}

function patchRunAsync(database: SQLite.SQLiteDatabase): void {
  const origRun = database.runAsync.bind(database);
  const origGet = database.getFirstAsync.bind(database);
  const origAll = database.getAllAsync.bind(database);

  (database as any).runAsync = (sql: string, params?: any) =>
    origRun(sql, Array.isArray(params) ? sanitizeParams(sql, params) : params);

  (database as any).getFirstAsync = (sql: string, params?: any) =>
    origGet(sql, Array.isArray(params) ? sanitizeParams(sql, params) : params);

  (database as any).getAllAsync = (sql: string, params?: any) =>
    origAll(sql, Array.isArray(params) ? sanitizeParams(sql, params) : params);
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
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS db_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);
  } catch (e) {
    console.error('[migration] Error creando db_version:', e);
  }

  let currentVersion = 0;
  try {
    const result = await db.getFirstAsync<{ version: number }>(
      'SELECT MAX(version) as version FROM db_version'
    );
    currentVersion = result?.version ?? 0;
  } catch (e) {
    console.error('[migration] Error leyendo versión:', e);
  }

  console.log('[migration] versión actual:', currentVersion, '→ target:', DATABASE_VERSION);

  if (currentVersion < 2) {
    try {
      await db.execAsync('ALTER TABLE gasto_recurrente_version ADD COLUMN cuenta_liquidez_id TEXT REFERENCES cuenta_liquidez(id)');
      console.log('[migration v2] columna cuenta_liquidez_id agregada');
    } catch (_) {
      console.log('[migration v2] columna ya existía (instalación nueva)');
    }
    try {
      await db.execAsync('INSERT OR IGNORE INTO db_version (version) VALUES (2)');
    } catch (e) {
      console.error('[migration v2] Error registrando versión:', e);
    }
  }

  if (currentVersion < DATABASE_VERSION && DATABASE_VERSION > 2) {
    try {
      await db.execAsync(`INSERT OR IGNORE INTO db_version (version) VALUES (${DATABASE_VERSION})`);
    } catch (e) {
      console.error('[migration] Error registrando versión final:', e);
    }
  }
}

export async function resetDatabase(): Promise<void> {
  const database = await getDatabase();

  const TABLAS = [
    'saldo_snapshot', 'rendimiento_snapshot',
    'movimiento_inversion', 'cuenta_inversion_version', 'cuenta_inversion',
    'instancia_pago', 'gasto_recurrente_version', 'gasto_recurrente',
    'cuota_mensual', 'compra',
    'gasto',
    'periodo_corte', 'tarjeta_version', 'tarjeta',
    'movimiento_liquidez', 'cuenta_liquidez',
    'db_version',
  ];

  await database.execAsync('PRAGMA foreign_keys = OFF;');
  for (const tabla of TABLAS) {
    await database.execAsync(`DROP TABLE IF EXISTS ${tabla};`);
  }
  await database.execAsync('PRAGMA foreign_keys = ON;');

  await initDatabase(database);
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