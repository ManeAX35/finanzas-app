import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TEMAS, ThemeColors, ThemeId } from './colors';

interface ThemeContextType {
  theme: ThemeColors;
  themeId: ThemeId;
  cambiarTema: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: TEMAS.claro.colors,
  themeId: 'claro',
  cambiarTema: () => {},
});

const THEME_KEY = 'app-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>('claro');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then(saved => {
        if (saved && TEMAS[saved as ThemeId]) setThemeId(saved as ThemeId);
      })
      .catch(() => {});
  }, []);

  const cambiarTema = (id: ThemeId) => {
    setThemeId(id);
    AsyncStorage.setItem(THEME_KEY, id).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{ theme: TEMAS[themeId].colors, themeId, cambiarTema }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
