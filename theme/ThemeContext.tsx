import React, { createContext, useContext, useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system';
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

const TEMA_PATH = FileSystem.documentDirectory + 'tema.txt';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>('claro');

  useEffect(() => {
    FileSystem.readAsStringAsync(TEMA_PATH)
      .then(saved => {
        if (saved && TEMAS[saved as ThemeId]) setThemeId(saved as ThemeId);
      })
      .catch(() => {});
  }, []);

  const cambiarTema = (id: ThemeId) => {
    setThemeId(id);
    FileSystem.writeAsStringAsync(TEMA_PATH, id).catch(() => {});
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
