import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(req) {
  const u = new URL(req.url).searchParams.get('u');
  const { verifyOwnership } = await import('@/lib/db/local.mjs');
  return NextResponse.json(await verifyOwnership(u));
}
