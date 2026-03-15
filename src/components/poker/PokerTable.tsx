import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Brain, Play, RotateCcw } from 'lucide-react';
import Button from '../ui/Button';

interface PokerCard {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string;
}

const PokerTable: React.FC = () => {
  const [heroCards] = useState<PokerCard[]>([
    { suit: 'hearts', value: 'A' },
    { suit: 'spades', value: 'K' }
  ]);
  const [board, setBoard] = useState<PokerCard[]>([]);
  const [pot] = useState(1250);
  const [heroStack] = useState(5000);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);

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

  const dealFlop = () => {
    setBoard([
      { suit: 'diamonds', value: 'Q' },
      { suit: 'clubs', value: 'J' },
      { suit: 'hearts', value: '10' }
    ]);
  };

  const resetTable = () => {
    setBoard([]);
    setAnalysis(null);
  };

  const analyzeHand = () => {
    setIsAnalyzing(true);
    // Simulate AI analysis
    setTimeout(() => {
      setAnalysis("У вас отличная рука (Big Slick). На таком флопе у вас натсовое стрит-дро. Рекомендуемая стратегия: продолженная ставка (C-bet) в 1/2 пота для создания давления на оппонента и максимизации велью при доезде.");
      setIsAnalyzing(false);
    }, 1500);
  };

  return (
    <div className="relative w-full aspect-[16/9] bg-emerald-900 rounded-[100px] border-[12px] border-amber-900 shadow-2xl overflow-hidden flex flex-col items-center justify-center p-8">
      {/* Table Felt Pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
      
      {/* Pot Info */}
      <div className="absolute top-1/4 bg-black/40 backdrop-blur-md px-6 py-2 rounded-full border border-white/10">
        <span className="text-amber-400 font-mono font-bold text-xl">POT: ${pot}</span>
      </div>

      {/* Board Cards */}
      <div className="flex gap-4 mb-12">
        <AnimatePresence>
          {board.length === 0 && (
            <div className="text-emerald-700/50 font-bold text-2xl uppercase tracking-widest italic">Waiting for Flop...</div>
          )}
          {board.map((card, idx) => (
            <motion.div
              key={`${card.value}-${card.suit}-${idx}`}
              initial={{ y: -50, opacity: 0, rotateY: 180 }}
              animate={{ y: 0, opacity: 1, rotateY: 0 }}
              className="w-16 h-24 bg-white rounded-lg shadow-xl flex flex-col items-center justify-between p-2 border border-slate-200"
            >
              <div className={`self-start font-bold text-lg ${getSuitColor(card.suit)}`}>{card.value}</div>
              <div className={`text-3xl ${getSuitColor(card.suit)}`}>{getSuitIcon(card.suit)}</div>
              <div className={`self-end font-bold text-lg rotate-180 ${getSuitColor(card.suit)}`}>{card.value}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Hero Area */}
      <div className="absolute bottom-8 flex flex-col items-center">
        <div className="flex gap-2 mb-4">
          {heroCards.map((card, idx) => (
            <motion.div
              key={idx}
              whileHover={{ y: -10 }}
              className="w-14 h-20 bg-white rounded-md shadow-lg flex flex-col items-center justify-between p-1.5 border border-slate-200 cursor-pointer"
            >
              <div className={`self-start font-bold text-sm ${getSuitColor(card.suit)}`}>{card.value}</div>
              <div className={`text-xl ${getSuitColor(card.suit)}`}>{getSuitIcon(card.suit)}</div>
              <div className={`self-end font-bold text-sm rotate-180 ${getSuitColor(card.suit)}`}>{card.value}</div>
            </motion.div>
          ))}
        </div>
        <div className="bg-slate-900 px-4 py-1 rounded-full border border-amber-500/50 flex items-center gap-2">
          <User size={14} className="text-amber-500" />
          <span className="text-white font-bold text-sm">YOU: ${heroStack}</span>
        </div>
      </div>

      {/* Controls Overlay */}
      <div className="absolute right-8 bottom-8 flex flex-col gap-3">
        {board.length === 0 ? (
          <Button onClick={dealFlop} variant="primary" className="flex items-center gap-2">
            <Play size={18} /> Сдать флоп
          </Button>
        ) : (
          <Button onClick={resetTable} variant="secondary" className="flex items-center gap-2">
            <RotateCcw size={18} /> Сбросить
          </Button>
        )}
        <Button 
          onClick={analyzeHand} 
          variant="primary" 
          className="bg-purple-600 hover:bg-purple-700 flex items-center gap-2"
          disabled={isAnalyzing}
        >
          <Brain size={18} /> {isAnalyzing ? 'Анализ...' : 'ИИ Тренер'}
        </Button>
      </div>

      {/* Analysis Tooltip */}
      <AnimatePresence>
        {analysis && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute left-8 bottom-8 max-w-xs bg-slate-900/90 backdrop-blur-xl border border-purple-500/30 p-4 rounded-2xl shadow-2xl"
          >
            <div className="flex items-center gap-2 mb-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
              <Brain size={14} /> AI Coach Advice
            </div>
            <p className="text-slate-200 text-sm leading-relaxed italic">
              "{analysis}"
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PokerTable;
