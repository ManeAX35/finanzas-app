import { getDatabase, uid } from '../index';
import { CuentaLiquidez, MovimientoLiquidez } from '../../types';
import {
  crearMovimiento as _crearMovimiento,
  eliminarMovimiento as _eliminarMovimiento,
  obtenerMovimientosPorCuenta,
  obtenerMovimientosPorMes as _obtenerMovimientosPorMes,
  calcularSaldoCuenta,
  obtenerTotalDisponible as _obtenerTotalDisponible,
} from './movimientos';

// ─────────────────────────────────────────
// CUENTAS DE LIQUIDEZ
// ─────────────────────────────────────────

export async function crearCuentaLiquidez(
  cuenta: Omit<CuentaLiquidez, 'id' | 'activa' | 'created_at'>
): Promise<string> {
  const db = await getDatabase();
  const id = uid();

  await db.runAsync(
    `INSERT INTO cuenta_liquidez (id, nombre, tipo, institucion, color, activa)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [id, cuenta.nombre, cuenta.tipo, cuenta.institucion ?? null, cuenta.color]
  );

  return id;
}

export async function obtenerCuentasLiquidez(): Promise<CuentaLiquidez[]> {
  const db = await getDatabase();
  return await db.getAllAsync<CuentaLiquidez>(
    `SELECT * FROM cuenta_liquidez
     WHERE activa = 1
     ORDER BY nombre ASC`
  );
}

export async function obtenerSaldoCuenta(cuentaId: string): Promise<number> {
  return calcularSaldoCuenta(cuentaId);
}

export async function obtenerSaldosTodos(): Promise<{ id: string; nombre: string; saldo: number }[]> {
  const cuentas = await obtenerCuentasLiquidez();

  return await Promise.all(
    cuentas.map(async (c) => ({
      id: c.id,
      nombre: c.nombre,
      saldo: await calcularSaldoCuenta(c.id),
    }))
  );
}

export async function actualizarCuentaLiquidez(
  id: string,
  datos: Partial<Pick<CuentaLiquidez, 'nombre' | 'tipo' | 'institucion' | 'color'>>
): Promise<void> {
  const db = await getDatabase();
  const campos = Object.keys(datos).map(k => `${k} = ?`).join(', ');
  const valores = [...Object.values(datos), id];

  await db.runAsync(
    `UPDATE cuenta_liquidez SET ${campos} WHERE id = ?`,
    valores
  );
}

export async function eliminarCuentaLiquidez(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE cuenta_liquidez SET activa = 0 WHERE id = ?',
    [id]
  );
}

// ─────────────────────────────────────────
// MOVIMIENTOS — redirigen a movimientos.ts
// ─────────────────────────────────────────

export async function crearMovimiento(
  movimiento: Omit<MovimientoLiquidez, 'id' | 'created_at'>
): Promise<string> {
  return _crearMovimiento({
    tipo: movimiento.tipo,
    monto: movimiento.monto,
    fecha: movimiento.fecha,
    descripcion: movimiento.descripcion,
    categoria: movimiento.categoria,
    cuenta_id: movimiento.cuenta_id,
    cuenta_destino_id: movimiento.cuenta_destino_id,
  });
}

export async function obtenerMovimientos(
  cuentaId: string,
  limite: number = 50
): Promise<MovimientoLiquidez[]> {
  return obtenerMovimientosPorCuenta(cuentaId, limite);
}

export async function obtenerMovimientosPorMes(
  anio: number,
  mes: number
): Promise<MovimientoLiquidez[]> {
  return _obtenerMovimientosPorMes(anio, mes);
}

export async function eliminarMovimiento(id: string): Promise<void> {
  return _eliminarMovimiento(id);
}

export async function obtenerTotalDisponible(): Promise<number> {
  return _obtenerTotalDisponible();
}
