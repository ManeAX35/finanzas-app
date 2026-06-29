import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Modal, TextInput,
  RefreshControl, Alert, Switch
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  obtenerRecurrentes, crearRecurrente,
  actualizarRecurrente, eliminarRecurrente,
  marcarInstanciaPagada, obtenerRecurrentesPorMes
} from '../../database/queries/recurrentes';
import { obtenerTarjetas } from '../../database/queries/tarjetas';
import { obtenerCuentasLiquidez } from '../../database/queries/liquidez';
import { formatMXN, hoy } from '../../database';
import { GastoRecurrenteVersion, TarjetaConVersion, CuentaLiquidez } from '../../types';
import Header from '../../components/Header';

const FRECUENCIAS = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual'];
const CATEGORIAS = ['Streaming', 'Servicios digitales', 'Salud/Gym', 'Seguro', 'Renta', 'Servicios', 'Educación', 'Mensualidad', 'Otro'];

const FORM_INICIAL = {
  nombre: '', monto: '', dia_cobro: '',
  frecuencia: 'mensual', categoria: 'Streaming',
  tipo_cobro: 'ninguno' as 'ninguno' | 'tarjeta' | 'cuenta',
  tarjeta_version_id: '',
  cuenta_liquidez_id: '',
  es_domiciliado: false, monto_variable: false,
};

