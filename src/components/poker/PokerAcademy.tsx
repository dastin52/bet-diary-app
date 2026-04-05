import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  BookOpen, 
  Trophy, 
  Target, 
  Brain, 
  TrendingUp, 
  Shield, 
  Zap,
  ChevronRight,
  PlayCircle,
  BarChart3
} from 'lucide-react';
import PokerTable from './PokerTable';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';

const PokerAcademy: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'training' | 'theory' | 'analysis'>('training');
  const [showTestModal, setShowTestModal] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<{title: string, cat: string} | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  const handleFileUpload = () => {
    setIsUploading(true);
    setTimeout(() => {
      setIsUploading(false);
      setUploadResult("История раздач успешно загружена! Мы обнаружили 42 раздачи. Перейдите во вкладку 'Тренировка', чтобы разобрать наиболее интересные из них с ИИ-тренером.");
    }, 2000);
  };

  const trainingModules = [
    {
      title: 'Кэш-игры: Основы',
      description: 'Изучите основы игры за кэш-столами, управление стеком и позиционную игру.',
      icon: <TrendingUp className="text-emerald-500" />,
      difficulty: 'Beginner',
      lessons: 12
    },
    {
      title: 'Турнирная стратегия (MTT)',
      description: 'Как выживать и побеждать в многостоловых турнирах. Стадии турнира и ICM.',
      icon: <Trophy className="text-amber-500" />,
      difficulty: 'Intermediate',
      lessons: 18
    },
    {
      title: 'Продвинутый блеф',
      description: 'Математика блефа, чтение диапазонов и использование слабостей оппонентов.',
      icon: <Zap className="text-purple-500" />,
      difficulty: 'Pro',
      lessons: 8
    }
  ];

  return (
    <div className="space-y-8 pb-20">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-6 md:p-8 text-white border border-white/5">
        <div className="relative z-10 max-w-2xl">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-3xl md:text-4xl font-bold mb-4"
          >
            Академия Покера <span className="text-amber-500">Pro</span>
          </motion.h1>
          <p className="text-slate-400 text-base md:text-lg mb-6">
            Полноценная подготовка к играм, глубокий анализ стратегий и персональный ИИ-тренер для вашего прогресса.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button 
              onClick={() => setActiveTab('training')}
              variant="primary" 
              className="flex items-center justify-center gap-2"
            >
              <PlayCircle size={18} /> Начать обучение
            </Button>
            <Button 
              onClick={() => setActiveTab('analysis')}
              variant="secondary" 
              className="bg-white/5 border-white/10 hover:bg-white/10 flex items-center justify-center"
            >
              Мой прогресс
            </Button>
          </div>
        </div>
        {/* Abstract background elements */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-amber-500/10 to-transparent"></div>
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl"></div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl w-full sm:w-fit overflow-x-auto no-scrollbar">
        {[
          { id: 'training', label: 'Тренировка', icon: <Target size={16} /> },
          { id: 'theory', label: 'Теория', icon: <BookOpen size={16} /> },
          { id: 'analysis', label: 'Анализ рук', icon: <BarChart3 size={16} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center justify-center gap-2 px-4 md:px-6 py-2 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap flex-1 sm:flex-none ${
              activeTab === tab.id 
                ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' 
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab.icon}
            <span className="hidden xs:inline">{tab.label}</span>
            <span className="xs:hidden">{tab.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {activeTab === 'training' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Simulator */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <PlayCircle className="text-amber-500" /> Практический симулятор
              </h2>
              <div className="text-sm text-slate-500 italic">Режим: Безлимитный Холдем</div>
            </div>
            <PokerTable />
            
            <Card className="p-6 bg-purple-500/5 border-purple-500/20">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-500 rounded-xl text-white">
                  <Brain size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">ИИ Тренер: Совет дня</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                    В турнирах на ранних стадиях играйте тайтово. Ваша задача — сохранить стек для поздних стадий, где блайнды будут иметь большее значение. Не рискуйте всем стеком без натсовой руки.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Sidebar Modules */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Модули обучения</h2>
            <div className="space-y-4">
              {trainingModules.map((module, idx) => (
                <motion.div
                  key={idx}
                  whileHover={{ x: 5 }}
                  className="group cursor-pointer p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg group-hover:scale-110 transition-transform">
                      {module.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{module.difficulty}</span>
                        <span className="text-[10px] text-slate-400">{module.lessons} уроков</span>
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-white mb-1">{module.title}</h4>
                      <p className="text-xs text-slate-500 line-clamp-2">{module.description}</p>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 self-center" />
                  </div>
                </motion.div>
              ))}
            </div>

            <Card className="p-6 bg-amber-500 text-white border-none overflow-hidden relative">
              <div className="relative z-10">
                <h3 className="font-bold text-lg mb-2">Готовы к турниру?</h3>
                <p className="text-white/80 text-xs mb-4">Пройдите финальный тест и получите сертификат Академии.</p>
                <Button 
                  onClick={() => setShowTestModal(true)}
                  className="bg-white text-amber-500 hover:bg-slate-100 w-full font-bold"
                >
                  Пройти тест
                </Button>
              </div>
              <Trophy size={120} className="absolute -right-8 -bottom-8 text-white/10 rotate-12" />
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'theory' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: 'Математика Покера', cat: 'Basics', icon: <BarChart3 /> },
            { title: 'Психология и Тильт', cat: 'Mindset', icon: <Brain /> },
            { title: 'Банкролл Менеджмент', cat: 'Strategy', icon: <Shield /> },
            { title: 'Чтение оппонентов', cat: 'Advanced', icon: <Target /> },
            { title: 'GTO vs Exploitative', cat: 'Theory', icon: <Zap /> },
            { title: 'Специфика MTT', cat: 'Tournament', icon: <Trophy /> }
          ].map((item, i) => (
            <Card 
              key={i} 
              onClick={() => setSelectedLesson(item)}
              className="p-6 hover:border-amber-500/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
                  {item.icon}
                </div>
                <div>
                  <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">{item.cat}</div>
                  <h3 className="font-bold text-lg">{item.title}</h3>
                </div>
              </div>
              <p className="text-sm text-slate-500 mb-4">Детальное руководство по теме с примерами и видео-разборами.</p>
              <div className="flex items-center text-amber-500 text-sm font-bold gap-1">
                Читать далее <ChevronRight size={16} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'analysis' && (
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold">Анализатор раздач</h2>
            <p className="text-slate-500">Загрузите историю раздачи или введите данные вручную для глубокого ИИ-анализа ваших решений.</p>
          </div>
          
          <Card 
            onClick={handleFileUpload}
            className={`p-8 border-dashed border-2 ${isUploading ? 'border-amber-500 bg-amber-500/5' : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30'} flex flex-col items-center justify-center text-center cursor-pointer transition-all`}
          >
            <div className={`p-4 bg-white dark:bg-slate-800 rounded-full shadow-md mb-4 ${isUploading ? 'animate-pulse' : ''}`}>
              <BarChart3 size={32} className="text-amber-500" />
            </div>
            <h3 className="font-bold text-xl mb-2">
              {isUploading ? 'Обработка...' : 'Перетащите файл сюда'}
            </h3>
            <p className="text-slate-500 text-sm mb-6">Поддерживаются форматы PokerStars, GG Poker, Winamax</p>
            <Button variant="primary" disabled={isUploading}>
              {isUploading ? 'Загрузка...' : 'Выбрать файл'}
            </Button>
          </Card>

          {uploadResult && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-600 dark:text-emerald-400 flex items-start gap-4"
            >
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <Target size={20} />
              </div>
              <div>
                <h4 className="font-bold mb-1">Анализ завершен</h4>
                <p className="text-sm opacity-80">{uploadResult}</p>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h4 className="font-bold mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-emerald-500" /> Последние разборы</h4>
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white dark:bg-slate-700 rounded-lg flex items-center justify-center font-bold text-xs">A♠K♥</div>
                      <div>
                        <div className="text-sm font-bold">Cash Game $0.5/1</div>
                        <div className="text-[10px] text-slate-400">15.03.2026 • Ошибка на терне</div>
                      </div>
                    </div>
                    <div className="text-red-500 font-bold">-$45.00</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-6">
              <h4 className="font-bold mb-4 flex items-center gap-2"><Brain size={18} className="text-purple-500" /> Статистика ошибок</h4>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Оверплей рук</span>
                    <span className="text-red-500">42%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500" style={{ width: '42%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Недостаточный блеф</span>
                    <span className="text-amber-500">28%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: '28%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Позиционная игра</span>
                    <span className="text-emerald-500">85%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: '85%' }}></div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
      {/* Test Modal */}
      {showTestModal && (
        <Modal title="Тестирование Академии" onClose={() => setShowTestModal(false)}>
          <div className="space-y-4">
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400">
              <p className="text-sm font-medium">
                Тестирование будет доступно в следующем обновлении! 
              </p>
              <p className="text-xs mt-1 opacity-80">
                Мы готовим интерактивный экзамен, который поможет вам закрепить полученные знания и получить сертификат.
              </p>
            </div>
            <Button onClick={() => setShowTestModal(false)} className="w-full">
              Понятно
            </Button>
          </div>
        </Modal>
      )}

      {/* Lesson Modal */}
      {selectedLesson && (
        <Modal title={selectedLesson.title} onClose={() => setSelectedLesson(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-500 text-xs font-bold uppercase tracking-widest">
              <BookOpen size={14} /> {selectedLesson.cat} Lesson
            </div>
            <div className="prose dark:prose-invert max-w-none">
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Это подробный урок по теме <strong>{selectedLesson.title}</strong>. В этом модуле мы разберем ключевые концепции, математические модели и психологические аспекты, которые помогут вам принимать более взвешенные решения.
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm text-slate-500 mt-4">
                <li>Основные определения и терминология</li>
                <li>Математическое обоснование стратегии</li>
                <li>Примеры из реальных игр (High Stakes)</li>
                <li>Типичные ошибки новичков и как их избежать</li>
              </ul>
            </div>
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setSelectedLesson(null)}>Закрыть</Button>
              <Button variant="primary" onClick={() => {
                setSelectedLesson(null);
                setActiveTab('training');
              }}>Перейти к практике</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default PokerAcademy;
