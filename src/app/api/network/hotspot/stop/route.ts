// src/app/api/network/hotspot/stop/route.ts
import { NextResponse } from 'next/server';
import { stopHotspotCommand } from '@/lib/network-commands';

export async function POST() {
  try {
    console.log('🔴 [Hotspot Stop] START');

    await stopHotspotCommand();

    console.log('✅ [Hotspot Stop] DONE');

    return NextResponse.json({
      success: true,
      message: 'Hotspot wyłączony'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [Hotspot Stop] FAILED:', errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: 'Nie udało się wyłączyć Hotspot',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}