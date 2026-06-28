import { getDatabase, uid, hoy } from '../index';
import { CuentaInversion, CuentaInversionVersion, MovimientoInversion } from '../../types';

// ─────────────────────────────────────────
// CUENTAS DE INVERSIÓN
// ─────────────────────────────────────────

export async function crearCuentaInversion(
  cuenta: Omit<CuentaInversion, 'id' | 'created_at'>,
  version: Omit<CuentaInversionVersion, 'id' | 'cuenta_id' | 'es_actual' | 'vigente_desde' | 'vigente_hasta' | 'created_at'>
): Promise<string> {
  const db = await getDatabase();
  const cuentaId = uid();
  const versionId = uid();

  await db.runAsync(
    'INSERT INTO cuenta_inversion (id, institucion, nombre) VALUES (?, ?, ?)',
    [cuentaId, cuenta.institucion, cuenta.nombre]
  );

  await db.runAsync(
    `INSERT INTO cuenta_inversion_version
      (id, cuenta_id, tasa_anual, frecuencia_rendimiento, saldo_inicial, fecha_inicio, es_actual, vigente_desde)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [versionId, cuentaId, version.tasa_anual, version.frecuencia_rendimiento,
     version.saldo_inicial, version.fecha_inicio, hoy()]
  );

  // Registrar depósito inicial
  if (version.saldo_inicial > 0) {
    await db.runAsync(
      `INSERT INTO movimiento_inversion
        (id, cuenta_version_id, tipo, monto, fecha, saldo_resultante, notas)
       VALUES (?, ?, 'deposito', ?, ?, ?, 'Saldo inicial')`,
      [uid(), versionId, version.saldo_inicial, version.fecha_inicio, version.saldo_inicial]
    );
  }

  return cuentaId;
}

// ─────────────────────────────────────────
// ACTUALIZAR TASA (SCD 2)
// ─────────────────────────────────────────

export async function actualizarTasaInversion(
  cuentaId: string,
  nuevaTasa: number,
  nuevaFrecuencia?: CuentaInversionVersion['frecuencia_rendimiento']
): Promise<void> {
  const db = await getDatabase();
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = ayer.toISOString().slice(0, 10);

  const versionActual = await db.getFirstAsync<CuentaInversionVersion>(
    'SELECT * FROM cuenta_inversion_version WHERE cuenta_id = ? AND es_actual = 1',
    [cuentaId]
  );

  if (!versionActual) return;

  const saldoActual = await obtenerSaldoActual(cuentaId);

  // Cerrar versión actual
  await db.runAsync(
    `UPDATE cuenta_inversion_version
     SET es_actual = 0, vigente_hasta = ?
     WHERE cuenta_id = ? AND es_actual = 1`,
    [ayerStr, cuentaId]
  );

  // Abrir nueva versión
  const versionId = uid();
  await db.runAsync(
    `INSERT INTO cuenta_inversion_version
      (id, cuenta_id, tasa_anual, frecuencia_rendimiento, saldo_inicial, fecha_inicio, es_actual, vigente_desde)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [versionId, cuentaId, nuevaTasa,
     nuevaFrecuencia ?? versionActual.frecuencia_rendimiento,
     saldoActual, hoy(), hoy()]
  );

  // Snapshot antes del cambio
  await tomarRendimientoSnapshot(cuentaId, 'cambio_tasa');
}

// ─────────────────────────────────────────
// OBTENER CUENTAS
// ─────────────────────────────────────────

export async function obtenerCuentasInversion(): Promise
  (CuentaInversion & CuentaInversionVersion)[]
