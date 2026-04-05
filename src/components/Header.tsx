import React from 'react';
import Button from './ui/Button';
import { useBetContext } from '../contexts/BetContext';
import { View } from '../types';

const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 mr-2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);

const MenuIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
);


interface HeaderProps {
  onAddBetClick: () => void;
  onCashOutClick: () => void;
  onUpdateBankrollClick: () => void;
  onToggleSidebar: () => void;
  currentView: View;
}

const viewTitles: Record<View, { title: string; subtitle: string }> = {
    dashboard: {
        title: 'Дашборд',
        subtitle: 'Обзор вашей эффективности.'
    },
    log: {
        title: 'Журнал ставок',
        subtitle: 'Вся история ваших ставок.'
    },
    bank_history: {
        title: 'История Банка',
        subtitle: 'Все транзакции и динамика вашего баланса.'
    },
    admin: {
        title: 'Панель Администратора',
        subtitle: 'Обзор пользователей и глобальной статистики.'
    },
    competition: {
        title: 'Соревнования',
        subtitle: 'Соревнуйтесь с другими игроками!'
    },
    settings: {
        title: 'Настройки',
        subtitle: 'Управляйте своими предпочтениями.'
    },
    goals: {
        title: 'Мои цели',
        subtitle: 'Устанавливайте и отслеживайте свои финансовые и аналитические цели.'
    },
    ai_strategy: {
        title: 'AI-Стратег',
        subtitle: 'Получите персональные рекомендации по улучшению вашей стратегии.'
    },
    bank_simulator: {
        title: 'Симулятор Банка',
        subtitle: 'Прогнозируйте возможные исходы с помощью симуляции Монте-Карло.'
    },
    ai_prediction_log: {
        title: 'База прогнозов AI',
        subtitle: 'Анализируйте точность прогнозов искусственного интеллекта.'
    },
    poker_academy: {
        title: 'Академия Покера',
        subtitle: 'Обучение, симуляции и ИИ-анализ вашей игры.'
    }
}


const Header: React.FC<HeaderProps> = ({ onAddBetClick, onCashOutClick, onUpdateBankrollClick, currentView, onToggleSidebar }) => {
  const { bankroll } = useBetContext();
  const { title, subtitle } = viewTitles[currentView] || viewTitles.dashboard;
  const showActionButtons = ['dashboard', 'log'].includes(currentView);

  return (
    <header className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 md:px-8 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
            <button onClick={onToggleSidebar} className="md:hidden mr-4 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                <MenuIcon />
            </button>
            <div>
               <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h2>
               <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
            </div>
        </div>
        {showActionButtons && (
            <div className="flex items-center flex-wrap justify-end gap-1 md:gap-4">
                <div className="text-right hidden lg:block mr-2">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Банк</div>
                    <div className="text-base font-bold text-gray-900 dark:text-white">{bankroll.toFixed(2)} ₽</div>
                </div>
                <div className="flex gap-1">
                  <Button onClick={onUpdateBankrollClick} variant="secondary" className="px-2 py-1 text-[10px] md:text-sm md:px-4 md:py-2 flex items-center">
                      <span className="hidden xs:inline">Банк</span>
                      <span className="xs:hidden">Б</span>
                  </Button>
                  <Button onClick={onCashOutClick} variant="secondary" className="px-2 py-1 text-[10px] md:text-sm md:px-4 md:py-2 flex items-center">
                      <span className="hidden xs:inline">Кэшаут</span>
                      <span className="xs:hidden">К</span>
                  </Button>
                  <Button onClick={onAddBetClick} className="px-2 py-1 text-[10px] md:text-sm md:px-4 md:py-2 flex items-center">
                      <PlusIcon />
                      <span className="hidden sm:inline">Ставка</span>
                  </Button>
                </div>
            </div>
        )}
      </div>
    </header>
  );
};

export default Header;