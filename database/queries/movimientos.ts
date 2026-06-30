import { getDatabase, uid } from '../index';
import { MovimientoLiquidez } from '../../types';

export type NuevoMovimiento = {
  tipo: 'ingreso' | 'gasto' | 'transferencia';
  monto: number;
  fecha: string;
  descripcion?: string;
  categoria?: string;
  cuenta_id?: string;
  tarjeta_version_id?: string;
  cuenta_destino_id?: string;
  inversion_id?: string;
  compra_id?: string;
  recurrente_id?: string;
  es_msi?: number;
  notas?: string;
};

export async function crearMovimiento(mov: NuevoMovimiento): Promise<string> {
  const db = await getDatabase();
  const id = uid();

  await db.runAsync(
    `INSERT INTO movimiento
      (id, tipo, monto, fecha, descripcion, categoria, cuenta_id, tarjeta_version_id,
       cuenta_destino_id, inversion_id, compra_id, recurrente_id, es_msi, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, mov.tipo, mov.monto, mov.fecha,
      mov.descripcion ?? null, mov.categoria ?? null,
      mov.cuenta_id ?? null, mov.tarjeta_version_id ?? null,
      mov.cuenta_destino_id ?? null, mov.inversion_id ?? null,
      mov.compra_id ?? null, mov.recurrente_id ?? null,
      mov.es_msi ?? 0, mov.notas ?? null,
    ]
  );

  return id;
}

export async function eliminarMovimiento(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM movimiento WHERE id = ?', [id]);
}

export async function obtenerMovimientosPorCuenta(
  cuentaId: string,
  limite: number = 50
): Promise<MovimientoLiquidez[]> {
  const db = await getDatabase();
  return await db.getAllAsync<MovimientoLiquidez>(
    `SELECT * FROM movimiento
     WHERE cuenta_id = ? OR cuenta_destino_id = ?
     ORDER BY fecha DESC, created_at DESC
     LIMIT ?`,
    [cuentaId, cuentaId, limite]
  );
}

export async function obtenerMovimientosPorMes(
  anio: number,
  mes: number
): Promise<MovimientoLiquidez[]> {
  const db = await getDatabase();
  const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-31`;

  return await db.getAllAsync<MovimientoLiquidez>(
    `SELECT * FROM movimiento
     WHERE fecha BETWEEN ? AND ?
     ORDER BY fecha DESC`,
    [fechaInicio, fechaFin]
  );
}

export async function calcularSaldoCuenta(cuentaId: string): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ saldo: number }>(
    `SELECT COALESCE(SUM(CASE
       WHEN tipo = 'ingreso' THEN monto
       WHEN tipo = 'gasto' AND cuenta_id = ? THEN -monto
       WHEN tipo = 'transferencia' AND cuenta_id = ? THEN -monto
       WHEN tipo = 'transferencia' AND cuenta_destino_id = ? THEN monto
       ELSE 0
     END), 0) as saldo
     FROM movimiento
     WHERE cuenta_id = ? OR cuenta_destino_id = ?`,
    [cuentaId, cuentaId, cuentaId, cuentaId, cuentaId]
  );
  return result?.saldo ?? 0;
}

export async function obtenerTotalDisponible(): Promise<number> {
  const db = await getDatabase();
  const cuentas = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM cuenta_liquidez WHERE activa = 1'
  );
  let total = 0;
  for (const c of cuentas) {
    total += await calcularSaldoCuenta(c.id);
  }
  return total;
}
