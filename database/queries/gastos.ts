import { getDatabase, uid, hoy } from '../index';
import { Gasto, Compra, CuotaMensual } from '../../types';
import { crearMovimiento } from './movimientos';

// ─────────────────────────────────────────
// GASTOS DEL DÍA A DÍA
// ─────────────────────────────────────────

export async function crearGasto(
  gasto: Omit<Gasto, 'id' | 'created_at'>
): Promise<string> {
  const id = await crearMovimiento({
    tipo: 'gasto',
    monto: gasto.monto,
    fecha: gasto.fecha,
    descripcion: gasto.descripcion,
    categoria: gasto.categoria,
    cuenta_id: gasto.cuenta_liquidez_id,
    tarjeta_version_id: gasto.tarjeta_version_id,
    notas: gasto.notas,
  });

  if (gasto.tarjeta_version_id) {
    await actualizarSaldoPeriodo(gasto.tarjeta_version_id, gasto.monto, gasto.fecha);
  }

  return id;
}

export async function obtenerGastos(
  limite: number = 50,
  offset: number = 0
): Promise<Gasto[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Gasto>(
    `SELECT *, cuenta_id as cuenta_liquidez_id FROM movimiento
     WHERE tipo = 'gasto' AND compra_id IS NULL AND recurrente_id IS NULL
     ORDER BY fecha DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    [limite, offset]
  );
}

export async function obtenerGastosPorTarjeta(
  tarjetaVersionId: string,
  fechaDesde?: string,
  fechaHasta?: string
): Promise<Gasto[]> {
  const db = await getDatabase();

  if (fechaDesde && fechaHasta) {
    return await db.getAllAsync<Gasto>(
      `SELECT *, cuenta_id as cuenta_liquidez_id FROM movimiento
       WHERE tarjeta_version_id = ? AND fecha BETWEEN ? AND ?
       ORDER BY fecha DESC`,
      [tarjetaVersionId, fechaDesde, fechaHasta]
    );
  }

  return await db.getAllAsync<Gasto>(
    `SELECT *, cuenta_id as cuenta_liquidez_id FROM movimiento
     WHERE tarjeta_version_id = ?
     ORDER BY fecha DESC`,
    [tarjetaVersionId]
  );
}

export async function obtenerGastosPorMes(
  anio: number,
  mes: number
): Promise<Gasto[]> {
  const db = await getDatabase();
  const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-31`;

  return await db.getAllAsync<Gasto>(
    `SELECT *, cuenta_id as cuenta_liquidez_id FROM movimiento
     WHERE tipo = 'gasto' AND fecha BETWEEN ? AND ?
     AND compra_id IS NULL AND recurrente_id IS NULL
     ORDER BY fecha DESC`,
    [fechaInicio, fechaFin]
  );
}

export async function eliminarGasto(id: string): Promise<void> {
  const db = await getDatabase();
  const mov = await db.getFirstAsync<{ tarjeta_version_id: string | null; monto: number; fecha: string }>(
    'SELECT tarjeta_version_id, monto, fecha FROM movimiento WHERE id = ?',
    [id]
  );
  if (mov?.tarjeta_version_id) {
    await revertirSaldoPeriodo(mov.tarjeta_version_id, mov.monto, mov.fecha);
  }
  await db.runAsync('DELETE FROM movimiento WHERE id = ?', [id]);
}

export async function actualizarGasto(
  id: string,
  cambios: { descripcion?: string; monto?: number; fecha?: string; categoria?: string; notas?: string }
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE movimiento SET descripcion = ?, monto = ?, fecha = ?, categoria = ?, notas = ? WHERE id = ?`,
    [cambios.descripcion ?? null, cambios.monto ?? null, cambios.fecha ?? null, cambios.categoria ?? null, cambios.notas ?? null, id]
  );
}

// ─────────────────────────────────────────
// COMPRAS A MSI
// ─────────────────────────────────────────

export async function crearCompra(
  compra: Omit<Compra, 'id' | 'estado' | 'created_at'>
): Promise<string> {
  const db = await getDatabase();
  const id = uid();

  await db.runAsync(
    `INSERT INTO compra
      (id, tarjeta_version_id, descripcion, monto_total, meses, fecha_compra, categoria, origen, notas, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activa')`,
    [id, compra.tarjeta_version_id ?? null, compra.descripcion,
     compra.monto_total, compra.meses, compra.fecha_compra,
     compra.categoria ?? null, compra.origen, compra.notas ?? null]
  );

  await generarCuotas(id, compra.monto_total, compra.meses, compra.fecha_compra);

  if (compra.tarjeta_version_id) {
    await actualizarSaldoPeriodo(compra.tarjeta_version_id, compra.monto_total, compra.fecha_compra);
  }

  return id;
}

async function generarCuotas(
  compraId: string,
  montoTotal: number,
  meses: number,
  fechaCompra: string
): Promise<void> {
  const db = await getDatabase();
  const montoCuota = montoTotal / meses;

  for (let i = 0; i < meses; i++) {
    const fecha = new Date(fechaCompra);
    fecha.setMonth(fecha.getMonth() + i);
    const fechaStr = fecha.toISOString().slice(0, 10);

    await db.runAsync(
      `INSERT INTO cuota_mensual (id, compra_id, numero_cuota, monto_cuota, fecha_esperada, estado)
       VALUES (?, ?, ?, ?, ?, 'pendiente')`,
      [uid(), compraId, i + 1, montoCuota, fechaStr]
    );
  }
}

export async function obtenerCompras(): Promise<Compra[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Compra>(
    `SELECT * FROM compra
     WHERE estado = 'activa'
     ORDER BY fecha_compra DESC`
  );
}

export async function obtenerCompraConCuotas(
  compraId: string
): Promise<{ compra: Compra; cuotas: CuotaMensual[] } | null> {
  const db = await getDatabase();

  const compra = await db.getFirstAsync<Compra>(
    'SELECT * FROM compra WHERE id = ?',
    [compraId]
  );

  if (!compra) return null;

  const cuotas = await db.getAllAsync<CuotaMensual>(
    `SELECT * FROM cuota_mensual
     WHERE compra_id = ?
     ORDER BY numero_cuota ASC`,
    [compraId]
  );

  return { compra, cuotas };
}

export async function obtenerCuotasPendientesMes(
  anio: number,
  mes: number
): Promise<(CuotaMensual & { descripcion_compra: string; compra_tarjeta_version_id: string | null })[]> {
  const db = await getDatabase();
  const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-31`;

  return await db.getAllAsync(
    `SELECT cm.*, c.descripcion as descripcion_compra, c.tarjeta_version_id as compra_tarjeta_version_id
     FROM cuota_mensual cm
     JOIN compra c ON c.id = cm.compra_id
     WHERE cm.fecha_esperada BETWEEN ? AND ?
     AND cm.estado = 'pendiente'
     ORDER BY cm.fecha_esperada ASC`,
    [fechaInicio, fechaFin]
  );
}

export async function marcarCuotaPagada(cuotaId: string, cuentaLiquidezId?: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE cuota_mensual SET estado = 'pagada', fecha_pagada = ? WHERE id = ?`,
    [hoy(), cuotaId]
  );

  const cuota = await db.getFirstAsync<CuotaMensual>(
    'SELECT * FROM cuota_mensual WHERE id = ?',
    [cuotaId]
  );

  if (cuota) {
    // For crédito directo compras (no tarjeta), create a gasto movement from the account
    if (cuentaLiquidezId) {
      const compra = await db.getFirstAsync<{ tarjeta_version_id: string | null; descripcion: string; numero_cuota?: number }>(
        'SELECT tarjeta_version_id, descripcion FROM compra WHERE id = ?',
        [cuota.compra_id]
      );
      if (compra && !compra.tarjeta_version_id) {
        await crearMovimiento({
          tipo: 'gasto',
          monto: cuota.monto_cuota,
          fecha: hoy(),
          descripcion: `${compra.descripcion} (cuota ${cuota.numero_cuota})`,
          categoria: 'MSI',
          cuenta_id: cuentaLiquidezId,
        });
      }
    }

    const pendientes = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) as total FROM cuota_mensual WHERE compra_id = ? AND estado = 'pendiente'`,
      [cuota.compra_id]
    );

    if (pendientes?.total === 0) {
      await db.runAsync(
        `UPDATE compra SET estado = 'liquidada' WHERE id = ?`,
        [cuota.compra_id]
      );
    }
  }
}

export async function eliminarCompra(id: string): Promise<void> {
  const db = await getDatabase();
  const compra = await db.getFirstAsync<{ tarjeta_version_id: string | null; monto_total: number; fecha_compra: string }>(
    'SELECT tarjeta_version_id, monto_total, fecha_compra FROM compra WHERE id = ?',
    [id]
  );
  if (compra?.tarjeta_version_id) {
    await revertirSaldoPeriodo(compra.tarjeta_version_id, compra.monto_total, compra.fecha_compra);
  }
  await db.runAsync('DELETE FROM cuota_mensual WHERE compra_id = ?', [id]);
  await db.runAsync('DELETE FROM compra WHERE id = ?', [id]);
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

async function actualizarSaldoPeriodo(
  tarjetaVersionId: string,
  monto: number,
  fechaGasto: string
): Promise<void> {
  const db = await getDatabase();

  const periodo = await db.getFirstAsync<{ id: string }>(
    `SELECT pc.id FROM periodo_corte pc
     JOIN tarjeta_version tv ON tv.tarjeta_id = pc.tarjeta_id
     WHERE tv.id = ?
     AND pc.estado = 'abierto'
     AND pc.fecha_corte >= ?
     ORDER BY pc.fecha_corte ASC
     LIMIT 1`,
    [tarjetaVersionId, fechaGasto]
  );

  if (periodo) {
    await db.runAsync(
      `UPDATE periodo_corte SET saldo_calculado = saldo_calculado + ? WHERE id = ?`,
      [monto, periodo.id]
    );
  }
}

async function revertirSaldoPeriodo(
  tarjetaVersionId: string,
  monto: number,
  fechaGasto: string
): Promise<void> {
  const db = await getDatabase();

  const periodo = await db.getFirstAsync<{ id: string }>(
    `SELECT pc.id FROM periodo_corte pc
     JOIN tarjeta_version tv ON tv.tarjeta_id = pc.tarjeta_id
     WHERE tv.id = ?
     AND pc.fecha_corte >= ?
     ORDER BY pc.fecha_corte ASC
     LIMIT 1`,
    [tarjetaVersionId, fechaGasto]
  );

  if (periodo) {
    await db.runAsync(
      `UPDATE periodo_corte SET saldo_calculado = MAX(0, saldo_calculado - ?) WHERE id = ?`,
      [monto, periodo.id]
    );
  }
}
