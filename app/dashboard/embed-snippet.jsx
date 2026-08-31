'use client';
import { useState, useEffect } from 'react';

export default function EmbedSnippet({ username }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const code = `<div id="blink-sub" data-username="${username}"></div>\n<script src="${origin || 'https://your-host'}/embed.js"><\/script>`;

  function copy() {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div>
      <p style={{ color: 'var(--dim)', fontSize: 13, marginTop: 0 }}>
        Paste this on any site — custom, WordPress, Webflow, Squarespace — to show your subscribe box. Readers pay to your Blink username; nothing is stored on your page.
      </p>
      <div style={{ position: 'relative' }}>
        <pre style={{ background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 14, margin: 0, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</pre>
        <button className="btn primary sm" style={{ position: 'absolute', top: 8, right: 8 }} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p style={{ color: 'var(--faint)', fontSize: 12, marginBottom: 0 }}>
        The box updates automatically when you edit your tiers above.
      </p>
    </div>
  );
}
