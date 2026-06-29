import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl, Dimensions
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerGastosPorMes } from '../../database/queries/gastos';
import { obtenerMovimientosPorMes } from '../../database/queries/liquidez';
import { obtenerTarjetas, obtenerPeriodos } from '../../database/queries/tarjetas';
import { obtenerRecurrentesPorMes } from '../../database/queries/recurrentes';
import { formatMXN } from '../../database';
import Header from '../../components/Header';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';

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
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const hoyDate = new Date();
  const [refreshing, setRefreshing] = useState(false);
  const [mesSeleccionado, setMesSeleccionado] = useState(hoyDate.getMonth());
  const [anioSeleccionado, setAnioSeleccionado] = useState(hoyDate.getFullYear());
  const [gastosPorCategoria, setGastosPorCategoria] = useState<{ categoria: string; total: number }[]>([]);
  const [gastosPorMes, setGastosPorMes] = useState<{ mes: number; anio: number; total: number }[]>([]);
  const [ingresosPorMes, setIngresosPorMes] = useState<{ mes: number; anio: number; total: number }[]>([]);
  const [deudaPorMes, setDeudaPorMes] = useState<{ mes: number; total: number }[]>([]);
  const [totalGastosMes, setTotalGastosMes] = useState(0);
  const [totalIngresosMes, setTotalIngresosMes] = useState(0);
  const [totalRecurrentesMes, setTotalRecurrentesMes] = useState(0);

  const cargarDatos = async () => {
    try {
      const gastosArr: { mes: number; anio: number; total: number }[] = [];
      const ingresosArr: { mes: number; anio: number; total: number }[] = [];
      const categoriasMap: Record<string, number> = {};

      for (let i = 5; i >= 0; i--) {
        let mes = mesSeleccionado - i;
        let anio = anioSeleccionado;
        if (mes < 0) { mes += 12; anio -= 1; }
        const mesReal = mes + 1;

        const [gastos, movimientos, recurrentes] = await Promise.all([
          obtenerGastosPorMes(anio, mesReal),
          obtenerMovimientosPorMes(anio, mesReal),
          obtenerRecurrentesPorMes(anio, mesReal),
        ]);

        const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
        const totalRec = recurrentes.reduce((s: number, r: any) => s + (r.monto_cobrado ?? r.monto_esperado ?? 0), 0);
        gastosArr.push({ mes, anio, total: totalGastos + totalRec });

        const totalIngresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
        ingresosArr.push({ mes, anio, total: totalIngresos });

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

      const deudaMap: Record<string, number> = {};
      const tarjetas = await obtenerTarjetas();
      for (const t of tarjetas) {
        const periodos = await obtenerPeriodos(t.tarjeta_id);
        for (const p of periodos) {
          const fecha = new Date(p.fecha_corte);
          const key = `${fecha.getFullYear()}-${fecha.getMonth()}`;
          deudaMap[key] = (deudaMap[key] ?? 0) + p.saldo_calculado;
        }
      }

      setGastosPorMes(gastosArr);
      setIngresosPorMes(ingresosArr);
      setDeudaPorMes(gastosArr.map(g => ({ mes: g.mes, total: deudaMap[`${g.anio}-${g.mes}`] ?? 0 })));
      setGastosPorCategoria(
        Object.entries(categoriasMap).map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total)
      );
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { cargarDatos(); }, [mesSeleccionado, anioSeleccionado]));

  const mesAnterior = () => {
    if (mesSeleccionado === 0) { setMesSeleccionado(11); setAnioSeleccionado(a => a - 1); }
    else { setMesSeleccionado(m => m - 1); }
  };

  const mesSiguiente = () => {
    const hoy = new Date();
    if (anioSeleccionado === hoy.getFullYear() && mesSeleccionado === hoy.getMonth()) return;
    if (mesSeleccionado === 11) { setMesSeleccionado(0); setAnioSeleccionado(a => a + 1); }
    else { setMesSeleccionado(m => m + 1); }
  };

  const esMesActual = anioSeleccionado === hoyDate.getFullYear() && mesSeleccionado === hoyDate.getMonth();
  const maxBar = Math.max(...gastosPorMes.map(g => g.total), ...ingresosPorMes.map(g => g.total), 1);
  const totalCategorias = gastosPorCategoria.reduce((s, c) => s + c.total, 0);

  return (
    <View style={styles.container}>
      <Header title="Dashboard" />

      <View style={styles.mesSelector}>
        <TouchableOpacity onPress={mesAnterior} style={styles.mesBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.primary} />
        </TouchableOpacity>
        <View style={styles.mesCentro}>
          <Text style={styles.mesTexto}>{MESES[mesSeleccionado]} {anioSeleccionado}</Text>
          {esMesActual && <View style={styles.mesBadge}><Text style={styles.mesBadgeText}>Actual</Text></View>}
        </View>
        <TouchableOpacity onPress={mesSiguiente} style={[styles.mesBtn, esMesActual && styles.mesBtnDisabled]}>
          <Ionicons name="chevron-forward" size={20} color={esMesActual ? theme.border : theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargarDatos(); }} />}
      >
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { borderTopColor: theme.success }]}>
            <Text style={styles.metricLabel}>Ingresos</Text>
            <Text style={[styles.metricValor, { color: theme.success }]}>{formatMXN(totalIngresosMes)}</Text>
          </View>
          <View style={[styles.metricCard, { borderTopColor: theme.danger }]}>
            <Text style={styles.metricLabel}>Gastos</Text>
            <Text style={[styles.metricValor, { color: theme.danger }]}>{formatMXN(totalGastosMes)}</Text>
          </View>
          <View style={[styles.metricCard, { borderTopColor: theme.warning }]}>
            <Text style={styles.metricLabel}>Recurrentes</Text>
            <Text style={[styles.metricValor, { color: theme.warning }]}>{formatMXN(totalRecurrentesMes)}</Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Gastos vs Ingresos — últimos 6 meses</Text>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.danger }]} />
              <Text style={styles.legendText}>Gastos</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.success }]} />
              <Text style={styles.legendText}>Ingresos</Text>
            </View>
          </View>
          <View style={styles.barsContainer}>
            {gastosPorMes.map((g, i) => {
              const ingreso = ingresosPorMes[i]?.total ?? 0;
              const alturaGasto = (g.total / maxBar) * 150;
              const alturaIngreso = (ingreso / maxBar) * 150;
              const esActual = g.mes === mesSeleccionado && g.anio === anioSeleccionado;
              return (
                <View key={`${g.anio}-${g.mes}`} style={styles.barGroup}>
                  <View style={styles.barsRow}>
                    <View style={[styles.bar, { height: Math.max(alturaGasto, 4), backgroundColor: theme.danger, opacity: esActual ? 1 : 0.5 }]} />
                    <View style={[styles.bar, { height: Math.max(alturaIngreso, 4), backgroundColor: theme.success, opacity: esActual ? 1 : 0.5 }]} />
                  </View>
                  <Text style={[styles.barLabel, esActual && { color: theme.primary, fontWeight: '600' }]}>{MESES[g.mes]}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Deuda en tarjetas — últimos 6 meses</Text>
          <View style={styles.barsContainer}>
            {deudaPorMes.map((d, i) => {
              const maxDeuda = Math.max(...deudaPorMes.map(x => x.total), 1);
              const altura = (d.total / maxDeuda) * 120;
              const esActual = gastosPorMes[i]?.mes === mesSeleccionado && gastosPorMes[i]?.anio === anioSeleccionado;
              const color = d.total > 0 ? theme.primary : theme.border;
              return (
                <View key={i} style={styles.barGroup}>
                  <Text style={styles.barAmount}>{d.total > 0 ? formatMXN(d.total).replace('MX$', '$') : ''}</Text>
                  <View style={[styles.barSingle, { height: Math.max(altura, 4), backgroundColor: color, opacity: esActual ? 1 : 0.5 }]} />
                  <Text style={[styles.barLabel, esActual && { color: theme.primary, fontWeight: '600' }]}>{MESES[gastosPorMes[i]?.mes ?? 0]}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {gastosPorCategoria.length > 0 ? (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Gastos por categoría — {MESES[mesSeleccionado]} {anioSeleccionado}</Text>
            {gastosPorCategoria.map(c => {
              const pct = totalCategorias > 0 ? (c.total / totalCategorias) * 100 : 0;
              const color = CATEGORIA_COLORES[c.categoria] ?? '#6B7280';
              return (
                <View key={c.categoria} style={styles.catRow}>
                  <View style={styles.catTop}>
                    <View style={styles.catLeft}>
                      <View style={[styles.catDot, { backgroundColor: color }]} />
                      <Text style={styles.catNombre}>{c.categoria}</Text>
                    </View>
                    <View style={styles.catRight}>
                      <Text style={styles.catMonto}>{formatMXN(c.total)}</Text>
                      <Text style={styles.catPct}>{pct.toFixed(0)}%</Text>
                    </View>
                  </View>
                  <View style={styles.catBarBg}>
                    <View style={[styles.catBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Gastos por categoría — {MESES[mesSeleccionado]} {anioSeleccionado}</Text>
            <View style={styles.emptyChart}>
              <Ionicons name="pie-chart-outline" size={36} color={theme.border} />
              <Text style={styles.emptyChartText}>Sin gastos registrados este mes</Text>
            </View>
          </View>
        )}

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Balance {MESES[mesSeleccionado]} {anioSeleccionado}</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Ingresos</Text>
            <Text style={[styles.balanceValor, { color: theme.success }]}>{formatMXN(totalIngresosMes)}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Gastos directos</Text>
            <Text style={[styles.balanceValor, { color: theme.danger }]}>− {formatMXN(totalGastosMes)}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Recurrentes</Text>
            <Text style={[styles.balanceValor, { color: theme.danger }]}>− {formatMXN(totalRecurrentesMes)}</Text>
          </View>
          <View style={[styles.balanceRow, styles.balanceTotalRow]}>
            <Text style={styles.balanceTotalLabel}>Diferencia</Text>
            <Text style={[styles.balanceTotalValor, { color: (totalIngresosMes - totalGastosMes - totalRecurrentesMes) >= 0 ? theme.success : theme.danger }]}>
              {formatMXN(totalIngresosMes - totalGastosMes - totalRecurrentesMes)}
            </Text>
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  mesSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.surface, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: t.border },
  mesBtn: { padding: 8, borderRadius: 8, backgroundColor: t.primary + '18' },
  mesBtnDisabled: { backgroundColor: t.background },
  mesCentro: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mesTexto: { fontSize: 16, fontWeight: '600', color: t.text, textTransform: 'capitalize' },
  mesBadge: { backgroundColor: t.primary + '18', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  mesBadgeText: { fontSize: 11, color: t.primary, fontWeight: '500' },
  scroll: { padding: 16 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metricCard: { flex: 1, backgroundColor: t.card, borderRadius: 12, padding: 12, borderTopWidth: 3, alignItems: 'center' },
  metricLabel: { fontSize: 11, color: t.textSecondary, marginBottom: 4 },
  metricValor: { fontSize: 13, fontWeight: '700' },
  chartCard: { backgroundColor: t.card, borderRadius: 14, padding: 16, marginBottom: 16 },
  chartTitle: { fontSize: 14, fontWeight: '600', color: t.text, marginBottom: 14 },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: t.textSecondary },
  barsContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 180 },
  barGroup: { alignItems: 'center', flex: 1 },
  barsRow: { flexDirection: 'row', gap: 3, alignItems: 'flex-end' },
  bar: { width: BAR_WIDTH / 2.5, borderRadius: 3 },
  barSingle: { width: BAR_WIDTH * 0.7, borderRadius: 3 },
  barLabel: { fontSize: 10, color: t.textSecondary, marginTop: 6 },
  barAmount: { fontSize: 7, color: t.textSecondary, marginBottom: 2, textAlign: 'center' },
  catRow: { marginBottom: 12 },
  catTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catNombre: { fontSize: 13, color: t.text },
  catRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  catMonto: { fontSize: 13, fontWeight: '600', color: t.text },
  catPct: { fontSize: 11, color: t.textSecondary, minWidth: 32, textAlign: 'right' },
  catBarBg: { height: 6, backgroundColor: t.border, borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 3 },
  emptyChart: { alignItems: 'center', padding: 24, gap: 8 },
  emptyChartText: { fontSize: 13, color: t.textSecondary },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  balanceLabel: { fontSize: 14, color: t.textSecondary },
  balanceValor: { fontSize: 14, fontWeight: '500' },
  balanceTotalRow: { borderTopWidth: 0.5, borderTopColor: t.border, paddingTop: 10, marginTop: 4 },
  balanceTotalLabel: { fontSize: 14, fontWeight: '600', color: t.text },
  balanceTotalValor: { fontSize: 16, fontWeight: '700' },
});
