import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl, Dimensions
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerGastosPorMes } from '../../database/queries/gastos';
import { obtenerMovimientosPorMes, obtenerSaldosTodos } from '../../database/queries/liquidez';
import { obtenerTarjetas, obtenerPeriodos } from '../../database/queries/tarjetas';
import { obtenerRecurrentesPorMes } from '../../database/queries/recurrentes';
import { formatMXN } from '../../database';

const { width } = Dimensions.get('window');
const BAR_WIDTH = (width - 80) / 6;

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const CATEGORIA_COLORES: Record<string, string> = {
  'Alimentación': '#10B981',
  'Transporte': '#3B82F6',
  'Salud': '#EF4444',
  'Entretenimiento': '#8B5CF6',
  'Ropa': '#F97316',
  'Hogar': '#F59E0B',
  'Tecnología': '#6366F1',
  'Educación': '#14B8A6',
  'Viaje': '#EC4899',
  'Otro': '#6B7280',
};

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [mesActual] = useState(new Date().getMonth());
  const [anioActual] = useState(new Date().getFullYear());
  const [gastosPorCategoria, setGastosPorCategoria] = useState<{ categoria: string; total: number }[]>([]);
  const [gastosPorMes, setGastosPorMes] = useState<{ mes: number; total: number }[]>([]);
  const [ingresosPorMes, setIngresosPorMes] = useState<{ mes: number; total: number }[]>([]);
  const [deudaPorMes, setDeudaPorMes] = useState<{ mes: number; total: number }[]>([]);
  const [totalGastosMes, setTotalGastosMes] = useState(0);
  const [totalIngresosMes, setTotalIngresosMes] = useState(0);
  const [totalRecurrentesMes, setTotalRecurrentesMes] = useState(0);

  const cargarDatos = async () => {
    try {
      const gastosMap: Record<number, number> = {};
      const ingresosMap: Record<number, number> = {};
      const deudaMap: Record<number, number> = {};
      const categoriasMap: Record<string, number> = {};

      // Últimos 6 meses
      for (let i = 5; i >= 0; i--) {
        let mes = mesActual - i;
        let anio = anioActual;
        if (mes < 0) { mes += 12; anio -= 1; }
        const mesReal = mes + 1;

        const [gastos, movimientos, recurrentes] = await Promise.all([
          obtenerGastosPorMes(anio, mesReal),
          obtenerMovimientosPorMes(anio, mesReal),
          obtenerRecurrentesPorMes(anio, mesReal),
        ]);

        const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
        const totalRec = recurrentes.reduce((s: number, r: any) => s + (r.monto_cobrado ?? r.monto_esperado ?? 0), 0);
        gastosMap[mes] = totalGastos + totalRec;

        const totalIngresos = movimientos
          .filter(m => m.tipo === 'ingreso')
          .reduce((s, m) => s + m.monto, 0);
        ingresosMap[mes] = totalIngresos;

        // Categorías solo del mes actual
        if (i === 0) {
          for (const g of gastos) {
            const cat = g.categoria ?? 'Otro';
            categoriasMap[cat] = (categoriasMap[cat] ?? 0) + g.monto;
          }
          setTotalGastosMes(totalGastos);
          setTotalIngresosMes(totalIngresos);
          setTotalRecurrentesMes(totalRec);
        }
      }

      // Deuda por tarjeta por mes
      const tarjetas = await obtenerTarjetas();
      for (const t of tarjetas) {
        const periodos = await obtenerPeriodos(t.tarjeta_id);
        for (const p of periodos) {
          const fecha = new Date(p.fecha_corte);
          const mes = fecha.getMonth();
          deudaMap[mes] = (deudaMap[mes] ?? 0) + p.saldo_calculado;
        }
      }

      const meses6 = Array.from({ length: 6 }, (_, i) => {
        let mes = mesActual - (5 - i);
        if (mes < 0) mes += 12;
        return mes;
      });

      setGastosPorMes(meses6.map(m => ({ mes: m, total: gastosMap[m] ?? 0 })));
      setIngresosPorMes(meses6.map(m => ({ mes: m, total: ingresosMap[m] ?? 0 })));
      setDeudaPorMes(meses6.map(m => ({ mes: m, total: deudaMap[m] ?? 0 })));

      const cats = Object.entries(categoriasMap)
        .map(([categoria, total]) => ({ categoria, total }))
        .sort((a, b) => b.total - a.total);
      setGastosPorCategoria(cats);

    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { cargarDatos(); }, []));

  const maxGasto = Math.max(...gastosPorMes.map(g => g.total), 1);
  const maxIngreso = Math.max(...ingresosPorMes.map(g => g.total), 1);
  const maxBar = Math.max(maxGasto, maxIngreso, 1);
  const totalCategorias = gastosPorCategoria.reduce((s, c) => s + c.total, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <Text style={styles.headerSub}>{MESES[mesActual]} {anioActual}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargarDatos(); }} />}
      >
        {/* Métricas del mes */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { borderTopColor: '#10B981' }]}>
            <Text style={styles.metricLabel}>Ingresos</Text>
            <Text style={[styles.metricValor, { color: '#10B981' }]}>{formatMXN(totalIngresosMes)}</Text>
          </View>
          <View style={[styles.metricCard, { borderTopColor: '#EF4444' }]}>
            <Text style={styles.metricLabel}>Gastos</Text>
            <Text style={[styles.metricValor, { color: '#EF4444' }]}>{formatMXN(totalGastosMes)}</Text>
          </View>
          <View style={[styles.metricCard, { borderTopColor: '#F59E0B' }]}>
            <Text style={styles.metricLabel}>Recurrentes</Text>
            <Text style={[styles.metricValor, { color: '#F59E0B' }]}>{formatMXN(totalRecurrentesMes)}</Text>
          </View>
        </View>

        {/* Gráfica de barras - Gastos vs Ingresos */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Gastos vs Ingresos — últimos 6 meses</Text>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.legendText}>Gastos</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.legendText}>Ingresos</Text>
            </View>
          </View>
          <View style={styles.barsContainer}>
            {gastosPorMes.map((g, i) => {
              const ingreso = ingresosPorMes[i]?.total ?? 0;
              const alturaGasto = (g.total / maxBar) * 150;
              const alturaIngreso = (ingreso / maxBar) * 150;
              return (
                <View key={g.mes} style={styles.barGroup}>
                  <View style={styles.barsRow}>
                    <View style={[styles.bar, { height: Math.max(alturaGasto, 4), backgroundColor: '#EF4444' }]} />
                    <View style={[styles.bar, { height: Math.max(alturaIngreso, 4), backgroundColor: '#10B981' }]} />
                  </View>
                  <Text style={styles.barLabel}>{MESES[g.mes]}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Gráfica de deuda */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Deuda en tarjetas — últimos 6 meses</Text>
          <View style={styles.barsContainer}>
            {deudaPorMes.map((d) => {
              const maxDeuda = Math.max(...deudaPorMes.map(x => x.total), 1);
              const altura = (d.total / maxDeuda) * 120;
              const color = d.total > 0 ? '#6366F1' : '#E5E7EB';
              return (
                <View key={d.mes} style={styles.barGroup}>
                  <Text style={styles.barAmount}>{d.total > 0 ? formatMXN(d.total).replace('$', '') : ''}</Text>
                  <View style={[styles.barSingle, { height: Math.max(altura, 4), backgroundColor: color }]} />
                  <Text style={styles.barLabel}>{MESES[d.mes]}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Gastos por categoría */}
        {gastosPorCategoria.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Gastos por categoría — {MESES[mesActual]}</Text>
            {gastosPorCategoria.map(c => {
              const pct = totalCategorias > 0 ? (c.total / totalCategorias) * 100 : 0;
              const color = CATEGORIA_COLORES[c.categoria] ?? '#6B7280';
              return (
                <View key={c.categoria} style={styles.catRow}>
                  <View style={styles.catLeft}>
                    <View style={[styles.catDot, { backgroundColor: color }]} />
                    <Text style={styles.catNombre}>{c.categoria}</Text>
                  </View>
                  <View style={styles.catRight}>
                    <Text style={styles.catMonto}>{formatMXN(c.total)}</Text>
                    <Text style={styles.catPct}>{pct.toFixed(0)}%</Text>
                  </View>
                  <View style={styles.catBarBg}>
                    <View style={[styles.catBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Balance del mes */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Balance {MESES[mesActual]}</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Ingresos</Text>
            <Text style={[styles.balanceValor, { color: '#10B981' }]}>{formatMXN(totalIngresosMes)}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Gastos directos</Text>
            <Text style={[styles.balanceValor, { color: '#EF4444' }]}>− {formatMXN(totalGastosMes)}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Recurrentes</Text>
            <Text style={[styles.balanceValor, { color: '#EF4444' }]}>− {formatMXN(totalRecurrentesMes)}</Text>
          </View>
          <View style={[styles.balanceRow, styles.balanceTotalRow]}>
            <Text style={styles.balanceTotalLabel}>Diferencia</Text>
            <Text style={[styles.balanceTotalValor, {
              color: (totalIngresosMes - totalGastosMes - totalRecurrentesMes) >= 0 ? '#10B981' : '#EF4444'
            }]}>
              {formatMXN(totalIngresosMes - totalGastosMes - totalRecurrentesMes)}
            </Text>
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 24, fontWeight: '600', color: '#111827' },
  headerSub: { fontSize: 13, color: '#6B7280', marginTop: 2, textTransform: 'capitalize' },
  scroll: { padding: 16 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metricCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, borderTopWidth: 3, alignItems: 'center' },
  metricLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  metricValor: { fontSize: 13, fontWeight: '700' },
  chartCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 16 },
  chartTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 14 },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#6B7280' },
  barsContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 180 },
  barGroup: { alignItems: 'center', flex: 1 },
  barsRow: { flexDirection: 'row', gap: 3, alignItems: 'flex-end' },
  bar: { width: BAR_WIDTH / 2.5, borderRadius: 3 },
  barSingle: { width: BAR_WIDTH * 0.7, borderRadius: 3 },
  barLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 6 },
  barAmount: { fontSize: 8, color: '#6B7280', marginBottom: 2 },
  catRow: { marginBottom: 12 },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catNombre: { fontSize: 13, color: '#374151', flex: 1 },
  catRight: { position: 'absolute', right: 0, top: 0, flexDirection: 'row', gap: 8, alignItems: 'center' },
  catMonto: { fontSize: 13, fontWeight: '600', color: '#111827' },
  catPct: { fontSize: 11, color: '#9CA3AF', minWidth: 32, textAlign: 'right' },
  catBarBg: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 3 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  balanceLabel: { fontSize: 14, color: '#6B7280' },
  balanceValor: { fontSize: 14, fontWeight: '500' },
  balanceTotalRow: { borderTopWidth: 0.5, borderTopColor: '#E5E7EB', paddingTop: 10, marginTop: 4 },
  balanceTotalLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  balanceTotalValor: { fontSize: 16, fontWeight: '700' },
});