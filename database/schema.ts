export const DATABASE_VERSION = 2;

export const CREATE_TABLES = `

  -- ─────────────────────────────────────────
  -- LIQUIDEZ (cuentas de débito y efectivo)
  -- ─────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS cuenta_liquidez (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('debito','digital','efectivo','monedero')),
    institucion TEXT,
    color TEXT DEFAULT 'blue',
    activa INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS movimiento_liquidez (
    id TEXT PRIMARY KEY,
    cuenta_id TEXT NOT NULL REFERENCES cuenta_liquidez(id),
    tipo TEXT NOT NULL CHECK(tipo IN ('ingreso','gasto','transferencia')),
    monto REAL NOT NULL,
    fecha TEXT NOT NULL,
    descripcion TEXT,
    categoria TEXT,
    cuenta_destino_id TEXT REFERENCES cuenta_liquidez(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────
  -- TARJETAS (crédito y departamentales) SCD 2
  -- ─────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS tarjeta (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL CHECK(tipo IN ('bancaria','departamental')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tarjeta_version (
    id TEXT PRIMARY KEY,
    tarjeta_id TEXT NOT NULL REFERENCES tarjeta(id),
    banco TEXT NOT NULL,
    nombre TEXT NOT NULL,
    digitos TEXT,
    limite_credito REAL DEFAULT 0,
    dia_corte INTEGER NOT NULL,
    dias_pago INTEGER DEFAULT 20,
    tasa_anual REAL DEFAULT 0,
    color TEXT DEFAULT 'blue',
    es_actual INTEGER DEFAULT 1,
    vigente_desde TEXT NOT NULL,
    vigente_hasta TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS periodo_corte (
    id TEXT PRIMARY KEY,
    tarjeta_id TEXT NOT NULL REFERENCES tarjeta(id),
    fecha_corte TEXT NOT NULL,
    fecha_limite_pago TEXT NOT NULL,
    saldo_calculado REAL DEFAULT 0,
    estado TEXT DEFAULT 'abierto' CHECK(estado IN ('abierto','cerrado','pagado')),
    monto_pagado REAL,
    fecha_pago_real TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────
  -- GASTOS DEL DÍA A DÍA
  -- ─────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS gasto (
    id TEXT PRIMARY KEY,
    tarjeta_version_id TEXT REFERENCES tarjeta_version(id),
    cuenta_liquidez_id TEXT REFERENCES cuenta_liquidez(id),
    descripcion TEXT NOT NULL,
    monto REAL NOT NULL,
    fecha TEXT NOT NULL,
    categoria TEXT,
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────
  -- COMPRAS A MSI Y CRÉDITOS
  -- ─────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS compra (
    id TEXT PRIMARY KEY,
    tarjeta_version_id TEXT REFERENCES tarjeta_version(id),
    descripcion TEXT NOT NULL,
    monto_total REAL NOT NULL,
    meses INTEGER DEFAULT 1,
    fecha_compra TEXT NOT NULL,
    categoria TEXT,
    origen TEXT DEFAULT 'tarjeta' CHECK(origen IN ('tarjeta','credito_directo','departamental')),
    notas TEXT,
    estado TEXT DEFAULT 'activa' CHECK(estado IN ('activa','liquidada')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cuota_mensual (
    id TEXT PRIMARY KEY,
    compra_id TEXT NOT NULL REFERENCES compra(id),
    numero_cuota INTEGER NOT NULL,
    monto_cuota REAL NOT NULL,
    fecha_esperada TEXT NOT NULL,
    fecha_pagada TEXT,
    estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente','pagada','vencida')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────
  -- RECURRENTES Y DOMICILIADOS SCD 2
  -- ─────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS gasto_recurrente (
    id TEXT PRIMARY KEY,
    tipo TEXT DEFAULT 'suscripcion',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gasto_recurrente_version (
    id TEXT PRIMARY KEY,
    recurrente_id TEXT NOT NULL REFERENCES gasto_recurrente(id),
    tarjeta_version_id TEXT REFERENCES tarjeta_version(id),
    cuenta_liquidez_id TEXT REFERENCES cuenta_liquidez(id),
    nombre TEXT NOT NULL,
    monto REAL DEFAULT 0,
    dia_cobro INTEGER NOT NULL,
    frecuencia TEXT DEFAULT 'mensual' CHECK(frecuencia IN ('mensual','bimestral','trimestral','semestral','anual')),
    categoria TEXT,
    es_domiciliado INTEGER DEFAULT 0,
    monto_variable INTEGER DEFAULT 0,
    es_actual INTEGER DEFAULT 1,
    vigente_desde TEXT NOT NULL,
    vigente_hasta TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS instancia_pago (
    id TEXT PRIMARY KEY,
    recurrente_version_id TEXT NOT NULL REFERENCES gasto_recurrente_version(id),
    fecha_esperada TEXT NOT NULL,
    fecha_real_cobro TEXT,
    monto_cobrado REAL,
    estado TEXT DEFAULT 'esperado' CHECK(estado IN ('esperado','pagado','fallido','omitido')),
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────
  -- INVERSIONES SCD 2
  -- ─────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS cuenta_inversion (
    id TEXT PRIMARY KEY,
    institucion TEXT NOT NULL,
    nombre TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cuenta_inversion_version (
    id TEXT PRIMARY KEY,
    cuenta_id TEXT NOT NULL REFERENCES cuenta_inversion(id),
    tasa_anual REAL NOT NULL,
    frecuencia_rendimiento TEXT DEFAULT 'mensual' CHECK(frecuencia_rendimiento IN ('diario','mensual','trimestral','al_vencimiento')),
    saldo_inicial REAL DEFAULT 0,
    fecha_inicio TEXT NOT NULL,
    es_actual INTEGER DEFAULT 1,
    vigente_desde TEXT NOT NULL,
    vigente_hasta TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS movimiento_inversion (
    id TEXT PRIMARY KEY,
    cuenta_version_id TEXT NOT NULL REFERENCES cuenta_inversion_version(id),
    tipo TEXT NOT NULL CHECK(tipo IN ('deposito','retiro','rendimiento')),
    monto REAL NOT NULL,
    fecha TEXT NOT NULL,
    saldo_resultante REAL NOT NULL,
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────
  -- SNAPSHOTS HISTÓRICOS SCD 4
  -- ─────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS saldo_snapshot (
    id TEXT PRIMARY KEY,
    tarjeta_id TEXT NOT NULL REFERENCES tarjeta(id),
    fecha_snapshot TEXT NOT NULL,
    saldo_calculado REAL DEFAULT 0,
    limite_vigente REAL DEFAULT 0,
    porcentaje_uso REAL DEFAULT 0,
    trigger_evento TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rendimiento_snapshot (
    id TEXT PRIMARY KEY,
    cuenta_id TEXT NOT NULL REFERENCES cuenta_inversion(id),
    fecha_snapshot TEXT NOT NULL,
    saldo_esperado REAL DEFAULT 0,
    saldo_real REAL DEFAULT 0,
    rendimiento_acumulado REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`;