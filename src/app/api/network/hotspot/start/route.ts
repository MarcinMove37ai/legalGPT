// src/app/api/network/hotspot/start/route.ts
import { NextResponse } from 'next/server';
import { startHotspotCommand } from '@/lib/network-commands';

export async function POST() {
  try {
    console.log('📶 [Hotspot Start] START');

    await startHotspotCommand();

    console.log('✅ [Hotspot Start] DONE');

    return NextResponse.json({
      success: true,
      message: 'Hotspot włączony'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [Hotspot Start] FAILED:', errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: 'Nie udało się włączyć Hotspot',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}