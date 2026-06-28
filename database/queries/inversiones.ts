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

  const p1 = [cuentaId, cuenta.institucion ?? null, cuenta.nombre ?? null];
  console.log('[crearCuentaInversion] INSERT cuenta_inversion:', JSON.stringify(p1));
  await db.runAsync(
    'INSERT INTO cuenta_inversion (id, institucion, nombre) VALUES (?, ?, ?)',
    p1
  );

  const p2 = [versionId, cuentaId, version.tasa_anual ?? null, version.frecuencia_rendimiento ?? null,
    version.saldo_inicial ?? 0, version.fecha_inicio ?? null, hoy()];
  console.log('[crearCuentaInversion] INSERT cuenta_inversion_version:', JSON.stringify(p2));
  await db.runAsync(
    `INSERT INTO cuenta_inversion_version
      (id, cuenta_id, tasa_anual, frecuencia_rendimiento, saldo_inicial, fecha_inicio, es_actual, vigente_desde)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    p2
  );

  if (version.saldo_inicial > 0) {
    const p3 = [uid(), versionId, version.saldo_inicial ?? null, version.fecha_inicio ?? null, version.saldo_inicial ?? null];
    console.log('[crearCuentaInversion] INSERT movimiento_inversion:', JSON.stringify(p3));
    await db.runAsync(
      `INSERT INTO movimiento_inversion
        (id, cuenta_version_id, tipo, monto, fecha, saldo_resultante, notas)
       VALUES (?, ?, 'deposito', ?, ?, ?, 'Saldo inicial')`,
      p3
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

  await db.runAsync(
    `UPDATE cuenta_inversion_version
     SET es_actual = 0, vigente_hasta = ?
     WHERE cuenta_id = ? AND es_actual = 1`,
    [ayerStr, cuentaId]
  );

  const versionId = uid();
  await db.runAsync(
    `INSERT INTO cuenta_inversion_version
      (id, cuenta_id, tasa_anual, frecuencia_rendimiento, saldo_inicial, fecha_inicio, es_actual, vigente_desde)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [versionId, cuentaId, nuevaTasa,
     nuevaFrecuencia ?? versionActual.frecuencia_rendimiento,
     saldoActual, hoy(), hoy()]
  );

  await tomarRendimientoSnapshot(cuentaId, 'cambio_tasa');
}

// ─────────────────────────────────────────
// OBTENER CUENTAS
// ─────────────────────────────────────────

export async function obtenerCuentasInversion(): Promise<(CuentaInversion & CuentaInversionVersion)[]> {
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
    `SELECT COALESCE(SUM(
       CASE
         WHEN mi.tipo = 'deposito' THEN mi.monto
         WHEN mi.tipo = 'retiro' THEN -mi.monto
         WHEN mi.tipo = 'rendimiento' THEN mi.monto
         ELSE 0
       END
     ), 0) as saldo
     FROM movimiento_inversion mi
     JOIN cuenta_inversion_version civ ON civ.id = mi.cuenta_version_id
     WHERE civ.cuenta_id = ?`,
    [cuentaId]
  );

  console.log('[obtenerSaldoActual] cuentaId:', cuentaId, '→ saldo:', result?.saldo);
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

  const saldoReal = await obtenerSaldoActual(cuentaId);
  const tasaAnual = version.tasa_anual / 100;
  const diasTranscurridos = Math.floor(
    (Date.now() - new Date(version.fecha_inicio).getTime()) / (1000 * 60 * 60 * 24)
  );

  return saldoReal * Math.pow(1 + tasaAnual / 365, diasTranscurridos);
}

export async function calcularRendimientoHoy(cuentaId: string): Promise<{
  saldoEsperado: number;
  saldoReal: number;
  rendimientoAcumulado: number;
  rendimientoHoy: number;
}> {
  const db = await getDatabase();
  const version = await db.getFirstAsync<CuentaInversionVersion>(
    'SELECT * FROM cuenta_inversion_version WHERE cuenta_id = ? AND es_actual = 1',
    [cuentaId]
  );

  const saldoReal = await obtenerSaldoActual(cuentaId);
  const tasaAnual = (version?.tasa_anual ?? 0) / 100;
  const diasTranscurridos = Math.floor(
    (Date.now() - new Date(version?.fecha_inicio ?? new Date()).getTime()) / (1000 * 60 * 60 * 24)
  );

  const saldoEsperado = saldoReal * Math.pow(1 + tasaAnual / 365, diasTranscurridos);
  const rendimientoAcumulado = saldoEsperado - saldoReal;
  const rendimientoHoy = saldoReal * (tasaAnual / 365);

  return { saldoEsperado, saldoReal, rendimientoAcumulado, rendimientoHoy };
}

export async function calcularRendimientoDiario(cuentaId: string): Promise<number> {
  const db = await getDatabase();
  const version = await db.getFirstAsync<CuentaInversionVersion>(
    'SELECT * FROM cuenta_inversion_version WHERE cuenta_id = ? AND es_actual = 1',
    [cuentaId]
  );
  if (!version) return 0;
  const saldoReal = await obtenerSaldoActual(cuentaId);
  return saldoReal * (version.tasa_anual / 100 / 365);
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
  const saldoResultante = tipo === 'retiro' ? saldoActual - monto : saldoActual + monto;

  console.log('[registrarMovimientoInversion]', { cuentaId, versionId: version.id, tipo, monto, saldoActual, saldoResultante });

  await db.runAsync(
    `INSERT INTO movimiento_inversion
      (id, cuenta_version_id, tipo, monto, fecha, saldo_resultante, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uid(), version.id, tipo, monto, hoy(), saldoResultante, notas ?? null]
  );

  console.log('[registrarMovimientoInversion] movimiento insertado');
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

// ─────────────────────────────────────────
// TRANSFERENCIAS CRUZADAS
// ─────────────────────────────────────────

export async function transferirCuentaAInversion(
  cuentaId: string,
  cuentaInversionId: string,
  monto: number,
  notas?: string
): Promise<void> {
  const { crearMovimiento } = await import('./liquidez');

  await crearMovimiento({
    cuenta_id: cuentaId,
    tipo: 'gasto',
    monto,
    fecha: hoy(),
    descripcion: notas ?? 'Depósito a inversión',
    categoria: 'Transferencia',
  });

  await registrarMovimientoInversion(cuentaInversionId, 'deposito', monto, notas ?? 'Desde cuenta');
}

export async function transferirInversionACuenta(
  cuentaInversionId: string,
  cuentaId: string,
  monto: number,
  notas?: string
): Promise<void> {
  const { crearMovimiento } = await import('./liquidez');

  await registrarMovimientoInversion(cuentaInversionId, 'retiro', monto, notas ?? 'Retiro a cuenta');

  await crearMovimiento({
    cuenta_id: cuentaId,
    tipo: 'ingreso',
    monto,
    fecha: hoy(),
    descripcion: notas ?? 'Retiro de inversión',
    categoria: 'Transferencia',
  });
}