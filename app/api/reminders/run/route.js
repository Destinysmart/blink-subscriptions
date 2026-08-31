import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET() {
  const { runExpiringCheck } = await import('@/lib/db/local.mjs');
  return NextResponse.json(await runExpiringCheck(3));
}
