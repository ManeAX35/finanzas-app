import { getDatabase, uid, hoy } from '../index';
import { GastoRecurrente, GastoRecurrenteVersion, InstanciaPago } from '../../types';

// ─────────────────────────────────────────
// CREAR RECURRENTE
// ─────────────────────────────────────────

export async function crearRecurrente(
  tipo: string,
  version: Omit<GastoRecurrenteVersion, 'id' | 'recurrente_id' | 'es_actual' | 'vigente_desde' | 'vigente_hasta' | 'created_at'>
): Promise<string> {
  const db = await getDatabase();
  const recurrenteId = uid();
  const versionId = uid();

  await db.runAsync(
    'INSERT INTO gasto_recurrente (id, tipo) VALUES (?, ?)',
    [recurrenteId, tipo]
  );

  await db.runAsync(
    `INSERT INTO gasto_recurrente_version
      (id, recurrente_id, tarjeta_version_id, nombre, monto, dia_cobro, frecuencia,
       categoria, es_domiciliado, monto_variable, es_actual, vigente_desde)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [versionId, recurrenteId, version.tarjeta_version_id ?? null,
     version.nombre, version.monto, version.dia_cobro, version.frecuencia,
     version.categoria ?? null, version.es_domiciliado, version.monto_variable, hoy()]
  );

  await generarInstanciasPago(recurrenteId, versionId, version.dia_cobro, version.frecuencia, version.monto);

  return recurrenteId;
}

// ─────────────────────────────────────────
// ACTUALIZAR RECURRENTE (SCD 2)
// ─────────────────────────────────────────

export async function actualizarRecurrente(
  recurrenteId: string,
  nuevaVersion: Omit<GastoRecurrenteVersion, 'id' | 'recurrente_id' | 'es_actual' | 'vigente_desde' | 'vigente_hasta' | 'created_at'>
): Promise<void> {
  const db = await getDatabase();
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = ayer.toISOString().slice(0, 10);

  // Cerrar versión actual
  await db.runAsync(
    `UPDATE gasto_recurrente_version
     SET es_actual = 0, vigente_hasta = ?
     WHERE recurrente_id = ? AND es_actual = 1`,
    [ayerStr, recurrenteId]
  );

  // Abrir nueva versión
  const versionId = uid();
  await db.runAsync(
    `INSERT INTO gasto_recurrente_version
      (id, recurrente_id, tarjeta_version_id, nombre, monto, dia_cobro, frecuencia,
       categoria, es_domiciliado, monto_variable, es_actual, vigente_desde)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [versionId, recurrenteId, nuevaVersion.tarjeta_version_id ?? null,
     nuevaVersion.nombre, nuevaVersion.monto, nuevaVersion.dia_cobro,
     nuevaVersion.frecuencia, nuevaVersion.categoria ?? null,
     nuevaVersion.es_domiciliado, nuevaVersion.monto_variable, hoy()]
  );

  await generarInstanciasPago(recurrenteId, versionId, nuevaVersion.dia_cobro, nuevaVersion.frecuencia, nuevaVersion.monto);
}

// ─────────────────────────────────────────
// OBTENER RECURRENTES
// ─────────────────────────────────────────

export async function obtenerRecurrentes(): Promise<GastoRecurrenteVersion[]> {
  const db = await getDatabase();
  return await db.getAllAsync<GastoRecurrenteVersion>(
    `SELECT grv.*
     FROM gasto_recurrente_version grv
     JOIN gasto_recurrente gr ON gr.id = grv.recurrente_id
     WHERE grv.es_actual = 1
     ORDER BY grv.dia_cobro ASC`
  );
}

export async function obtenerRecurrentesPorMes(
  anio: number,
  mes: number
): Promise<InstanciaPago[]> {
  const db = await getDatabase();
  const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-31`;

  return await db.getAllAsync<InstanciaPago>(
    `SELECT ip.*, grv.nombre, grv.monto as monto_esperado
     FROM instancia_pago ip
     JOIN gasto_recurrente_version grv ON grv.id = ip.recurrente_version_id
     WHERE ip.fecha_esperada BETWEEN ? AND ?
     ORDER BY ip.fecha_esperada ASC`,
    [fechaInicio, fechaFin]
  );
}

export async function obtenerHistorialRecurrente(
  recurrenteId: string
): Promise<GastoRecurrenteVersion[]> {
  const db = await getDatabase();
  return await db.getAllAsync<GastoRecurrenteVersion>(
    `SELECT * FROM gasto_recurrente_version
     WHERE recurrente_id = ?
     ORDER BY vigente_desde DESC`,
    [recurrenteId]
  );
}

// ─────────────────────────────────────────
// INSTANCIAS DE PAGO
// ─────────────────────────────────────────

async function generarInstanciasPago(
  recurrenteId: string,
  versionId: string,
  diaCobro: number,
  frecuencia: string,
  monto: number,
  mesesAdelante: number = 3
): Promise<void> {
  const db = await getDatabase();
  const saltoMeses: Record<string, number> = {
    mensual: 1,
    bimestral: 2,
    trimestral: 3,
    semestral: 6,
    anual: 12,
  };

  const salto = saltoMeses[frecuencia] ?? 1;

  for (let i = 0; i < mesesAdelante; i++) {
    const fecha = new Date();
    fecha.setDate(diaCobro);
    fecha.setMonth(fecha.getMonth() + i * salto);
    const fechaStr = fecha.toISOString().slice(0, 10);

    const existe = await db.getFirstAsync(
      `SELECT id FROM instancia_pago
       WHERE recurrente_version_id = ? AND fecha_esperada = ?`,
      [versionId, fechaStr]
    );

    if (!existe) {
      await db.runAsync(
        `INSERT INTO instancia_pago (id, recurrente_version_id, fecha_esperada, monto_cobrado, estado)
         VALUES (?, ?, ?, ?, 'esperado')`,
        [uid(), versionId, fechaStr, monto]
      );
    }
  }
}

export async function marcarInstanciaPagada(
  instanciaId: string,
  montoCobrado: number,
  notas?: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE instancia_pago
     SET estado = 'pagado', fecha_real_cobro = ?, monto_cobrado = ?, notas = ?
     WHERE id = ?`,
    [hoy(), montoCobrado, notas ?? null, instanciaId]
  );
}

export async function marcarInstanciaFallida(
  instanciaId: string,
  notas?: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE instancia_pago
     SET estado = 'fallido', notas = ?
     WHERE id = ?`,
    [notas ?? null, instanciaId]
  );
}

export async function eliminarRecurrente(recurrenteId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE gasto_recurrente_version
     SET es_actual = 0, vigente_hasta = ?
     WHERE recurrente_id = ?`,
    [hoy(), recurrenteId]
  );
}