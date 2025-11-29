import React, { useState } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import Input from './ui/Input';
import Button from './ui/Button';

// Icons
const DashboardIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
);

const LogIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
);

const BankIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const CompetitionIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>
);

const AdminIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
);

const SettingsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066 2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const LogoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
);

const LoginIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
    </svg>
);

const ArrowDownIcon = ({ isOpen }: { isOpen: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

const StarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
);
const GoalIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
);
const AiIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
);
const AIPredictionIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 4.992c2.613.621 4.225 3.332 3.604 5.945-1.24 5.256-4.237 8.23-7.604 8.23-3.367 0-6.364-2.974-7.604-8.23C3.775 8.324 5.387 5.613 8 4.992M12 12h.01M12 12v3.313" />
    </svg>
);
const SimulatorIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);



type View = 'dashboard' | 'log' | 'admin' | 'competition' | 'settings' | 'bank_history' | 'goals' | 'ai_strategy' | 'bank_simulator' | 'ai_prediction_log';

interface SidebarProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  isDemoMode: boolean;
  onAuthRequired: () => void;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  view: View;
  currentView: View;
  onClick: (view: View) => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, view, currentView, onClick }) => {
  const isActive = currentView === view;
  return (
    <button
      onClick={() => onClick(view)}
      className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
        isActive
          ? 'bg-indigo-600 text-white'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      <span className="mr-3">{icon}</span>
      {label}
    </button>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, isDemoMode, onAuthRequired }) => {
  const { currentUser, logout, isAdmin, isTelegramAuth } = useAuthContext();
  
  const [isReferralOpen, setIsReferralOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSetView = (view: View) => {
    const allowedDemoViews: View[] = ['dashboard', 'competition', 'ai_prediction_log'];
    if (isDemoMode && !allowedDemoViews.includes(view)) {
        onAuthRequired();
        return;
    }
    setCurrentView(view);
  }

  const handleCopyCode = () => {
    if (currentUser?.referralCode) {
        navigator.clipboard.writeText(currentUser.referralCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
  };


  return (
    <div className="flex flex-col w-64 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center h-20 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                <span className="text-indigo-600 dark:text-indigo-400">Bet</span>Diary
            </h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <nav className="space-y-1">
                <NavItem icon={<DashboardIcon />} label="Дашборд" view="dashboard" currentView={currentView} onClick={handleSetView} />
                <NavItem icon={<LogIcon />} label="Журнал ставок" view="log" currentView={currentView} onClick={handleSetView} />
                <NavItem icon={<BankIcon />} label="История банка" view="bank_history" currentView={currentView} onClick={handleSetView} />
                <NavItem icon={<CompetitionIcon />} label="Соревнования" view="competition" currentView={currentView} onClick={handleSetView} />
            </nav>
            
            <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                <h3 className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Инструменты</h3>
                <nav className="space-y-1">
                    <NavItem icon={<GoalIcon />} label="Мои цели" view="goals" currentView={currentView} onClick={handleSetView} />
                    <NavItem icon={<AiIcon />} label="AI-Стратег" view="ai_strategy" currentView={currentView} onClick={handleSetView} />
                    <NavItem icon={<AIPredictionIcon />} label="База прогнозов AI" view="ai_prediction_log" currentView={currentView} onClick={handleSetView} />
                    <NavItem icon={<SimulatorIcon />} label="Симулятор Банка" view="bank_simulator" currentView={currentView} onClick={handleSetView} />
                </nav>
            </div>
             
             <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                 <h3 className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Система</h3>
                 <nav className="space-y-1">
                    <NavItem icon={<SettingsIcon />} label="Настройки" view="settings" currentView={currentView} onClick={handleSetView} />
                    {isAdmin && <NavItem icon={<AdminIcon />} label="Админ панель" view="admin" currentView={currentView} onClick={handleSetView} />}
                 </nav>
            </div>


             {!isDemoMode && currentUser && (
                    <div className="space-y-2 pt-4 mt-2 border-t border-gray-200 dark:border-gray-700">
                        {/* Referral Program Section */}
                        <div>
                            <button onClick={() => setIsReferralOpen(!isReferralOpen)} className="w-full flex justify-between items-center text-left text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
                                <span className="uppercase">Реферальная программа</span>
                                <ArrowDownIcon isOpen={isReferralOpen} />
                            </button>
                             <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isReferralOpen ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                                <div className="p-3 bg-gray-100 dark:bg-gray-900/50 rounded-b-lg space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-500 dark:text-gray-400">Ваш баланс:</span>
                                        <div className="flex items-center font-bold">
                                            <StarIcon />
                                            <span className="ml-1">{currentUser.buttercups || 0}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Код приглашения:</p>
                                        <div className="flex items-center space-x-2">
                                            <Input type="text" value={currentUser.referralCode} readOnly className="text-sm bg-gray-200 dark:bg-gray-800 text-center font-mono" />
                                            <Button onClick={handleCopyCode} variant="secondary" className="whitespace-nowrap">{copied ? 'Скопировано!' : 'Копировать'}</Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
        </div>
        
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            {currentUser ? (
                <div>
                    <div className="mb-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{currentUser.nickname}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{currentUser.email}</p>
                    </div>
                    {!isTelegramAuth && (
                        <button
                            onClick={logout}
                            className="w-full flex items-center px-4 py-2 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-300 hover:bg-red-500 hover:text-white transition-colors duration-200"
                        >
                            <LogoutIcon />
                            <span className="ml-3">Выйти</span>
                        </button>
                    )}
                </div>
            ) : (
                 <button
                    onClick={onAuthRequired}
                    className="w-full flex items-center px-4 py-2 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-indigo-600 hover:text-white transition-colors duration-200"
                >
                    <LoginIcon />
                    <span className="ml-3">Войти / Регистрация</span>
                </button>
            )}
        </div>
    </div>
  );
};

export default Sidebar;