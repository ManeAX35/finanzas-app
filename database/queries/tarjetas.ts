import { getDatabase, uid, hoy } from '../index';
import { Tarjeta, TarjetaVersion, TarjetaConVersion, PeriodoCorte } from '../../types';

// ─────────────────────────────────────────
// CREAR TARJETA
// ─────────────────────────────────────────

export async function crearTarjeta(
  tipo: 'bancaria' | 'departamental',
  version: Omit<TarjetaVersion, 'id' | 'tarjeta_id' | 'es_actual' | 'vigente_desde' | 'vigente_hasta' | 'created_at'>
): Promise<string> {
  const db = await getDatabase();
  const tarjetaId = uid();
  const versionId = uid();

  const pt = [tarjetaId, tipo];
  console.log('[crearTarjeta] INSERT tarjeta:', JSON.stringify(pt));
  await db.runAsync(
    'INSERT INTO tarjeta (id, tipo) VALUES (?, ?)',
    pt
  );

  const diaCorte = (typeof version.dia_corte === 'number' && !isNaN(version.dia_corte)) ? version.dia_corte : 1;
  const diasPago = (typeof version.dias_pago === 'number' && !isNaN(version.dias_pago)) ? version.dias_pago : 20;
  const pv: (string | number | null)[] = [
    versionId, tarjetaId,
    version.banco ?? null, version.nombre ?? null, version.digitos || null,
    version.limite_credito ?? 0, diaCorte, diasPago,
    version.tasa_anual ?? 0, version.color || 'blue', hoy(),
  ];
  console.log('[crearTarjeta] INSERT tarjeta_version:', JSON.stringify(pv));
  await db.runAsync(
    `INSERT INTO tarjeta_version
      (id, tarjeta_id, banco, nombre, digitos, limite_credito, dia_corte, dias_pago, tasa_anual, color, es_actual, vigente_desde)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    pv
  );

  await generarPeriodosCorte(tarjetaId, diaCorte, diasPago);

  return tarjetaId;
}

// ─────────────────────────────────────────
// ACTUALIZAR TARJETA (SCD 2)
// ─────────────────────────────────────────

export async function actualizarTarjeta(
  tarjetaId: string,
  nuevaVersion: Omit<TarjetaVersion, 'id' | 'tarjeta_id' | 'es_actual' | 'vigente_desde' | 'vigente_hasta' | 'created_at'>
): Promise<void> {
  const db = await getDatabase();
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = ayer.toISOString().slice(0, 10);

  // Cerrar versión actual
  await db.runAsync(
    `UPDATE tarjeta_version 
     SET es_actual = 0, vigente_hasta = ?
     WHERE tarjeta_id = ? AND es_actual = 1`,
    [ayerStr, tarjetaId]
  );

  // Abrir nueva versión
  const versionId = uid();
  const pvUpdate: (string | number | null)[] = [
    versionId, tarjetaId,
    nuevaVersion.banco ?? null, nuevaVersion.nombre ?? null, nuevaVersion.digitos || null,
    nuevaVersion.limite_credito ?? 0,
    (typeof nuevaVersion.dia_corte === 'number' && !isNaN(nuevaVersion.dia_corte)) ? nuevaVersion.dia_corte : 1,
    (typeof nuevaVersion.dias_pago === 'number' && !isNaN(nuevaVersion.dias_pago)) ? nuevaVersion.dias_pago : 20,
    nuevaVersion.tasa_anual ?? 0, nuevaVersion.color || 'blue', hoy(),
  ];
  await db.runAsync(
    `INSERT INTO tarjeta_version
      (id, tarjeta_id, banco, nombre, digitos, limite_credito, dia_corte, dias_pago, tasa_anual, color, es_actual, vigente_desde)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    pvUpdate
  );

  // Snapshot del saldo antes del cambio
  await tomarSaldoSnapshot(tarjetaId, 'cambio_version');
}

// ─────────────────────────────────────────
// OBTENER TARJETAS
// ─────────────────────────────────────────

export async function obtenerTarjetas(): Promise<TarjetaConVersion[]> {
  const db = await getDatabase();
  return await db.getAllAsync<TarjetaConVersion>(
    `SELECT tv.*, t.tipo
     FROM tarjeta_version tv
     JOIN tarjeta t ON t.id = tv.tarjeta_id
     WHERE tv.es_actual = 1
     ORDER BY tv.banco, tv.nombre`
  );
}

export async function obtenerTarjetaPorId(tarjetaId: string): Promise<TarjetaConVersion | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<TarjetaConVersion>(
    `SELECT tv.*, t.tipo
     FROM tarjeta_version tv
     JOIN tarjeta t ON t.id = tv.tarjeta_id
     WHERE tv.tarjeta_id = ? AND tv.es_actual = 1`,
    [tarjetaId]
  );
}

export async function obtenerHistorialTarjeta(tarjetaId: string): Promise<TarjetaVersion[]> {
  const db = await getDatabase();
  return await db.getAllAsync<TarjetaVersion>(
    `SELECT * FROM tarjeta_version
     WHERE tarjeta_id = ?
     ORDER BY vigente_desde DESC`,
    [tarjetaId]
  );
}

// ─────────────────────────────────────────
// PERIODOS DE CORTE
// ─────────────────────────────────────────

