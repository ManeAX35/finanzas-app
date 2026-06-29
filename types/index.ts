// ─────────────────────────────────────────
// LIQUIDEZ
// ─────────────────────────────────────────

export interface CuentaLiquidez {
  id: string;
  nombre: string;
  tipo: 'debito' | 'digital' | 'efectivo' | 'monedero';
  institucion?: string;
  color: string;
  activa: number;
  created_at: string;
}

export interface MovimientoLiquidez {
  id: string;
  cuenta_id: string;
  tipo: 'ingreso' | 'gasto' | 'transferencia';
  monto: number;
  fecha: string;
  descripcion?: string;
  categoria?: string;
  cuenta_destino_id?: string;
  created_at: string;
}

// ─────────────────────────────────────────
// TARJETAS
// ─────────────────────────────────────────

export interface Tarjeta {
  id: string;
  tipo: 'bancaria' | 'departamental';
  created_at: string;
}

export interface TarjetaVersion {
  id: string;
  tarjeta_id: string;
  banco: string;
  nombre: string;
  digitos?: string;
  limite_credito: number;
  dia_corte: number;
  dias_pago: number;
  tasa_anual: number;
  color: string;
  es_actual: number;
  vigente_desde: string;
  vigente_hasta?: string;
  created_at: string;
}

export interface TarjetaConVersion extends TarjetaVersion {
  tipo: 'bancaria' | 'departamental';
}

export interface PeriodoCorte {
  id: string;
  tarjeta_id: string;
  fecha_corte: string;
  fecha_limite_pago: string;
  saldo_calculado: number;
  estado: 'abierto' | 'cerrado' | 'pagado';
  monto_pagado?: number;
  fecha_pago_real?: string;
  created_at: string;
}

// ─────────────────────────────────────────
// GASTOS
// ─────────────────────────────────────────

export interface Gasto {
  id: string;
  tarjeta_version_id?: string;
  cuenta_liquidez_id?: string;
  descripcion: string;
  monto: number;
  fecha: string;
  categoria?: string;
  notas?: string;
  created_at: string;
}

// ─────────────────────────────────────────
// COMPRAS A MSI
// ─────────────────────────────────────────

export interface Compra {
  id: string;
  tarjeta_version_id?: string;
  descripcion: string;
  monto_total: number;
  meses: number;
  fecha_compra: string;
  categoria?: string;
  origen: 'tarjeta' | 'credito_directo' | 'departamental';
  notas?: string;
  estado: 'activa' | 'liquidada';
  created_at: string;
}

export interface CuotaMensual {
  id: string;
  compra_id: string;
  numero_cuota: number;
  monto_cuota: number;
  fecha_esperada: string;
  fecha_pagada?: string;
  estado: 'pendiente' | 'pagada' | 'vencida';
  created_at: string;
}

// ─────────────────────────────────────────
// RECURRENTES Y DOMICILIADOS
// ─────────────────────────────────────────

export interface GastoRecurrente {
  id: string;
  tipo: string;
  created_at: string;
}

export interface GastoRecurrenteVersion {
  id: string;
  recurrente_id: string;
  tarjeta_version_id?: string;
  cuenta_liquidez_id?: string;
  nombre: string;
  monto: number;
  dia_cobro: number;
  frecuencia: 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';
  categoria?: string;
  es_domiciliado: number;
  monto_variable: number;
  es_actual: number;
  vigente_desde: string;
  vigente_hasta?: string;
  created_at: string;
}

export interface InstanciaPago {
  id: string;
  recurrente_version_id: string;
  fecha_esperada: string;
  fecha_real_cobro?: string;
  monto_cobrado?: number;
  estado: 'esperado' | 'pagado' | 'fallido' | 'omitido';
  notas?: string;
  created_at: string;
}

// ─────────────────────────────────────────
// INVERSIONES
// ─────────────────────────────────────────

export interface CuentaInversion {
  id: string;
  institucion: string;
  nombre: string;
  created_at: string;
}

export interface CuentaInversionVersion {
  id: string;
  cuenta_id: string;
  tasa_anual: number;
  frecuencia_rendimiento: 'diario' | 'mensual' | 'trimestral' | 'al_vencimiento';
  saldo_inicial: number;
  fecha_inicio: string;
  es_actual: number;
  vigente_desde: string;
  vigente_hasta?: string;
  created_at: string;
}

export interface MovimientoInversion {
  id: string;
  cuenta_version_id: string;
  tipo: 'deposito' | 'retiro' | 'rendimiento';
  monto: number;
  fecha: string;
  saldo_resultante: number;
  notas?: string;
  created_at: string;
}

// ─────────────────────────────────────────
// SNAPSHOTS
// ─────────────────────────────────────────

export interface SaldoSnapshot {
  id: string;
  tarjeta_id: string;
  fecha_snapshot: string;
  saldo_calculado: number;
  limite_vigente: number;
  porcentaje_uso: number;
  trigger_evento?: string;
  created_at: string;
}

export interface RendimientoSnapshot {
  id: string;
  cuenta_id: string;
  fecha_snapshot: string;
  saldo_esperado: number;
  saldo_real: number;
  rendimiento_acumulado: number;
  created_at: string;
}

// ─────────────────────────────────────────
// VISTAS CALCULADAS (no son tablas)
// ─────────────────────────────────────────

export interface ResumenMensual {
  totalDisponible: number;
  totalDeuda: number;
  totalRecurrentes: number;
  totalMSI: number;
  neto: number;
  tarjetas: ResumenTarjeta[];
}

export interface ResumenTarjeta {
  tarjeta_id: string;
  nombre: string;
  banco: string;
  tipo: string;
  color: string;
  limite: number;
  saldoUsado: number;
  porcentajeUso: number;
  proximoCorte: string;
  diasParaCorte: number;
  fechaLimitePago: string;
  periodoActual: PeriodoCorte | null;
}