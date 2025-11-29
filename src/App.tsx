import React, { useState, useEffect } from 'react';
import { BetProvider } from './contexts/BetContext';
import Layout from './components/Layout';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import Modal from './components/ui/Modal';
import { SettingsProvider } from './contexts/SettingsContext';
import WelcomeOverlay from './components/WelcomeOverlay';
import { ThemeProvider } from './contexts/ThemeContext';
import LoginScreen from './components/auth/LoginScreen';
import { PredictionProvider } from './contexts/PredictionContext';
import ErrorBoundary from './components/ErrorBoundary';

const AppContent: React.FC = () => {
  const { currentUser } = useAuthContext();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false);

  const isDemoMode = !currentUser;

  // Remove the loader when the AppContent mounts (meaning React has successfully initialized)
  useEffect(() => {
      // Use standard setTimeout to clear it from the macro task queue
      const timer = setTimeout(() => {
          const loader = document.getElementById('app-loader');
          if (loader) {
              loader.style.opacity = '0';
              loader.style.pointerEvents = 'none';
              setTimeout(() => {
                  loader.remove();
              }, 500);
          }
      }, 100); // Small delay to allow initial paint
      return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const welcomeShown = sessionStorage.getItem('welcomeOverlayShown');
    if (isDemoMode && !welcomeShown) {
      const timer = setTimeout(() => {
        setShowWelcomeOverlay(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isDemoMode]);

  const handleAuthRequired = () => {
    setIsLoginModalOpen(true);
  };
  
  const handleLoginSuccess = () => {
    setIsLoginModalOpen(false);
  }

  const handleStartFromWelcome = () => {
    setShowWelcomeOverlay(false);
    sessionStorage.setItem('welcomeOverlayShown', 'true');
    handleAuthRequired();
  };

  return (
    <>
      {showWelcomeOverlay && <WelcomeOverlay onStart={handleStartFromWelcome} />}
      <Layout isDemoMode={isDemoMode} onAuthRequired={handleAuthRequired} />
      {isLoginModalOpen && (
          <Modal title="Вход или Регистрация" onClose={() => setIsLoginModalOpen(false)}>
              <LoginScreen onLoginSuccess={handleLoginSuccess} />
          </Modal>
      )}
    </>
  );
};

const AppProviders: React.FC = () => {
  const { currentUser } = useAuthContext();
  const userKey = currentUser ? currentUser.email : 'demo_user';

  return (
    <SettingsProvider userKey={userKey}>
      <ThemeProvider>
        <BetProvider userKey={userKey}>
          <PredictionProvider>
            <AppContent />
          </PredictionProvider>
        </BetProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
};


const App: React.FC = () => {
  return (
    <ErrorBoundary>
        <AuthProvider>
          <AppProviders />
        </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;