> {
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT ci.*, civ.id as version_id, civ.tasa_anual, civ.frecuencia_rendimiento,
            civ.saldo_inicial, civ.fecha_inicio
     FROM cuenta_inversion ci
     JOIN cuenta_inversion_version civ ON civ.cuenta_id = ci.id
     WHERE civ.es_actual = 1
     ORDER BY ci.nombre ASC`
  );
}

export async function obtenerSaldoActual(cuentaId: string): Promise<number> {
  const db = await getDatabase();

  const result = await db.getFirstAsync<{ saldo: number }>(
    `SELECT SUM(
       CASE
         WHEN mi.tipo = 'deposito' THEN mi.monto
         WHEN mi.tipo = 'retiro' THEN -mi.monto
         WHEN mi.tipo = 'rendimiento' THEN mi.monto
         ELSE 0
       END
     ) as saldo
     FROM movimiento_inversion mi
     JOIN cuenta_inversion_version civ ON civ.id = mi.cuenta_version_id
     WHERE civ.cuenta_id = ?`,
    [cuentaId]
  );

  return result?.saldo ?? 0;
}

// ─────────────────────────────────────────
// CALCULAR RENDIMIENTO ESPERADO
// ─────────────────────────────────────────

export async function calcularSaldoEsperadoHoy(cuentaId: string): Promise<number> {
  const db = await getDatabase();

  const version = await db.getFirstAsync<CuentaInversionVersion>(
    'SELECT * FROM cuenta_inversion_version WHERE cuenta_id = ? AND es_actual = 1',
    [cuentaId]
  );

  if (!version) return 0;

  const saldoInicial = version.saldo_inicial;
  const tasaAnual = version.tasa_anual / 100;
  const fechaInicio = new Date(version.fecha_inicio);
  const hoyDate = new Date();
  const diasTranscurridos = Math.floor(
    (hoyDate.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Interés compuesto diario
  const saldoEsperado = saldoInicial * Math.pow(1 + tasaAnual / 365, diasTranscurridos);

  return saldoEsperado;
}

export async function calcularRendimientoHoy(cuentaId: string): Promise<{
  saldoEsperado: number;
  saldoReal: number;
  rendimientoAcumulado: number;
  rendimientoHoy: number;
}> {
  const saldoEsperado = await calcularSaldoEsperadoHoy(cuentaId);
  const saldoReal = await obtenerSaldoActual(cuentaId);

  const db = await getDatabase();
  const version = await db.getFirstAsync<CuentaInversionVersion>(
    'SELECT * FROM cuenta_inversion_version WHERE cuenta_id = ? AND es_actual = 1',
    [cuentaId]
  );

  const saldoInicial = version?.saldo_inicial ?? 0;
  const tasaAnual = (version?.tasa_anual ?? 0) / 100;
  const rendimientoAcumulado = saldoEsperado - saldoInicial;
  const rendimientoHoy = saldoInicial * (tasaAnual / 365);

  return { saldoEsperado, saldoReal, rendimientoAcumulado, rendimientoHoy };
}

// ─────────────────────────────────────────
// MOVIMIENTOS
// ─────────────────────────────────────────

export async function registrarMovimientoInversion(
  cuentaId: string,
  tipo: 'deposito' | 'retiro' | 'rendimiento',
  monto: number,
  notas?: string
): Promise<void> {
  const db = await getDatabase();

  const version = await db.getFirstAsync<CuentaInversionVersion>(
    'SELECT * FROM cuenta_inversion_version WHERE cuenta_id = ? AND es_actual = 1',
    [cuentaId]
  );

  if (!version) return;

  const saldoActual = await obtenerSaldoActual(cuentaId);
  const saldoResultante = tipo === 'retiro'
    ? saldoActual - monto
    : saldoActual + monto;

  await db.runAsync(
    `INSERT INTO movimiento_inversion
      (id, cuenta_version_id, tipo, monto, fecha, saldo_resultante, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uid(), version.id, tipo, monto, hoy(), saldoResultante, notas ?? null]
  );
}

export async function obtenerMovimientosInversion(
  cuentaId: string,
  limite: number = 50
): Promise<MovimientoInversion[]> {
  const db = await getDatabase();
  return await db.getAllAsync<MovimientoInversion>(
    `SELECT mi.*
     FROM movimiento_inversion mi
     JOIN cuenta_inversion_version civ ON civ.id = mi.cuenta_version_id
     WHERE civ.cuenta_id = ?
     ORDER BY mi.fecha DESC
     LIMIT ?`,
    [cuentaId, limite]
  );
}

// ─────────────────────────────────────────
// SNAPSHOTS
// ─────────────────────────────────────────

export async function tomarRendimientoSnapshot(
  cuentaId: string,
  _trigger?: string
): Promise<void> {
  const db = await getDatabase();
  const { saldoEsperado, saldoReal, rendimientoAcumulado } =
    await calcularRendimientoHoy(cuentaId);

  await db.runAsync(
    `INSERT INTO rendimiento_snapshot
      (id, cuenta_id, fecha_snapshot, saldo_esperado, saldo_real, rendimiento_acumulado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uid(), cuentaId, hoy(), saldoEsperado, saldoReal, rendimientoAcumulado]
  );
}

export async function eliminarCuentaInversion(cuentaId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE cuenta_inversion_version
     SET es_actual = 0, vigente_hasta = ?
     WHERE cuenta_id = ?`,
    [hoy(), cuentaId]
  );
}