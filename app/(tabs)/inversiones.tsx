import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Modal, TextInput,
  RefreshControl, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  obtenerCuentasInversion, crearCuentaInversion,
  calcularRendimientoHoy, registrarMovimientoInversion,
  eliminarCuentaInversion, eliminarMovimientoInversion, actualizarTasaInversion,
  obtenerMovimientosInversion, transferirCuentaAInversion,
  transferirInversionACuenta, acumularRendimientosPendientes
} from '../../database/queries/inversiones';
import { obtenerCuentasLiquidez } from '../../database/queries/liquidez';
import { formatMXN, hoy } from '../../database';
import Header from '../../components/Header';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';

const FRECUENCIAS = ['diario', 'mensual', 'trimestral', 'al_vencimiento'];

const FORM_INICIAL = {
  institucion: '', nombre: '', tasa_anual: '',
  frecuencia_rendimiento: 'mensual', saldo_inicial: '',
  fecha_inicio: hoy(),
};

export default function InversionesScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [cuentas, setCuentas] = useState<any[]>([]);
  const [cuentasLiquidez, setCuentasLiquidezState] = useState<any[]>([]);
  const [rendimientos, setRendimientos] = useState<Record<string, any>>({});
  const [movimientos, setMovimientos] = useState<Record<string, any[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [modalNueva, setModalNueva] = useState(false);
  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [modalTasa, setModalTasa] = useState(false);
  const [modalTransferencia, setModalTransferencia] = useState(false);
  const [tipoTransferencia, setTipoTransferencia] = useState<'cuentaAInversion' | 'inversionACuenta'>('cuentaAInversion');
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [formMov, setFormMov] = useState({ tipo: 'deposito', monto: '', notas: '' });
  const [nuevaTasa, setNuevaTasa] = useState('');
  const [formTransferencia, setFormTransferencia] = useState({ monto: '', cuenta_liquidez_id: '', notas: '' });

  const cargarDatos = async () => {
    try {
      await acumularRendimientosPendientes();
      const [lista, liquidez] = await Promise.all([
        obtenerCuentasInversion(),
        obtenerCuentasLiquidez(),
      ]);
      setCuentas(lista);
      setCuentasLiquidezState(liquidez);
      const rends: Record<string, any> = {};
      const movs: Record<string, any[]> = {};
      for (const c of lista) {
        rends[c.id] = await calcularRendimientoHoy(c.id);
        movs[c.id] = await obtenerMovimientosInversion(c.id, 5);
      }
      setRendimientos(rends);
      setMovimientos(movs);
    } catch (e) {
      console.error('[inversiones ERROR]', e);
      Alert.alert('Error cargando inversiones', String(e));
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { cargarDatos(); }, []));

  const guardarNueva = async () => {
    if (!form.institucion || !form.nombre || !form.tasa_anual) {
      Alert.alert('Campos requeridos', 'Institución, nombre y tasa son obligatorios.');
      return;
    }
    const tasa = parseFloat(form.tasa_anual);
    if (isNaN(tasa) || tasa <= 0) {
      Alert.alert('Monto inválido', 'La tasa anual debe ser mayor a 0.');
      return;
    }
    try {
      await crearCuentaInversion(
        { institucion: form.institucion, nombre: form.nombre },
        {
          tasa_anual: parseFloat(form.tasa_anual),
          frecuencia_rendimiento: form.frecuencia_rendimiento as any,
          saldo_inicial: parseFloat(form.saldo_inicial) || 0,
          fecha_inicio: form.fecha_inicio,
        }
      );
      setModalNueva(false);
      setForm(FORM_INICIAL);
      cargarDatos();
    } catch (e) { Alert.alert('Error', String(e)); }
  };

  const guardarMovimiento = async () => {
    const monto = parseFloat(formMov.monto);
    if (!cuentaSeleccionada || !formMov.monto || isNaN(monto) || monto <= 0) {
      Alert.alert('Monto inválido', 'El monto debe ser mayor a 0.');
      return;
    }
    try {
      await registrarMovimientoInversion(cuentaSeleccionada, formMov.tipo as any, parseFloat(formMov.monto), formMov.notas || undefined);
      setModalMovimiento(false);
      setFormMov({ tipo: 'deposito', monto: '', notas: '' });
      cargarDatos();
    } catch (e) { Alert.alert('Error', String(e)); }
  };

  const guardarNuevaTasa = async () => {
    const tasa = parseFloat(nuevaTasa);
    if (!cuentaSeleccionada || !nuevaTasa || isNaN(tasa) || tasa <= 0) {
      Alert.alert('Monto inválido', 'La tasa debe ser mayor a 0.');
      return;
    }
    try {
      await actualizarTasaInversion(cuentaSeleccionada, parseFloat(nuevaTasa));
      setModalTasa(false);
      setNuevaTasa('');
      cargarDatos();
    } catch (e) { Alert.alert('Error', String(e)); }
  };

  const guardarTransferencia = async () => {
    const monto = parseFloat(formTransferencia.monto);
    if (!formTransferencia.cuenta_liquidez_id || !cuentaSeleccionada || !formTransferencia.monto || isNaN(monto) || monto <= 0) {
      Alert.alert('Campos requeridos', 'Monto válido y cuenta son obligatorios.');
      return;
    }
    try {
      if (tipoTransferencia === 'cuentaAInversion') {
        await transferirCuentaAInversion(formTransferencia.cuenta_liquidez_id, cuentaSeleccionada, parseFloat(formTransferencia.monto), formTransferencia.notas || undefined);
      } else {
        await transferirInversionACuenta(cuentaSeleccionada, formTransferencia.cuenta_liquidez_id, parseFloat(formTransferencia.monto), formTransferencia.notas || undefined);
      }
      setModalTransferencia(false);
      setFormTransferencia({ monto: '', cuenta_liquidez_id: '', notas: '' });
      cargarDatos();
    } catch (e) { Alert.alert('Error', String(e)); }
  };

  const eliminarMov = (id: string) => {
    Alert.alert('Eliminar movimiento', '¿Eliminar este movimiento?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await eliminarMovimientoInversion(id); cargarDatos(); } },
    ]);
  };

  const eliminar = (id: string, nombre: string) => {
    Alert.alert('Eliminar', `¿Eliminar ${nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await eliminarCuentaInversion(id); cargarDatos(); } },
    ]);
  };

  const totalInversiones = Object.values(rendimientos).reduce((s, r) => s + (r?.saldoReal ?? 0), 0);
  const totalRendimientoHoy = Object.values(rendimientos).reduce((s, r) => s + (r?.rendimientoHoy ?? 0), 0);

  return (
    <View style={styles.container}>
      <Header title="Inversiones" subtitle={`+${formatMXN(totalRendimientoHoy)} hoy`} />

      {cuentas.length > 0 && (
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total en inversiones</Text>
          <Text style={styles.totalValor}>{formatMXN(totalInversiones)}</Text>
          <Text style={styles.totalSub}>Rendimiento estimado hoy: +{formatMXN(totalRendimientoHoy)}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargarDatos(); }} />}
      >
        {cuentas.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trending-up-outline" size={48} color={theme.border} />
            <Text style={styles.emptyTitle}>Sin inversiones</Text>
            <Text style={styles.emptyText}>Agrega tus cuentas de inversión para ver su rendimiento</Text>
          </View>
        ) : cuentas.map(c => {
          const rend = rendimientos[c.id];
          const movs = movimientos[c.id] ?? [];
          const isExpanded = expandida === c.id;
          const rendAcumulado = rend?.rendimientoAcumulado ?? 0;
          return (
            <View key={c.id} style={styles.card}>
              <TouchableOpacity onPress={() => setExpandida(isExpanded ? null : c.id)}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardIcon}>
                    <Ionicons name="trending-up-outline" size={20} color={theme.secondary} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardNombre}>{c.nombre}</Text>
                    <Text style={styles.cardInstitucion}>{c.institucion} · {c.tasa_anual}% anual</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.cardSaldo}>{formatMXN(rend?.saldoReal ?? c.saldo_inicial)}</Text>
                    <Text style={styles.cardSaldoLabel}>real</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.expanded}>
                  <View style={styles.expandedMetrics}>
                    <View style={styles.expandedMetric}>
                      <Text style={styles.expandedLabel}>Rendimiento acumulado</Text>
                      <Text style={[styles.expandedValor, { color: rendAcumulado >= 0 ? theme.success : theme.danger }]}>
                        +{formatMXN(rendAcumulado)}
                      </Text>
                    </View>
                    <View style={styles.expandedMetric}>
                      <Text style={styles.expandedLabel}>Rendimiento hoy</Text>
                      <Text style={[styles.expandedValor, { color: theme.success }]}>+{formatMXN(rend?.rendimientoHoy ?? 0)}</Text>
                    </View>
                    <View style={styles.expandedMetric}>
                      <Text style={styles.expandedLabel}>Frecuencia</Text>
                      <Text style={styles.expandedValor}>{c.frecuencia_rendimiento}</Text>
                    </View>
                    <View style={styles.expandedMetric}>
                      <Text style={styles.expandedLabel}>Desde</Text>
                      <Text style={styles.expandedValor}>{c.fecha_inicio}</Text>
                    </View>
                  </View>

                  <View style={styles.expandedActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => { setCuentaSeleccionada(c.id); setFormMov({ ...formMov, tipo: 'deposito' }); setModalMovimiento(true); }}>
                      <Ionicons name="arrow-down-outline" size={14} color={theme.success} />
                      <Text style={[styles.actionText, { color: theme.success }]}>Depositar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => { setCuentaSeleccionada(c.id); setFormMov({ ...formMov, tipo: 'retiro' }); setModalMovimiento(true); }}>
                      <Ionicons name="arrow-up-outline" size={14} color={theme.danger} />
                      <Text style={[styles.actionText, { color: theme.danger }]}>Retirar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => { setCuentaSeleccionada(c.id); setTipoTransferencia('cuentaAInversion'); setFormTransferencia({ monto: '', cuenta_liquidez_id: '', notas: '' }); setModalTransferencia(true); }}>
                      <Ionicons name="arrow-down-circle-outline" size={14} color="#3B82F6" />
                      <Text style={[styles.actionText, { color: '#3B82F6' }]}>Desde cuenta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => { setCuentaSeleccionada(c.id); setTipoTransferencia('inversionACuenta'); setFormTransferencia({ monto: '', cuenta_liquidez_id: '', notas: '' }); setModalTransferencia(true); }}>
                      <Ionicons name="arrow-up-circle-outline" size={14} color="#F97316" />
                      <Text style={[styles.actionText, { color: '#F97316' }]}>A cuenta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => { setCuentaSeleccionada(c.id); setNuevaTasa(String(c.tasa_anual)); setModalTasa(true); }}>
                      <Ionicons name="pencil-outline" size={14} color={theme.secondary} />
                      <Text style={[styles.actionText, { color: theme.secondary }]}>Editar tasa</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => eliminar(c.id, c.nombre)}>
                      <Ionicons name="trash-outline" size={14} color={theme.textSecondary} />
                      <Text style={[styles.actionText, { color: theme.textSecondary }]}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>

                  {movs.length > 0 && (
                    <View style={styles.movimientos}>
                      <Text style={styles.movTitle}>Últimos movimientos</Text>
                      {movs.map((m: any) => (
                        <View key={m.id} style={styles.movRow}>
                          <View style={styles.movLeft}>
                            <Ionicons
                              name={m.tipo === 'deposito' ? 'arrow-down-circle-outline' : m.tipo === 'retiro' ? 'arrow-up-circle-outline' : 'star-outline'}
                              size={14}
                              color={m.tipo === 'deposito' ? theme.success : m.tipo === 'retiro' ? theme.danger : theme.secondary}
                            />
                            <Text style={styles.movTipo}>{m.tipo}</Text>
                            <Text style={styles.movFecha}>{m.fecha}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[styles.movMonto, { color: m.tipo === 'retiro' ? theme.danger : theme.success }]}>
                              {m.tipo === 'retiro' ? '−' : '+'}{formatMXN(m.monto)}
                            </Text>
                            <TouchableOpacity onPress={() => eliminarMov(m.id)}>
                              <Ionicons name="trash-outline" size={12} color={theme.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.bottomBtn} onPress={() => setModalNueva(true)}>
          <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
          <Text style={styles.bottomBtnText}>Agregar inversión</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modalNueva} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalNueva(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nueva inversión</Text>
            <TouchableOpacity onPress={() => setModalNueva(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            {[
              { label: 'Institución', key: 'institucion', placeholder: 'GBM, Nu, CETES...' },
              { label: 'Nombre / apodo', key: 'nombre', placeholder: 'Mi CETE, Fondo GBM...' },
              { label: 'Tasa anual (%)', key: 'tasa_anual', placeholder: '11.5', keyboardType: 'decimal-pad' as const },
              { label: 'Saldo inicial ($)', key: 'saldo_inicial', placeholder: '10000', keyboardType: 'decimal-pad' as const },
              { label: 'Fecha de inicio', key: 'fecha_inicio', placeholder: 'YYYY-MM-DD' },
            ].map(f => (
              <View key={f.key} style={styles.formGroup}>
                <Text style={styles.formLabel}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={f.placeholder}
                  placeholderTextColor={theme.textSecondary}
                  keyboardType={f.keyboardType}
                  value={form[f.key as keyof typeof form]}
                  onChangeText={v => {
                    const filtered = f.keyboardType === 'decimal-pad' ? v.replace(/[^0-9.]/g, '') : v;
                    setForm(p => ({ ...p, [f.key]: filtered }));
                  }}
                />
              </View>
            ))}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Frecuencia de rendimiento</Text>
              <View style={styles.chipsRow}>
                {FRECUENCIAS.map(f => (
                  <TouchableOpacity key={f} style={[styles.chip, form.frecuencia_rendimiento === f && styles.chipActive]} onPress={() => setForm(p => ({ ...p, frecuencia_rendimiento: f }))}>
                    <Text style={[styles.chipText, form.frecuencia_rendimiento === f && styles.chipTextActive]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={guardarNueva}>
              <Text style={styles.saveBtnText}>Guardar inversión</Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={modalMovimiento} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalMovimiento(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{formMov.tipo === 'deposito' ? 'Depositar' : 'Retirar'}</Text>
            <TouchableOpacity onPress={() => setModalMovimiento(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={theme.textSecondary} keyboardType="decimal-pad" value={formMov.monto} onChangeText={v => setFormMov(p => ({ ...p, monto: v.replace(/[^0-9.]/g, '') }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Notas (opcional)</Text>
              <TextInput style={styles.input} placeholder="Razón del movimiento..." placeholderTextColor={theme.textSecondary} value={formMov.notas} onChangeText={v => setFormMov(p => ({ ...p, notas: v }))} />
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={guardarMovimiento}>
              <Text style={styles.saveBtnText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalTasa} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalTasa(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Actualizar tasa</Text>
            <TouchableOpacity onPress={() => setModalTasa(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.modalInfo}>Al cambiar la tasa se cerrará la versión actual y se abrirá una nueva. El historial queda guardado.</Text>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Nueva tasa anual (%)</Text>
              <TextInput style={styles.input} placeholder="11.5" placeholderTextColor={theme.textSecondary} keyboardType="decimal-pad" value={nuevaTasa} onChangeText={v => setNuevaTasa(v.replace(/[^0-9.]/g, ''))} />
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={guardarNuevaTasa}>
              <Text style={styles.saveBtnText}>Actualizar tasa (SCD 2)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalTransferencia} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalTransferencia(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {tipoTransferencia === 'cuentaAInversion' ? 'Cuenta → Inversión' : 'Inversión → Cuenta'}
            </Text>
            <TouchableOpacity onPress={() => setModalTransferencia(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.modalInfo}>
              {tipoTransferencia === 'cuentaAInversion'
                ? 'Se descontará de tu cuenta y se sumará a esta inversión.'
                : 'Se retirará de esta inversión y se sumará a tu cuenta.'}
            </Text>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={theme.textSecondary} keyboardType="decimal-pad" value={formTransferencia.monto} onChangeText={v => setFormTransferencia(p => ({ ...p, monto: v.replace(/[^0-9.]/g, '') }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{tipoTransferencia === 'cuentaAInversion' ? 'Cuenta origen' : 'Cuenta destino'}</Text>
              {cuentasLiquidez.length === 0 ? (
                <Text style={styles.emptyText}>Primero agrega una cuenta en la sección Cuentas</Text>
              ) : cuentasLiquidez.map((c: any) => (
                <TouchableOpacity key={c.id} style={[styles.selectorItem, formTransferencia.cuenta_liquidez_id === c.id && styles.selectorItemActive]} onPress={() => setFormTransferencia(p => ({ ...p, cuenta_liquidez_id: c.id }))}>
                  <Text style={styles.selectorText}>{c.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Notas (opcional)</Text>
              <TextInput style={styles.input} placeholder="Razón de la transferencia..." placeholderTextColor={theme.textSecondary} value={formTransferencia.notas} onChangeText={v => setFormTransferencia(p => ({ ...p, notas: v }))} />
            </View>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#3B82F6' }]} onPress={guardarTransferencia}>
              <Text style={styles.saveBtnText}>Confirmar transferencia</Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  totalCard: { margin: 16, backgroundColor: t.primary, borderRadius: 16, padding: 20, alignItems: 'center' },
  totalLabel: { fontSize: 13, color: '#FFFFFF99' },
  totalValor: { fontSize: 28, fontWeight: '700', color: '#FFFFFF', marginTop: 4 },
  totalSub: { fontSize: 12, color: '#FFFFFFAA', marginTop: 4 },
  scroll: { padding: 16 },
  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: t.textSecondary },
  emptyText: { fontSize: 13, color: t.textSecondary, textAlign: 'center' },
  card: { backgroundColor: t.card, borderRadius: 14, padding: 16, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.secondary + '18', justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardNombre: { fontSize: 15, fontWeight: '600', color: t.text },
  cardInstitucion: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardSaldo: { fontSize: 16, fontWeight: '700', color: t.text },
  cardSaldoLabel: { fontSize: 10, color: t.textSecondary, marginTop: 1 },
  expanded: { marginTop: 14, borderTopWidth: 0.5, borderTopColor: t.border, paddingTop: 14 },
  expandedMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  expandedMetric: { minWidth: '40%' },
  expandedLabel: { fontSize: 11, color: t.textSecondary },
  expandedValor: { fontSize: 14, fontWeight: '600', color: t.text, marginTop: 2 },
  expandedActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 0.5, borderColor: t.border },
  actionText: { fontSize: 12, fontWeight: '500' },
  movimientos: { borderTopWidth: 0.5, borderTopColor: t.border, paddingTop: 12 },
  movTitle: { fontSize: 12, fontWeight: '600', color: t.textSecondary, marginBottom: 8 },
  movRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  movLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  movTipo: { fontSize: 12, color: t.text, textTransform: 'capitalize' },
  movFecha: { fontSize: 11, color: t.textSecondary },
  movMonto: { fontSize: 13, fontWeight: '600' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 24, backgroundColor: t.surface, borderTopWidth: 0.5, borderTopColor: t.border },
  bottomBtn: { backgroundColor: t.primary, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottomBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: t.surface },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 0.5, borderBottomColor: t.border },
  modalTitle: { fontSize: 18, fontWeight: '600', color: t.text },
  modalBody: { padding: 20 },
  modalInfo: { fontSize: 13, color: t.textSecondary, backgroundColor: t.warning + '20', padding: 12, borderRadius: 8, marginBottom: 16 },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, color: t.text, fontWeight: '500', marginBottom: 6 },
  input: { backgroundColor: t.background, borderWidth: 0.5, borderColor: t.border, borderRadius: 10, padding: 12, fontSize: 15, color: t.text },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: t.background, borderWidth: 0.5, borderColor: t.border },
  chipActive: { backgroundColor: t.primary + '18', borderColor: t.primary },
  chipText: { fontSize: 12, color: t.textSecondary },
  chipTextActive: { color: t.primary, fontWeight: '600' },
  selectorItem: { padding: 12, borderRadius: 8, backgroundColor: t.background, marginBottom: 6, borderWidth: 0.5, borderColor: t.border },
  selectorItemActive: { backgroundColor: t.primary + '18', borderColor: t.primary },
  selectorText: { fontSize: 14, color: t.text },
  saveBtn: { backgroundColor: t.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
