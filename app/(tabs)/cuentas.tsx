import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Modal, TextInput,
  RefreshControl, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  obtenerCuentasLiquidez, crearCuentaLiquidez,
  actualizarCuentaLiquidez, eliminarCuentaLiquidez,
  obtenerSaldoCuenta, crearMovimiento, obtenerMovimientos
} from '../../database/queries/liquidez';
import { formatMXN, hoy } from '../../database';
import { CuentaLiquidez, MovimientoLiquidez } from '../../types';

const TIPOS = ['debito', 'digital', 'efectivo', 'monedero'] as const;
const TIPO_LABEL: Record<string, string> = {
  debito: 'Débito', digital: 'Digital', efectivo: 'Efectivo', monedero: 'Monedero'
};
const TIPO_ICON: Record<string, any> = {
  debito: 'card-outline', digital: 'phone-portrait-outline',
  efectivo: 'cash-outline', monedero: 'wallet-outline'
};
const COLORES = ['blue', 'teal', 'purple', 'coral', 'amber', 'gray'];
const COLOR_MAP: Record<string, string> = {
  blue: '#3B82F6', teal: '#14B8A6', purple: '#8B5CF6',
  coral: '#F97316', amber: '#F59E0B', gray: '#6B7280',
};
const CATEGORIAS_MOV = ['Sueldo', 'Transferencia', 'Venta', 'Reembolso', 'Alimentación', 'Transporte', 'Servicios', 'Entretenimiento', 'Salud', 'Otro'];

const FORM_INICIAL = { nombre: '', tipo: 'debito', institucion: '', color: 'blue' };
const FORM_MOV_INICIAL = { tipo: 'ingreso', monto: '', descripcion: '', categoria: 'Sueldo', fecha: hoy(), cuenta_destino_id: '' };

