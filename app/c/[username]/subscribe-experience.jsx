'use client';
import { useState } from 'react';
import SubscribePanel from './subscribe-panel';

const ACCENTS = [
  { name: 'Bitcoin', c: '#f7931a', ink: '#17120a' },
  { name: 'Sunset',  c: '#fb5607', ink: '#ffffff' },
  { name: 'Emerald', c: '#10b981', ink: '#04241a' },
  { name: 'Azure',   c: '#3b82f6', ink: '#ffffff' },
  { name: 'Violet',  c: '#8b5cf6', ink: '#ffffff' },
  { name: 'Rose',    c: '#f43f5e', ink: '#ffffff' },
];

export default function SubscribeExperience({ creator, rate }) {
  const [theme, setTheme] = useState('dark');
  const [ac, setAc] = useState(ACCENTS[0]);

  return (
    <>
      <div className="customizer">
        <div className="cz-group">
          <span className="cz-label">Theme</span>
          <div className="cz-theme">
            <button className={`cz-opt${theme === 'light' ? ' on' : ''}`} onClick={() => setTheme('light')}>Light</button>
            <button className={`cz-opt${theme === 'dark' ? ' on' : ''}`} onClick={() => setTheme('dark')}>Dark</button>
          </div>
        </div>
        <div className="cz-group">
          <span className="cz-label">Accent</span>
          <div className="swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.c}
                className={`swatch${ac.c === a.c ? ' on' : ''}`}
                style={{ background: a.c, color: a.c }}
                onClick={() => setAc(a)}
                title={a.name}
                aria-label={a.name}
              />
            ))}
          </div>
        </div>
        <span className="cz-hint">appearance · demo</span>
      </div>

      <div className="panel widget" data-theme={theme} style={{ '--accent': ac.c, '--accent-ink': ac.ink }}>
        <div className="ph"><h2>Support {creator.brand}</h2><span className="tag">monthly · recurring</span></div>
        <div className="pb">
          <div className="creator-head">
            <div className="avatar">{(creator.brand || creator.blink_username)[0].toUpperCase()}</div>
            <div>
              <div className="n">{creator.brand}</div>
              <div className="h">@{creator.blink_username}</div>
            </div>
          </div>
          <p className="creator-pitch">{creator.pitch}</p>
          <SubscribePanel creator={creator} rate={rate} />
        </div>
      </div>
    </>
  );
}
