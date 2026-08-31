import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const u = new URL(req.url).searchParams.get('u');
  const { getCreator } = await import('@/lib/data');
  const c = await getCreator(u);
  return NextResponse.json({ tiers: c?.tiers || [] });
}

export async function POST(req) {
  try {
    const { username, tiers } = await req.json();
    if (!username || !Array.isArray(tiers)) return NextResponse.json({ ok: false, error: 'bad input' }, { status: 400 });
    const { updateCreatorTiers } = await import('@/lib/data');
    await updateCreatorTiers(username, tiers);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message) }, { status: 500 });
  }
}
