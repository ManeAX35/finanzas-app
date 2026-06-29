import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Modal, TextInput,
  RefreshControl, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { crearGasto, obtenerGastos, eliminarGasto, actualizarGasto, crearCompra, obtenerCompras, eliminarCompra, obtenerCuotasPendientesMes, marcarCuotaPagada } from '../../database/queries/gastos';
import { obtenerTarjetas, abonarSaldoTarjeta } from '../../database/queries/tarjetas';
import { obtenerCuentasLiquidez, crearMovimiento } from '../../database/queries/liquidez';
import { obtenerCuentasInversion, transferirCuentaAInversion } from '../../database/queries/inversiones';
import { formatMXN, hoy } from '../../database';
import { Gasto, Compra, TarjetaConVersion, CuentaLiquidez } from '../../types';
import Header from '../../components/Header';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';

const CATEGORIAS = ['Alimentación', 'Transporte', 'Salud', 'Entretenimiento', 'Ropa', 'Hogar', 'Tecnología', 'Educación', 'Viaje', 'Otro'];
const MSI_OPTS = [1, 3, 6, 9, 12, 18, 24];

export default function GastosScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [tab, setTab] = useState<'gastos' | 'msi' | 'cuotas'>('gastos');
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [cuotas, setCuotas] = useState<any[]>([]);
  const [tarjetas, setTarjetas] = useState<TarjetaConVersion[]>([]);
  const [cuentas, setCuentas] = useState<CuentaLiquidez[]>([]);
  const [inversiones, setInversiones] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalGasto, setModalGasto] = useState(false);
  const [modalMSI, setModalMSI] = useState(false);
  const [modalEditarGasto, setModalEditarGasto] = useState(false);
  const [editandoGasto, setEditandoGasto] = useState<Gasto | null>(null);
  const [formEditar, setFormEditar] = useState({ descripcion: '', monto: '', fecha: hoy(), categoria: 'Alimentación', notas: '' });
  const [tipoGasto, setTipoGasto] = useState<'tarjeta' | 'cuenta' | 'pago_tarjeta' | 'a_inversion'>('tarjeta');

  const [formGasto, setFormGasto] = useState({
    descripcion: '', monto: '', fecha: hoy(),
    categoria: 'Alimentación', notas: '',
    tarjeta_version_id: '', cuenta_liquidez_id: '',
    pago_tarjeta_id: '', pago_cuenta_id: '',
    inv_inversion_id: '',
  });

  const [formMSI, setFormMSI] = useState({
    descripcion: '', monto_total: '', meses: '3',
    fecha_compra: hoy(), categoria: 'Tecnología',
    tarjeta_version_id: '', origen: 'tarjeta', notas: '',
  });

  const cargarDatos = async () => {
    try {
      const hoyDate = new Date();
      const [g, c, t, cu, inv, cuotas] = await Promise.all([
        obtenerGastos(),
        obtenerCompras(),
        obtenerTarjetas(),
        obtenerCuentasLiquidez(),
        obtenerCuentasInversion(),
        obtenerCuotasPendientesMes(hoyDate.getFullYear(), hoyDate.getMonth() + 1),
      ]);
      setGastos(g);
      setCompras(c);
      setTarjetas(t);
      setCuentas(cu);
      setInversiones(inv);
      setCuotas(cuotas);
    } catch (e) {
      console.error('[gastos ERROR]', e);
      Alert.alert('Error cargando gastos', String(e));
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { cargarDatos(); }, []));

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
          notas: formGasto.notas, tarjeta_version_id: formGasto.tarjeta_version_id,
        });
      } else if (tipoGasto === 'cuenta') {
        if (!formGasto.cuenta_liquidez_id) { Alert.alert('Selecciona una cuenta'); return; }
        await crearGasto({
          descripcion: formGasto.descripcion || 'Gasto',
          monto, fecha: formGasto.fecha, categoria: formGasto.categoria,
          notas: formGasto.notas, cuenta_liquidez_id: formGasto.cuenta_liquidez_id,
        });
      } else if (tipoGasto === 'pago_tarjeta') {
        if (!formGasto.pago_tarjeta_id || !formGasto.pago_cuenta_id) {
          Alert.alert('Selecciona tarjeta y cuenta origen'); return;
        }
        await crearMovimiento({
          cuenta_id: formGasto.pago_cuenta_id, tipo: 'gasto', monto,
          fecha: formGasto.fecha,
          descripcion: formGasto.descripcion || 'Pago a tarjeta',
          categoria: 'Tarjeta',
        });
        await abonarSaldoTarjeta(formGasto.pago_tarjeta_id, monto);
      } else if (tipoGasto === 'a_inversion') {
        if (!formGasto.cuenta_liquidez_id || !formGasto.inv_inversion_id) {
          Alert.alert('Selecciona cuenta e inversión'); return;
        }
        await transferirCuentaAInversion(formGasto.cuenta_liquidez_id, formGasto.inv_inversion_id, monto, formGasto.descripcion || undefined);
      }
      setModalGasto(false);
      setFormGasto({ descripcion: '', monto: '', fecha: hoy(), categoria: 'Alimentación', notas: '', tarjeta_version_id: '', cuenta_liquidez_id: '', pago_tarjeta_id: '', pago_cuenta_id: '', inv_inversion_id: '' });
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', String(e));
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
      Alert.alert('Error', String(e));
    }
  };

  const abrirEditarGasto = (g: Gasto) => {
    setEditandoGasto(g);
    setFormEditar({ descripcion: g.descripcion, monto: String(g.monto), fecha: g.fecha, categoria: g.categoria ?? 'Alimentación', notas: g.notas ?? '' });
    setModalEditarGasto(true);
  };

  const guardarEdicion = async () => {
    if (!editandoGasto) return;
    const monto = parseFloat(formEditar.monto);
    if (isNaN(monto) || monto <= 0) { Alert.alert('Monto inválido'); return; }
    try {
      await actualizarGasto(editandoGasto.id, { descripcion: formEditar.descripcion, monto, fecha: formEditar.fecha, categoria: formEditar.categoria, notas: formEditar.notas });
      setModalEditarGasto(false);
      setEditandoGasto(null);
      cargarDatos();
    } catch (e) {
      Alert.alert('Error', String(e));
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
      <Header title="Gastos" />

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
                <Ionicons name="receipt-outline" size={48} color={theme.border} />
                <Text style={styles.emptyText}>Sin gastos registrados</Text>
              </View>
            ) : gastos.map(g => {
              const tarjeta = tarjetas.find(t => t.id === g.tarjeta_version_id);
              return (
                <View key={g.id} style={styles.item}>
                  <View style={styles.itemLeft}>
                    <View style={styles.itemIcon}>
                      <Ionicons name="receipt-outline" size={16} color={theme.secondary} />
                    </View>
                    <View>
                      <Text style={styles.itemTitle}>{g.descripcion}</Text>
                      <Text style={styles.itemSub}>{g.fecha} · {g.categoria}</Text>
                      {tarjeta && <Text style={styles.itemTag}>{tarjeta.nombre}</Text>}
                    </View>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.itemMonto}>{formatMXN(g.monto)}</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity onPress={() => abrirEditarGasto(g)}>
                        <Ionicons name="pencil-outline" size={14} color={theme.secondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => borrarGasto(g.id)}>
                        <Ionicons name="trash-outline" size={14} color={theme.danger} />
                      </TouchableOpacity>
                    </View>
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
                <Ionicons name="layers-outline" size={48} color={theme.border} />
                <Text style={styles.emptyText}>Sin compras a MSI</Text>
              </View>
            ) : compras.map(c => {
              const cuotaMonto = c.monto_total / c.meses;
              return (
                <View key={c.id} style={styles.msiCard}>
                  <View style={styles.msiHeader}>
                    <Text style={styles.msiTitle}>{c.descripcion}</Text>
                    <TouchableOpacity onPress={() => borrarCompra(c.id)}>
                      <Ionicons name="trash-outline" size={14} color={theme.danger} />
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
                <Ionicons name="checkmark-circle-outline" size={48} color={theme.border} />
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
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        {tab === 'gastos' && (
          <TouchableOpacity style={styles.bottomBtn} onPress={() => setModalGasto(true)}>
            <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
            <Text style={styles.bottomBtnText}>Agregar gasto</Text>
          </TouchableOpacity>
        )}
        {tab === 'msi' && (
          <TouchableOpacity style={[styles.bottomBtn, { backgroundColor: theme.success }]} onPress={() => setModalMSI(true)}>
            <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
            <Text style={styles.bottomBtnText}>Agregar compra MSI</Text>
          </TouchableOpacity>
        )}
        {tab === 'cuotas' && (
          <View style={styles.bottomBtnDisabled}>
            <Text style={styles.bottomBtnDisabledText}>Las cuotas se generan automáticamente</Text>
          </View>
        )}
      </View>

      {/* Modal gasto */}
      <Modal visible={modalGasto} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalGasto(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nuevo gasto</Text>
            <TouchableOpacity onPress={() => setModalGasto(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descripción</Text>
              <TextInput style={styles.input} placeholder="Super, gasolina..." placeholderTextColor={theme.textSecondary} value={formGasto.descripcion} onChangeText={v => setFormGasto(p => ({ ...p, descripcion: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={theme.textSecondary} keyboardType="decimal-pad" value={formGasto.monto} onChangeText={v => setFormGasto(p => ({ ...p, monto: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Fecha</Text>
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textSecondary} value={formGasto.fecha} onChangeText={v => setFormGasto(p => ({ ...p, fecha: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Tipo</Text>
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

            {tipoGasto === 'tarjeta' && (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tarjeta de crédito</Text>
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

            {tipoGasto === 'pago_tarjeta' && (
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Tarjeta a pagar</Text>
                  {tarjetas.map(t => (
                    <TouchableOpacity key={t.id} style={[styles.selectorItem, formGasto.pago_tarjeta_id === t.tarjeta_id && styles.selectorItemActive]} onPress={() => setFormGasto(p => ({ ...p, pago_tarjeta_id: t.tarjeta_id }))}>
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
              </>
            )}

            {tipoGasto === 'a_inversion' && (
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Cuenta origen</Text>
                  {cuentas.map(c => (
                    <TouchableOpacity key={c.id} style={[styles.selectorItem, formGasto.cuenta_liquidez_id === c.id && styles.selectorItemActive]} onPress={() => setFormGasto(p => ({ ...p, cuenta_liquidez_id: c.id }))}>
                      <Text style={styles.selectorText}>{c.nombre}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Inversión destino</Text>
                  {inversiones.map((inv: any) => (
                    <TouchableOpacity key={inv.id} style={[styles.selectorItem, formGasto.inv_inversion_id === inv.id && styles.selectorItemActive]} onPress={() => setFormGasto(p => ({ ...p, inv_inversion_id: inv.id }))}>
                      <Text style={styles.selectorText}>{inv.nombre} — {inv.institucion}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Categoría</Text>
              <View style={styles.chipsRow}>
                {CATEGORIAS.map(cat => (
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

      {/* Modal editar gasto */}
      <Modal visible={modalEditarGasto} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalEditarGasto(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Editar gasto</Text>
            <TouchableOpacity onPress={() => setModalEditarGasto(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descripción</Text>
              <TextInput style={styles.input} placeholder="Super, gasolina..." placeholderTextColor={theme.textSecondary} value={formEditar.descripcion} onChangeText={v => setFormEditar(p => ({ ...p, descripcion: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={theme.textSecondary} keyboardType="decimal-pad" value={formEditar.monto} onChangeText={v => setFormEditar(p => ({ ...p, monto: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Fecha</Text>
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textSecondary} value={formEditar.fecha} onChangeText={v => setFormEditar(p => ({ ...p, fecha: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Categoría</Text>
              <View style={styles.chipsRow}>
                {CATEGORIAS.map(cat => (
                  <TouchableOpacity key={cat} style={[styles.chip, formEditar.categoria === cat && styles.chipActive]} onPress={() => setFormEditar(p => ({ ...p, categoria: cat }))}>
                    <Text style={[styles.chipText, formEditar.categoria === cat && styles.chipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={guardarEdicion}>
              <Text style={styles.saveBtnText}>Guardar cambios</Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Modal MSI */}
      <Modal visible={modalMSI} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalMSI(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nueva compra MSI</Text>
            <TouchableOpacity onPress={() => setModalMSI(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descripción</Text>
              <TextInput style={styles.input} placeholder="Laptop, celular..." placeholderTextColor={theme.textSecondary} value={formMSI.descripcion} onChangeText={v => setFormMSI(p => ({ ...p, descripcion: v }))} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monto total ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={theme.textSecondary} keyboardType="decimal-pad" value={formMSI.monto_total} onChangeText={v => setFormMSI(p => ({ ...p, monto_total: v }))} />
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
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textSecondary} value={formMSI.fecha_compra} onChangeText={v => setFormMSI(p => ({ ...p, fecha_compra: v }))} />
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

const makeStyles = (t: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  tabs: { flexDirection: 'row', backgroundColor: t.surface, borderBottomWidth: 0.5, borderBottomColor: t.border },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: t.primary },
  tabText: { fontSize: 12, color: t.textSecondary, fontWeight: '500' },
  tabTextActive: { color: t.primary },
  scroll: { padding: 16 },
  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 14, color: t.textSecondary },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: t.card, borderRadius: 12, padding: 14, marginBottom: 8 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  itemIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: t.primary + '18', justifyContent: 'center', alignItems: 'center' },
  itemTitle: { fontSize: 14, fontWeight: '500', color: t.text },
  itemSub: { fontSize: 11, color: t.textSecondary, marginTop: 2 },
  itemTag: { fontSize: 11, color: t.secondary, marginTop: 2 },
  itemRight: { alignItems: 'flex-end', gap: 4 },
  itemMonto: { fontSize: 15, fontWeight: '600', color: t.text },
  msiCard: { backgroundColor: t.card, borderRadius: 12, padding: 14, marginBottom: 8 },
  msiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  msiTitle: { fontSize: 15, fontWeight: '600', color: t.text },
  msiMetrics: { flexDirection: 'row', gap: 16, marginBottom: 6 },
  msiMetric: {},
  msiMetricLabel: { fontSize: 11, color: t.textSecondary },
  msiMetricValor: { fontSize: 14, fontWeight: '600', color: t.text },
  msiSub: { fontSize: 11, color: t.textSecondary },
  cuotaItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: t.card, borderRadius: 12, padding: 14, marginBottom: 8 },
  cuotaRight: { alignItems: 'flex-end', gap: 6 },
  pagarBtn: { backgroundColor: t.success, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  pagarBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 24, backgroundColor: t.surface, borderTopWidth: 0.5, borderTopColor: t.border },
  bottomBtn: { backgroundColor: t.primary, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottomBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  bottomBtnDisabled: { backgroundColor: t.background, borderRadius: 14, padding: 16, alignItems: 'center' },
  bottomBtnDisabledText: { color: t.textSecondary, fontSize: 14 },
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
  saveBtn: { backgroundColor: t.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
