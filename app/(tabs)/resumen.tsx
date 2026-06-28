import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  RefreshControl, TouchableOpacity
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerTarjetas, obtenerPeriodoActual } from '../../database/queries/tarjetas';
import { obtenerTotalDisponible, obtenerSaldosTodos } from '../../database/queries/liquidez';
import { obtenerCuentasInversion, calcularRendimientoHoy } from '../../database/queries/inversiones';
import { obtenerRecurrentes } from '../../database/queries/recurrentes';
import { obtenerCuotasPendientesMes } from '../../database/queries/gastos';
import { formatMXN } from '../../database';
import { TarjetaConVersion } from '../../types';

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

  const cargarDatos = async () => {
    try {
      const hoy = new Date();
      const anio = hoy.getFullYear();
      const mes = hoy.getMonth() + 1;

      const [disponible, saldos, tarjetasList, recurrentes, cuotas, inversiones] =
        await Promise.all([
          obtenerTotalDisponible(),
          obtenerSaldosTodos(),
          obtenerTarjetas(),
          obtenerRecurrentes(),
          obtenerCuotasPendientesMes(anio, mes),
          obtenerCuentasInversion(),
        ]);

      setTotalDisponible(disponible);
      setCuentasLiquidez(saldos);
      setTarjetas(tarjetasList);

      // Saldo por tarjeta
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
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Resumen</Text>
        <Text style={styles.headerDate}>
          {new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
        </Text>
      </View>

      {/* Patrimonio neto */}
      <View style={styles.patrimonioCard}>
        <Text style={styles.patrimonioLabel}>Patrimonio neto</Text>
        <Text style={[styles.patrimonioValor, { color: patrimonioNeto >= 0 ? '#10B981' : '#EF4444' }]}>
          {formatMXN(patrimonioNeto)}
        </Text>
        <Text style={styles.patrimonioSub}>disponible + inversiones − deuda</Text>
      </View>

      {/* Métricas principales */}
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

      {/* Balance del mes */}
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

      {/* Cuentas de liquidez */}
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

      {/* Tarjetas */}
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
      <TouchableOpacity style={styles.bottomBtn} onPress={() => {}}>
        <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
        <Text style={styles.bottomBtnText}>Agregar gasto</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#6B7280', fontSize: 16 },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 24, fontWeight: '600', color: '#111827' },
  headerDate: { fontSize: 14, color: '#6B7280', marginTop: 2, textTransform: 'capitalize' },
  patrimonioCard: { margin: 16, backgroundColor: '#4F46E5', borderRadius: 16, padding: 20, alignItems: 'center' },
  patrimonioLabel: { fontSize: 13, color: '#C7D2FE', marginBottom: 4 },
  patrimonioValor: { fontSize: 32, fontWeight: '700', color: '#FFFFFF' },
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
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 24, backgroundColor: '#FFFFFF', borderTopWidth: 0.5, borderTopColor: '#E5E7EB' },
  bottomBtn: { backgroundColor: '#4F46E5', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottomBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});