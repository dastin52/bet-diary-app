
import React from 'react';
import Card from './ui/Card';
import Button from './ui/Button';

const TargetIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 text-indigo-500 dark:text-indigo-400"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
);


interface WelcomeOverlayProps {
  onStart: () => void;
}

const WelcomeOverlay: React.FC<WelcomeOverlayProps> = ({ onStart }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-80 backdrop-blur-sm">
      <Card className="max-w-md w-full text-center transform transition-all animate-fade-in-up">
        <div className="mx-auto mb-4">
            <TargetIcon />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Добро пожаловать в Дневник Ставок!</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Это демонстрационный режим, чтобы вы могли ознакомиться со всеми возможностями аналитики.
          Начните вести свой собственный журнал, чтобы отслеживать прогресс и принимать взвешенные решения.
        </p>
        <Button onClick={onStart} className="w-full text-base py-3">
          Начать вести свой дневник
        </Button>
      </Card>
      <style>{`
        @keyframes fade-in-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
            animation: fade-in-up 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default WelcomeOverlay;