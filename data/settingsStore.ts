import { UserSettings } from '../types';

// FIX: Complete the defaultSettings object to match the UserSettings type.
export const defaultSettings: UserSettings = {
  notifications: {
    betReminders: true,
    competitionUpdates: true,
    aiAnalysisAlerts: false,
  },
  theme: 'system',
};

const getSettingsKey = (userKey: string) => `betDiarySettings_${userKey}`;

// FIX: Add loadSettings function.
export const loadSettings = (userKey: string): UserSettings => {
  if (userKey === 'demo_user') {
    return { ...defaultSettings };
  }
  try {
    const stored = localStorage.getItem(getSettingsKey(userKey));
    return stored ? JSON.parse(stored) : { ...defaultSettings };
  } catch (error) {
    console.error(`Error loading settings from localStorage for user: ${userKey}`, error);
    return { ...defaultSettings };
  }
};

// FIX: Add saveSettings function.
export const saveSettings = (userKey: string, settings: UserSettings): void => {
  if (userKey === 'demo_user') return;
  try {
    localStorage.setItem(getSettingsKey(userKey), JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving settings to localStorage', error);
  }
};