export default function CuentasScreen() {
  const [cuentas, setCuentas] = useState<CuentaLiquidez[]>([]);
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [movimientos, setMovimientos] = useState<Record<string, MovimientoLiquidez[]>>({});
  const [expandida, setExpandida] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modalCuenta, setModalCuenta] = useState(false);
  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [formMov, setFormMov] = useState(FORM_MOV_INICIAL);

  const cargarDatos = async () => {
    try {
      const lista = await obtenerCuentasLiquidez();
      setCuentas(lista);
      const saldosMap: Record<string, number> = {};
      const movsMap: Record<string, MovimientoLiquidez[]> = {};
      for (const c of lista) {
        saldosMap[c.id] = await obtenerSaldoCuenta(c.id);
        movsMap[c.id] = await obtenerMovimientos(c.id, 5);
      }
      setSaldos(saldosMap);
      setMovimientos(movsMap);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { cargarDatos(); }, []));

  const abrirNueva = () => {
    setEditando(null);
    setForm(FORM_INICIAL);
    setModalCuenta(true);
  };

  const abrirEditar = (c: CuentaLiquidez) => {
    setEditando(c.id);
    setForm({ nombre: c.nombre, tipo: c.tipo, institucion: c.institucion ?? '', color: c.color });
    setModalCuenta(true);
  };

  const guardarCuenta = async () => {
    if (!form.nombre) {
      Alert.alert('Campo requerido', 'El nombre es obligatorio.');
      return;
    }
    try {
      if (editando) {
        await actualizarCuentaLiquidez(editando, { nombre: form.nombre, tipo: form.tipo as any, institucion: form.institucion, color: form.color });
      } else {
        await crearCuentaLiquidez({ nombre: form.nombre, tipo: form.tipo as any, institucion: form.institucion, color: form.color });
      }
      setModalCuenta(false);
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la cuenta.');
    }
  };

  const eliminar = (id: string, nombre: string) => {
    Alert.alert('Eliminar cuenta', `¿Eliminar ${nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await eliminarCuentaLiquidez(id); cargarDatos(); } },
    ]);
  };

  const abrirMovimiento = (cuentaId: string, tipo: 'ingreso' | 'gasto' | 'transferencia') => {
    setCuentaSeleccionada(cuentaId);
    setFormMov({ ...FORM_MOV_INICIAL, tipo, fecha: hoy() });
    setModalMovimiento(true);
  };

  const guardarMovimiento = async () => {
    if (!formMov.monto || !cuentaSeleccionada) {
      Alert.alert('Campo requerido', 'El monto es obligatorio.');
      return;
    }
    try {
      await crearMovimiento({
        cuenta_id: cuentaSeleccionada,
        tipo: formMov.tipo as any,
        monto: parseFloat(formMov.monto),
        fecha: formMov.fecha,
        descripcion: formMov.descripcion,
        categoria: formMov.categoria,
        cuenta_destino_id: formMov.tipo === 'transferencia' ? formMov.cuenta_destino_id : undefined,
      });
      setModalMovimiento(false);
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el movimiento.');
    }
  };

  const totalDisponible = Object.values(saldos).reduce((s, v) => s + v, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Cuentas</Text>
          <Text style={styles.headerSub}>Total disponible: {formatMXN(totalDisponible)}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargarDatos(); }} />}
      >
        {cuentas.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>Sin cuentas</Text>
            <Text style={styles.emptyText}>Agrega tus cuentas de débito, efectivo o digitales</Text>
          </View>
        ) : cuentas.map(c => {
          const saldo = saldos[c.id] ?? 0;
          const movs = movimientos[c.id] ?? [];
          const isExpanded = expandida === c.id;
          const color = COLOR_MAP[c.color] ?? '#6B7280';

          return (
            <View key={c.id} style={[styles.card, { borderLeftColor: color }]}>
              <TouchableOpacity onPress={() => setExpandida(isExpanded ? null : c.id)}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIconBg, { backgroundColor: color + '20' }]}>
                    <Ionicons name={TIPO_ICON[c.tipo]} size={20} color={color} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardNombre}>{c.nombre}</Text>
                    <Text style={styles.cardSub}>{TIPO_LABEL[c.tipo]}{c.institucion ? ` · ${c.institucion}` : ''}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={[styles.cardSaldo, { color: saldo >= 0 ? '#10B981' : '#EF4444' }]}>
                      {formatMXN(saldo)}
                    </Text>
                    <Ionicons name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color="#9CA3AF" />
                  </View>
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.expanded}>
                  <View style={styles.expandedActions}>
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: '#10B981' }]} onPress={() => abrirMovimiento(c.id, 'ingreso')}>
                      <Ionicons name="arrow-down-outline" size={14} color="#10B981" />
                      <Text style={[styles.actionText, { color: '#10B981' }]}>Ingreso</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: '#EF4444' }]} onPress={() => abrirMovimiento(c.id, 'gasto')}>
                      <Ionicons name="arrow-up-outline" size={14} color="#EF4444" />
                      <Text style={[styles.actionText, { color: '#EF4444' }]}>Gasto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: '#6366F1' }]} onPress={() => abrirMovimiento(c.id, 'transferencia')}>
                      <Ionicons name="swap-horizontal-outline" size={14} color="#6366F1" />
                      <Text style={[styles.actionText, { color: '#6366F1' }]}>Transferir</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: '#D1D5DB' }]} onPress={() => abrirEditar(c)}>
                      <Ionicons name="pencil-outline" size={14} color="#6B7280" />
                      <Text style={[styles.actionText, { color: '#6B7280' }]}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: '#FCA5A5' }]} onPress={() => eliminar(c.id, c.nombre)}>
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      <Text style={[styles.actionText, { color: '#EF4444' }]}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>

                  {movs.length > 0 && (
                    <View style={styles.movimientos}>
                      <Text style={styles.movTitle}>Últimos movimientos</Text>
                      {movs.map(m => (
                        <View key={m.id} style={styles.movRow}>
                          <View style={styles.movLeft}>
                            <Ionicons
                              name={m.tipo === 'ingreso' ? 'arrow-down-circle-outline' : m.tipo === 'gasto' ? 'arrow-up-circle-outline' : 'swap-horizontal-outline'}
                              size={16}
                              color={m.tipo === 'ingreso' ? '#10B981' : m.tipo === 'gasto' ? '#EF4444' : '#6366F1'}
                            />
                            <View>
                              <Text style={styles.movDesc}>{m.descripcion ?? m.tipo}</Text>
                              <Text style={styles.movFecha}>{m.fecha} · {m.categoria}</Text>
                            </View>
                          </View>
                          <Text style={[styles.movMonto, { color: m.tipo === 'ingreso' ? '#10B981' : '#EF4444' }]}>
                            {m.tipo === 'ingreso' ? '+' : '−'}{formatMXN(m.monto)}
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
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomBtn} onPress={abrirNueva}>
          <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
          <Text style={styles.bottomBtnText}>Agregar cuenta</Text>
        </TouchableOpacity>
      </View>

      {/* Modal cuenta */}
      <Modal visible={modalCuenta} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editando ? 'Editar cuenta' : 'Nueva cuenta'}</Text>
            <TouchableOpacity onPress={() => setModalCuenta(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Nombre</Text>
              <TextInput style={styles.input} placeholder="BBVA Débito, Nu, Efectivo..." placeholderTextColor="#9CA3AF" value={form.nombre} onChangeText={v => setForm(p => ({ ...p, nombre: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Institución (opcional)</Text>
              <TextInput style={styles.input} placeholder="BBVA, Nu, Mercado Pago..." placeholderTextColor="#9CA3AF" value={form.institucion} onChangeText={v => setForm(p => ({ ...p, institucion: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Tipo</Text>
              <View style={styles.chipsRow}>
                {TIPOS.map(t => (
                  <TouchableOpacity key={t} style={[styles.chip, form.tipo === t && styles.chipActive]} onPress={() => setForm(p => ({ ...p, tipo: t }))}>
                    <Text style={[styles.chipText, form.tipo === t && styles.chipTextActive]}>{TIPO_LABEL[t]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Color</Text>
              <View style={styles.coloresRow}>
                {COLORES.map(c => (
                  <TouchableOpacity key={c} style={[styles.colorDot, { backgroundColor: COLOR_MAP[c] }, form.color === c && styles.colorDotSelected]} onPress={() => setForm(p => ({ ...p, color: c }))} />
                ))}
              </View>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={guardarCuenta}>
              <Text style={styles.saveBtnText}>Guardar cuenta</Text>
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
              {formMov.tipo === 'ingreso' ? 'Registrar ingreso' : formMov.tipo === 'gasto' ? 'Registrar gasto' : 'Transferencia'}
            </Text>
            <TouchableOpacity onPress={() => setModalMovimiento(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad" value={formMov.monto} onChangeText={v => setFormMov(p => ({ ...p, monto: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descripción (opcional)</Text>
              <TextInput style={styles.input} placeholder="Sueldo, super, gasolina..." placeholderTextColor="#9CA3AF" value={formMov.descripcion} onChangeText={v => setFormMov(p => ({ ...p, descripcion: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Fecha</Text>
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" value={formMov.fecha} onChangeText={v => setFormMov(p => ({ ...p, fecha: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Categoría</Text>
              <View style={styles.chipsRow}>
                {CATEGORIAS_MOV.map(cat => (
                  <TouchableOpacity key={cat} style={[styles.chip, formMov.categoria === cat && styles.chipActive]} onPress={() => setFormMov(p => ({ ...p, categoria: cat }))}>
                    <Text style={[styles.chipText, formMov.categoria === cat && styles.chipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {formMov.tipo === 'transferencia' && (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cuenta destino</Text>
                {cuentas.filter(c => c.id !== cuentaSeleccionada).map(c => (
                  <TouchableOpacity key={c.id} style={[styles.selectorItem, formMov.cuenta_destino_id === c.id && styles.selectorItemActive]} onPress={() => setFormMov(p => ({ ...p, cuenta_destino_id: c.id }))}>
                    <Text style={styles.selectorText}>{c.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity style={styles.saveBtn} onPress={guardarMovimiento}>
              <Text style={styles.saveBtnText}>Guardar</Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 24, fontWeight: '600', color: '#111827' },
  headerSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  scroll: { padding: 16 },
  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: '#6B7280' },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 10, borderLeftWidth: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconBg: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardNombre: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  cardSaldo: { fontSize: 16, fontWeight: '700' },
  expanded: { marginTop: 14, borderTopWidth: 0.5, borderTopColor: '#F3F4F6', paddingTop: 14 },
  expandedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 0.5, backgroundColor: '#F9FAFB' },
  actionText: { fontSize: 12, fontWeight: '500' },
  movimientos: { borderTopWidth: 0.5, borderTopColor: '#F3F4F6', paddingTop: 12 },
  movTitle: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 8 },
  movRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 },
  movLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  movDesc: { fontSize: 13, color: '#374151', fontWeight: '500' },
  movFecha: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  movMonto: { fontSize: 14, fontWeight: '600' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 24, backgroundColor: '#FFFFFF', borderTopWidth: 0.5, borderTopColor: '#E5E7EB' },
  bottomBtn: { backgroundColor: '#4F46E5', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottomBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  modalBody: { padding: 20 },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, color: '#374151', fontWeight: '500', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 0.5, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, fontSize: 15, color: '#111827' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 0.5, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  chipText: { fontSize: 12, color: '#6B7280' },
  chipTextActive: { color: '#4F46E5', fontWeight: '600' },
  coloresRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotSelected: { borderWidth: 3, borderColor: '#111827' },
  selectorItem: { padding: 12, borderRadius: 8, backgroundColor: '#F9FAFB', marginBottom: 6, borderWidth: 0.5, borderColor: '#E5E7EB' },
  selectorItemActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  selectorText: { fontSize: 14, color: '#374151' },
  saveBtn: { backgroundColor: '#4F46E5', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});