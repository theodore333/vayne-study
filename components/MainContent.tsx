'use client';

import { useApp } from '@/lib/context';
import Header from './Header';

export default function MainContent({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useApp();

  return (
    <div className={`flex-1 transition-all duration-200 ${sidebarCollapsed ? 'ml-[60px]' : 'ml-[260px]'}`}>
      <Header />

      <main className="p-6">
        {children}
      </main>
    </div>
  );
}
