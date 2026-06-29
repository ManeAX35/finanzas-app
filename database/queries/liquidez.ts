import { getDatabase, uid, hoy } from '../index';
import { CuentaLiquidez, MovimientoLiquidez } from '../../types';

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
  const db = await getDatabase();

  const result = await db.getFirstAsync<{ saldo: number }>(
    `SELECT COALESCE(SUM(
       CASE
         WHEN tipo = 'ingreso' THEN monto
         WHEN tipo = 'gasto' THEN -monto
         ELSE 0
       END
     ), 0) as saldo
     FROM movimiento_liquidez
     WHERE cuenta_id = ?`,
    [cuentaId]
  );

  return result?.saldo ?? 0;
}
export async function obtenerSaldosTodos(): Promise<{ id: string; nombre: string; saldo: number }[]> {
  const db = await getDatabase();
  const cuentas = await obtenerCuentasLiquidez();

  const resultados = await Promise.all(
    cuentas.map(async (c) => ({
      id: c.id,
      nombre: c.nombre,
      saldo: await obtenerSaldoCuenta(c.id),
    }))
  );

  return resultados;
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
// MOVIMIENTOS
// ─────────────────────────────────────────

export async function crearMovimiento(
  movimiento: Omit<MovimientoLiquidez, 'id' | 'created_at'>
): Promise<string> {
  const db = await getDatabase();

  if (movimiento.tipo === 'transferencia' && movimiento.cuenta_destino_id) {
    const idOrigen = uid();
    const idDestino = uid();

    const sql = `INSERT INTO movimiento_liquidez (id, cuenta_id, tipo, monto, fecha, descripcion, categoria, cuenta_destino_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    const paramsOrigen: (string | number | null)[] = [
      idOrigen,
      movimiento.cuenta_id ?? null,
      'gasto',
      movimiento.monto ?? null,
      movimiento.fecha ?? null,
      movimiento.descripcion ?? null,
      movimiento.categoria ?? null,
      movimiento.cuenta_destino_id ?? null,
    ];

    const paramsDestino: (string | number | null)[] = [
      idDestino,
      movimiento.cuenta_destino_id ?? null,
      'ingreso',
      movimiento.monto ?? null,
      movimiento.fecha ?? null,
      movimiento.descripcion ?? null,
      movimiento.categoria ?? null,
      movimiento.cuenta_id ?? null,
    ];

    await db.runAsync(sql, paramsOrigen);
    await db.runAsync(sql, paramsDestino);

    return idOrigen;
  }

  const id = uid();
  await db.runAsync(
    `INSERT INTO movimiento_liquidez
      (id, cuenta_id, tipo, monto, fecha, descripcion, categoria, cuenta_destino_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, movimiento.cuenta_id ?? null, movimiento.tipo ?? null, movimiento.monto ?? null,
     movimiento.fecha ?? null, movimiento.descripcion ?? null,
     movimiento.categoria ?? null, movimiento.cuenta_destino_id ?? null]
  );

  return id;
}

export async function obtenerMovimientos(
  cuentaId: string,
  limite: number = 50
): Promise<MovimientoLiquidez[]> {
  const db = await getDatabase();
  return await db.getAllAsync<MovimientoLiquidez>(
    `SELECT * FROM movimiento_liquidez
     WHERE cuenta_id = ?
     ORDER BY fecha DESC, created_at DESC
     LIMIT ?`,
    [cuentaId, limite]
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
    `SELECT * FROM movimiento_liquidez
     WHERE fecha BETWEEN ? AND ?
     ORDER BY fecha DESC`,
    [fechaInicio, fechaFin]
  );
}

export async function eliminarMovimiento(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM movimiento_liquidez WHERE id = ?', [id]);
}

// ─────────────────────────────────────────
// TOTAL DISPONIBLE
// ─────────────────────────────────────────

export async function obtenerTotalDisponible(): Promise<number> {
  const saldos = await obtenerSaldosTodos();
  return saldos.reduce((sum, c) => sum + c.saldo, 0);
}