import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { openGlobalMenu } from '../app/(tabs)/_layout';
import { useTheme } from '../theme/ThemeContext';
import { TEMAS, ThemeId } from '../theme/colors';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

const TEMA_IDS = Object.keys(TEMAS) as ThemeId[];

export default function Header({ title, subtitle }: HeaderProps) {
  const { theme, themeId, cambiarTema } = useTheme();
  const [modalTema, setModalTema] = useState(false);

  return (
    <View style={[styles.header, { backgroundColor: theme.header, borderBottomColor: theme.border }]}>
      <View style={styles.left}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {subtitle && <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
      </View>
      <View style={styles.rightButtons}>
        <TouchableOpacity onPress={() => setModalTema(true)} style={styles.iconBtn}>
          <Ionicons name="color-palette-outline" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={openGlobalMenu} style={styles.iconBtn}>
          <Ionicons name="menu-outline" size={26} color={theme.text} />
        </TouchableOpacity>
      </View>

      <Modal visible={modalTema} transparent animationType="fade" onRequestClose={() => setModalTema(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setModalTema(false)}>
          <SafeAreaView style={[styles.temaSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.temaTitle, { color: theme.text }]}>Tema</Text>
            {TEMA_IDS.map(id => {
              const def = TEMAS[id];
              const activo = id === themeId;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.temaRow, activo && { backgroundColor: def.colors.primary + '18' }]}
                  onPress={() => { cambiarTema(id); setModalTema(false); }}
                >
                  <View style={[styles.temaSwatch, { backgroundColor: def.preview }]} />
                  <Text style={[styles.temaNombre, { color: theme.text }]}>{def.nombre}</Text>
                  {activo && <Ionicons name="checkmark" size={18} color={def.colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </SafeAreaView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 0.5 },
  left: { flex: 1 },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { fontSize: 13, marginTop: 2 },
  rightButtons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 4 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  temaSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 0.5, borderBottomWidth: 0 },
  temaTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  temaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4 },
  temaSwatch: { width: 28, height: 28, borderRadius: 14 },
  temaNombre: { flex: 1, fontSize: 15 },
});
