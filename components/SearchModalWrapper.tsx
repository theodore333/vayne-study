'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const SearchModal = dynamic(() => import('./SearchModal'), { ssr: false });

export default function SearchModalWrapper() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    const handleOpen = () => setOpen(true);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-search', handleOpen);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-search', handleOpen);
    };
  }, []);

  if (!open) return null;
  return <SearchModal onClose={() => setOpen(false)} />;
}
