// src/app/api/network/activate/route.ts
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * POST /api/network/activate
 * Aktywuje tryb przesyłania: włącza Hotspot, wyłącza WiFi
 */
export async function POST() {
  try {
    console.log('🔄 Aktywacja trybu przesyłania - START');

    // KROK 1: Włącz Hotspot (NAJPIERW!)
    console.log('📶 Włączanie Hotspot...');
    await startHotspot();

    // KROK 2: Rozłącz WiFi (PO aktywacji hotspota)
    console.log('📡 Rozłączanie WiFi...');
    await disconnectWiFi();

    console.log('✅ Aktywacja trybu przesyłania - SUKCES');

    return NextResponse.json({
      success: true,
      message: 'Tryb przesyłania aktywowany'
    });
  } catch (error) {
    console.error('❌ Błąd aktywacji trybu przesyłania:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Nie udało się aktywować trybu przesyłania',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Rozłącza WiFi
 */
async function disconnectWiFi(): Promise<void> {
  try {
    await execAsync(
      'powershell -Command "netsh wlan disconnect"',
      { encoding: 'utf8' }
    );
    console.log('✅ WiFi rozłączone');
  } catch (error) {
    console.error('❌ Błąd rozłączania WiFi:', error);
    throw new Error('Nie udało się rozłączyć WiFi');
  }
}

/**
 * Włącza Hotspot - ZOPTYMALIZOWANA METODA
 */
async function startHotspot(): Promise<void> {
  try {
    const command = `powershell -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Runtime.WindowsRuntime; [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime] | Out-Null; $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile(); $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($connectionProfile); $tetheringManager.StartTetheringAsync() | Out-Null; Write-Output 'OK'"`;

    await execAsync(command, {
      encoding: 'utf8',
      timeout: 5000
    });

    console.log('✅ Hotspot włączony');
  } catch (error) {
    console.error('❌ Błąd włączania Hotspot:', error);
    throw new Error('Nie udało się włączyć Hotspot');
  }
}