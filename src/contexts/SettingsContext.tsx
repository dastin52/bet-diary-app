import React, { createContext, useContext, ReactNode } from 'react';
import { useSettings, UseSettingsReturn } from '../hooks/useSettings';

const SettingsContext = createContext<UseSettingsReturn | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode; userKey: string; }> = ({ children, userKey }) => {
  const settingsState = useSettings(userKey);
  // Force isLoading to false for context consumers to prevent blocking entire app
  // The hook itself manages the data, but for the Provider, we want immediate render
  const value = { ...settingsState, isLoading: false };
  
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettingsContext = (): UseSettingsReturn => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettingsContext must be used within a SettingsProvider');
  }
  return context;
};