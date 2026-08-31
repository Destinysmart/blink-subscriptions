'use client';
import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark');
  useEffect(() => { setTheme(document.documentElement.dataset.theme || 'dark'); }, []);

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
    setTheme(next);
  }

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle light and dark">
      {theme === 'light' ? (
        // moon (switch to dark)
        <svg width="18" height="18" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round"><path d="M216 152A88 88 0 0 1 104 40a88 88 0 1 0 112 112Z" /></svg>
      ) : (
        // sun (switch to light)
        <svg width="18" height="18" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round"><circle cx="128" cy="128" r="52" /><line x1="128" y1="36" x2="128" y2="16" /><line x1="128" y1="240" x2="128" y2="220" /><line x1="60" y1="60" x2="46" y2="46" /><line x1="210" y1="210" x2="196" y2="196" /><line x1="36" y1="128" x2="16" y2="128" /><line x1="240" y1="128" x2="220" y2="128" /><line x1="60" y1="196" x2="46" y2="210" /><line x1="210" y1="46" x2="196" y2="60" /></svg>
      )}
    </button>
  );
}
