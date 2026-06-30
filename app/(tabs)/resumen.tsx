import { useState, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, StyleSheet,
  RefreshControl, TouchableOpacity, Modal, TextInput, Alert
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { obtenerTarjetas, obtenerPeriodoActual, obtenerPeriodoCerradoPendiente, marcarPeriodoPagado, abonarSaldoTarjeta } from '../../database/queries/tarjetas';
import { obtenerTotalDisponible, obtenerSaldosTodos, crearMovimiento } from '../../database/queries/liquidez';
import { obtenerCuentasInversion, calcularRendimientoHoy, transferirCuentaAInversion, transferirInversionACuenta } from '../../database/queries/inversiones';
import { obtenerRecurrentes } from '../../database/queries/recurrentes';
import { obtenerCuotasPendientesMes, crearGasto, obtenerGastosPorMes } from '../../database/queries/gastos';
import { obtenerCuentasLiquidez } from '../../database/queries/liquidez';
import { formatMXN, hoy } from '../../database';
import { TarjetaConVersion, CuentaLiquidez, PeriodoCorte } from '../../types';
import Header from '../../components/Header';

type PagoPendiente = {
  tarjeta: TarjetaConVersion;
  periodoAbierto: PeriodoCorte | null;
  periodoCerrado: PeriodoCorte | null;
};

type PagoRModal = { periodoId: string; tarjetaId: string; nombre: string; saldo: number };

const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtDDMM(iso: string) {
  const p = iso.split('-');
  return `${parseInt(p[2])} ${MESES_CORTOS[parseInt(p[1]) - 1]}`;
}

const CATEGORIAS_GASTO =['Alimentación', 'Transporte', 'Salud', 'Entretenimiento', 'Ropa', 'Hogar', 'Tecnología', 'Educación', 'Viaje', 'Otro'];
const CATEGORIAS_INGRESO = ['Sueldo', 'Freelance', 'Venta', 'Reembolso', 'Transferencia', 'Otro'];

export default function ResumenScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalDisponible, setTotalDisponible] = useState(0);
  const [totalDeuda, setTotalDeuda] = useState(0);
  const [totalRecurrentes, setTotalRecurrentes] = useState(0);
  const [totalMSI, setTotalMSI] = useState(0);
  const [totalInversiones, setTotalInversiones] = useState(0);
  const [totalGastosMes, setTotalGastosMes] = useState(0);
  const [totalGastosTarjetaMes, setTotalGastosTarjetaMes] = useState(0);
  const [cuentasLiquidez, setCuentasLiquidez] = useState<{ id: string; nombre: string; saldo: number }[]>([]);
  const [tarjetas, setTarjetas] = useState<TarjetaConVersion[]>([]);
  const [tarjetasSaldo, setTarjetasSaldo] = useState<Record<string, number>>({});
  const [cuentas, setCuentas] = useState<CuentaLiquidez[]>([]);
  const [pagosPendientes, setPagosPendientes] = useState<PagoPendiente[]>([]);
  const [pagoRModal, setPagoRModal] = useState<PagoRModal | null>(null);
  const [pagoRMonto, setPagoRMonto] = useState('');
  const [pagoRCuentaId, setPagoRCuentaId] = useState<string | null>(null);

  const [inversiones, setInversiones] = useState<any[]>([]);
  const [modalGasto, setModalGasto] = useState(false);
  const [modalIngreso, setModalIngreso] = useState(false);
  const [tipoGasto, setTipoGasto] = useState<'tarjeta' | 'cuenta' | 'pago_tarjeta' | 'a_inversion'>('tarjeta');
  const [tipoIngreso, setTipoIngreso] = useState<'cuenta' | 'desde_inversion'>('cuenta');

  const [formGasto, setFormGasto] = useState({
    descripcion: '', monto: '', fecha: hoy(), categoria: 'Alimentación',
    tarjeta_version_id: '', cuenta_liquidez_id: '',
    pago_tarjeta_id: '', pago_cuenta_id: '',
    inv_cuenta_id: '', inv_inversion_id: '',
  });

  const [formIngreso, setFormIngreso] = useState({
    monto: '', descripcion: '', categoria: 'Sueldo', fecha: hoy(),
    cuenta_id: '', inv_id: '', inv_destino_cuenta_id: '',
  });

  const cargarDatos = async () => {
    try {
      const hoyDate = new Date();
      const anio = hoyDate.getFullYear();
      const mes = hoyDate.getMonth() + 1;

      const [disponible, saldos, tarjetasList, recurrentes, cuotas, invList, cuentasList, gastosMes] =
        await Promise.all([
          obtenerTotalDisponible(),
          obtenerSaldosTodos(),
          obtenerTarjetas(),
          obtenerRecurrentes(),
          obtenerCuotasPendientesMes(anio, mes),
          obtenerCuentasInversion(),
          obtenerCuentasLiquidez(),
          obtenerGastosPorMes(anio, mes),
        ]);

      setTotalDisponible(disponible);
      setCuentasLiquidez(saldos);
      setTarjetas(tarjetasList);
      setCuentas(cuentasList);
      setInversiones(invList);
      setTotalGastosMes(gastosMes.filter(g => g.cuenta_liquidez_id).reduce((s, g) => s + g.monto, 0));
      setTotalGastosTarjetaMes(gastosMes.filter(g => g.tarjeta_version_id).reduce((s, g) => s + g.monto, 0));

      const saldosMap: Record<string, number> = {};
      for (const t of tarjetasList) {
        const periodo = await obtenerPeriodoActual(t.tarjeta_id);
        saldosMap[t.tarjeta_id] = periodo?.saldo_calculado ?? 0;
      }
      setTarjetasSaldo(saldosMap);

      const pendientes: PagoPendiente[] = [];
      for (const t of tarjetasList) {
        const [pa, pc] = await Promise.all([
          obtenerPeriodoActual(t.tarjeta_id),
          obtenerPeriodoCerradoPendiente(t.tarjeta_id),
        ]);
        if (pa || pc) pendientes.push({ tarjeta: t, periodoAbierto: pa, periodoCerrado: pc });
      }
      setPagosPendientes(pendientes);

      const deudaTotal = Object.values(saldosMap).reduce((s, v) => s + v, 0);
      setTotalDeuda(deudaTotal);

      const recMensual = recurrentes
        .filter(r => r.frecuencia === 'mensual')
        .reduce((s, r) => s + r.monto, 0);
      setTotalRecurrentes(recMensual);

      const msiTotal = cuotas.reduce((s, c) => s + c.monto_cuota, 0);
      setTotalMSI(msiTotal);

      let invTotal = 0;
      for (const inv of invList) {
        const { saldoReal } = await calcularRendimientoHoy(inv.id);
        invTotal += saldoReal;
      }
      setTotalInversiones(invTotal);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const router = useRouter();

  useFocusEffect(useCallback(() => { cargarDatos(); }, []));

  const onRefresh = () => { setRefreshing(true); cargarDatos(); };

  const resetFormGasto = () => setFormGasto({
    descripcion: '', monto: '', fecha: hoy(), categoria: 'Alimentación',
    tarjeta_version_id: '', cuenta_liquidez_id: '',
    pago_tarjeta_id: '', pago_cuenta_id: '',
    inv_cuenta_id: '', inv_inversion_id: '',
  });

  const guardarGasto = async () => {
    const monto = parseFloat(formGasto.monto);
    if (!formGasto.monto || isNaN(monto) || monto <= 0) {
      Alert.alert('Monto requerido');
      return;
    }
    try {
      if (tipoGasto === 'tarjeta') {
        if (!formGasto.tarjeta_version_id) { Alert.alert('Selecciona una tarjeta'); return; }
        await crearGasto({
          descripcion: formGasto.descripcion || 'Gasto',
          monto, fecha: formGasto.fecha, categoria: formGasto.categoria,
          tarjeta_version_id: formGasto.tarjeta_version_id,
        });
      } else if (tipoGasto === 'cuenta') {
        if (!formGasto.cuenta_liquidez_id || formGasto.cuenta_liquidez_id === '') { Alert.alert('Selecciona una cuenta'); return; }
        await crearGasto({
          descripcion: formGasto.descripcion || 'Gasto',
          monto, fecha: formGasto.fecha, categoria: formGasto.categoria,
          cuenta_liquidez_id: formGasto.cuenta_liquidez_id,
        });
      } else if (tipoGasto === 'pago_tarjeta') {
        if (!formGasto.pago_tarjeta_id || !formGasto.pago_cuenta_id) {
          Alert.alert('Selecciona tarjeta y cuenta origen'); return;
        }
        await crearMovimiento({
          cuenta_id: formGasto.pago_cuenta_id, tipo: 'gasto', monto,
          fecha: formGasto.fecha,
          descripcion: formGasto.descripcion || 'Pago a tarjeta',
          categoria: 'Pago tarjeta',
        });
        await abonarSaldoTarjeta(formGasto.pago_tarjeta_id, monto);
      } else if (tipoGasto === 'a_inversion') {
        if (!formGasto.inv_cuenta_id || !formGasto.inv_inversion_id) {
          Alert.alert('Selecciona cuenta e inversión'); return;
        }
        await transferirCuentaAInversion(
          formGasto.inv_cuenta_id, formGasto.inv_inversion_id, monto,
          formGasto.descripcion || undefined
        );
      }
      setModalGasto(false);
      resetFormGasto();
      cargarDatos();
    } catch (e) {
      console.error('[guardarGasto ERROR]', e);
      Alert.alert('Error', String(e));
    }
  };

  const resetFormIngreso = () => setFormIngreso({
    monto: '', descripcion: '', categoria: 'Sueldo', fecha: hoy(),
    cuenta_id: '', inv_id: '', inv_destino_cuenta_id: '',
  });

  const guardarIngreso = async () => {
    const monto = parseFloat(formIngreso.monto);
    if (!formIngreso.monto || isNaN(monto) || monto <= 0) {
      Alert.alert('Monto requerido');
      return;
    }
    try {
      if (tipoIngreso === 'cuenta') {
        if (!formIngreso.cuenta_id || formIngreso.cuenta_id === '') { Alert.alert('Selecciona una cuenta'); return; }
        await crearMovimiento({
          cuenta_id: formIngreso.cuenta_id, tipo: 'ingreso', monto,
          fecha: formIngreso.fecha,
          descripcion: formIngreso.descripcion,
          categoria: formIngreso.categoria,
        });
      } else if (tipoIngreso === 'desde_inversion') {
        if (!formIngreso.inv_id || !formIngreso.inv_destino_cuenta_id) {
          Alert.alert('Selecciona inversión y cuenta destino'); return;
        }
        await transferirInversionACuenta(
          formIngreso.inv_id, formIngreso.inv_destino_cuenta_id, monto,
          formIngreso.descripcion || undefined
        );
      }
      setModalIngreso(false);
      resetFormIngreso();
      cargarDatos();
    } catch (e) {
      console.error('[guardarIngreso ERROR]', e);
      Alert.alert('Error', String(e));
    }
  };

  const confirmarPagoRapido = async () => {
    if (!pagoRModal || !pagoRCuentaId) return;
    const monto = parseFloat(pagoRMonto);
    if (isNaN(monto) || monto <= 0) { Alert.alert('Monto inválido'); return; }
    try {
      if (monto >= pagoRModal.saldo) {
        await marcarPeriodoPagado(pagoRModal.periodoId, monto);
      }
      await crearMovimiento({
        cuenta_id: pagoRCuentaId,
        tipo: 'gasto',
        monto,
        fecha: hoy(),
        descripcion: `Pago tarjeta ${pagoRModal.nombre}`,
        categoria: 'Pago tarjeta',
      });
      setPagoRModal(null);
      setPagoRMonto('');
      setPagoRCuentaId(null);
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  const efectivoDisponible = totalDisponible - totalMSI - totalRecurrentes;
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
          <Text style={styles.patrimonioLabel}>Patrimonio total</Text>
          <Text style={[styles.patrimonioValor, { color: patrimonioNeto >= 0 ? '#FFFFFF' : '#FCA5A5' }]}>
            {formatMXN(patrimonioNeto)}
          </Text>
          <Text style={styles.patrimonioSub}>disponible + inversiones − deuda</Text>
        </View>

        <View style={styles.metricsGrid}>
          <TouchableOpacity style={[styles.metricCard, { borderLeftColor: theme.success }]} onPress={() => router.push('/(tabs)/cuentas')}>
            <Ionicons name="wallet-outline" size={18} color={theme.success} />
            <Text style={styles.metricLabel}>Disponible</Text>
            <Text style={[styles.metricValor, { color: theme.success }]}>{formatMXN(totalDisponible)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.metricCard, { borderLeftColor: theme.danger }]} onPress={() => router.push('/(tabs)/tarjetas')}>
            <Ionicons name="card-outline" size={18} color={theme.danger} />
            <Text style={styles.metricLabel}>Deuda total</Text>
            <Text style={[styles.metricValor, { color: theme.danger }]}>{formatMXN(totalDeuda)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.metricCard, { borderLeftColor: theme.warning }]} onPress={() => router.push('/(tabs)/recurrentes')}>
            <Ionicons name="repeat-outline" size={18} color={theme.warning} />
            <Text style={styles.metricLabel}>Recurrentes</Text>
            <Text style={[styles.metricValor, { color: theme.warning }]}>{formatMXN(totalRecurrentes)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.metricCard, { borderLeftColor: theme.secondary }]} onPress={() => router.push('/(tabs)/inversiones')}>
            <Ionicons name="trending-up-outline" size={18} color={theme.secondary} />
            <Text style={styles.metricLabel}>Inversiones</Text>
            <Text style={[styles.metricValor, { color: theme.secondary }]}>{formatMXN(totalInversiones)}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Balance del mes</Text>
          <View style={styles.balanceCard}>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Disponible</Text>
              <Text style={[styles.balanceValor, { color: theme.success }]}>{formatMXN(totalDisponible)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceLabel, { fontSize: 12, fontStyle: 'italic' }]}>Gastado en tarjeta (ya en deuda)</Text>
              <Text style={[styles.balanceValor, { color: theme.textSecondary, fontSize: 12 }]}>{formatMXN(totalGastosTarjetaMes)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceLabel, { fontSize: 12, fontStyle: 'italic' }]}>Gastado en cuenta (ya descontado)</Text>
              <Text style={[styles.balanceValor, { color: theme.textSecondary, fontSize: 12 }]}>{formatMXN(totalGastosMes)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Cuotas MSI pendientes</Text>
              <Text style={[styles.balanceValor, { color: totalMSI > 0 ? theme.danger : theme.textSecondary }]}>− {formatMXN(totalMSI)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Recurrentes pendientes</Text>
              <Text style={[styles.balanceValor, { color: totalRecurrentes > 0 ? theme.danger : theme.textSecondary }]}>− {formatMXN(totalRecurrentes)}</Text>
            </View>
            <View style={[styles.balanceRow, styles.balanceTotalRow]}>
              <Text style={styles.balanceTotalLabel}>Efectivo disponible</Text>
              <Text style={[styles.balanceTotalValor, { color: efectivoDisponible >= 0 ? theme.success : theme.danger }]}>
                {formatMXN(efectivoDisponible)}
              </Text>
            </View>
          </View>
        </View>

        {cuentasLiquidez.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mis cuentas</Text>
            {cuentasLiquidez.map(c => (
              <TouchableOpacity key={c.id} style={styles.cuentaRow} onPress={() => router.push('/(tabs)/cuentas')}>
                <View style={styles.cuentaIcon}>
                  <Ionicons name="wallet-outline" size={16} color={theme.secondary} />
                </View>
                <Text style={styles.cuentaNombre}>{c.nombre}</Text>
                <Text style={[styles.cuentaSaldo, { color: c.saldo >= 0 ? theme.success : theme.danger }]}>
                  {formatMXN(c.saldo)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {pagosPendientes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pagos pendientes</Text>
            {pagosPendientes.map(({ tarjeta, periodoAbierto, periodoCerrado }) => (
              <View key={tarjeta.tarjeta_id} style={styles.pagoCard}>
                <Text style={styles.pagoNombre}>{tarjeta.nombre} — {tarjeta.banco}</Text>
                {periodoAbierto && (
                  <Text style={styles.pagoAbiertoText}>
                    Acumulado este corte: {formatMXN(periodoAbierto.saldo_calculado)} · Corta el día {tarjeta.dia_corte}
                  </Text>
                )}
                {periodoCerrado && (() => {
                  const vencido = new Date(periodoCerrado.fecha_limite_pago) < new Date();
                  return (
                    <View style={styles.pagoCerradoRow}>
                      <Text style={[styles.pagoCerradoText, vencido && styles.pagoCerradoVencido]}>
                        Por pagar: {formatMXN(periodoCerrado.saldo_calculado)} · Vence {fmtDDMM(periodoCerrado.fecha_limite_pago)}{vencido ? ' (vencido)' : ''}
                      </Text>
                      <TouchableOpacity
                        style={styles.pagoBtn}
                        onPress={() => {
                          setPagoRModal({ periodoId: periodoCerrado.id, tarjetaId: tarjeta.tarjeta_id, nombre: tarjeta.nombre, saldo: periodoCerrado.saldo_calculado });
                          setPagoRMonto(periodoCerrado.saldo_calculado > 0 ? String(periodoCerrado.saldo_calculado) : '');
                          setPagoRCuentaId(cuentas[0]?.id ?? null);
                        }}
                      >
                        <Text style={styles.pagoBtnText}>Pagar</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}
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
              const color = pct > 70 ? theme.danger : pct > 40 ? theme.warning : theme.success;
              return (
                <TouchableOpacity key={t.tarjeta_id} style={styles.tarjetaCard} onPress={() => router.push('/(tabs)/tarjetas')}>
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
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {tarjetas.length === 0 && cuentasLiquidez.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={48} color={theme.border} />
            <Text style={styles.emptyTitle}>Todo listo</Text>
            <Text style={styles.emptyText}>Agrega tus tarjetas y cuentas para ver tu resumen aquí</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
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
      <Modal visible={modalGasto} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setModalGasto(false); resetFormGasto(); }}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nuevo gasto</Text>
            <TouchableOpacity onPress={() => { setModalGasto(false); resetFormGasto(); }}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Tipo de gasto</Text>
              <View style={{ gap: 8 }}>
                <View style={styles.toggleRow}>
                  <TouchableOpacity style={[styles.toggleBtn, tipoGasto === 'tarjeta' && styles.toggleBtnActive]} onPress={() => setTipoGasto('tarjeta')}>
                    <Text style={[styles.toggleText, tipoGasto === 'tarjeta' && styles.toggleTextActive]}>Tarjeta</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.toggleBtn, tipoGasto === 'cuenta' && styles.toggleBtnActive]} onPress={() => setTipoGasto('cuenta')}>
                    <Text style={[styles.toggleText, tipoGasto === 'cuenta' && styles.toggleTextActive]}>Cuenta</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.toggleRow}>
                  <TouchableOpacity style={[styles.toggleBtn, tipoGasto === 'pago_tarjeta' && styles.toggleBtnActive]} onPress={() => setTipoGasto('pago_tarjeta')}>
                    <Text style={[styles.toggleText, tipoGasto === 'pago_tarjeta' && styles.toggleTextActive]}>Pago tarjeta</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.toggleBtn, tipoGasto === 'a_inversion' && styles.toggleBtnActive]} onPress={() => setTipoGasto('a_inversion')}>
                    <Text style={[styles.toggleText, tipoGasto === 'a_inversion' && styles.toggleTextActive]}>A inversión</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descripción</Text>
              <TextInput style={styles.input} placeholder="Super, gasolina..." placeholderTextColor="#9CA3AF" value={formGasto.descripcion} onChangeText={v => setFormGasto(p => ({ ...p, descripcion: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad" value={formGasto.monto} onChangeText={v => setFormGasto(p => ({ ...p, monto: v.replace(/[^0-9.]/g, '') }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Fecha</Text>
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" value={formGasto.fecha} onChangeText={v => setFormGasto(p => ({ ...p, fecha: v }))} />
            </View>
            {tipoGasto === 'tarjeta' && (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tarjeta</Text>
                {tarjetas.map(t => (
                  <TouchableOpacity key={t.id} style={[styles.selectorItem, formGasto.tarjeta_version_id === t.id && styles.selectorItemActive]} onPress={() => setFormGasto(p => ({ ...p, tarjeta_version_id: t.id }))}>
                    <Text style={styles.selectorText}>{t.nombre} — {t.banco}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {tipoGasto === 'cuenta' && (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cuenta</Text>
                {cuentas.map(c => (
                  <TouchableOpacity key={c.id} style={[styles.selectorItem, formGasto.cuenta_liquidez_id === c.id && styles.selectorItemActive]} onPress={() => setFormGasto(p => ({ ...p, cuenta_liquidez_id: c.id }))}>
                    <Text style={styles.selectorText}>{c.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {tipoGasto === 'pago_tarjeta' && (<>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tarjeta a pagar</Text>
                {tarjetas.map(t => (
                  <TouchableOpacity key={t.tarjeta_id} style={[styles.selectorItem, formGasto.pago_tarjeta_id === t.tarjeta_id && styles.selectorItemActive]} onPress={() => setFormGasto(p => ({ ...p, pago_tarjeta_id: t.tarjeta_id }))}>
                    <Text style={styles.selectorText}>{t.nombre} — {t.banco}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cuenta origen</Text>
                {cuentas.map(c => (
                  <TouchableOpacity key={c.id} style={[styles.selectorItem, formGasto.pago_cuenta_id === c.id && styles.selectorItemActive]} onPress={() => setFormGasto(p => ({ ...p, pago_cuenta_id: c.id }))}>
                    <Text style={styles.selectorText}>{c.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>)}
            {tipoGasto === 'a_inversion' && (<>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cuenta origen</Text>
                {cuentas.map(c => (
                  <TouchableOpacity key={c.id} style={[styles.selectorItem, formGasto.inv_cuenta_id === c.id && styles.selectorItemActive]} onPress={() => setFormGasto(p => ({ ...p, inv_cuenta_id: c.id }))}>
                    <Text style={styles.selectorText}>{c.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Inversión destino</Text>
                {inversiones.length === 0 ? (
                  <Text style={styles.emptyText}>Agrega una inversión primero</Text>
                ) : inversiones.map((inv: any) => (
                  <TouchableOpacity key={inv.id} style={[styles.selectorItem, formGasto.inv_inversion_id === inv.id && styles.selectorItemActive]} onPress={() => setFormGasto(p => ({ ...p, inv_inversion_id: inv.id }))}>
                    <Text style={styles.selectorText}>{inv.nombre} — {inv.institucion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>)}
            {(tipoGasto === 'tarjeta' || tipoGasto === 'cuenta') && (
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
            )}
            <TouchableOpacity style={styles.saveBtn} onPress={guardarGasto}>
              <Text style={styles.saveBtnText}>Guardar gasto</Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Modal pago rápido tarjeta */}
      <Modal visible={!!pagoRModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setPagoRModal(null); setPagoRMonto(''); setPagoRCuentaId(null); }}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pagar tarjeta</Text>
            <TouchableOpacity onPress={() => { setPagoRModal(null); setPagoRMonto(''); setPagoRCuentaId(null); }}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            {pagoRModal && (
              <Text style={[styles.pagoNombre, { marginBottom: 16 }]}>
                {pagoRModal.nombre} · Saldo: {formatMXN(pagoRModal.saldo)}
              </Text>
            )}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto a pagar ($)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                value={pagoRMonto}
                onChangeText={v => setPagoRMonto(v.replace(/[^0-9.]/g, ''))}
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descontar de cuenta</Text>
              {cuentas.length === 0 ? (
                <Text style={styles.emptyText}>Sin cuentas registradas</Text>
              ) : cuentas.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.selectorItem, pagoRCuentaId === c.id && styles.selectorItemActive]}
                  onPress={() => setPagoRCuentaId(c.id)}
                >
                  <Text style={styles.selectorText}>{c.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, (!pagoRCuentaId || !pagoRMonto) && { opacity: 0.4 }]}
              onPress={confirmarPagoRapido}
            >
              <Text style={styles.saveBtnText}>Confirmar pago</Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Modal ingreso rápido */}
      <Modal visible={modalIngreso} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setModalIngreso(false); resetFormIngreso(); }}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nuevo ingreso</Text>
            <TouchableOpacity onPress={() => { setModalIngreso(false); resetFormIngreso(); }}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Tipo de ingreso</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity style={[styles.toggleBtn, tipoIngreso === 'cuenta' && styles.toggleBtnActive]} onPress={() => setTipoIngreso('cuenta')}>
                  <Text style={[styles.toggleText, tipoIngreso === 'cuenta' && styles.toggleTextActive]}>Cuenta</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toggleBtn, tipoIngreso === 'desde_inversion' && styles.toggleBtnActive]} onPress={() => setTipoIngreso('desde_inversion')}>
                  <Text style={[styles.toggleText, tipoIngreso === 'desde_inversion' && styles.toggleTextActive]}>Desde inversión</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad" value={formIngreso.monto} onChangeText={v => setFormIngreso(p => ({ ...p, monto: v.replace(/[^0-9.]/g, '') }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descripción (opcional)</Text>
              <TextInput style={styles.input} placeholder="Sueldo, freelance..." placeholderTextColor="#9CA3AF" value={formIngreso.descripcion} onChangeText={v => setFormIngreso(p => ({ ...p, descripcion: v }))} />
            </View>
            {tipoIngreso === 'cuenta' && (<>
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
            </>)}
            {tipoIngreso === 'desde_inversion' && (<>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Inversión origen</Text>
                {inversiones.length === 0 ? (
                  <Text style={styles.emptyText}>Agrega una inversión primero</Text>
                ) : inversiones.map((inv: any) => (
                  <TouchableOpacity key={inv.id} style={[styles.selectorItem, formIngreso.inv_id === inv.id && styles.selectorItemActive]} onPress={() => setFormIngreso(p => ({ ...p, inv_id: inv.id }))}>
                    <Text style={styles.selectorText}>{inv.nombre} — {inv.institucion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cuenta destino</Text>
                {cuentas.map(c => (
                  <TouchableOpacity key={c.id} style={[styles.selectorItem, formIngreso.inv_destino_cuenta_id === c.id && styles.selectorItemActive]} onPress={() => setFormIngreso(p => ({ ...p, inv_destino_cuenta_id: c.id }))}>
                    <Text style={styles.selectorText}>{c.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>)}
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

const makeStyles = (t: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  scrollView: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: t.textSecondary, fontSize: 16 },
  patrimonioCard: { margin: 16, backgroundColor: t.primary, borderRadius: 16, padding: 20, alignItems: 'center' },
  patrimonioLabel: { fontSize: 13, color: '#FFFFFF99', marginBottom: 4 },
  patrimonioValor: { fontSize: 32, fontWeight: '700', color: '#FFFFFF' },
  patrimonioSub: { fontSize: 11, color: '#FFFFFFAA', marginTop: 4 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  metricCard: { flex: 1, minWidth: '45%', backgroundColor: t.card, borderRadius: 12, padding: 14, borderLeftWidth: 3, gap: 4 },
  metricLabel: { fontSize: 11, color: t.textSecondary, marginTop: 4 },
  metricValor: { fontSize: 16, fontWeight: '600' },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: t.text, marginBottom: 10 },
  balanceCard: { backgroundColor: t.card, borderRadius: 12, padding: 16, gap: 10 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: 14, color: t.textSecondary },
  balanceValor: { fontSize: 14, fontWeight: '500' },
  balanceTotalRow: { borderTopWidth: 0.5, borderTopColor: t.border, paddingTop: 10, marginTop: 4 },
  balanceTotalLabel: { fontSize: 14, fontWeight: '600', color: t.text },
  balanceTotalValor: { fontSize: 16, fontWeight: '700' },
  cuentaRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 10, padding: 14, marginBottom: 8, gap: 10 },
  cuentaIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: t.primary + '18', justifyContent: 'center', alignItems: 'center' },
  cuentaNombre: { flex: 1, fontSize: 14, color: t.text },
  cuentaSaldo: { fontSize: 15, fontWeight: '600' },
  tarjetaCard: { backgroundColor: t.card, borderRadius: 12, padding: 14, marginBottom: 8 },
  tarjetaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  tarjetaNombre: { fontSize: 14, fontWeight: '500', color: t.text },
  tarjetaBanco: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
  tarjetaSaldo: { fontSize: 16, fontWeight: '600' },
  progressBg: { height: 6, backgroundColor: t.border, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', borderRadius: 3 },
  tarjetaLimite: { fontSize: 11, color: t.textSecondary },
  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: t.textSecondary },
  emptyText: { fontSize: 13, color: t.textSecondary, textAlign: 'center' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 24, backgroundColor: t.surface, borderTopWidth: 0.5, borderTopColor: t.border, flexDirection: 'row', gap: 10 },
  bottomBtnIngreso: { flex: 1, backgroundColor: t.success, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottomBtnGasto: { flex: 1, backgroundColor: t.primary, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottomBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: t.surface },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 0.5, borderBottomColor: t.border },
  modalTitle: { fontSize: 18, fontWeight: '600', color: t.text },
  modalBody: { padding: 20 },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, color: t.text, fontWeight: '500', marginBottom: 6 },
  input: { backgroundColor: t.background, borderWidth: 0.5, borderColor: t.border, borderRadius: 10, padding: 12, fontSize: 15, color: t.text },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: t.background, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: t.primary + '18' },
  toggleText: { fontSize: 14, color: t.textSecondary },
  toggleTextActive: { color: t.primary, fontWeight: '600' },
  selectorItem: { padding: 12, borderRadius: 8, backgroundColor: t.background, marginBottom: 6, borderWidth: 0.5, borderColor: t.border },
  selectorItemActive: { backgroundColor: t.primary + '18', borderColor: t.primary },
  selectorText: { fontSize: 14, color: t.text },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: t.background, borderWidth: 0.5, borderColor: t.border },
  chipActive: { backgroundColor: t.primary + '18', borderColor: t.primary },
  chipText: { fontSize: 12, color: t.textSecondary },
  chipTextActive: { color: t.primary, fontWeight: '600' },
  pagoCard: { backgroundColor: t.card, borderRadius: 12, padding: 14, marginBottom: 8, gap: 6 },
  pagoNombre: { fontSize: 14, fontWeight: '600', color: t.text },
  pagoAbiertoText: { fontSize: 13, color: t.textSecondary },
  pagoCerradoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  pagoCerradoText: { flex: 1, fontSize: 13, color: t.text },
  pagoCerradoVencido: { color: t.danger, fontWeight: '500' },
  pagoBtn: { backgroundColor: t.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  pagoBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  saveBtn: { backgroundColor: t.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});