import React from 'react';
import { MessageSquare, FileText, BookOpen, Award, Layers } from 'lucide-react';

export type ActiveTab = 'chat' | 'summary' | 'notes' | 'quiz' | 'inspector';

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
      label: 'Chat & Q&A',
      icon: MessageSquare,
      badge: null,
      desc: 'Ask grounded questions',
    },
    {
      id: 'summary' as ActiveTab,
      label: 'AI Summaries',
      icon: FileText,
      badge: 'Map-Reduce',
      desc: 'Multi-depth document summaries',
    },
    {
      id: 'notes' as ActiveTab,
      label: 'Smart Study Notes',
      icon: BookOpen,
      badge: null,
      desc: 'Extracted concepts & review',
    },
    {
      id: 'quiz' as ActiveTab,
      label: 'Quiz Arena',
      icon: Award,
      badge: 'Interactive',
      desc: 'Test your understanding',
    },
    {
      id: 'inspector' as ActiveTab,
      label: 'Chunk Inspector',
      icon: Layers,
      badge: null,
      desc: 'Vectors & RAG transparency',
    },
  ];

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 backdrop-blur px-4">
      <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 overflow-x-auto py-2 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
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
