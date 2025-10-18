import React, { useState, useEffect, useRef } from 'react';
import { Bet, Message, GroundingSource, AIPrediction } from '../types';
import { UseBetsReturn } from '../hooks/useBets';
import { getAIChatResponse } from '../services/aiService';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Button from './ui/Button';

interface AIChatModalProps {
  bet: Bet | null;
  analytics: UseBetsReturn['analytics'];
  onClose: () => void;
  onSavePrediction: (prediction: Omit<AIPrediction, 'id' | 'createdAt' | 'status'>) => void;
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

const isMatchPrediction = (text: string) => /прогноз проходимости/i.test(text);

const parsePrediction = (userMessage: Message, modelMessage: Message): Omit<AIPrediction, 'id' | 'createdAt' | 'status'> | null => {
    try {
        // Match analysis from quick action
        let matchNameMatch = userMessage.text.match(/Анализ матча:\s*(.+)/i);
        let sport = 'Футбол'; // Default sport from quick action

        // Match analysis from direct prompt
        if (!matchNameMatch) {
            const directMatch = userMessage.text.match(/(?:проанализируй|анализ)\s+матч[а:]?\s*(.+)/i);
            if (directMatch && directMatch[1]) {
                 matchNameMatch = directMatch;
            }
        }

        const predictionMatch = modelMessage.text.match(/Прогноз проходимости:([\s\S]*)/i);

        if (matchNameMatch && matchNameMatch[1] && predictionMatch && predictionMatch[1]) {
            let matchName = matchNameMatch[1].trim();
            // A simple way to guess sport from text if not provided
            if (matchName.toLowerCase().includes('футбол')) sport = 'Футбол';
            if (matchName.toLowerCase().includes('баскетбол')) sport = 'Баскетбол';
            if (matchName.toLowerCase().includes('теннис')) sport = 'Теннис';
            if (matchName.toLowerCase().includes('хоккей')) sport = 'Хоккей';


            return {
                sport: sport,
                matchName: matchName,
                prediction: predictionMatch[1].trim(),
            };
        }
        return null;
    } catch {
        return null;
    }
};


const AIChatModal: React.FC<AIChatModalProps> = ({ bet, analytics, onClose, onSavePrediction }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatState, setChatState] = useState<'idle' | 'awaiting_match_name' | 'awaiting_sport'>('idle');
  const [tempMatchData, setTempMatchData] = useState<{ sport?: string, matchName?: string }>({});
  const [savedPredictions, setSavedPredictions] = useState<Set<string>>(new Set());
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
  
  const sendMessage = async (messageText: string, isSystemMessage: boolean = false) => {
      if (!messageText.trim()) return;

      const userMessage: Message = { role: 'user', text: messageText };
      const historyForApi = [...messages, userMessage];

      if (!isSystemMessage) {
        setMessages(historyForApi);
      }
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
          sendMessage('Привет! Проанализируй, пожалуйста, эту ставку.');
      } else if (!bet && messages.length === 0) {
          setMessages([{
              role: 'model',
              text: 'Здравствуйте! Я ваш AI-Аналитик. Чем могу помочь? Вы можете задать вопрос о своей статистике или запросить анализ предстоящего матча.'
          }]);
      }
  }, [bet]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatState === 'awaiting_match_name' && tempMatchData.sport) {
        const fullPrompt = `Анализ матча: ${input} ${tempMatchData.sport}`;
        const userMessageForUi: Message = { role: 'user', text: `Анализ матча: ${input}` };
        
        // This is a bit of a race condition, but it works for the UI update.
        // The user message appears, then the API call starts.
        setMessages(prev => [...prev, userMessageForUi]);
        sendMessage(fullPrompt, true);
        
        setChatState('idle');
        setTempMatchData({});
    } else {
        sendMessage(input);
    }
    setInput('');
  };

  const handleQuickAction = (type: 'performance' | 'match_analysis') => {
      if (type === 'performance') {
          sendMessage("Проанализируй мою эффективность");
      } else if (type === 'match_analysis') {
          setChatState('awaiting_match_name');
          setTempMatchData({ sport: 'футбол' }); // Default to football, can be changed
          setMessages(prev => [...prev, { role: 'model', text: 'Пожалуйста, введите название матча (например, "Реал Мадрид - Барселона").' }]);
      }
  };

  const handleSavePrediction = (userMsg: Message, modelMsg: Message) => {
      const predictionData = parsePrediction(userMsg, modelMsg);
      if (predictionData) {
          onSavePrediction(predictionData);
          setSavedPredictions(prev => new Set(prev).add(modelMsg.text));
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
            const isPrediction = msg.role === 'model' && isMatchPrediction(msg.text);
            const userMessageForPrediction = isPrediction ? messages[index - 1] : null;

            return (
            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row' : 'flex-row'}`}>
              {msg.role === 'user' ? <UserIcon /> : <ModelIcon />}
              <div className="flex flex-col">
                <div className={`px-4 py-2 rounded-lg max-w-md break-words ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tl-none' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-tr-none'}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
                
                {isPrediction && userMessageForPrediction && (
                    <div className="mt-2">
                        <Button
                            variant="secondary"
                            className="text-xs !py-1 !px-2"
                            onClick={() => handleSavePrediction(userMessageForPrediction, msg)}
                            disabled={savedPredictions.has(msg.text)}
                        >
                            {savedPredictions.has(msg.text) ? '✅ Сохранено' : '💾 Сохранить прогноз'}
                        </Button>
                    </div>
                )}

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