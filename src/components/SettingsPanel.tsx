
import React, { useState } from 'react';
import Card from './ui/Card';
// FIX: Changed to a named import to match the updated export in ToggleSwitch.tsx.
import { ToggleSwitch } from './ui/ToggleSwitch';
import { useSettingsContext } from '../contexts/SettingsContext';
import { useAuthContext } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import { useBetContext } from '../contexts/BetContext';

const SunIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM10 18a1 1 0 01-1-1v-1a1 1 0 112 0v1a1 1 0 01-1 1zm-4.95-.464a1 1 0 01-1.414 0l-.707-.707a1 1 0 011.414-1.414l.707.707a1 1 0 010 1.414zM4 10a1 1 0 01-1-1H2a1 1 0 110-2h1a1 1 0 011 1zm10.607-2.12a1 1 0 011.414 0l.707-.707a1 1 0 111.414 1.414l-.707.707a1 1 0 01-1.414-1.414zM10 18a1 1 0 01-1-1v-1a1 1 0 112 0v1a1 1 0 01-1 1z"/></svg>;
const MoonIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>;
const ComputerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm2 0h10v8H5V5zm0 2h10v1H5V7zm0 2h10v1H5V9zm0 2h10v1H5v-1z" clipRule="evenodd" /></svg>;
const TelegramIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23l7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3L3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.28 1.4.24 1.15 1.1l-3.22 15.26c-.24.93-1 .4-1.4-.15l-4.24-3.75l-2.02 1.93c-.23.23-.42.42-.8.42z" /></svg>;


const SettingsPanel: React.FC = () => {
  const { settings, updateSettings, isLoading } = useSettingsContext();
  const { currentUser } = useAuthContext();
  const { bets, bankroll, bankHistory, goals } = useBetContext();
  const { setTheme } = useTheme();
  const isDemoMode = !currentUser;

  const [telegramCode, setTelegramCode] = useState<string | null>(null);
  const [isTgLoading, setIsTgLoading] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);

  const handleNotificationChange = (key: 'betReminders' | 'competitionUpdates' | 'aiAnalysisAlerts', value: boolean) => {
    updateSettings({
      notifications: {
        ...settings.notifications,
        [key]: value,
      },
    });
  };
  
  const handleThemeChange = (themeValue: 'light' | 'dark' | 'system') => {
      updateSettings({ theme: themeValue });
      setTheme(themeValue);
  }

  const handleGenerateTelegramCode = async () => {
      if (!currentUser) return;
      setIsTgLoading(true);
      setTgError(null);
      setTelegramCode(null);
      try {
          const userDataPayload = {
            user: currentUser,
            bets,
            bankroll,
            bankHistory,
            goals,
          };

          const response = await fetch('/api/telegram/generate-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  email: currentUser.email,
                  userData: userDataPayload,
              }),
          });
          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Не удалось сгенерировать код.');
          }
          const { code } = await response.json();
          setTelegramCode(code);
      } catch (err) {
          setTgError(err instanceof Error ? err.message : 'Произошла сетевая ошибка.');
      } finally {
          setIsTgLoading(false);
      }
  };


  if (isLoading) {
    return <div className="text-center text-gray-400">Загрузка настроек...</div>;
  }
  
  // FIX: Explicitly type the theme options array to ensure type safety.
  // FIX: Changed JSX.Element to React.ReactNode to resolve "Cannot find namespace 'JSX'" error.
  const themeOptions: { value: 'light' | 'dark' | 'system', label: string, icon: React.ReactNode }[] = [
      { value: 'light', label: 'Светлая', icon: <SunIcon/> },
      { value: 'dark', label: 'Темная', icon: <MoonIcon /> },
      { value: 'system', label: 'Системная', icon: <ComputerIcon /> },
  ];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Card>
        <h2 className="text-xl font-semibold mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">Внешний вид</h2>
         <div className="space-y-2">
            <p className="font-medium text-gray-900 dark:text-white">Тема оформления</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Выберите, как будет выглядеть приложение.</p>
            <div className="flex flex-wrap gap-2 pt-2">
                {themeOptions.map(opt => (
                    <Button 
                        key={opt.value} 
                        variant={settings.theme === opt.value ? 'primary' : 'secondary'}
                        onClick={() => handleThemeChange(opt.value)}
                        disabled={isDemoMode}
                        className="flex items-center gap-2"
                    >
                       {opt.icon} {opt.label}
                    </Button>
                ))}
            </div>
         </div>
      </Card>
      
      {!isDemoMode && (
          <Card>
            <h2 className="text-xl font-semibold mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">Интеграция с Telegram</h2>
             <div className="space-y-2">
                <p className="font-medium text-gray-900 dark:text-white">Подключить Telegram-бот</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Получите доступ к статистике и добавляйте ставки прямо из Telegram. Нажмите, чтобы сгенерировать одноразовый код для привязки вашего аккаунта.</p>
                <div className="pt-2">
                    <Button 
                        variant="secondary"
                        onClick={handleGenerateTelegramCode}
                        disabled={isTgLoading}
                        className="flex items-center gap-2 !bg-blue-500/80 hover:!bg-blue-600 !text-white"
                    >
                       <TelegramIcon /> {isTgLoading ? 'Генерация...' : 'Сгенерировать код'}
                    </Button>
                </div>
                {tgError && <p className="mt-2 text-sm text-red-400">{tgError}</p>}
                {telegramCode && (
                    <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-900/50 rounded-lg">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Ваш одноразовый код (действителен 5 минут):</p>
                        <p className="text-3xl font-bold tracking-widest text-center my-2 text-indigo-500 dark:text-indigo-400">{telegramCode}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Отправьте этот код вашему Telegram-боту, чтобы завершить привязку.</p>
                    </div>
                )}
             </div>
          </Card>
      )}


      <Card>
        <h2 className="text-xl font-semibold mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">Настройки Уведомлений</h2>
        <div className="space-y-6">
          <ToggleSwitch
            label="Напоминания о ставках"
            description="Получайте уведомления о предстоящих событиях, на которые вы сделали ставку."
            checked={settings.notifications.betReminders}
            onChange={(value) => handleNotificationChange('betReminders', value)}
            disabled={isDemoMode}
          />
          <ToggleSwitch
            label="Обновления соревнований"
            description="Получайте уведомления об изменениях в таблице лидеров и новостях соревнований."
            checked={settings.notifications.competitionUpdates}
            onChange={(value) => handleNotificationChange('competitionUpdates', value)}
            disabled={isDemoMode}
          />
          <ToggleSwitch
            label="Оповещения от AI-аналитика"
            description="Получайте уведомления, когда AI находит важные инсайты по вашей статистике."
            checked={settings.notifications.aiAnalysisAlerts}
            onChange={(value) => handleNotificationChange('aiAnalysisAlerts', value)}
            disabled={isDemoMode}
          />
        </div>
         {isDemoMode && (
          <p className="mt-6 text-sm text-center text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/50 p-3 rounded-md">
            Войдите в аккаунт, чтобы изменить настройки.
          </p>
        )}
      </Card>
    </div>
  );
};

export default SettingsPanel;