export async function generarPeriodosCorte(
  tarjetaId: string,
  diaCorte: number,
  diasPago: number,
  mesesAdelante: number = 3
): Promise<void> {
  if (!diaCorte || isNaN(diaCorte)) return;
  const db = await getDatabase();

  for (let i = 0; i < mesesAdelante; i++) {
    const fechaCorte = new Date();
    fechaCorte.setDate(diaCorte);
    fechaCorte.setMonth(fechaCorte.getMonth() + i);

    const fechaPago = new Date(fechaCorte);
    fechaPago.setDate(fechaPago.getDate() + diasPago);

    const fechaCorteStr = fechaCorte.toISOString().slice(0, 10);
    const fechaPagoStr = fechaPago.toISOString().slice(0, 10);

    const existe = await db.getFirstAsync(
      'SELECT id FROM periodo_corte WHERE tarjeta_id = ? AND fecha_corte = ?',
      [tarjetaId, fechaCorteStr]
    );

    if (!existe) {
      await db.runAsync(
        `INSERT INTO periodo_corte (id, tarjeta_id, fecha_corte, fecha_limite_pago, estado)
         VALUES (?, ?, ?, ?, 'abierto')`,
        [uid(), tarjetaId, fechaCorteStr, fechaPagoStr]
      );
    }
  }
}

export async function obtenerPeriodoActual(tarjetaId: string): Promise<PeriodoCorte | null> {
  const db = await getDatabase();
  const hoyStr = hoy();
  return await db.getFirstAsync<PeriodoCorte>(
    `SELECT * FROM periodo_corte
     WHERE tarjeta_id = ? AND estado = 'abierto'
     AND fecha_corte >= ?
     ORDER BY fecha_corte ASC
     LIMIT 1`,
    [tarjetaId, hoyStr]
  );
}

export async function obtenerPeriodos(tarjetaId: string): Promise<PeriodoCorte[]> {
  const db = await getDatabase();
  return await db.getAllAsync<PeriodoCorte>(
    `SELECT * FROM periodo_corte
     WHERE tarjeta_id = ?
     ORDER BY fecha_corte DESC`,
    [tarjetaId]
  );
}

export type PeriodoConSaldo = PeriodoCorte & { dias_para_vencer: number };

export async function obtenerPeriodosConSaldo(tarjetaId: string): Promise<PeriodoConSaldo[]> {
  const db = await getDatabase();
  const hoyStr = hoy();
  const rows = await db.getAllAsync<PeriodoCorte>(
    `SELECT * FROM periodo_corte
     WHERE tarjeta_id = ?
     ORDER BY fecha_corte DESC
     LIMIT 3`,
    [tarjetaId]
  );
  return rows.map(p => {
    const dias_para_vencer = p.fecha_limite_pago
      ? Math.ceil((new Date(p.fecha_limite_pago).getTime() - new Date(hoyStr).getTime()) / 86400000)
      : 0;
    return { ...p, dias_para_vencer };
  });
}

export async function obtenerPeriodoCerradoPendiente(tarjetaId: string): Promise<PeriodoCorte | null> {
  const db = await getDatabase();
  const hoyStr = hoy();
  return await db.getFirstAsync<PeriodoCorte>(
    `SELECT * FROM periodo_corte
     WHERE tarjeta_id = ? AND fecha_corte < ? AND estado != 'pagado'
     ORDER BY fecha_corte DESC
     LIMIT 1`,
    [tarjetaId, hoyStr]
  );
}

export async function marcarPeriodoPagado(
  periodoId: string,
  montoPagado: number
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE periodo_corte
     SET estado = 'pagado', monto_pagado = ?, fecha_pago_real = ?
     WHERE id = ?`,
    [montoPagado ?? null, hoy(), periodoId ?? null]
  );
}

export async function abonarSaldoTarjeta(tarjetaId: string, monto: number): Promise<void> {
  const db = await getDatabase();
  const periodo = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM periodo_corte
     WHERE tarjeta_id = ? AND estado != 'pagado'
     ORDER BY fecha_corte DESC LIMIT 1`,
    [tarjetaId]
  );
  if (periodo) {
    await db.runAsync(
      `UPDATE periodo_corte SET saldo_calculado = MAX(0, saldo_calculado - ?) WHERE id = ?`,
      [monto ?? null, periodo.id ?? null]
    );
  }
}

export async function sumarSaldoTarjetaPorVersion(tarjetaVersionId: string, monto: number): Promise<void> {
  const db = await getDatabase();
  const version = await db.getFirstAsync<{ tarjeta_id: string }>(
    'SELECT tarjeta_id FROM tarjeta_version WHERE id = ?',
    [tarjetaVersionId]
  );
  if (!version) return;
  const periodo = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM periodo_corte
     WHERE tarjeta_id = ? AND estado = 'abierto'
     ORDER BY fecha_corte ASC LIMIT 1`,
    [version.tarjeta_id]
  );
  if (periodo) {
    await db.runAsync(
      'UPDATE periodo_corte SET saldo_calculado = saldo_calculado + ? WHERE id = ?',
      [monto ?? null, periodo.id ?? null]
    );
  }
}

// ─────────────────────────────────────────
// SNAPSHOTS
// ─────────────────────────────────────────

export async function tomarSaldoSnapshot(
  tarjetaId: string,
  triggerEvento: string
): Promise<void> {
  const db = await getDatabase();

  const version = await obtenerTarjetaPorId(tarjetaId);
  if (!version) return;

  const periodo = await obtenerPeriodoActual(tarjetaId);
  const saldo = periodo?.saldo_calculado ?? 0;
  const limite = version.limite_credito;
  const pct = limite > 0 ? (saldo / limite) * 100 : 0;

  await db.runAsync(
    `INSERT INTO saldo_snapshot (id, tarjeta_id, fecha_snapshot, saldo_calculado, limite_vigente, porcentaje_uso, trigger_evento)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uid(), tarjetaId, hoy(), saldo, limite, pct, triggerEvento]
  );
}

// ─────────────────────────────────────────
// ELIMINAR TARJETA
// ─────────────────────────────────────────

export async function eliminarTarjeta(tarjetaId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE tarjeta_version SET es_actual = 0 WHERE tarjeta_id = ?',
    [tarjetaId]
  );
}