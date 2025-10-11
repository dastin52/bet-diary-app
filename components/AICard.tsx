import React from 'react';
import Card from './ui/Card';
import Button from './ui/Button';

const SparklesIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 2a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 2zM5.22 5.22a.75.75 0 011.06 0l2.47 2.47a.75.75 0 01-1.06 1.06L5.22 6.28a.75.75 0 010-1.06zM2 10a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5A.75.75 0 012 10zm3.22 4.78a.75.75 0 010 1.06l-2.47 2.47a.75.75 0 11-1.06-1.06l2.47-2.47a.75.75 0 011.06 0zm10.82-1.06a.75.75 0 011.06 0l2.47 2.47a.75.75 0 01-1.06 1.06l-2.47-2.47a.75.75 0 010-1.06zM17 10a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm-2.22-4.78a.75.75 0 010 1.06L12.31 13.7a.75.75 0 01-1.06-1.06l2.47-2.47a.75.75 0 011.06 0z" clipRule="evenodd" />
    </svg>
);


const AICard: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    return (
        <Card className="bg-gradient-to-tr from-indigo-100 via-white to-white dark:from-indigo-900/50 dark:via-gray-800/50 dark:to-gray-800/50">
            <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="flex-shrink-0">
                    <div className="p-3 bg-indigo-500/20 dark:bg-indigo-600/50 rounded-full text-indigo-600 dark:text-indigo-300">
                        <SparklesIcon />
                    </div>
                </div>
                <div className="flex-1 text-center md:text-left">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI-Анализ Эффективности</h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Получите персональные инсайты от AI для улучшения вашей стратегии ставок.
                    </p>
                </div>
                <div className="mt-4 md:mt-0">
                    <Button onClick={onClick} variant="primary">
                        Начать анализ
                    </Button>
                </div>
            </div>
        </Card>
    )
}

export default AICard;