import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Modal, TextInput,
  RefreshControl, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { crearGasto, obtenerGastos, eliminarGasto, crearCompra, obtenerCompras, eliminarCompra, obtenerCuotasPendientesMes, marcarCuotaPagada } from '../../database/queries/gastos';
import { obtenerTarjetas } from '../../database/queries/tarjetas';
import { obtenerCuentasLiquidez } from '../../database/queries/liquidez';
import { formatMXN, hoy } from '../../database';
import { Gasto, Compra, TarjetaConVersion, CuentaLiquidez } from '../../types';

const CATEGORIAS = ['Alimentación', 'Transporte', 'Salud', 'Entretenimiento', 'Ropa', 'Hogar', 'Tecnología', 'Educación', 'Viaje', 'Otro'];
const MSI_OPTS = [1, 3, 6, 9, 12, 18, 24];

export default function GastosScreen() {
  const [tab, setTab] = useState<'gastos' | 'msi' | 'cuotas'>('gastos');
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [cuotas, setCuotas] = useState<any[]>([]);
  const [tarjetas, setTarjetas] = useState<TarjetaConVersion[]>([]);
  const [cuentas, setCuentas] = useState<CuentaLiquidez[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalGasto, setModalGasto] = useState(false);
  const [modalMSI, setModalMSI] = useState(false);
  const [usaTarjeta, setUsaTarjeta] = useState(true);

  const [formGasto, setFormGasto] = useState({
    descripcion: '', monto: '', fecha: hoy(),
    categoria: 'Alimentación', notas: '',
    tarjeta_version_id: '', cuenta_liquidez_id: '',
  });

  const [formMSI, setFormMSI] = useState({
    descripcion: '', monto_total: '', meses: '3',
    fecha_compra: hoy(), categoria: 'Tecnología',
    tarjeta_version_id: '', origen: 'tarjeta', notas: '',
  });

  const cargarDatos = async () => {
    try {
      const hoyDate = new Date();
      const [g, c, t, cu, cuotas] = await Promise.all([
        obtenerGastos(),
        obtenerCompras(),
        obtenerTarjetas(),
        obtenerCuentasLiquidez(),
        obtenerCuotasPendientesMes(hoyDate.getFullYear(), hoyDate.getMonth() + 1),
      ]);
      setGastos(g);
      setCompras(c);
      setTarjetas(t);
      setCuentas(cu);
      setCuotas(cuotas);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { cargarDatos(); }, []));

  const guardarGasto = async () => {
    if (!formGasto.descripcion || !formGasto.monto) {
      Alert.alert('Campos requeridos', 'Descripción y monto son obligatorios.');
      return;
    }
    try {
      await crearGasto({
        descripcion: formGasto.descripcion,
        monto: parseFloat(formGasto.monto),
        fecha: formGasto.fecha,
        categoria: formGasto.categoria,
        notas: formGasto.notas,
        tarjeta_version_id: usaTarjeta ? formGasto.tarjeta_version_id || undefined : undefined,
        cuenta_liquidez_id: !usaTarjeta ? formGasto.cuenta_liquidez_id || undefined : undefined,
      });
      setModalGasto(false);
      setFormGasto({ descripcion: '', monto: '', fecha: hoy(), categoria: 'Alimentación', notas: '', tarjeta_version_id: '', cuenta_liquidez_id: '' });
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el gasto.');
    }
  };

  const guardarMSI = async () => {
    if (!formMSI.descripcion || !formMSI.monto_total) {
      Alert.alert('Campos requeridos', 'Descripción y monto son obligatorios.');
      return;
    }
    try {
      await crearCompra({
        descripcion: formMSI.descripcion,
        monto_total: parseFloat(formMSI.monto_total),
        meses: parseInt(formMSI.meses),
        fecha_compra: formMSI.fecha_compra,
        categoria: formMSI.categoria,
        origen: formMSI.origen as any,
        notas: formMSI.notas,
        tarjeta_version_id: formMSI.tarjeta_version_id || undefined,
      });
      setModalMSI(false);
      setFormMSI({ descripcion: '', monto_total: '', meses: '3', fecha_compra: hoy(), categoria: 'Tecnología', tarjeta_version_id: '', origen: 'tarjeta', notas: '' });
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la compra.');
    }
  };

  const borrarGasto = (id: string) => {
    Alert.alert('Eliminar gasto', '¿Eliminar este gasto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await eliminarGasto(id); cargarDatos(); } },
    ]);
  };

  const borrarCompra = (id: string) => {
    Alert.alert('Eliminar compra', '¿Eliminar esta compra y todas sus cuotas?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await eliminarCompra(id); cargarDatos(); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Gastos</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalGasto(true)}>
            <Ionicons name="receipt-outline" size={16} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#10B981' }]} onPress={() => setModalMSI(true)}>
            <Ionicons name="layers-outline" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        {(['gastos', 'msi', 'cuotas'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'gastos' ? 'Gastos' : t === 'msi' ? 'MSI / Créditos' : 'Cuotas del mes'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargarDatos(); }} />}
      >
        {tab === 'gastos' && (
          <>
            {gastos.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>Sin gastos registrados</Text>
              </View>
            ) : gastos.map(g => {
              const tarjeta = tarjetas.find(t => t.id === g.tarjeta_version_id);
              return (
                <View key={g.id} style={styles.item}>
                  <View style={styles.itemLeft}>
                    <View style={styles.itemIcon}>
                      <Ionicons name="receipt-outline" size={16} color="#6366F1" />
                    </View>
                    <View>
                      <Text style={styles.itemTitle}>{g.descripcion}</Text>
                      <Text style={styles.itemSub}>{g.fecha} · {g.categoria}</Text>
                      {tarjeta && <Text style={styles.itemTag}>{tarjeta.nombre}</Text>}
                    </View>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.itemMonto}>{formatMXN(g.monto)}</Text>
                    <TouchableOpacity onPress={() => borrarGasto(g.id)}>
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {tab === 'msi' && (
          <>
            {compras.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="layers-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>Sin compras a MSI</Text>
              </View>
            ) : compras.map(c => {
              const cuotaMonto = c.monto_total / c.meses;
              return (
                <View key={c.id} style={styles.msiCard}>
                  <View style={styles.msiHeader}>
                    <Text style={styles.msiTitle}>{c.descripcion}</Text>
                    <TouchableOpacity onPress={() => borrarCompra(c.id)}>
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.msiMetrics}>
                    <View style={styles.msiMetric}>
                      <Text style={styles.msiMetricLabel}>Total</Text>
                      <Text style={styles.msiMetricValor}>{formatMXN(c.monto_total)}</Text>
                    </View>
                    <View style={styles.msiMetric}>
                      <Text style={styles.msiMetricLabel}>Cuota</Text>
                      <Text style={styles.msiMetricValor}>{formatMXN(cuotaMonto)}</Text>
                    </View>
                    <View style={styles.msiMetric}>
                      <Text style={styles.msiMetricLabel}>Meses</Text>
                      <Text style={styles.msiMetricValor}>{c.meses} MSI</Text>
                    </View>
                  </View>
                  <Text style={styles.msiSub}>{c.fecha_compra} · {c.categoria}</Text>
                </View>
              );
            })}
          </>
        )}

        {tab === 'cuotas' && (
          <>
            {cuotas.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>Sin cuotas pendientes este mes</Text>
              </View>
            ) : cuotas.map((c: any) => (
              <View key={c.id} style={styles.cuotaItem}>
                <View>
                  <Text style={styles.itemTitle}>{c.descripcion_compra}</Text>
                  <Text style={styles.itemSub}>Cuota {c.numero_cuota} · {c.fecha_esperada}</Text>
                </View>
                <View style={styles.cuotaRight}>
                  <Text style={styles.itemMonto}>{formatMXN(c.monto_cuota)}</Text>
                  <TouchableOpacity style={styles.pagarBtn} onPress={async () => { await marcarCuotaPagada(c.id); cargarDatos(); }}>
                    <Text style={styles.pagarBtnText}>Pagar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Modal gasto */}
      <Modal visible={modalGasto} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nuevo gasto</Text>
            <TouchableOpacity onPress={() => setModalGasto(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descripción</Text>
              <TextInput style={styles.input} placeholder="Super, gasolina..." placeholderTextColor="#9CA3AF" value={formGasto.descripcion} onChangeText={v => setFormGasto(p => ({ ...p, descripcion: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad" value={formGasto.monto} onChangeText={v => setFormGasto(p => ({ ...p, monto: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Fecha</Text>
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" value={formGasto.fecha} onChangeText={v => setFormGasto(p => ({ ...p, fecha: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>¿Con tarjeta de crédito?</Text>
              <View style={styles.toggleRow}>
                {(['Sí', 'No'] as const).map((op, i) => (
                  <TouchableOpacity key={op} style={[styles.toggleBtn, (i === 0 ? usaTarjeta : !usaTarjeta) && styles.toggleBtnActive]} onPress={() => setUsaTarjeta(i === 0)}>
                    <Text style={[styles.toggleText, (i === 0 ? usaTarjeta : !usaTarjeta) && styles.toggleTextActive]}>{op}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {usaTarjeta ? (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tarjeta</Text>
                {tarjetas.map(t => (
                  <TouchableOpacity key={t.id} style={[styles.selectorItem, formGasto.tarjeta_version_id === t.id && styles.selectorItemActive]} onPress={() => setFormGasto(p => ({ ...p, tarjeta_version_id: t.id }))}>
                    <Text style={styles.selectorText}>{t.nombre} — {t.banco}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cuenta</Text>
                {cuentas.map(c => (
                  <TouchableOpacity key={c.id} style={[styles.selectorItem, formGasto.cuenta_liquidez_id === c.id && styles.selectorItemActive]} onPress={() => setFormGasto(p => ({ ...p, cuenta_liquidez_id: c.id }))}>
                    <Text style={styles.selectorText}>{c.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Categoría</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipsRow}>
                  {CATEGORIAS.map(cat => (
                    <TouchableOpacity key={cat} style={[styles.chip, formGasto.categoria === cat && styles.chipActive]} onPress={() => setFormGasto(p => ({ ...p, categoria: cat }))}>
                      <Text style={[styles.chipText, formGasto.categoria === cat && styles.chipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={guardarGasto}>
              <Text style={styles.saveBtnText}>Guardar gasto</Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Modal MSI */}
      <Modal visible={modalMSI} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nueva compra MSI</Text>
            <TouchableOpacity onPress={() => setModalMSI(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descripción</Text>
              <TextInput style={styles.input} placeholder="Laptop, celular..." placeholderTextColor="#9CA3AF" value={formMSI.descripcion} onChangeText={v => setFormMSI(p => ({ ...p, descripcion: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto total ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad" value={formMSI.monto_total} onChangeText={v => setFormMSI(p => ({ ...p, monto_total: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Meses sin intereses</Text>
              <View style={styles.chipsRow}>
                {MSI_OPTS.map(m => (
                  <TouchableOpacity key={m} style={[styles.chip, formMSI.meses === String(m) && styles.chipActive]} onPress={() => setFormMSI(p => ({ ...p, meses: String(m) }))}>
                    <Text style={[styles.chipText, formMSI.meses === String(m) && styles.chipTextActive]}>{m === 1 ? 'Contado' : `${m} MSI`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Fecha de compra</Text>
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" value={formMSI.fecha_compra} onChangeText={v => setFormMSI(p => ({ ...p, fecha_compra: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Tarjeta</Text>
              {tarjetas.map(t => (
                <TouchableOpacity key={t.id} style={[styles.selectorItem, formMSI.tarjeta_version_id === t.id && styles.selectorItemActive]} onPress={() => setFormMSI(p => ({ ...p, tarjeta_version_id: t.id }))}>
                  <Text style={styles.selectorText}>{t.nombre} — {t.banco}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={guardarMSI}>
              <Text style={styles.saveBtnText}>Guardar compra</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 24, fontWeight: '600', color: '#111827' },
  headerBtns: { flexDirection: 'row', gap: 8 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#4F46E5' },
  tabText: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  tabTextActive: { color: '#4F46E5' },
  scroll: { padding: 16 },
  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  itemIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  itemTitle: { fontSize: 14, fontWeight: '500', color: '#111827' },
  itemSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  itemTag: { fontSize: 11, color: '#6366F1', marginTop: 2 },
  itemRight: { alignItems: 'flex-end', gap: 4 },
  itemMonto: { fontSize: 15, fontWeight: '600', color: '#111827' },
  msiCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8 },
  msiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  msiTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  msiMetrics: { flexDirection: 'row', gap: 16, marginBottom: 6 },
  msiMetric: {},
  msiMetricLabel: { fontSize: 11, color: '#9CA3AF' },
  msiMetricValor: { fontSize: 14, fontWeight: '600', color: '#111827' },
  msiSub: { fontSize: 11, color: '#9CA3AF' },
  cuotaItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8 },
  cuotaRight: { alignItems: 'flex-end', gap: 6 },
  pagarBtn: { backgroundColor: '#10B981', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  pagarBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  modalBody: { padding: 20 },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, color: '#374151', fontWeight: '500', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 0.5, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, fontSize: 15, color: '#111827' },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#EEF2FF' },
  toggleText: { fontSize: 14, color: '#6B7280' },
  toggleTextActive: { color: '#4F46E5', fontWeight: '600' },
  selectorItem: { padding: 12, borderRadius: 8, backgroundColor: '#F9FAFB', marginBottom: 6, borderWidth: 0.5, borderColor: '#E5E7EB' },
  selectorItemActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  selectorText: { fontSize: 14, color: '#374151' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 0.5, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  chipText: { fontSize: 12, color: '#6B7280' },
  chipTextActive: { color: '#4F46E5', fontWeight: '600' },
  saveBtn: { backgroundColor: '#4F46E5', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});