import React from 'react';
import { MessageSquare, FileText, BookOpen, Award, Layers, Brain, Network } from 'lucide-react';

export type ActiveTab = 'chat' | 'summary' | 'notes' | 'quiz' | 'flashcards' | 'graph' | 'inspector';

interface NavigationTabsProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  documentCount: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onTabChange,
  documentCount,
}) => {
  const tabs = [
    {
      id: 'chat' as ActiveTab,
      label: 'Chat',
      icon: MessageSquare,
      badge: null,
      desc: 'Ask grounded questions',
    },
    {
      id: 'summary' as ActiveTab,
      label: 'Summaries',
      icon: FileText,
      badge: 'Map-Reduce',
      desc: 'Multi-depth document summaries',
    },
    {
      id: 'notes' as ActiveTab,
      label: 'Study Notes',
      icon: BookOpen,
      badge: null,
      desc: 'Extracted concepts & review',
    },
    {
      id: 'quiz' as ActiveTab,
      label: 'Quiz',
      icon: Award,
      badge: 'Interactive',
      desc: 'Test your understanding',
    },
    {
      id: 'flashcards' as ActiveTab,
      label: 'Flashcards',
      icon: Brain,
      badge: 'SM-2',
      desc: 'Spaced repetition memory cards',
    },
    {
      id: 'graph' as ActiveTab,
      label: 'Mind Map',
      icon: Network,
      badge: null,
      desc: 'Interactive concept graph',
    },
    {
      id: 'inspector' as ActiveTab,
      label: 'Inspector',
      icon: Layers,
      badge: null,
      desc: 'Vectors & RAG transparency',
    },
  ];

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="w-full">
      <div
        onWheel={handleWheel}
        className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-1.5 scrollbar-none"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              title={tab.desc}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full font-medium hidden 2xl:inline-flex ${
                    isActive
                      ? 'bg-indigo-500/50 text-indigo-100'
                      : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
