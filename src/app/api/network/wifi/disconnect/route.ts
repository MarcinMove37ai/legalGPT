// src/app/api/network/wifi/disconnect/route.ts
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * POST /api/network/wifi/disconnect
 * Ręcznie rozłącza WiFi
 */
export async function POST() {
  try {
    console.log('🔴 [WiFi Disconnect] START');

    console.time('[WiFi Disconnect] netsh');
    await execAsync(
      'powershell -Command "netsh wlan disconnect"',
      { encoding: 'utf8', timeout: 5000 }
    );
    console.timeEnd('[WiFi Disconnect] netsh');

    console.log('✅ [WiFi Disconnect] DONE');

    return NextResponse.json({
      success: true,
      message: 'WiFi rozłączone'
    });
  } catch (error) {
    console.error('❌ [WiFi Disconnect] FAILED:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Nie udało się rozłączyć WiFi'
      },
      { status: 500 }
    );
  }
}