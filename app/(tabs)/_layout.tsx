import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, SafeAreaView, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
  name: string;
  title: string;
  icon: IoniconsName;
  color: string;
}

const MENU_ITEMS: MenuItem[] = [
  { name: 'resumen', title: 'Resumen', icon: 'home-outline', color: '#4F46E5' },
  { name: 'dashboard', title: 'Dashboard', icon: 'bar-chart-outline', color: '#6366F1' },
  { name: 'tarjetas', title: 'Tarjetas', icon: 'card-outline', color: '#3B82F6' },
  { name: 'cuentas', title: 'Cuentas', icon: 'wallet-outline', color: '#10B981' },
  { name: 'gastos', title: 'Gastos', icon: 'receipt-outline', color: '#F59E0B' },
  { name: 'recurrentes', title: 'Recurrentes', icon: 'repeat-outline', color: '#F97316' },
  { name: 'inversiones', title: 'Inversiones', icon: 'trending-up-outline', color: '#8B5CF6' },
];

let globalOpenMenu: (() => void) | null = null;
export function openGlobalMenu() { globalOpenMenu?.(); }

const makeStyles = (t: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  overlayBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  drawer: { width: 280, backgroundColor: t.surface, shadowColor: '#000', shadowOffset: { width: -2, height: 0 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 10 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 0.5, borderBottomColor: t.border },
  drawerLogo: { width: 44, height: 44, borderRadius: 12, backgroundColor: t.primary + '18', justifyContent: 'center', alignItems: 'center' },
  drawerTitle: { fontSize: 16, fontWeight: '700', color: t.text },
  drawerSub: { fontSize: 12, color: t.textSecondary, marginTop: 1 },
  closeBtn: { marginLeft: 'auto' as any, padding: 4 },
  drawerMenu: { flex: 1, padding: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, marginBottom: 4 },
  menuItemActive: { backgroundColor: t.primary + '12' },
  menuIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  menuText: { flex: 1, fontSize: 15, color: t.textSecondary },
  drawerFooter: { padding: 20, borderTopWidth: 0.5, borderTopColor: t.border },
  drawerFooterText: { fontSize: 12, color: t.textSecondary, textAlign: 'center' },
});

export default function TabLayout() {
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(() => makeStyles(theme), [theme]);

  globalOpenMenu = () => setMenuVisible(true);

  const navegarA = (name: string) => {
    setActiveTab(name);
    setMenuVisible(false);
    router.push(`/(tabs)/${name}` as any);
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        {MENU_ITEMS.map(item => (
          <Tabs.Screen key={item.name} name={item.name} />
        ))}
      </Tabs>

      <Modal
        visible={menuVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayBg} onPress={() => setMenuVisible(false)} />
          <SafeAreaView style={styles.drawer}>
            <View style={[styles.drawerHeader, { paddingTop: insets.top + 16 }]}>
              <View style={styles.drawerLogo}>
                <Ionicons name="wallet-outline" size={28} color={theme.primary} />
              </View>
              <View>
                <Text style={styles.drawerTitle}>Mis Finanzas</Text>
                <Text style={styles.drawerSub}>Control personal</Text>
              </View>
              <TouchableOpacity onPress={() => setMenuVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.drawerMenu}>
              {MENU_ITEMS.map(item => (
                <TouchableOpacity
                  key={item.name}
                  style={[styles.menuItem, activeTab === item.name && styles.menuItemActive]}
                  onPress={() => navegarA(item.name)}
                >
                  <View style={[styles.menuIcon, { backgroundColor: item.color + '18' }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <Text style={[styles.menuText, activeTab === item.name && { color: item.color, fontWeight: '600' }]}>
                    {item.title}
                  </Text>
                  {activeTab === item.name && (
                    <Ionicons name="chevron-forward" size={16} color={item.color} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.drawerFooter}>
              <Text style={styles.drawerFooterText}>Mis Finanzas v1.0</Text>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
