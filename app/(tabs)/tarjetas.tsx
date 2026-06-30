import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Modal, TextInput,
  RefreshControl, Alert, Switch
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  obtenerTarjetas, crearTarjeta, actualizarTarjeta,
  eliminarTarjeta, obtenerPeriodoActual,
  obtenerPeriodosConSaldo, marcarPeriodoPagado,
  type PeriodoConSaldo,
} from '../../database/queries/tarjetas';
import { obtenerCuentasLiquidez, crearMovimiento } from '../../database/queries/liquidez';
import { formatMXN, hoy } from '../../database';
import { TarjetaConVersion, CuentaLiquidez } from '../../types';
import Header from '../../components/Header';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';

const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtFecha(iso: string) {
  const p = iso.split('-');
  return `${parseInt(p[2])} ${MESES_CORTOS[parseInt(p[1]) - 1]}`;
}

const COLORES = ['blue', 'teal', 'purple', 'coral', 'amber', 'gray'];
const COLOR_MAP: Record<string, string> = {
  blue: '#3B82F6', teal: '#14B8A6', purple: '#8B5CF6',
  coral: '#F97316', amber: '#F59E0B', gray: '#6B7280',
};

const FORM_INICIAL = {
  banco: '', nombre: '', digitos: '', limite_credito: '',
  dia_corte: '', dias_pago: '20', tasa_anual: '', color: 'blue',
};

type PagoModal = { periodoId: string; tarjetaId: string; saldo: number };

