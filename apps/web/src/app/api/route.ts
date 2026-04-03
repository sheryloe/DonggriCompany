import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('http://127.0.0.1:3001/ping');
    const data = await res.json();
    return NextResponse.json({ ...data, webProxy: 'ok' });
  } catch {
    return NextResponse.json({ error: 'Orchestrator offline' }, { status: 500 });
  }
}
