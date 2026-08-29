export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="wrap">
      <div className="nav">
        <div className="brandmark"><span className="dot">₿</span>Blink<span className="s">Sub</span></div>
        <a className="navlink" href="/dashboard">Dashboard</a>
      </div>

      <div className="land">
        <span className="kicker">FOSS · Built on Blink</span>
        <h1>Subscriptions that pay in <em>bitcoin</em></h1>
        <p>Recurring income for creators, settled over Lightning to a Blink username. No cards, no Stripe, no bank. It works where the old rails do not.</p>
        <div className="landrow">
          <a className="btn primary" href="/c/destiny_smart">See a subscribe page</a>
          <a className="btn ghost" href="/dashboard">Open the dashboard</a>
        </div>
        <div className="foot">No signup, no database setup. Runs on a local file. Set <code>SUPABASE_URL</code> and Blink keys to go live.</div>
      </div>
    </div>
  );
}
