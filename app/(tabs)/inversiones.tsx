import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Modal, TextInput,
  RefreshControl, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  obtenerCuentasInversion, crearCuentaInversion,
  calcularRendimientoHoy, registrarMovimientoInversion,
  eliminarCuentaInversion, actualizarTasaInversion,
  obtenerMovimientosInversion
} from '../../database/queries/inversiones';
import { formatMXN, hoy } from '../../database';

const FRECUENCIAS = ['diario', 'mensual', 'trimestral', 'al_vencimiento'];

const FORM_INICIAL = {
  institucion: '', nombre: '', tasa_anual: '',
  frecuencia_rendimiento: 'mensual', saldo_inicial: '',
  fecha_inicio: hoy(),
};

export default function InversionesScreen() {
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [rendimientos, setRendimientos] = useState<Record<string, any>>({});
  const [movimientos, setMovimientos] = useState<Record<string, any[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [modalNueva, setModalNueva] = useState(false);
  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [modalTasa, setModalTasa] = useState(false);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [formMov, setFormMov] = useState({ tipo: 'deposito', monto: '', notas: '' });
  const [nuevaTasa, setNuevaTasa] = useState('');

  const cargarDatos = async () => {
    try {
      const lista = await obtenerCuentasInversion();
      setCuentas(lista);

      const rends: Record<string, any> = {};
      const movs: Record<string, any[]> = {};

      for (const c of lista) {
        rends[c.id] = await calcularRendimientoHoy(c.id);
        movs[c.id] = await obtenerMovimientosInversion(c.id, 5);
      }

      setRendimientos(rends);
      setMovimientos(movs);
    } catch (e) {
      console.error(e);
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
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la cuenta.');
    }
  };

  const guardarMovimiento = async () => {
    if (!formMov.monto || !cuentaSeleccionada) return;
    try {
      await registrarMovimientoInversion(
        cuentaSeleccionada,
        formMov.tipo as any,
        parseFloat(formMov.monto),
        formMov.notas
      );
      setModalMovimiento(false);
      setFormMov({ tipo: 'deposito', monto: '', notas: '' });
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', 'No se pudo registrar el movimiento.');
    }
  };

  const guardarNuevaTasa = async () => {
    if (!nuevaTasa || !cuentaSeleccionada) return;
    try {
      await actualizarTasaInversion(cuentaSeleccionada, parseFloat(nuevaTasa));
      setModalTasa(false);
      setNuevaTasa('');
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', 'No se pudo actualizar la tasa.');
    }
  };

  const eliminar = (id: string, nombre: string) => {
    Alert.alert('Eliminar', `¿Eliminar ${nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => { await eliminarCuentaInversion(id); cargarDatos(); }
      },
    ]);
  };

  const totalInversiones = Object.values(rendimientos).reduce((s, r) => s + (r?.saldoEsperado ?? 0), 0);
  const totalRendimientoHoy = Object.values(rendimientos).reduce((s, r) => s + (r?.rendimientoHoy ?? 0), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Inversiones</Text>
          <Text style={styles.headerSub}>+{formatMXN(totalRendimientoHoy)} hoy</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalNueva(true)}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Resumen total */}
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
            <Ionicons name="trending-up-outline" size={48} color="#D1D5DB" />
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
                    <Ionicons name="trending-up-outline" size={20} color="#6366F1" />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardNombre}>{c.nombre}</Text>
                    <Text style={styles.cardInstitucion}>{c.institucion} · {c.tasa_anual}% anual</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.cardSaldo}>{formatMXN(rend?.saldoEsperado ?? c.saldo_inicial)}</Text>
                    <Text style={[styles.cardRend, { color: rendAcumulado >= 0 ? '#10B981' : '#EF4444' }]}>
                      +{formatMXN(rendAcumulado)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.expanded}>
                  <View style={styles.expandedMetrics}>
                    <View style={styles.expandedMetric}>
                      <Text style={styles.expandedLabel}>Saldo inicial</Text>
                      <Text style={styles.expandedValor}>{formatMXN(c.saldo_inicial)}</Text>
                    </View>
                    <View style={styles.expandedMetric}>
                      <Text style={styles.expandedLabel}>Rendimiento hoy</Text>
                      <Text style={[styles.expandedValor, { color: '#10B981' }]}>
                        +{formatMXN(rend?.rendimientoHoy ?? 0)}
                      </Text>
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
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => { setCuentaSeleccionada(c.id); setFormMov({ ...formMov, tipo: 'deposito' }); setModalMovimiento(true); }}
                    >
                      <Ionicons name="arrow-down-outline" size={14} color="#10B981" />
                      <Text style={[styles.actionText, { color: '#10B981' }]}>Depositar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => { setCuentaSeleccionada(c.id); setFormMov({ ...formMov, tipo: 'retiro' }); setModalMovimiento(true); }}
                    >
                      <Ionicons name="arrow-up-outline" size={14} color="#EF4444" />
                      <Text style={[styles.actionText, { color: '#EF4444' }]}>Retirar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => { setCuentaSeleccionada(c.id); setNuevaTasa(String(c.tasa_anual)); setModalTasa(true); }}
                    >
                      <Ionicons name="pencil-outline" size={14} color="#6366F1" />
                      <Text style={[styles.actionText, { color: '#6366F1' }]}>Editar tasa</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => eliminar(c.id, c.nombre)}
                    >
                      <Ionicons name="trash-outline" size={14} color="#9CA3AF" />
                      <Text style={[styles.actionText, { color: '#9CA3AF' }]}>Eliminar</Text>
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
                              color={m.tipo === 'deposito' ? '#10B981' : m.tipo === 'retiro' ? '#EF4444' : '#6366F1'}
                            />
                            <Text style={styles.movTipo}>{m.tipo}</Text>
                            <Text style={styles.movFecha}>{m.fecha}</Text>
                          </View>
                          <Text style={[styles.movMonto, { color: m.tipo === 'retiro' ? '#EF4444' : '#10B981' }]}>
                            {m.tipo === 'retiro' ? '−' : '+'}{formatMXN(m.monto)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Modal nueva cuenta */}
      <Modal visible={modalNueva} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nueva inversión</Text>
            <TouchableOpacity onPress={() => setModalNueva(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
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
                  placeholderTextColor="#9CA3AF"
                  keyboardType={f.keyboardType}
                  value={form[f.key as keyof typeof form]}
                  onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                />
              </View>
            ))}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Frecuencia de rendimiento</Text>
              <View style={styles.chipsRow}>
                {FRECUENCIAS.map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.chip, form.frecuencia_rendimiento === f && styles.chipActive]}
                    onPress={() => setForm(p => ({ ...p, frecuencia_rendimiento: f }))}
                  >
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

      {/* Modal movimiento */}
      <Modal visible={modalMovimiento} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {formMov.tipo === 'deposito' ? 'Depositar' : 'Retirar'}
            </Text>
            <TouchableOpacity onPress={() => setModalMovimiento(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto ($)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                value={formMov.monto}
                onChangeText={v => setFormMov(p => ({ ...p, monto: v }))}
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Notas (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Razón del movimiento..."
                placeholderTextColor="#9CA3AF"
                value={formMov.notas}
                onChangeText={v => setFormMov(p => ({ ...p, notas: v }))}
              />
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={guardarMovimiento}>
              <Text style={styles.saveBtnText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal tasa */}
      <Modal visible={modalTasa} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Actualizar tasa</Text>
            <TouchableOpacity onPress={() => setModalTasa(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.modalInfo}>
              Al cambiar la tasa se cerrará la versión actual y se abrirá una nueva. El historial queda guardado.
            </Text>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Nueva tasa anual (%)</Text>
              <TextInput
                style={styles.input}
                placeholder="11.5"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                value={nuevaTasa}
                onChangeText={setNuevaTasa}
              />
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={guardarNuevaTasa}>
              <Text style={styles.saveBtnText}>Actualizar tasa (SCD 2)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 24, fontWeight: '600', color: '#111827' },
  headerSub: { fontSize: 13, color: '#10B981', marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' },
  totalCard: { margin: 16, backgroundColor: '#4F46E5', borderRadius: 16, padding: 20, alignItems: 'center' },
  totalLabel: { fontSize: 13, color: '#C7D2FE' },
  totalValor: { fontSize: 28, fontWeight: '700', color: '#FFFFFF', marginTop: 4 },
  totalSub: { fontSize: 12, color: '#A5B4FC', marginTop: 4 },
  scroll: { padding: 16 },
  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: '#6B7280' },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardNombre: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardInstitucion: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardSaldo: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardRend: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  expanded: { marginTop: 14, borderTopWidth: 0.5, borderTopColor: '#F3F4F6', paddingTop: 14 },
  expandedMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  expandedMetric: { minWidth: '40%' },
  expandedLabel: { fontSize: 11, color: '#9CA3AF' },
  expandedValor: { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 2 },
  expandedActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F9FAFB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 0.5, borderColor: '#E5E7EB' },
  actionText: { fontSize: 12, fontWeight: '500' },
  movimientos: { borderTopWidth: 0.5, borderTopColor: '#F3F4F6', paddingTop: 12 },
  movTitle: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 8 },
  movRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  movLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  movTipo: { fontSize: 12, color: '#374151', textTransform: 'capitalize' },
  movFecha: { fontSize: 11, color: '#9CA3AF' },
  movMonto: { fontSize: 13, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  modalBody: { padding: 20 },
  modalInfo: { fontSize: 13, color: '#6B7280', backgroundColor: '#FEF3C7', padding: 12, borderRadius: 8, marginBottom: 16 },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, color: '#374151', fontWeight: '500', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 0.5, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, fontSize: 15, color: '#111827' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 0.5, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  chipText: { fontSize: 12, color: '#6B7280' },
  chipTextActive: { color: '#4F46E5', fontWeight: '600' },
  saveBtn: { backgroundColor: '#4F46E5', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});