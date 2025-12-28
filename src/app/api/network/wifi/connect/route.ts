// src/app/api/network/wifi/connect/route.ts
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const DEFAULT_WIFI_SSID = 'HUAWEI_B818_ml';

export async function POST() {
  try {
    console.log('🔵 [WiFi Connect] START');

    console.time('[WiFi Connect] netsh');
    await execAsync(
      `netsh wlan connect name="${DEFAULT_WIFI_SSID}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    console.timeEnd('[WiFi Connect] netsh');

    console.log('✅ [WiFi Connect] DONE');

    return NextResponse.json({
      success: true,
      message: `Połączono z WiFi: ${DEFAULT_WIFI_SSID}`
    });
  } catch (error) {
    console.error('❌ [WiFi Connect] FAILED:', error);
    return NextResponse.json(
      { success: false, error: 'Nie udało się połączyć z WiFi' },
      { status: 500 }
    );
  }
}