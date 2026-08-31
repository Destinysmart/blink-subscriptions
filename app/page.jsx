import GetStarted from './get-started';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="wrap">
      <div className="nav">
        <div className="brandmark"><img className="logo" src="/blink/blink-lockup-dark.svg" alt="Blink" /><span className="product">subscriptions</span></div>
        <a className="navlink" href="/dashboard">Dashboard</a>
      </div>
      <div className="land">
        <div className="eyebrow">Built on Blink</div>
        <h1>Get paid monthly, in bitcoin</h1>
        <p>Recurring support to your Blink username. No signup, no bank. Readers pay from any Lightning wallet.</p>
        <GetStarted />
        <div className="foot">Just your Blink username. Nothing to install. · <a href="/c/destiny_smart" style={{ color: 'var(--dim)', textDecoration: 'underline' }}>see an example</a></div>
      </div>
    </div>
  );
}
