import React, { createContext, useContext, useEffect, ReactNode, useCallback } from 'react';
import { useSettingsContext } from './SettingsContext';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  setTheme: (theme: Theme) => void;
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings, updateSettings, isLoading } = useSettingsContext();
  const theme = settings.theme;

  const setTheme = useCallback((newTheme: Theme) => {
    updateSettings({ theme: newTheme });
  }, [updateSettings]);

  useEffect(() => {
    if (isLoading) return;

    const root = window.document.documentElement;
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    root.classList.toggle('dark', isDark);
  }, [theme, isLoading]);

  useEffect(() => {
    if (isLoading || theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.toggle('dark', mediaQuery.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, isLoading]);

  const value = { theme, setTheme };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