export default function RecurrentesScreen() {
  const [tab, setTab] = useState<'activos' | 'pendientes'>('activos');
  const [recurrentes, setRecurrentes] = useState<GastoRecurrenteVersion[]>([]);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [tarjetas, setTarjetas] = useState<TarjetaConVersion[]>([]);
  const [cuentas, setCuentas] = useState<CuentaLiquidez[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);

  const cargarDatos = async () => {
    try {
      const hoyDate = new Date();
      const [rec, tars, ctas, pend] = await Promise.all([
        obtenerRecurrentes(),
        obtenerTarjetas(),
        obtenerCuentasLiquidez(),
        obtenerRecurrentesPorMes(hoyDate.getFullYear(), hoyDate.getMonth() + 1),
      ]);
      setRecurrentes(rec);
      setTarjetas(tars);
      setCuentas(ctas);
      setPendientes(pend);
    } catch (e) {
      console.error('[recurrentes ERROR]', e);
      Alert.alert('Error cargando recurrentes', String(e));
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { cargarDatos(); }, []));

  const abrirNuevo = () => {
    setEditando(null);
    setForm(FORM_INICIAL);
    setModalVisible(true);
  };

  const abrirEditar = (r: GastoRecurrenteVersion) => {
    setEditando(r.recurrente_id);
    const tipo_cobro: 'ninguno' | 'tarjeta' | 'cuenta' =
      r.tarjeta_version_id ? 'tarjeta' : r.cuenta_liquidez_id ? 'cuenta' : 'ninguno';
    setForm({
      nombre: r.nombre,
      monto: String(r.monto),
      dia_cobro: String(r.dia_cobro),
      frecuencia: r.frecuencia,
      categoria: r.categoria ?? 'Otro',
      tipo_cobro,
      tarjeta_version_id: r.tarjeta_version_id ?? '',
      cuenta_liquidez_id: r.cuenta_liquidez_id ?? '',
      es_domiciliado: r.es_domiciliado === 1,
      monto_variable: r.monto_variable === 1,
    });
    setModalVisible(true);
  };

  const guardar = async () => {
    if (!form.nombre || !form.dia_cobro) {
      Alert.alert('Campos requeridos', 'Nombre y día de cobro son obligatorios.');
      return;
    }
    try {
      const datos = {
        nombre: form.nombre,
        monto: parseFloat(form.monto) || 0,
        dia_cobro: parseInt(form.dia_cobro),
        frecuencia: form.frecuencia as GastoRecurrenteVersion['frecuencia'],
        categoria: form.categoria,
        tarjeta_version_id: form.tipo_cobro === 'tarjeta' ? (form.tarjeta_version_id || undefined) : undefined,
        cuenta_liquidez_id: form.tipo_cobro === 'cuenta' ? (form.cuenta_liquidez_id || undefined) : undefined,
        es_domiciliado: form.es_domiciliado ? 1 : 0,
        monto_variable: form.monto_variable ? 1 : 0,
      };
      if (editando) {
        await actualizarRecurrente(editando, datos);
      } else {
        await crearRecurrente('suscripcion', datos);
      }
      setModalVisible(false);
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  const eliminar = (id: string, nombre: string) => {
    Alert.alert('Eliminar', `¿Eliminar ${nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => { await eliminarRecurrente(id); cargarDatos(); }
      },
    ]);
  };

  const totalMensual = recurrentes
    .filter(r => r.frecuencia === 'mensual')
    .reduce((s, r) => s + r.monto, 0);

  return (
    <View style={styles.container}>
      <Header title="Recurrentes" subtitle={`Total mensual: ${formatMXN(totalMensual)}`} />

      <View style={styles.tabs}>
        {(['activos', 'pendientes'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'activos' ? 'Activos' : 'Pendientes este mes'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargarDatos(); }} />}
      >
        {tab === 'activos' && (
          <>
            {recurrentes.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="repeat-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>Sin gastos recurrentes</Text>
              </View>
            ) : recurrentes.map(r => {
              const tarjeta = tarjetas.find(t => t.id === r.tarjeta_version_id);
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIcon}>
                      <Ionicons name="repeat-outline" size={18} color="#F59E0B" />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardNombre}>{r.nombre}</Text>
                      <Text style={styles.cardSub}>Día {r.dia_cobro} · {r.frecuencia} · {r.categoria}</Text>
                      {tarjeta && <Text style={styles.cardTag}>{tarjeta.nombre}</Text>}
                    </View>
                    <View style={styles.cardRight}>
                      <Text style={styles.cardMonto}>{formatMXN(r.monto)}</Text>
                      <View style={styles.cardActions}>
                        <TouchableOpacity onPress={() => abrirEditar(r)}>
                          <Ionicons name="pencil-outline" size={14} color="#6B7280" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => eliminar(r.recurrente_id, r.nombre)}>
                          <Ionicons name="trash-outline" size={14} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  <View style={styles.badges}>
                    {r.es_domiciliado === 1 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Domiciliado</Text>
                      </View>
                    )}
                    {r.monto_variable === 1 && (
                      <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[styles.badgeText, { color: '#92400E' }]}>Monto variable</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {tab === 'pendientes' && (
          <>
            {pendientes.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>Sin pagos pendientes este mes</Text>
              </View>
            ) : pendientes.map((p: any) => (
              <View key={p.id} style={styles.pendienteItem}>
                <View>
                  <Text style={styles.cardNombre}>{p.nombre}</Text>
                  <Text style={styles.cardSub}>Esperado: {p.fecha_esperada}</Text>
                </View>
                <View style={styles.pendienteRight}>
                  <Text style={styles.cardMonto}>{formatMXN(p.monto_cobrado ?? p.monto_esperado)}</Text>
                  {p.estado === 'esperado' && (
                    <TouchableOpacity
                      style={styles.pagarBtn}
                      onPress={async () => {
                        await marcarInstanciaPagada(p.id, p.monto_cobrado ?? p.monto_esperado);
                        cargarDatos();
                      }}
                    >
                      <Text style={styles.pagarBtnText}>Pagado</Text>
                    </TouchableOpacity>
                  )}
                  {p.estado === 'pagado' && (
                    <View style={styles.pagadoBadge}>
                      <Text style={styles.pagadoText}>✓ Pagado</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomBtn} onPress={abrirNuevo}>
          <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
          <Text style={styles.bottomBtnText}>Agregar recurrente</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editando ? 'Editar recurrente' : 'Nuevo recurrente'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            {[
              { label: 'Nombre', key: 'nombre', placeholder: 'Netflix, gym, seguro...' },
              { label: 'Monto ($)', key: 'monto', placeholder: '199', keyboardType: 'decimal-pad' as const },
              { label: 'Día de cobro', key: 'dia_cobro', placeholder: '1', keyboardType: 'number-pad' as const },
            ].map(f => (
              <View key={f.key} style={styles.formGroup}>
                <Text style={styles.formLabel}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={f.placeholder}
                  placeholderTextColor="#9CA3AF"
                  keyboardType={f.keyboardType}
                  value={form[f.key as keyof typeof form] as string}
                  onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                />
              </View>
            ))}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Frecuencia</Text>
              <View style={styles.chipsRow}>
                {FRECUENCIAS.map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.chip, form.frecuencia === f && styles.chipActive]}
                    onPress={() => setForm(p => ({ ...p, frecuencia: f }))}
                  >
                    <Text style={[styles.chipText, form.frecuencia === f && styles.chipTextActive]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Categoría</Text>
              <View style={styles.chipsRow}>
                {CATEGORIAS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, form.categoria === c && styles.chipActive]}
                    onPress={() => setForm(p => ({ ...p, categoria: c }))}
                  >
                    <Text style={[styles.chipText, form.categoria === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Cobrar a</Text>
              <TouchableOpacity
                style={[styles.selectorItem, form.tipo_cobro === 'ninguno' && styles.selectorItemActive]}
                onPress={() => setForm(p => ({ ...p, tipo_cobro: 'ninguno', tarjeta_version_id: '', cuenta_liquidez_id: '' }))}
              >
                <Text style={styles.selectorText}>Sin cobro / efectivo</Text>
              </TouchableOpacity>

              {tarjetas.length > 0 && (
                <Text style={[styles.formLabel, { marginTop: 8, marginBottom: 4, fontSize: 11, color: '#9CA3AF' }]}>TARJETAS</Text>
              )}
              {tarjetas.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.selectorItem, form.tipo_cobro === 'tarjeta' && form.tarjeta_version_id === t.id && styles.selectorItemActive]}
                  onPress={() => setForm(p => ({ ...p, tipo_cobro: 'tarjeta', tarjeta_version_id: t.id, cuenta_liquidez_id: '' }))}
                >
                  <Text style={styles.selectorText}>{t.nombre} — {t.banco}</Text>
                </TouchableOpacity>
              ))}

              {cuentas.length > 0 && (
                <Text style={[styles.formLabel, { marginTop: 8, marginBottom: 4, fontSize: 11, color: '#9CA3AF' }]}>CUENTAS DE LIQUIDEZ</Text>
              )}
              {cuentas.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.selectorItem, form.tipo_cobro === 'cuenta' && form.cuenta_liquidez_id === c.id && styles.selectorItemActive]}
                  onPress={() => setForm(p => ({ ...p, tipo_cobro: 'cuenta', cuenta_liquidez_id: c.id, tarjeta_version_id: '' }))}
                >
                  <Text style={styles.selectorText}>{c.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.formLabel}>Es domiciliado</Text>
              <Switch
                value={form.es_domiciliado}
                onValueChange={v => setForm(p => ({ ...p, es_domiciliado: v }))}
                trackColor={{ true: '#6366F1' }}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.formLabel}>Monto variable</Text>
              <Switch
                value={form.monto_variable}
                onValueChange={v => setForm(p => ({ ...p, monto_variable: v }))}
                trackColor={{ true: '#F59E0B' }}
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={guardar}>
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
  tabs: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#4F46E5' },
  tabText: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  tabTextActive: { color: '#4F46E5' },
  scroll: { padding: 16 },
  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardNombre: { fontSize: 14, fontWeight: '500', color: '#111827' },
  cardSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  cardTag: { fontSize: 11, color: '#6366F1', marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  cardMonto: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardActions: { flexDirection: 'row', gap: 8 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8, marginLeft: 46 },
  badge: { backgroundColor: '#EEF2FF', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, color: '#4F46E5', fontWeight: '500' },
  pendienteItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8 },
  pendienteRight: { alignItems: 'flex-end', gap: 6 },
  pagarBtn: { backgroundColor: '#10B981', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  pagarBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  pagadoBadge: { backgroundColor: '#D1FAE5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pagadoText: { fontSize: 12, color: '#065F46', fontWeight: '500' },
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
  selectorItem: { padding: 12, borderRadius: 8, backgroundColor: '#F9FAFB', marginBottom: 6, borderWidth: 0.5, borderColor: '#E5E7EB' },
  selectorItemActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  selectorText: { fontSize: 14, color: '#374151' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, backgroundColor: '#F9FAFB', padding: 14, borderRadius: 10 },
  saveBtn: { backgroundColor: '#4F46E5', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});