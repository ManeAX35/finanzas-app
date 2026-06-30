import { getDatabase, uid, hoy } from '../index';
import { GastoRecurrente, GastoRecurrenteVersion, InstanciaPago } from '../../types';
import { sumarSaldoTarjetaPorVersion } from './tarjetas';

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

  const pvCreate: (string | number | null)[] = [
    versionId, recurrenteId,
    version.tarjeta_version_id ?? null,
    version.cuenta_liquidez_id ?? null,
    version.nombre ?? '',
    Number(version.monto) || 0,
    Number(version.dia_cobro) || 1,
    version.frecuencia ?? 'mensual',
    version.categoria ?? null,
    Number(version.es_domiciliado) || 0,
    Number(version.monto_variable) || 0,
    hoy(),
  ];
  await db.runAsync(
    `INSERT INTO gasto_recurrente_version
      (id, recurrente_id, tarjeta_version_id, cuenta_liquidez_id, nombre, monto, dia_cobro, frecuencia,
       categoria, es_domiciliado, monto_variable, es_actual, vigente_desde)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    pvCreate
  );

  await generarInstanciasPago(recurrenteId, versionId, Number(version.dia_cobro) || 1, version.frecuencia ?? 'mensual', Number(version.monto) || 0);

  return recurrenteId;
}

// ─────────────────────────────────────────
// ACTUALIZAR RECURRENTE (SCD2 o UPDATE in-place)
// ─────────────────────────────────────────

export async function actualizarRecurrente(
  recurrenteId: string,
  nuevaVersion: Omit<GastoRecurrenteVersion, 'id' | 'recurrente_id' | 'es_actual' | 'vigente_desde' | 'vigente_hasta' | 'created_at'>
): Promise<void> {
  const db = await getDatabase();

  const mesActual = hoy().slice(0, 7); // YYYY-MM
  const versionActual = await db.getFirstAsync<{ id: string; vigente_desde: string }>(
    `SELECT id, vigente_desde FROM gasto_recurrente_version WHERE recurrente_id = ? AND es_actual = 1`,
    [recurrenteId]
  );

  if (versionActual && versionActual.vigente_desde.startsWith(mesActual)) {
    // Creado este mes: corrección in-place, sin nueva versión SCD2
    await db.runAsync(
      `UPDATE gasto_recurrente_version
       SET tarjeta_version_id = ?, cuenta_liquidez_id = ?, nombre = ?, monto = ?,
           dia_cobro = ?, frecuencia = ?, categoria = ?, es_domiciliado = ?, monto_variable = ?
       WHERE id = ?`,
      [
        nuevaVersion.tarjeta_version_id ?? null,
        nuevaVersion.cuenta_liquidez_id ?? null,
        nuevaVersion.nombre ?? '',
        Number(nuevaVersion.monto) || 0,
        Number(nuevaVersion.dia_cobro) || 1,
        nuevaVersion.frecuencia ?? 'mensual',
        nuevaVersion.categoria ?? null,
        Number(nuevaVersion.es_domiciliado) || 0,
        Number(nuevaVersion.monto_variable) || 0,
        versionActual.id,
      ]
    );
    await generarInstanciasPago(recurrenteId, versionActual.id, Number(nuevaVersion.dia_cobro) || 1, nuevaVersion.frecuencia ?? 'mensual', Number(nuevaVersion.monto) || 0);
  } else {
    // Creado en mes anterior: SCD2 normal
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = ayer.toISOString().slice(0, 10);

    await db.runAsync(
      `UPDATE gasto_recurrente_version
       SET es_actual = 0, vigente_hasta = ?
       WHERE recurrente_id = ? AND es_actual = 1`,
      [ayerStr, recurrenteId]
    );

    const versionId = uid();
    const pvUpdate: (string | number | null)[] = [
      versionId, recurrenteId,
      nuevaVersion.tarjeta_version_id ?? null,
      nuevaVersion.cuenta_liquidez_id ?? null,
      nuevaVersion.nombre ?? '',
      Number(nuevaVersion.monto) || 0,
      Number(nuevaVersion.dia_cobro) || 1,
      nuevaVersion.frecuencia ?? 'mensual',
      nuevaVersion.categoria ?? null,
      Number(nuevaVersion.es_domiciliado) || 0,
      Number(nuevaVersion.monto_variable) || 0,
      hoy(),
    ];
    await db.runAsync(
      `INSERT INTO gasto_recurrente_version
        (id, recurrente_id, tarjeta_version_id, cuenta_liquidez_id, nombre, monto, dia_cobro, frecuencia,
         categoria, es_domiciliado, monto_variable, es_actual, vigente_desde)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      pvUpdate
    );

    await generarInstanciasPago(recurrenteId, versionId, Number(nuevaVersion.dia_cobro) || 1, nuevaVersion.frecuencia ?? 'mensual', Number(nuevaVersion.monto) || 0);
  }
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
     LEFT JOIN gasto_recurrente_version grv ON grv.id = ip.recurrente_version_id
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

    const mesStr = fechaStr.slice(0, 7); // YYYY-MM
    const existe = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM instancia_pago
       WHERE recurrente_version_id = ? AND strftime('%Y-%m', fecha_esperada) = ?`,
      [versionId, mesStr]
    );

    if (existe) {
      await db.runAsync(
        `UPDATE instancia_pago SET monto_cobrado = ?, fecha_esperada = ? WHERE id = ? AND estado = 'esperado'`,
        [Number(monto) || 0, fechaStr, existe.id]
      );
    } else {
      const piParams: (string | number | null)[] = [uid(), versionId ?? null, fechaStr ?? hoy(), Number(monto) || 0];
      await db.runAsync(
        `INSERT INTO instancia_pago (id, recurrente_version_id, fecha_esperada, monto_cobrado, estado)
         VALUES (?, ?, ?, ?, 'esperado')`,
        piParams
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

  const instancia = await db.getFirstAsync<{ recurrente_version_id: string }>(
    'SELECT recurrente_version_id FROM instancia_pago WHERE id = ?',
    [instanciaId]
  );
  if (!instancia) return;

  const rv = await db.getFirstAsync<{ tarjeta_version_id: string | null; cuenta_liquidez_id: string | null; nombre: string; recurrente_id: string }>(
    'SELECT tarjeta_version_id, cuenta_liquidez_id, nombre, recurrente_id FROM gasto_recurrente_version WHERE id = ?',
    [instancia.recurrente_version_id]
  );
  if (!rv) return;

  const monto = Number(montoCobrado) || 0;

  if (rv.tarjeta_version_id) {
    await sumarSaldoTarjetaPorVersion(rv.tarjeta_version_id, monto);
  } else if (rv.cuenta_liquidez_id) {
    const { crearMovimiento } = await import('./movimientos');
    await crearMovimiento({
      cuenta_id: rv.cuenta_liquidez_id,
      tipo: 'gasto',
      monto,
      fecha: hoy(),
      descripcion: rv.nombre,
      categoria: 'Recurrente',
      recurrente_id: rv.recurrente_id,
    });
  }
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