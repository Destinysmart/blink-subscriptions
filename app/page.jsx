import GetStarted from './get-started';
import ThemeToggle from './theme-toggle';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="wrap">
      <div className="nav">
        <div className="brandmark"><img className="logo logo-dark" src="/blink/blink-lockup-dark.svg" alt="Blink" /><img className="logo logo-light" src="/blink/blink-lockup-color.svg" alt="Blink" /><span className="product">subscriptions</span></div>
        <ThemeToggle />
      </div>
      <div className="land">
        <h1>Get paid monthly, in bitcoin</h1>
        <p>Recurring support to your Blink username. No signup, no bank. Readers pay from any Lightning wallet.</p>
        <GetStarted />
        <div className="foot">Just your Blink username. Nothing to install. · <a href="/c/demo" style={{ color: 'var(--dim)', textDecoration: 'underline' }}>see an example</a></div>
      </div>
    </div>
  );
}
