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

const matchAnalysisTemplate = `Проанализируй матч: [Матч] - [Турнир].
Вид спорта: [Вид спорта].
ДАТА МАТЧА: [ДД.ММ.ГГГГ].
ДАТА АНАЛИЗА: Используй текущую системную дату.
Команда 1: [Название 1]. Последние 5:
[Результаты]. Травмы/Новости: [Данные].
Команда 2: [Название 2]. Последние 5:
[Результаты]. Травмы/Новости: [Данные].
Очные встречи (5 последних) :
[Результаты]. Стиль игры: [Команда 1] vs [Команда 2].
Факторы: [Погода, Судья, Усталость].
На основе текущей даты и всех предоставленных данных, создай комплексный анализ, включающий тактический прогноз, три вероятных сценария и итоговую рекомендацию на матч. Учти любые изменения в составах или новостной фон, произошедшие после последних матчей команд.`;

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
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const isComponentMounted = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

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
  
  const sendMessage = async (messageText: string) => {
      if (!messageText.trim()) return;

      const userMessage: Message = { role: 'user', text: messageText };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setIsLoading(true);

      try {
          const { text, sources } = await getAIChatResponse(bet, newMessages, analytics);
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
          sendMessage('Привет! Проанализируй, пожалуйста, эту ставку.');
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bet]);

  const handleSuggestionClick = (prompt: string) => {
    sendMessage(prompt);
  };

  const handleTemplateClick = () => {
    setInput(matchAnalysisTemplate);
    inputRef.current?.focus();
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
    setInput('');
  };

  const modalTitle = bet ? "AI-Анализ Ставки" : "AI-Аналитик";
  const inputPlaceholder = bet 
    ? "Задайте вопрос по этой ставке..." 
    : "Спросите про вашу статистику или предстоящий матч...";

  return (
    <Modal title={modalTitle} onClose={onClose}>
      <div className="flex flex-col h-[60vh]">
        <div ref={chatBodyRef} className="flex-1 overflow-y-auto pr-2 space-y-6">
          {messages.length === 0 && !isLoading && !bet && (
             <div className="text-center p-4 flex flex-col items-center h-full justify-center">
                <ModelIcon />
                <h3 className="font-semibold text-lg text-white mt-4">Чем могу помочь?</h3>
                <p className="text-sm text-gray-400 mt-1 mb-6 max-w-sm">
                    Я могу проанализировать вашу статистику, дать прогноз на матч или помочь со стратегией.
                </p>
                <div className="flex flex-col items-center gap-3 w-full">
                    <Button variant="secondary" className="w-full max-w-sm text-left !justify-start p-3 leading-tight" onClick={() => handleSuggestionClick('Проанализируй мою эффективность за последний месяц.')}>
                        <span className="font-semibold block">Проанализировать мою эффективность</span>
                        <span className="text-gray-400 text-xs block font-normal">Получить разбор сильных и слабых сторон</span>
                    </Button>
                    <Button variant="secondary" className="w-full max-w-sm text-left !justify-start p-3 leading-tight" onClick={handleTemplateClick}>
                        <span className="font-semibold block">Проанализировать матч по шаблону</span>
                        <span className="text-gray-400 text-xs block font-normal">Вставить готовый шаблон для разбора матча</span>
                    </Button>
                </div>
            </div>
          )}
           {messages.length === 0 && !isLoading && bet && (
              <div className="text-center p-4 flex flex-col items-center h-full justify-center">
                 <ModelIcon />
                 <h3 className="font-semibold text-lg text-white mt-4">Анализ ставки</h3>
                 <p className="text-sm text-gray-400 mt-1 mb-6 max-w-sm">
                    Загружаю данные по ставке. С чего начнем анализ?
                 </p>
              </div>
          )}
          {messages.map((msg, index) => (
            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row' : 'flex-row'}`}>
              {msg.role === 'user' ? <UserIcon /> : <ModelIcon />}
              <div className="flex flex-col">
                <div className={`px-4 py-2 rounded-lg max-w-md break-words ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tl-none' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-tr-none'}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
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
          ))}
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
              ref={inputRef}
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