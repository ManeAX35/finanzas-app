export type ThemeId = 'claro' | 'oscuro' | 'neon' | 'oceano' | 'sunset';

export interface ThemeColors {
  background: string;
  surface: string;
  card: string;
  primary: string;
  secondary: string;
  text: string;
  textSecondary: string;
  success: string;
  danger: string;
  warning: string;
  border: string;
  header: string;
  statusBar: 'light' | 'dark';
}

export interface TemaDefinition {
  nombre: string;
  preview: string;
  colors: ThemeColors;
}

export const TEMAS: Record<ThemeId, TemaDefinition> = {
  claro: {
    nombre: 'Claro',
    preview: '#4F46E5',
    colors: {
      background: '#F9FAFB',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      primary: '#4F46E5',
      secondary: '#6366F1',
      text: '#111827',
      textSecondary: '#6B7280',
      success: '#10B981',
      danger: '#EF4444',
      warning: '#F59E0B',
      border: '#E5E7EB',
      header: '#FFFFFF',
      statusBar: 'dark',
    },
  },
  oscuro: {
    nombre: 'Oscuro',
    preview: '#818CF8',
    colors: {
      background: '#0F172A',
      surface: '#1E293B',
      card: '#1E293B',
      primary: '#818CF8',
      secondary: '#6366F1',
      text: '#F1F5F9',
      textSecondary: '#94A3B8',
      success: '#34D399',
      danger: '#F87171',
      warning: '#FBBF24',
      border: '#334155',
      header: '#1E293B',
      statusBar: 'light',
    },
  },
  neon: {
    nombre: 'Neón',
    preview: '#00FF88',
    colors: {
      background: '#000000',
      surface: '#0D0D0D',
      card: '#111111',
      primary: '#00FF88',
      secondary: '#00E5FF',
      text: '#FFFFFF',
      textSecondary: '#888888',
      success: '#00FF88',
      danger: '#FF3366',
      warning: '#FFD600',
      border: '#222222',
      header: '#0D0D0D',
      statusBar: 'light',
    },
  },
  oceano: {
    nombre: 'Océano',
    preview: '#2196F3',
    colors: {
      background: '#0A1628',
      surface: '#0F2040',
      card: '#0F2040',
      primary: '#2196F3',
      secondary: '#03A9F4',
      text: '#E3F2FD',
      textSecondary: '#90CAF9',
      success: '#26C6DA',
      danger: '#EF5350',
      warning: '#FFA726',
      border: '#1A3A5C',
      header: '#0F2040',
      statusBar: 'light',
    },
  },
  sunset: {
    nombre: 'Sunset',
    preview: '#F97316',
    colors: {
      background: '#FFF8F0',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      primary: '#F97316',
      secondary: '#EC4899',
      text: '#1C0A00',
      textSecondary: '#7A4A2A',
      success: '#22C55E',
      danger: '#EF4444',
      warning: '#EAB308',
      border: '#FDDCB8',
      header: '#FFFFFF',
      statusBar: 'dark',
    },
  },
};
