import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  RefreshControl, TouchableOpacity, Modal, TextInput, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerTarjetas, obtenerPeriodoActual } from '../../database/queries/tarjetas';
import { obtenerTotalDisponible, obtenerSaldosTodos, crearMovimiento } from '../../database/queries/liquidez';
import { obtenerCuentasInversion, calcularRendimientoHoy } from '../../database/queries/inversiones';
import { obtenerRecurrentes } from '../../database/queries/recurrentes';
import { obtenerCuotasPendientesMes, crearGasto } from '../../database/queries/gastos';
import { obtenerCuentasLiquidez } from '../../database/queries/liquidez';
import { formatMXN, hoy } from '../../database';
import { TarjetaConVersion, CuentaLiquidez } from '../../types';
import Header from '../../components/Header';

const CATEGORIAS_GASTO = ['Alimentación', 'Transporte', 'Salud', 'Entretenimiento', 'Ropa', 'Hogar', 'Tecnología', 'Educación', 'Viaje', 'Otro'];
const CATEGORIAS_INGRESO = ['Sueldo', 'Freelance', 'Venta', 'Reembolso', 'Transferencia', 'Otro'];

export default function ResumenScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalDisponible, setTotalDisponible] = useState(0);
  const [totalDeuda, setTotalDeuda] = useState(0);
  const [totalRecurrentes, setTotalRecurrentes] = useState(0);
  const [totalMSI, setTotalMSI] = useState(0);
  const [totalInversiones, setTotalInversiones] = useState(0);
  const [cuentasLiquidez, setCuentasLiquidez] = useState<{ id: string; nombre: string; saldo: number }[]>([]);
  const [tarjetas, setTarjetas] = useState<TarjetaConVersion[]>([]);
  const [tarjetasSaldo, setTarjetasSaldo] = useState<Record<string, number>>({});
  const [cuentas, setCuentas] = useState<CuentaLiquidez[]>([]);

  const [modalGasto, setModalGasto] = useState(false);
  const [modalIngreso, setModalIngreso] = useState(false);
  const [usaTarjeta, setUsaTarjeta] = useState(true);

  const [formGasto, setFormGasto] = useState({
    descripcion: '', monto: '', fecha: hoy(),
    categoria: 'Alimentación', tarjeta_version_id: '', cuenta_liquidez_id: '',
  });

  const [formIngreso, setFormIngreso] = useState({
    monto: '', descripcion: '', categoria: 'Sueldo',
    fecha: hoy(), cuenta_id: '',
  });

  const cargarDatos = async () => {
    try {
      const hoyDate = new Date();
      const anio = hoyDate.getFullYear();
      const mes = hoyDate.getMonth() + 1;

      const [disponible, saldos, tarjetasList, recurrentes, cuotas, inversiones, cuentasList] =
        await Promise.all([
          obtenerTotalDisponible(),
          obtenerSaldosTodos(),
          obtenerTarjetas(),
          obtenerRecurrentes(),
          obtenerCuotasPendientesMes(anio, mes),
          obtenerCuentasInversion(),
          obtenerCuentasLiquidez(),
        ]);

      setTotalDisponible(disponible);
      setCuentasLiquidez(saldos);
      setTarjetas(tarjetasList);
      setCuentas(cuentasList);

      const saldosMap: Record<string, number> = {};
      for (const t of tarjetasList) {
        const periodo = await obtenerPeriodoActual(t.tarjeta_id);
        saldosMap[t.tarjeta_id] = periodo?.saldo_calculado ?? 0;
      }
      setTarjetasSaldo(saldosMap);

      const deudaTotal = Object.values(saldosMap).reduce((s, v) => s + v, 0);
      setTotalDeuda(deudaTotal);

      const recMensual = recurrentes
        .filter(r => r.frecuencia === 'mensual')
        .reduce((s, r) => s + r.monto, 0);
      setTotalRecurrentes(recMensual);

      const msiTotal = cuotas.reduce((s, c) => s + c.monto_cuota, 0);
      setTotalMSI(msiTotal);

      let invTotal = 0;
      for (const inv of inversiones) {
        const { saldoEsperado } = await calcularRendimientoHoy(inv.id);
        invTotal += saldoEsperado;
      }
      setTotalInversiones(invTotal);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { cargarDatos(); }, []));

  const onRefresh = () => { setRefreshing(true); cargarDatos(); };

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
        tarjeta_version_id: usaTarjeta ? formGasto.tarjeta_version_id || undefined : undefined,
        cuenta_liquidez_id: !usaTarjeta ? formGasto.cuenta_liquidez_id || undefined : undefined,
      });
      setModalGasto(false);
      setFormGasto({ descripcion: '', monto: '', fecha: hoy(), categoria: 'Alimentación', tarjeta_version_id: '', cuenta_liquidez_id: '' });
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el gasto.');
    }
  };

  const guardarIngreso = async () => {
    if (!formIngreso.monto || !formIngreso.cuenta_id) {
      Alert.alert('Campos requeridos', 'Monto y cuenta son obligatorios.');
      return;
    }
    try {
      await crearMovimiento({
        cuenta_id: formIngreso.cuenta_id,
        tipo: 'ingreso',
        monto: parseFloat(formIngreso.monto),
        fecha: formIngreso.fecha,
        descripcion: formIngreso.descripcion,
        categoria: formIngreso.categoria,
      });
      setModalIngreso(false);
      setFormIngreso({ monto: '', descripcion: '', categoria: 'Sueldo', fecha: hoy(), cuenta_id: '' });
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el ingreso.');
    }
  };

  const neto = totalDisponible - totalDeuda;
  const patrimonioNeto = totalDisponible + totalInversiones - totalDeuda;

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Header
          title="Resumen"
          subtitle={new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
        />

        <View style={styles.patrimonioCard}>
          <Text style={styles.patrimonioLabel}>Patrimonio neto</Text>
          <Text style={[styles.patrimonioValor, { color: patrimonioNeto >= 0 ? '#FFFFFF' : '#FCA5A5' }]}>
            {formatMXN(patrimonioNeto)}
          </Text>
          <Text style={styles.patrimonioSub}>disponible + inversiones − deuda</Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={[styles.metricCard, { borderLeftColor: '#10B981' }]}>
            <Ionicons name="wallet-outline" size={18} color="#10B981" />
            <Text style={styles.metricLabel}>Disponible</Text>
            <Text style={[styles.metricValor, { color: '#10B981' }]}>{formatMXN(totalDisponible)}</Text>
          </View>
          <View style={[styles.metricCard, { borderLeftColor: '#EF4444' }]}>
            <Ionicons name="card-outline" size={18} color="#EF4444" />
            <Text style={styles.metricLabel}>Deuda total</Text>
            <Text style={[styles.metricValor, { color: '#EF4444' }]}>{formatMXN(totalDeuda)}</Text>
          </View>
          <View style={[styles.metricCard, { borderLeftColor: '#F59E0B' }]}>
            <Ionicons name="repeat-outline" size={18} color="#F59E0B" />
            <Text style={styles.metricLabel}>Recurrentes</Text>
            <Text style={[styles.metricValor, { color: '#F59E0B' }]}>{formatMXN(totalRecurrentes)}</Text>
          </View>
          <View style={[styles.metricCard, { borderLeftColor: '#6366F1' }]}>
            <Ionicons name="trending-up-outline" size={18} color="#6366F1" />
            <Text style={styles.metricLabel}>Inversiones</Text>
            <Text style={[styles.metricValor, { color: '#6366F1' }]}>{formatMXN(totalInversiones)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Balance del mes</Text>
          <View style={styles.balanceCard}>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Disponible</Text>
              <Text style={[styles.balanceValor, { color: '#10B981' }]}>{formatMXN(totalDisponible)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Cuotas MSI este mes</Text>
              <Text style={[styles.balanceValor, { color: '#EF4444' }]}>− {formatMXN(totalMSI)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Recurrentes este mes</Text>
              <Text style={[styles.balanceValor, { color: '#EF4444' }]}>− {formatMXN(totalRecurrentes)}</Text>
            </View>
            <View style={[styles.balanceRow, styles.balanceTotalRow]}>
              <Text style={styles.balanceTotalLabel}>Neto después de pagos</Text>
              <Text style={[styles.balanceTotalValor, { color: neto >= 0 ? '#10B981' : '#EF4444' }]}>
                {formatMXN(neto)}
              </Text>
            </View>
          </View>
        </View>

        {cuentasLiquidez.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mis cuentas</Text>
            {cuentasLiquidez.map(c => (
              <View key={c.id} style={styles.cuentaRow}>
                <View style={styles.cuentaIcon}>
                  <Ionicons name="wallet-outline" size={16} color="#6366F1" />
                </View>
                <Text style={styles.cuentaNombre}>{c.nombre}</Text>
                <Text style={[styles.cuentaSaldo, { color: c.saldo >= 0 ? '#10B981' : '#EF4444' }]}>
                  {formatMXN(c.saldo)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {tarjetas.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tarjetas este corte</Text>
            {tarjetas.map(t => {
              const saldo = tarjetasSaldo[t.tarjeta_id] ?? 0;
              const pct = t.limite_credito > 0 ? (saldo / t.limite_credito) * 100 : 0;
              const color = pct > 70 ? '#EF4444' : pct > 40 ? '#F59E0B' : '#10B981';
              return (
                <View key={t.tarjeta_id} style={styles.tarjetaCard}>
                  <View style={styles.tarjetaHeader}>
                    <View>
                      <Text style={styles.tarjetaNombre}>{t.nombre}</Text>
                      <Text style={styles.tarjetaBanco}>{t.banco}</Text>
                    </View>
                    <Text style={[styles.tarjetaSaldo, { color }]}>{formatMXN(saldo)}</Text>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={styles.tarjetaLimite}>
                    {formatMXN(t.limite_credito - saldo)} disponible · Corte día {t.dia_corte}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {tarjetas.length === 0 && cuentasLiquidez.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>Todo listo</Text>
            <Text style={styles.emptyText}>Agrega tus tarjetas y cuentas para ver tu resumen aquí</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomBtnIngreso} onPress={() => setModalIngreso(true)}>
          <Ionicons name="arrow-down-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.bottomBtnText}>Ingreso</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomBtnGasto} onPress={() => setModalGasto(true)}>
          <Ionicons name="arrow-up-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.bottomBtnText}>Gasto</Text>
        </TouchableOpacity>
      </View>

      {/* Modal gasto rápido */}
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
                <TouchableOpacity style={[styles.toggleBtn, usaTarjeta && styles.toggleBtnActive]} onPress={() => setUsaTarjeta(true)}>
                  <Text style={[styles.toggleText, usaTarjeta && styles.toggleTextActive]}>Sí</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toggleBtn, !usaTarjeta && styles.toggleBtnActive]} onPress={() => setUsaTarjeta(false)}>
                  <Text style={[styles.toggleText, !usaTarjeta && styles.toggleTextActive]}>No</Text>
                </TouchableOpacity>
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
              <View style={styles.chipsRow}>
                {CATEGORIAS_GASTO.map(cat => (
                  <TouchableOpacity key={cat} style={[styles.chip, formGasto.categoria === cat && styles.chipActive]} onPress={() => setFormGasto(p => ({ ...p, categoria: cat }))}>
                    <Text style={[styles.chipText, formGasto.categoria === cat && styles.chipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={guardarGasto}>
              <Text style={styles.saveBtnText}>Guardar gasto</Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Modal ingreso rápido */}
      <Modal visible={modalIngreso} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nuevo ingreso</Text>
            <TouchableOpacity onPress={() => setModalIngreso(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad" value={formIngreso.monto} onChangeText={v => setFormIngreso(p => ({ ...p, monto: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descripción (opcional)</Text>
              <TextInput style={styles.input} placeholder="Sueldo, freelance..." placeholderTextColor="#9CA3AF" value={formIngreso.descripcion} onChangeText={v => setFormIngreso(p => ({ ...p, descripcion: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Fecha</Text>
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" value={formIngreso.fecha} onChangeText={v => setFormIngreso(p => ({ ...p, fecha: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>¿A qué cuenta?</Text>
              {cuentas.length === 0 ? (
                <Text style={styles.emptyText}>Primero agrega una cuenta en la sección Cuentas</Text>
              ) : cuentas.map(c => (
                <TouchableOpacity key={c.id} style={[styles.selectorItem, formIngreso.cuenta_id === c.id && styles.selectorItemActive]} onPress={() => setFormIngreso(p => ({ ...p, cuenta_id: c.id }))}>
                  <Text style={styles.selectorText}>{c.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Categoría</Text>
              <View style={styles.chipsRow}>
                {CATEGORIAS_INGRESO.map(cat => (
                  <TouchableOpacity key={cat} style={[styles.chip, formIngreso.categoria === cat && styles.chipActive]} onPress={() => setFormIngreso(p => ({ ...p, categoria: cat }))}>
                    <Text style={[styles.chipText, formIngreso.categoria === cat && styles.chipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#10B981' }]} onPress={guardarIngreso}>
              <Text style={styles.saveBtnText}>Guardar ingreso</Text>
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
  scrollView: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#6B7280', fontSize: 16 },
  patrimonioCard: { margin: 16, backgroundColor: '#4F46E5', borderRadius: 16, padding: 20, alignItems: 'center' },
  patrimonioLabel: { fontSize: 13, color: '#C7D2FE', marginBottom: 4 },
  patrimonioValor: { fontSize: 32, fontWeight: '700' },
  patrimonioSub: { fontSize: 11, color: '#A5B4FC', marginTop: 4 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  metricCard: { flex: 1, minWidth: '45%', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, borderLeftWidth: 3, gap: 4 },
  metricLabel: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  metricValor: { fontSize: 16, fontWeight: '600' },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 10 },
  balanceCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, gap: 10 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: 14, color: '#6B7280' },
  balanceValor: { fontSize: 14, fontWeight: '500' },
  balanceTotalRow: { borderTopWidth: 0.5, borderTopColor: '#E5E7EB', paddingTop: 10, marginTop: 4 },
  balanceTotalLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  balanceTotalValor: { fontSize: 16, fontWeight: '700' },
  cuentaRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14, marginBottom: 8, gap: 10 },
  cuentaIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  cuentaNombre: { flex: 1, fontSize: 14, color: '#374151' },
  cuentaSaldo: { fontSize: 15, fontWeight: '600' },
  tarjetaCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8 },
  tarjetaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  tarjetaNombre: { fontSize: 14, fontWeight: '500', color: '#111827' },
  tarjetaBanco: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  tarjetaSaldo: { fontSize: 16, fontWeight: '600' },
  progressBg: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', borderRadius: 3 },
  tarjetaLimite: { fontSize: 11, color: '#9CA3AF' },
  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: '#6B7280' },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 24, backgroundColor: '#FFFFFF', borderTopWidth: 0.5, borderTopColor: '#E5E7EB', flexDirection: 'row', gap: 10 },
  bottomBtnIngreso: { flex: 1, backgroundColor: '#10B981', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottomBtnGasto: { flex: 1, backgroundColor: '#4F46E5', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottomBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
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