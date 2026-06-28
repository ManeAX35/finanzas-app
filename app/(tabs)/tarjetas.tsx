import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Modal, TextInput,
  RefreshControl, Alert, Switch
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  obtenerTarjetas, crearTarjeta, actualizarTarjeta,
  eliminarTarjeta, obtenerPeriodoActual
} from '../../database/queries/tarjetas';
import { formatMXN } from '../../database';
import { TarjetaConVersion } from '../../types';

const COLORES = ['blue', 'teal', 'purple', 'coral', 'amber', 'gray'];
const COLOR_MAP: Record<string, string> = {
  blue: '#3B82F6', teal: '#14B8A6', purple: '#8B5CF6',
  coral: '#F97316', amber: '#F59E0B', gray: '#6B7280',
};

const FORM_INICIAL = {
  banco: '', nombre: '', digitos: '', limite_credito: '',
  dia_corte: '', dias_pago: '20', tasa_anual: '', color: 'blue',
};

export default function TarjetasScreen() {
  const [tarjetas, setTarjetas] = useState<TarjetaConVersion[]>([]);
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [esDepartamental, setEsDepartamental] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);

  const cargarDatos = async () => {
    try {
      const lista = await obtenerTarjetas();
      setTarjetas(lista);
      const map: Record<string, number> = {};
      for (const t of lista) {
        const p = await obtenerPeriodoActual(t.tarjeta_id);
        map[t.tarjeta_id] = p?.saldo_calculado ?? 0;
      }
      setSaldos(map);
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
    setEsDepartamental(false);
    setModalVisible(true);
  };

  const abrirEditar = (t: TarjetaConVersion) => {
    setEditando(t.tarjeta_id);
    setEsDepartamental(t.tipo === 'departamental');
    setForm({
      banco: t.banco, nombre: t.nombre, digitos: t.digitos ?? '',
      limite_credito: String(t.limite_credito), dia_corte: String(t.dia_corte),
      dias_pago: String(t.dias_pago), tasa_anual: String(t.tasa_anual), color: t.color,
    });
    setModalVisible(true);
  };

  const guardar = async () => {
    if (!form.banco || !form.nombre || !form.dia_corte) {
      Alert.alert('Campos requeridos', 'Banco, nombre y día de corte son obligatorios.');
      return;
    }
    try {
      const datos = {
        banco: form.banco, nombre: form.nombre, digitos: form.digitos,
        limite_credito: parseFloat(form.limite_credito) || 0,
        dia_corte: parseInt(form.dia_corte),
        dias_pago: parseInt(form.dias_pago) || 20,
        tasa_anual: parseFloat(form.tasa_anual) || 0,
        color: form.color,
      };
      if (editando) {
        await actualizarTarjeta(editando, datos);
      } else {
        await crearTarjeta(esDepartamental ? 'departamental' : 'bancaria', datos);
      }
      setModalVisible(false);
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la tarjeta.');
    }
  };

  const eliminar = (tarjetaId: string, nombre: string) => {
    Alert.alert('Eliminar tarjeta', `¿Eliminar ${nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        await eliminarTarjeta(tarjetaId);
        cargarDatos();
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tarjetas</Text>
        <TouchableOpacity style={styles.addBtn} onPress={abrirNueva}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargarDatos(); }} />}
      >
        {tarjetas.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>Sin tarjetas</Text>
            <Text style={styles.emptyText}>Agrega tu primera tarjeta tocando el botón +</Text>
          </View>
        ) : (
          tarjetas.map(t => {
            const saldo = saldos[t.tarjeta_id] ?? 0;
            const pct = t.limite_credito > 0 ? (saldo / t.limite_credito) * 100 : 0;
            const color = COLOR_MAP[t.color] ?? '#6366F1';
            const barColor = pct > 70 ? '#EF4444' : pct > 40 ? '#F59E0B' : '#10B981';
            return (
              <View key={t.tarjeta_id} style={[styles.card, { borderLeftColor: color }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIconBg, { backgroundColor: color + '20' }]}>
                    <Ionicons name={t.tipo === 'departamental' ? 'storefront-outline' : 'card-outline'} size={20} color={color} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardNombre}>{t.nombre}</Text>
                    <Text style={styles.cardBanco}>{t.banco} {t.digitos ? `···${t.digitos}` : ''}</Text>
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity onPress={() => abrirEditar(t)} style={styles.iconBtn}>
                      <Ionicons name="pencil-outline" size={16} color="#6B7280" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => eliminar(t.tarjeta_id, t.nombre)} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.cardMetrics}>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Saldo usado</Text>
                    <Text style={[styles.metricValor, { color: barColor }]}>{formatMXN(saldo)}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Disponible</Text>
                    <Text style={styles.metricValor}>{formatMXN(t.limite_credito - saldo)}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Límite</Text>
                    <Text style={styles.metricValor}>{formatMXN(t.limite_credito)}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Corte</Text>
                    <Text style={styles.metricValor}>Día {t.dia_corte}</Text>
                  </View>
                </View>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }]} />
                </View>
                <Text style={styles.pctText}>{pct.toFixed(0)}% utilizado · Pago {t.dias_pago} días después del corte</Text>
                {t.tasa_anual > 0 && (
                  <Text style={styles.tasaText}>Tasa anual: {t.tasa_anual}%</Text>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editando ? 'Editar tarjeta' : 'Nueva tarjeta'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Tarjeta departamental</Text>
              <Switch value={esDepartamental} onValueChange={setEsDepartamental} trackColor={{ true: '#6366F1' }} />
            </View>

            {[
              { label: 'Banco / Tienda', key: 'banco', placeholder: 'BBVA, Liverpool...' },
              { label: 'Nombre / apodo', key: 'nombre', placeholder: 'Oro, Azul...' },
              { label: 'Últimos 4 dígitos', key: 'digitos', placeholder: '1234', maxLength: 4, keyboardType: 'numeric' as const },
              { label: 'Límite de crédito ($)', key: 'limite_credito', placeholder: '30000', keyboardType: 'decimal-pad' as const },
              { label: 'Día de corte', key: 'dia_corte', placeholder: '15', keyboardType: 'number-pad' as const },
              { label: 'Días para pago después del corte', key: 'dias_pago', placeholder: '20', keyboardType: 'number-pad' as const },
              { label: 'Tasa de interés anual (%)', key: 'tasa_anual', placeholder: '36', keyboardType: 'decimal-pad' as const },
            ].map(f => (
              <View key={f.key} style={styles.formGroup}>
                <Text style={styles.formLabel}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={f.placeholder}
                  placeholderTextColor="#9CA3AF"
                  value={form[f.key as keyof typeof form]}
                  onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                  keyboardType={f.keyboardType}
                  maxLength={f.maxLength}
                />
              </View>
            ))}

            <Text style={styles.formLabel}>Color</Text>
            <View style={styles.coloresRow}>
              {COLORES.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: COLOR_MAP[c] },
                    form.color === c && styles.colorDotSelected]}
                  onPress={() => setForm(p => ({ ...p, color: c }))}
                />
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={guardar}>
              <Text style={styles.saveBtnText}>Guardar tarjeta</Text>
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
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16 },
  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: '#6B7280' },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12, borderLeftWidth: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  cardIconBg: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardNombre: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardBanco: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  cardMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  metric: { minWidth: '40%' },
  metricLabel: { fontSize: 11, color: '#9CA3AF' },
  metricValor: { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 2 },
  progressBg: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', borderRadius: 3 },
  pctText: { fontSize: 11, color: '#9CA3AF' },
  tasaText: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  modal: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  modalBody: { padding: 20 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, backgroundColor: '#F9FAFB', padding: 14, borderRadius: 10 },
  switchLabel: { fontSize: 14, color: '#374151' },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, color: '#374151', fontWeight: '500', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 0.5, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, fontSize: 15, color: '#111827' },
  coloresRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 24 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotSelected: { borderWidth: 3, borderColor: '#111827' },
  saveBtn: { backgroundColor: '#4F46E5', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});