
import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import BetLog from './BetLog';
import AdminPanel from './AdminPanel';
import CompetitionPanel from './CompetitionPanel';
import Header from './Header';
import AddBetModal from './AddBetModal';
import AIChatModal from './AIChatModal';
import CashOutModal from './CashOutModal';
import UpdateBankrollModal from './UpdateBankrollModal';
import { Bet } from '../types';
import { useBetContext } from '../contexts/BetContext';
import { useAuthContext } from '../contexts/AuthContext';
import SettingsPanel from './SettingsPanel';
import BankHistoryPanel from './BankHistoryPanel';
import GoalsPanel from './GoalsPanel';
import AIStrategyBuilder from './AIStrategyBuilder';
import BankrollSimulator from './BankrollSimulator';
import ImportBetsModal from './ImportBetsModal';
import BetDetailModal from './BetDetailModal';
import AIPredictionLog from './AIPredictionLog';
import { useTelegram } from '../hooks/useTelegram';

type View = 'dashboard' | 'log' | 'admin' | 'competition' | 'settings' | 'bank_history' | 'goals' | 'ai_strategy' | 'bank_simulator' | 'ai_prediction_log';

interface LayoutProps {
  isDemoMode: boolean;
  onAuthRequired: () => void;
}

const Layout: React.FC<LayoutProps> = ({ isDemoMode, onAuthRequired }) => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [betToEdit, setBetToEdit] = useState<Bet | null>(null);
  const [betToView, setBetToView] = useState<Bet | null>(null);
  const [chatBet, setChatBet] = useState<Bet | null>(null);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false);
  const [isUpdateBankrollModalOpen, setIsUpdateBankrollModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const { analytics } = useBetContext();
  const { isAdmin } = useAuthContext();
  const { isTwa, BackButton, onBackButtonClick, initData } = useTelegram();

  // Reset view to dashboard if user logs out from admin panel
  useEffect(() => {
    if (!isAdmin && currentView === 'admin') {
      setCurrentView('dashboard');
    }
  }, [isAdmin, currentView]);

  // TWA BackButton Logic
  useEffect(() => {
      if (isTwa && BackButton) {
          const hasModal = isAddEditModalOpen || isChatModalOpen || isCashOutModalOpen || isUpdateBankrollModalOpen || isImportModalOpen || !!betToView;
          if (hasModal || isSidebarOpen) {
              BackButton.show();
          } else {
              BackButton.hide();
          }
      }
  }, [isTwa, BackButton, isAddEditModalOpen, isChatModalOpen, isCashOutModalOpen, isUpdateBankrollModalOpen, isImportModalOpen, betToView, isSidebarOpen]);

  useEffect(() => {
      if (isTwa) {
          return onBackButtonClick(() => {
              if (isSidebarOpen) { setIsSidebarOpen(false); return; }
              if (isAddEditModalOpen) { setIsAddEditModalOpen(false); setBetToEdit(null); return; }
              if (isChatModalOpen) { setIsChatModalOpen(false); setChatBet(null); return; }
              if (isCashOutModalOpen) { setIsCashOutModalOpen(false); return; }
              if (isUpdateBankrollModalOpen) { setIsUpdateBankrollModalOpen(false); return; }
              if (isImportModalOpen) { setIsImportModalOpen(false); return; }
              if (betToView) { setBetToView(null); return; }
          });
      }
  }, [isTwa, onBackButtonClick, isSidebarOpen, isAddEditModalOpen, isChatModalOpen, isCashOutModalOpen, isUpdateBankrollModalOpen, isImportModalOpen, betToView]);


  const handleOpenAddModal = () => {
    if (isDemoMode) { onAuthRequired(); return; }
    setBetToEdit(null);
    setIsAddEditModalOpen(true);
  };

  const handleOpenEditModal = (bet: Bet) => {
     if (isDemoMode) { onAuthRequired(); return; }
    setBetToEdit(bet);
    setIsAddEditModalOpen(true);
  };
  
  const handleOpenViewModal = (bet: Bet) => {
    setBetToView(bet);
  };

  const handleOpenChatModal = (bet: Bet) => {
    if (isDemoMode) { onAuthRequired(); return; }
    setChatBet(bet);
    setIsChatModalOpen(true);
  };
  
  const handleOpenGeneralChatModal = () => {
     if (isDemoMode) { onAuthRequired(); return; }
    setChatBet(null); // No specific bet for general analysis
    setIsChatModalOpen(true);
  };
  
  const handleOpenCashOutModal = () => {
    if (isDemoMode) { onAuthRequired(); return; }
    setIsCashOutModalOpen(true);
  };

  const handleOpenUpdateBankrollModal = () => {
    if (isDemoMode) { onAuthRequired(); return; }
    setIsUpdateBankrollModalOpen(true);
  };
  
  const handleOpenImportModal = () => {
    if (isDemoMode) { onAuthRequired(); return; }
    setIsImportModalOpen(true);
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard onOpenAIChat={handleOpenGeneralChatModal} />;
      case 'log':
        return <BetLog onEditBet={handleOpenEditModal} onViewBet={handleOpenViewModal} onDiscussBet={handleOpenChatModal} onImportBets={handleOpenImportModal} isDemoMode={isDemoMode} onAuthRequired={onAuthRequired} />;
      case 'bank_history':
        return <BankHistoryPanel />;
      case 'admin':
        return isAdmin ? <AdminPanel /> : <Dashboard onOpenAIChat={handleOpenGeneralChatModal} />;
      case 'competition':
        return <CompetitionPanel />;
      case 'settings':
        return <SettingsPanel />;
      case 'goals':
        return <GoalsPanel />;
      case 'ai_strategy':
        return <AIStrategyBuilder />;
      case 'ai_prediction_log':
        return <AIPredictionLog />;
      case 'bank_simulator':
        return <BankrollSimulator />;
      default:
        return <Dashboard onOpenAIChat={handleOpenGeneralChatModal} />;
    }
  };

  return (
      <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
        <div className={`fixed inset-0 z-30 bg-black/50 transition-opacity md:hidden ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)}></div>
        <div className={`fixed inset-y-0 left-0 z-40 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col`}>
          <div className="flex-1 overflow-y-auto">
            <Sidebar currentView={currentView} setCurrentView={(view) => { setCurrentView(view); setIsSidebarOpen(false); }} isDemoMode={isDemoMode} onAuthRequired={onAuthRequired} />
          </div>
          
          {/* Debug Footer for missing initData */}
          {(!initData || initData === '' || initData === 'EMPTY_STRING') && (
              <div className="p-2 bg-yellow-900 text-yellow-200 text-[10px] break-all border-t border-yellow-700">
                  <p className="font-bold">⚠️ DEBUG: GUEST MODE</p>
                  <p>No Telegram initData found.</p>
                  <p>TWA: {String(isTwa)}</p>
              </div>
          )}
        </div>
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header 
            onAddBetClick={handleOpenAddModal} 
            onCashOutClick={handleOpenCashOutModal} 
            onUpdateBankrollClick={handleOpenUpdateBankrollModal}
            currentView={currentView}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 dark:bg-gray-900 p-4 md:p-8">
            {renderView()}
          </main>
        </div>
        
        {isAddEditModalOpen && <AddBetModal onClose={() => { setIsAddEditModalOpen(false); setBetToEdit(null); }} betToEdit={betToEdit} />}
        {isChatModalOpen && <AIChatModal bet={chatBet} analytics={analytics} onClose={() => { setIsChatModalOpen(false); setChatBet(null); }} />}
        {isCashOutModalOpen && <CashOutModal onClose={() => setIsCashOutModalOpen(false)} />}
        {isUpdateBankrollModalOpen && <UpdateBankrollModal onClose={() => setIsUpdateBankrollModalOpen(false)} />}
        {isImportModalOpen && <ImportBetsModal onClose={() => setIsImportModalOpen(false)} />}
        {betToView && <BetDetailModal bet={betToView} onEdit={handleOpenEditModal} onDiscuss={handleOpenChatModal} onClose={() => setBetToView(null)} />}

      </div>
  );
};

export default Layout;
