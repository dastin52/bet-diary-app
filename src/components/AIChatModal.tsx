import React, { useState, useEffect, useRef } from 'react';
import { Bet, Message, GroundingSource } from '../types';
import { UseBetsReturn } from '../hooks/useBets';
import { getAIChatResponse } from '../services/aiService';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Button from './ui/Button';

interface AIChatModalProps {
  bet: Bet | null;
  analytics: UseBetsReturn['analytics'];
  onClose: () => void;
}

const LoadingSpinner = () => (
    <div className="flex items-center space-x-2">
        <div className="w-2 h-2 rounded-full bg-gray-500 dark:bg-gray-400 animate-pulse"></div>
        <div className="w-2 h-2 rounded-full bg-gray-500 dark:bg-gray-400 animate-pulse [animation-delay:0.2s]"></div>
        <div className="w-2 h-2 rounded-full bg-gray-500 dark:bg-gray-400 animate-pulse [animation-delay:0.4s]"></div>
    </div>
);

const UserIcon = () => (
    <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
    </div>
);

const ModelIcon = () => (
     <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-300" viewBox="0 0 20 20" fill="currentColor">
             <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
        </svg>
    </div>
);

const AIChatModal: React.FC<AIChatModalProps> = ({ bet, analytics, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatState, setChatState] = useState<'idle' | 'awaiting_match_name' | 'awaiting_sport'>('idle');
  const [tempMatchData, setTempMatchData] = useState<{ sport?: string, matchName?: string }>({});
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const isComponentMounted = useRef(true);

  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
    }
  }, []);

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages]);

  const callAI = async (historyForApi: Message[]) => {
      if (!historyForApi.length) return;
      setIsLoading(true);
      try {
          const { text, sources } = await getAIChatResponse(bet, historyForApi, analytics);
          const modelMessage: Message = { role: 'model', text, sources };
          if(isComponentMounted.current) {
            setMessages(prev => [...prev, modelMessage]);
          }
      } catch (error) {
          console.error("AI chat error:", error);
          const errorMessage: Message = { role: 'model', text: 'Извините, произошла ошибка. Попробуйте еще раз.' };
          if(isComponentMounted.current) {
            setMessages(prev => [...prev, errorMessage]);
          }
      } finally {
          if(isComponentMounted.current) {
            setIsLoading(false);
          }
      }
  };
  
  useEffect(() => {
      if (bet && messages.length === 0) {
          const userMessage: Message = { role: 'user', text: 'Привет! Проанализируй, пожалуйста, эту ставку.' };
          setMessages([userMessage]);
          callAI([userMessage]);
      } else if (!bet && messages.length === 0) {
          setMessages([{
              role: 'model',
              text: 'Здравствуйте! Я ваш AI-Аналитик. Чем могу помочь? Вы можете задать вопрос о своей статистике или запросить анализ предстоящего матча.'
          }]);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bet]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    let userMessageForUi: Message;
    let historyForApi: Message[];

    if (chatState === 'awaiting_match_name' && tempMatchData.sport) {
        const fullPrompt = `Анализ матча: ${input} ${tempMatchData.sport}`;
        userMessageForUi = { role: 'user', text: `Анализ матча: ${input}` };
        historyForApi = [...messages, { role: 'user', text: fullPrompt }];
        setChatState('idle');
        setTempMatchData({});
    } else {
        userMessageForUi = { role: 'user', text: input };
        historyForApi = [...messages, userMessageForUi];
    }
    
    setMessages(prev => [...prev, userMessageForUi]);
    callAI(historyForApi);
    setInput('');
  };

  const handleQuickAction = (type: 'performance' | 'match_analysis') => {
      if (type === 'performance') {
          const userMessage: Message = { role: 'user', text: "Проанализируй мою эффективность" };
          const newHistory = [...messages, userMessage];
          setMessages(newHistory);
          callAI(newHistory);
      } else if (type === 'match_analysis') {
          setChatState('awaiting_match_name');
          setTempMatchData({ sport: 'футбол' });
          setMessages(prev => [...prev, { role: 'model', text: 'Пожалуйста, введите название матча (например, "Реал Мадрид - Барселона").' }]);
      }
  };

  const modalTitle = bet ? "AI-Анализ Ставки" : "AI-Аналитик";
  const inputPlaceholder = chatState === 'awaiting_match_name' 
    ? "Введите название матча..." 
    : (bet ? "Задайте вопрос по этой ставке..." : "Спросите про вашу статистику...");

  const showWelcomeScreen = messages.length <= 1 && !bet;

  return (
    <Modal title={modalTitle} onClose={onClose}>
      <div className="flex flex-col h-[60vh]">
        <div ref={chatBodyRef} className="flex-1 overflow-y-auto pr-2 space-y-6">
          {showWelcomeScreen && (
            <div className="text-center p-4">
              <h3 className="font-semibold text-lg mb-4">Чем могу помочь?</h3>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="secondary" onClick={() => handleQuickAction('performance')}>Проанализируй мою эффективность</Button>
                <Button variant="secondary" onClick={() => handleQuickAction('match_analysis')}>Проанализируй матч</Button>
              </div>
            </div>
          )}
          {messages.map((msg, index) => {
            return (
            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row' : 'flex-row'}`}>
              {msg.role === 'user' ? <UserIcon /> : <ModelIcon />}
              <div className="flex flex-col">
                <div className={`px-4 py-2 rounded-lg max-w-md break-words ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tl-none' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-tr-none'}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 text-xs text-gray-400">
                    <h4 className="font-semibold mb-1">Источники:</h4>
                    <ul className="space-y-1 list-disc list-inside">
                      {msg.sources.map((source, i) => (
                        <li key={i} className="truncate">
                          <a href={source.web.uri} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition-colors">
                            {source.web.title || source.web.uri}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )})}
          {isLoading && (
              <div className="flex items-start gap-3">
                  <ModelIcon />
                  <div className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700">
                     <LoadingSpinner />
                  </div>
              </div>
          )}
        </div>
        <form onSubmit={handleSubmit} className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-center space-x-2">
            <Input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inputPlaceholder}
              className="flex-1"
              disabled={isLoading}
              autoFocus
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              Отправить
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default AIChatModal;