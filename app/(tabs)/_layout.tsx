import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface TabConfig {
  name: string;
  title: string;
  icon: IoniconsName;
  iconFocused: IoniconsName;
}

const TABS: TabConfig[] = [
  {
    name: 'resumen',
    title: 'Resumen',
    icon: 'home-outline',
    iconFocused: 'home',
  },
  {
    name: 'tarjetas',
    title: 'Tarjetas',
    icon: 'card-outline',
    iconFocused: 'card',
  },
  {
    name: 'cuentas',
    title: 'Cuentas',
    icon: 'wallet-outline',
    iconFocused: 'wallet',
  },
  {
    name: 'gastos',
    title: 'Gastos',
    icon: 'receipt-outline',
    iconFocused: 'receipt',
  },
  {
    name: 'recurrentes',
    title: 'Recurrentes',
    icon: 'repeat-outline',
    iconFocused: 'repeat',
  },
  {
    name: 'inversiones',
    title: 'Inversiones',
    icon: 'trending-up-outline',
    iconFocused: 'trending-up',
  },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
          borderTopWidth: 0.5,
          paddingBottom: 6,
          paddingTop: 6,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? tab.iconFocused : tab.icon}
                size={size}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}