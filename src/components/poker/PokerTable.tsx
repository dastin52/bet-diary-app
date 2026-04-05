import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Brain, Play, RotateCcw, AlertCircle } from 'lucide-react';
import Button from '../ui/Button';
import { fetchPokerAnalysis } from '../../services/aiService';
import { useTelegram } from '../../hooks/useTelegram';

interface PokerCard {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string;
}

const PokerTable: React.FC = () => {
  const [heroCards, setHeroCards] = useState<PokerCard[]>([]);
  const [board, setBoard] = useState<PokerCard[]>([]);
  const [pot, setPot] = useState(0);
  const [heroStack, setHeroStack] = useState(5000);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const { isTwa, MainButton, onMainButtonClick } = useTelegram();

  const getSuitIcon = (suit: string) => {
    switch (suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
      default: return '';
    }
  };

  const getSuitColor = (suit: string) => {
    return (suit === 'hearts' || suit === 'diamonds') ? 'text-red-500' : 'text-slate-900';
  };

  const getRandomCard = (): PokerCard => {
    const suits: PokerCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    return {
      suit: suits[Math.floor(Math.random() * suits.length)],
      value: values[Math.floor(Math.random() * values.length)]
    };
  };

  const dealHand = () => {
    setHeroCards([getRandomCard(), getRandomCard()]);
    setPot(150); // Blinds
    setAnalysis(null);
    setError(null);
  };

  const dealNext = () => {
    if (heroCards.length === 0) {
      dealHand();
      return;
    }
    if (board.length === 0) {
      setBoard([getRandomCard(), getRandomCard(), getRandomCard()]);
    } else if (board.length < 5) {
      setBoard(prev => [...prev, getRandomCard()]);
    }
    setAnalysis(null);
    setError(null);
  };

  const resetTable = () => {
    setBoard([]);
    setHeroCards([]);
    setPot(0);
    setAnalysis(null);
    setError(null);
  };

  const handleAction = (action: string) => {
    if (action === 'Bet') {
      setHeroStack(prev => prev - 500);
      setPot(prev => prev + 500);
    }
    setAnalysis(null);
    setError(null);
  };

  const analyzeHand = async () => {
    if (heroCards.length === 0) return;
    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);
    
    const street = board.length === 0 ? 'Префлоп' : board.length === 3 ? 'Флоп' : board.length === 4 ? 'Терн' : 'Ривер';
    
    const handDescription = `
      Мои карты: ${heroCards.map(c => `${c.value}${getSuitIcon(c.suit)}`).join(', ')}
      Стол: ${board.length > 0 ? board.map(c => `${c.value}${getSuitIcon(c.suit)}`).join(', ') : 'Пусто'}
      Пот: $${pot}
      Мой стек: $${heroStack}
      Ситуация: ${street}. Дай краткий совет по GTO.
    `;

    try {
      const result = await fetchPokerAnalysis(handDescription);
      setAnalysis(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Не удалось получить анализ от ИИ. Пожалуйста, проверьте подключение.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Telegram MainButton Integration
  useEffect(() => {
    if (isTwa && MainButton) {
      if (heroCards.length === 0) {
        MainButton.setText('РАЗДАТЬ КАРТЫ');
        MainButton.show();
      } else if (board.length < 5) {
        MainButton.setText(board.length === 0 ? 'СДАТЬ ФЛОП' : board.length === 3 ? 'СДАТЬ ТЕРН' : 'СДАТЬ РИВЕР');
        MainButton.show();
      } else if (!analysis && !isAnalyzing) {
        MainButton.setText('СПРОСИТЬ ИИ ТРЕНЕРА');
        MainButton.show();
      } else {
        MainButton.hide();
      }
    }
  }, [isTwa, MainButton, heroCards, board, analysis, isAnalyzing]);

  useEffect(() => {
    if (isTwa) {
      return onMainButtonClick(() => {
        if (heroCards.length === 0 || board.length < 5) {
          dealNext();
        } else if (!analysis && !isAnalyzing) {
          analyzeHand();
        }
      });
    }
  }, [isTwa, onMainButtonClick, heroCards, board, analysis, isAnalyzing]);

  return (
    <div className="relative w-full min-h-[400px] md:aspect-[16/9] bg-emerald-900 rounded-3xl md:rounded-[100px] border-8 md:border-[12px] border-amber-900 shadow-2xl overflow-hidden flex flex-col items-center justify-center p-4 md:p-8">
      {/* Table Felt Pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
      
      {/* Pot Info */}
      <div className="absolute top-8 md:top-1/4 bg-black/40 backdrop-blur-md px-4 md:px-6 py-1 md:py-2 rounded-full border border-white/10 z-10">
        <span className="text-amber-400 font-mono font-bold text-lg md:text-xl">POT: ${pot}</span>
      </div>

      {/* Board Cards */}
      <div className="flex flex-wrap justify-center gap-2 md:gap-4 mb-8 md:mb-12 mt-16 md:mt-0">
        <AnimatePresence>
          {board.length === 0 && (
            <div className="text-emerald-700/50 font-bold text-lg md:text-2xl uppercase tracking-widest italic text-center">Waiting for Flop...</div>
          )}
          {board.map((card, idx) => (
            <motion.div
              key={`${card.value}-${card.suit}-${idx}`}
              initial={{ y: -50, opacity: 0, rotateY: 180 }}
              animate={{ y: 0, opacity: 1, rotateY: 0 }}
              className="w-12 h-18 md:w-16 md:h-24 bg-white rounded-lg shadow-xl flex flex-col items-center justify-between p-1.5 md:p-2 border border-slate-200"
            >
              <div className={`self-start font-bold text-sm md:text-lg ${getSuitColor(card.suit)}`}>{card.value}</div>
              <div className={`text-xl md:text-3xl ${getSuitColor(card.suit)}`}>{getSuitIcon(card.suit)}</div>
              <div className={`self-end font-bold text-sm md:text-lg rotate-180 ${getSuitColor(card.suit)}`}>{card.value}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Hero Area */}
      <div className="flex flex-col items-center mb-20 md:mb-0">
        <div className="flex gap-2 mb-4">
          {heroCards.map((card, idx) => (
            <motion.div
              key={idx}
              whileHover={{ y: -10 }}
              className="w-12 h-18 md:w-14 md:h-20 bg-white rounded-md shadow-lg flex flex-col items-center justify-between p-1 md:p-1.5 border border-slate-200 cursor-pointer"
            >
              <div className={`self-start font-bold text-xs md:text-sm ${getSuitColor(card.suit)}`}>{card.value}</div>
              <div className={`text-lg md:text-xl ${getSuitColor(card.suit)}`}>{getSuitIcon(card.suit)}</div>
              <div className={`self-end font-bold text-xs md:text-sm rotate-180 ${getSuitColor(card.suit)}`}>{card.value}</div>
            </motion.div>
          ))}
          {heroCards.length === 0 && (
            <div className="h-18 md:h-20 flex items-center text-emerald-700/30 text-xs font-bold uppercase">No Cards</div>
          )}
        </div>
        <div className="bg-slate-900 px-3 md:px-4 py-1 rounded-full border border-amber-500/50 flex items-center gap-2">
          <User size={12} className="text-amber-500" />
          <span className="text-white font-bold text-xs md:text-sm">YOU: ${heroStack}</span>
        </div>
      </div>

      {/* Controls Overlay - Hidden on mobile TWA if MainButton is used, but kept for desktop/browser */}
      <div className="absolute right-4 bottom-4 md:right-8 md:bottom-8 flex flex-col gap-2 md:gap-4 items-end scale-90 md:scale-100 origin-bottom-right">
        {/* Game Actions */}
        <div className="flex gap-1 md:gap-2 bg-black/20 backdrop-blur-md p-1.5 md:p-2 rounded-2xl border border-white/5">
          <Button 
            onClick={() => handleAction('Fold')} 
            className="bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 px-3 md:px-6 py-1.5 md:py-2 rounded-xl font-bold text-xs md:text-base transition-all"
          >
            Фолд
          </Button>
          <Button 
            onClick={() => handleAction('Check')} 
            className="bg-slate-700/50 hover:bg-slate-700 text-white border border-white/10 px-3 md:px-6 py-1.5 md:py-2 rounded-xl font-bold text-xs md:text-base transition-all"
          >
            Чек
          </Button>
          <Button 
            onClick={() => handleAction('Bet')} 
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 md:px-6 py-1.5 md:py-2 rounded-xl font-bold text-xs md:text-base shadow-lg shadow-blue-600/20 transition-all"
          >
            Бет
          </Button>
        </div>

        {/* Table Management */}
        <div className="flex gap-2">
          {board.length < 5 && (
            <Button 
              onClick={dealNext} 
              variant="primary" 
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-4 md:px-6 py-2 md:py-3 rounded-2xl font-bold shadow-xl shadow-emerald-900/40 text-xs md:text-base"
            >
              <Play size={16} fill="currentColor" /> 
              {heroCards.length === 0 ? 'Раздать' : board.length === 0 ? 'Флоп' : board.length === 3 ? 'Терн' : 'Ривер'}
            </Button>
          )}
          <Button 
            onClick={resetTable} 
            variant="secondary" 
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border-white/10 px-4 md:px-6 py-2 md:py-3 rounded-2xl font-bold text-xs md:text-base"
          >
            <RotateCcw size={16} /> Сброс
          </Button>
        </div>

        {/* AI Assistant - Only show if not in TWA or if user wants manual trigger */}
        <Button 
          onClick={analyzeHand} 
          variant="primary" 
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 flex items-center justify-center gap-2 md:gap-3 py-3 md:py-4 rounded-2xl font-bold shadow-2xl shadow-purple-900/40 border border-white/10 text-xs md:text-base"
          disabled={isAnalyzing}
        >
          <Brain size={18} className={isAnalyzing ? 'animate-pulse' : ''} /> 
          {isAnalyzing ? 'Анализ...' : 'ИИ Тренер'}
        </Button>
      </div>

      {/* Analysis Tooltip */}
      <AnimatePresence>
        {analysis && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute left-4 bottom-4 md:left-8 md:bottom-8 max-w-[280px] md:max-w-xs bg-slate-900/90 backdrop-blur-xl border border-purple-500/30 p-3 md:p-4 rounded-2xl shadow-2xl z-20"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-[10px] md:text-xs uppercase tracking-wider">
                <Brain size={14} /> AI Coach Advice
              </div>
              <button onClick={() => setAnalysis(null)} className="text-white/50 hover:text-white">
                <RotateCcw size={14} />
              </button>
            </div>
            <div className="text-slate-200 text-xs md:text-sm leading-relaxed italic max-h-32 md:max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {analysis}
            </div>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute left-4 bottom-4 md:left-8 md:bottom-8 max-w-[280px] md:max-w-xs bg-red-900/90 backdrop-blur-xl border border-red-500/30 p-3 md:p-4 rounded-2xl shadow-2xl z-20"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-red-400 font-bold text-[10px] md:text-xs uppercase tracking-wider">
                <AlertCircle size={14} /> Error
              </div>
              <button onClick={() => setError(null)} className="text-white/50 hover:text-white">
                <RotateCcw size={14} />
              </button>
            </div>
            <p className="text-slate-200 text-xs md:text-sm leading-relaxed">
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PokerTable;
