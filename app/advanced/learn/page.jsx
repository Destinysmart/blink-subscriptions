export const dynamic = 'force-dynamic';

export default function Learn() {
  const payload = `{
  "event": "subscription.paid",
  "data": {
    "email": "reader@example.com",
    "tier": "Builder",
    "sats": 5000,
    "cycle": "monthly",
    "paidUntil": "2026-10-01T12:00:00.000Z"
  },
  "ts": 1788190000000
}`;
  const verify = `// your backend (Node/Express) — verify the signature, then act
import crypto from 'crypto';

app.post('/api/blink-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.header('Blink-Signature');
  const expected = crypto.createHmac('sha256', process.env.BLINK_SECRET)
    .update(req.body).digest('hex');
  if (sig !== expected) return res.sendStatus(401);   // reject forgeries

  const { event, data } = JSON.parse(req.body);
  if (event === 'subscription.paid' || event === 'subscription.renewed') {
    // write to YOUR database with YOUR access — e.g. Firestore
    // db.collection('subscribers').doc(data.email).set({ paid: true, tier: data.tier, paidUntil: data.paidUntil }, { merge: true });
  }
  if (event === 'subscription.expiring') {
    // send YOUR renewal email with YOUR email tool
  }
  res.sendStatus(200);
});`;

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="nav">
        <a className="brandmark" href="/"><img className="logo logo-dark" src="/blink/blink-lockup-dark.svg" alt="Blink" /><img className="logo logo-light" src="/blink/blink-lockup-color.svg" alt="Blink" /><span className="product">subscriptions</span></a>
        <a className="navlink" href="/advanced">Back</a>
      </div>
      <div className="eyebrow">Advanced</div>
      <h1 className="h-page">The webhook connector</h1>
      <p style={{ color: 'var(--dim)', fontSize: 15, maxWidth: '64ch' }}>
        Blink Subscriptions never reaches into your database and holds no keys to your systems. Instead it <b>tells your backend</b> what happened, signed, and your backend does the rest with the access it already has. That keeps your emails and your database entirely yours.
      </p>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="ph"><h2>How it works</h2></div>
        <div className="pb" style={{ color: 'var(--dim)', fontSize: 14, lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}>1. A reader subscribes through your embedded box and pays over Lightning.</p>
          <p>2. We POST a signed event to your webhook URL — for example <code style={{ fontFamily: 'var(--mono)' }}>subscription.paid</code>.</p>
          <p>3. Your backend verifies the signature, then writes the subscriber into your own database (your Firebase) and sends your own emails.</p>
          <p style={{ marginBottom: 0 }}>4. Before a paid subscription lapses we send <code style={{ fontFamily: 'var(--mono)' }}>subscription.expiring</code> so you can email a renewal nudge.</p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="ph"><h2>Event payload</h2></div>
        <div className="pb"><pre style={{ background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 14, margin: 0, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--dim)', overflow: 'auto' }}>{payload}</pre></div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="ph"><h2>Verify &amp; handle (your backend)</h2></div>
        <div className="pb"><pre style={{ background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 14, margin: 0, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--dim)', overflow: 'auto' }}>{verify}</pre></div>
      </div>

      <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 16 }}>
        The signing secret only lets you <b>verify authenticity</b> — it grants no access to anything. If it leaked, the worst case is a fake event, which you can stop by rotating the secret.
      </p>
    </div>
  );
}
