// src/app/api/network/deactivate/route.ts
import { NextResponse } from 'next/server';
import { stopHotspotCommand, connectWiFiCommand, checkHotspotStatus } from '@/lib/network-commands';

const WIFI_SSID = 'HUAWEI_B818_ml';
const MAX_RETRIES = 2;
const WAIT_TIME = 2000; // 2s zamiast 1.5s

export async function POST() {
  try {
    console.log('🔄 [Deactivate] START');

    // KROK 1: Wyłącz Hotspot
    console.log('📶 [Deactivate] Wyłączanie Hotspot...');
    await stopHotspotCommand();

    // KROK 2: Czekaj i sprawdź (z retry)
    let hotspotActive = true;
    for (let i = 0; i < MAX_RETRIES; i++) {
      console.log(`⏳ [Deactivate] Próba ${i + 1}/${MAX_RETRIES} - czekam ${WAIT_TIME}ms...`);
      await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

      console.log('🔍 [Deactivate] Sprawdzam status hotspot...');
      hotspotActive = await checkHotspotStatus();
      console.log(`📊 [Deactivate] Hotspot: ${hotspotActive ? 'AKTYWNY' : 'WYŁĄCZONY'}`);

      if (!hotspotActive) break;
    }

    // KROK 3: Jeśli wyłączony → włącz WiFi
    if (!hotspotActive) {
      console.log(`📡 [Deactivate] Łączenie z WiFi: ${WIFI_SSID}...`);
      await connectWiFiCommand(WIFI_SSID);
      console.log('✅ [Deactivate] DONE');

      return NextResponse.json({
        success: true,
        message: 'Terminal przywrócony',
        connectedTo: WIFI_SSID
      });
    } else {
      throw new Error(`Hotspot nie wyłączył się po ${MAX_RETRIES} próbach`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [Deactivate] FAILED:', errorMessage);

    return NextResponse.json(
      { success: false, error: 'Błąd deaktywacji', details: errorMessage },
      { status: 500 }
    );
  }
}