export default function TarjetasScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [tarjetas, setTarjetas] = useState<TarjetaConVersion[]>([]);
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [esDepartamental, setEsDepartamental] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [periodos, setPeriodos] = useState<Record<string, PeriodoConSaldo[]>>({});
  const [cuentas, setCuentas] = useState<CuentaLiquidez[]>([]);
  const [pagoModal, setPagoModal] = useState<PagoModal | null>(null);
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoCuentaId, setPagoCuentaId] = useState<string | null>(null);

  const cargarDatos = async () => {
    try {
      console.log('[tarjetas] paso 1: obtenerTarjetas');
      const lista = await obtenerTarjetas();
      console.log('[tarjetas] paso 2: lista.length =', lista.length);
      setTarjetas(lista);
      const map: Record<string, number> = {};
      for (const t of lista) {
        console.log('[tarjetas] paso 3: obtenerPeriodoActual tarjeta_id =', t.tarjeta_id, typeof t.tarjeta_id);
        const p = await obtenerPeriodoActual(t.tarjeta_id);
        map[t.tarjeta_id] = p?.saldo_calculado ?? 0;
      }
      setSaldos(map);
      console.log('[tarjetas] paso 4: obtenerCuentasLiquidez');
      const cs = await obtenerCuentasLiquidez();
      console.log('[tarjetas] paso 5: done, cuentas =', cs.length);
      setCuentas(cs);
    } catch (e) {
      console.error('[tarjetas ERROR]', e);
      Alert.alert('Error cargando tarjetas', String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { cargarDatos(); }, []));

  const toggleExpand = async (tarjetaId: string) => {
    const abriendo = !expandidos.has(tarjetaId);
    setExpandidos(prev => {
      const next = new Set(prev);
      abriendo ? next.add(tarjetaId) : next.delete(tarjetaId);
      return next;
    });
    if (abriendo) {
      const ps = await obtenerPeriodosConSaldo(tarjetaId);
      setPeriodos(prev => ({ ...prev, [tarjetaId]: ps }));
    }
  };

  const cerrarPagoModal = () => {
    setPagoModal(null);
    setPagoMonto('');
    setPagoCuentaId(null);
  };

  const confirmarPago = async () => {
    if (!pagoModal || !pagoCuentaId) return;
    const monto = parseFloat(pagoMonto);
    if (isNaN(monto) || monto <= 0) { Alert.alert('Monto inválido'); return; }
    try {
      await marcarPeriodoPagado(pagoModal.periodoId, monto);
      await crearMovimiento({
        cuenta_id: pagoCuentaId,
        tipo: 'gasto',
        monto,
        fecha: hoy(),
        descripcion: 'Pago tarjeta de crédito',
        categoria: 'tarjeta',
      });
      const ps = await obtenerPeriodosConSaldo(pagoModal.tarjetaId);
      setPeriodos(prev => ({ ...prev, [pagoModal!.tarjetaId]: ps }));
      cerrarPagoModal();
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

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
      Alert.alert('Error', String(e));
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

  const hoyStr = hoy();

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.textSecondary, fontSize: 16 }}>Cargando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Tarjetas" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargarDatos(); }} />}
      >
        {tarjetas.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={48} color={theme.border} />
            <Text style={styles.emptyTitle}>Sin tarjetas</Text>
            <Text style={styles.emptyText}>Agrega tu primera tarjeta tocando el botón de abajo</Text>
          </View>
        ) : (
          tarjetas.map(t => {
            const saldo = saldos[t.tarjeta_id] ?? 0;
            const pct = t.limite_credito > 0 ? (saldo / t.limite_credito) * 100 : 0;
            const color = COLOR_MAP[t.color] ?? theme.secondary;
            const barColor = pct > 70 ? theme.danger : pct > 40 ? theme.warning : theme.success;
            const expandido = expandidos.has(t.tarjeta_id);
            const ps = periodos[t.tarjeta_id] ?? [];
            const primerCerradoId = ps.find(p => p.fecha_corte < hoyStr && p.estado !== 'pagado')?.id;

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
                      <Ionicons name="pencil-outline" size={16} color={theme.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => eliminar(t.tarjeta_id, t.nombre)} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={16} color={theme.danger} />
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

                <TouchableOpacity style={styles.expandBtn} onPress={() => toggleExpand(t.tarjeta_id)}>
                  <Text style={styles.expandBtnText}>Periodos</Text>
                  <Ionicons name={expandido ? 'chevron-up' : 'chevron-down'} size={14} color={theme.secondary} />
                </TouchableOpacity>

                {expandido && (
                  <View style={styles.periodosWrap}>
                    {ps.length === 0 ? (
                      <Text style={styles.periodoVacio}>Sin periodos registrados</Text>
                    ) : ps.map(p => {
                      const esActual = p.fecha_corte >= hoyStr && p.estado === 'abierto';
                      const esPagado = p.estado === 'pagado';
                      const esCerrado = p.fecha_corte < hoyStr && !esPagado;
                      const esPrimerCerrado = p.id === primerCerradoId;

                      const estadoLabel = esPagado ? 'Pagado' : esActual ? 'Abierto' : 'Cerrado';
                      const estadoColor = esPagado ? theme.success : esActual ? theme.primary : theme.warning;

                      return (
                        <View key={p.id} style={[styles.periodoRow, esCerrado && styles.periodoRowCerrado]}>
                          <View style={styles.periodoTop}>
                            <View style={[styles.estadoBadge, { backgroundColor: estadoColor + '20' }]}>
                              <Text style={[styles.estadoText, { color: estadoColor }]}>{estadoLabel}</Text>
                            </View>
                            <Text style={styles.periodoSaldo}>{formatMXN(p.saldo_calculado)}</Text>
                          </View>
                          <Text style={styles.periodoFechaLabel}>
                            {esActual
                              ? `Corte: ${fmtFecha(p.fecha_corte)} · Pago antes del: ${fmtFecha(p.fecha_limite_pago)}`
                              : `Cortó: ${fmtFecha(p.fecha_corte)} · Límite: ${fmtFecha(p.fecha_limite_pago)}`}
                          </Text>
                          {esCerrado && p.dias_para_vencer > 0 && (
                            <Text style={styles.periodoVence}>Vence en {p.dias_para_vencer} días</Text>
                          )}
                          {esCerrado && p.dias_para_vencer <= 0 && (
                            <Text style={[styles.periodoVence, { color: theme.danger }]}>
                              Venció hace {Math.abs(p.dias_para_vencer)} días
                            </Text>
                          )}
                          {esPrimerCerrado && (
                            <TouchableOpacity
                              style={styles.pagarBtn}
                              onPress={() => {
                                setPagoModal({ periodoId: p.id, tarjetaId: t.tarjeta_id, saldo: p.saldo_calculado });
                                setPagoMonto(p.saldo_calculado > 0 ? String(p.saldo_calculado) : '');
                                setPagoCuentaId(cuentas[0]?.id ?? null);
                              }}
                            >
                              <Text style={styles.pagarBtnText}>Registrar pago</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.bottomBtn} onPress={abrirNueva}>
          <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
          <Text style={styles.bottomBtnText}>Agregar tarjeta</Text>
        </TouchableOpacity>
      </View>

      {/* Modal crear/editar tarjeta */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editando ? 'Editar tarjeta' : 'Nueva tarjeta'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Tarjeta departamental</Text>
              <Switch value={esDepartamental} onValueChange={setEsDepartamental} trackColor={{ true: theme.secondary }} />
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
                  placeholderTextColor={theme.textSecondary}
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

      {/* Modal registrar pago */}
      <Modal visible={!!pagoModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={cerrarPagoModal}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Registrar pago</Text>
            <TouchableOpacity onPress={cerrarPagoModal}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto pagado ($)</Text>
              <TextInput
                style={styles.input}
                placeholder={pagoModal ? String(pagoModal.saldo) : '0'}
                placeholderTextColor={theme.textSecondary}
                value={pagoMonto}
                onChangeText={setPagoMonto}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descontar de cuenta</Text>
              {cuentas.length === 0 ? (
                <Text style={styles.periodoVacio}>Sin cuentas registradas. Agrega una en Cuentas.</Text>
              ) : cuentas.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.cuentaOption, pagoCuentaId === c.id && styles.cuentaOptionSelected]}
                  onPress={() => setPagoCuentaId(c.id)}
                >
                  <Text style={[styles.cuentaOptionText, pagoCuentaId === c.id && styles.cuentaOptionTextSelected]}>
                    {c.nombre}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, (!pagoCuentaId || !pagoMonto) && styles.saveBtnDisabled]}
              onPress={confirmarPago}
            >
              <Text style={styles.saveBtnText}>Confirmar pago</Text>
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
  scroll: { padding: 16 },
  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: t.textSecondary },
  emptyText: { fontSize: 13, color: t.textSecondary, textAlign: 'center' },
  card: { backgroundColor: t.card, borderRadius: 14, padding: 16, marginBottom: 12, borderLeftWidth: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  cardIconBg: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardNombre: { fontSize: 15, fontWeight: '600', color: t.text },
  cardBanco: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  cardMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  metric: { minWidth: '40%' },
  metricLabel: { fontSize: 11, color: t.textSecondary },
  metricValor: { fontSize: 14, fontWeight: '600', color: t.text, marginTop: 2 },
  progressBg: { height: 6, backgroundColor: t.background, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', borderRadius: 3 },
  pctText: { fontSize: 11, color: t.textSecondary },
  tasaText: { fontSize: 11, color: t.textSecondary, marginTop: 2 },
  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: t.border },
  expandBtnText: { fontSize: 13, color: t.secondary, fontWeight: '500' },
  periodosWrap: { marginTop: 10, gap: 8 },
  periodoRow: { backgroundColor: t.background, borderRadius: 10, padding: 12, gap: 6 },
  periodoRowCerrado: { borderWidth: 1, borderColor: t.warning + '40' },
  periodoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  estadoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  estadoText: { fontSize: 11, fontWeight: '600' },
  periodoSaldo: { fontSize: 15, fontWeight: '700', color: t.text },
  periodoFechaLabel: { fontSize: 12, color: t.text },
  periodoVence: { fontSize: 11, color: t.warning },
  periodoVacio: { fontSize: 12, color: t.textSecondary, textAlign: 'center', padding: 8 },
  pagarBtn: { backgroundColor: t.primary, borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 4 },
  pagarBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 24, backgroundColor: t.surface, borderTopWidth: 0.5, borderTopColor: t.border },
  bottomBtn: { backgroundColor: t.primary, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottomBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: t.surface },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 0.5, borderBottomColor: t.border },
  modalTitle: { fontSize: 18, fontWeight: '600', color: t.text },
  modalBody: { padding: 20 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, backgroundColor: t.background, padding: 14, borderRadius: 10 },
  switchLabel: { fontSize: 14, color: t.text },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, color: t.text, fontWeight: '500', marginBottom: 6 },
  input: { backgroundColor: t.background, borderWidth: 0.5, borderColor: t.border, borderRadius: 10, padding: 12, fontSize: 15, color: t.text },
  coloresRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 24 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotSelected: { borderWidth: 3, borderColor: t.text },
  saveBtn: { backgroundColor: t.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  cuentaOption: { backgroundColor: t.background, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 12, marginBottom: 8 },
  cuentaOptionSelected: { borderColor: t.primary, backgroundColor: t.primary + '18' },
  cuentaOptionText: { fontSize: 14, color: t.text },
  cuentaOptionTextSelected: { color: t.primary, fontWeight: '600' },
});
