// src/app/api/network/status/route.ts
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * GET /api/network/status
 * Zwraca aktualny status karty WiFi, połączenia z siecią, dostępu do internetu i Hotspot
 */
export async function GET() {
  try {
    // Sprawdź czy karta WiFi jest aktywna
    const wifiCardActive = await checkWiFiCardActive();

    // Sprawdź czy jest połączenie z siecią WiFi
    const wifiConnected = await checkWiFiConnected();

    // Sprawdź czy jest dostęp do internetu
    const internetAccess = await checkInternetAccess();

    // Sprawdź status Hotspot
    const hotspotActive = await checkHotspotStatus();

    return NextResponse.json({
      wifiCardActive,
      wifiConnected,
      internetAccess,
      hotspotActive
    });
  } catch (error) {
    console.error('Error checking network status:', error);
    return NextResponse.json(
      { error: 'Nie można pobrać statusu sieci' },
      { status: 500 }
    );
  }
}

/**
 * Sprawdza czy karta WiFi jest aktywna (włączona)
 */
async function checkWiFiCardActive(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      'powershell -Command "Get-NetAdapter | Where-Object {$_.Name -like \'*Wi-Fi*\' -or $_.Name -like \'*WiFi*\' -or $_.Name -like \'*Wireless*\'} | Select-Object -ExpandProperty Status"',
      { encoding: 'utf8' }
    );

    const status = stdout.trim();
    // Status może być: Up, Down, Disabled, Not Present
    return status === 'Up';
  } catch (error) {
    console.error('Error checking WiFi card status:', error);
    return false;
  }
}

/**
 * Sprawdza czy WiFi jest połączone z siecią (ma przypisany SSID)
 */
async function checkWiFiConnected(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      'powershell -Command "netsh wlan show interfaces | Select-String \'State\' | Select-Object -First 1"',
      { encoding: 'utf8' }
    );

    const output = stdout.trim();
    // Szukamy "State                  : connected"
    return output.toLowerCase().includes('connected');
  } catch (error) {
    console.error('Error checking WiFi connection:', error);
    return false;
  }
}

/**
 * Sprawdza czy jest faktyczny dostęp do internetu
 */
async function checkInternetAccess(): Promise<boolean> {
  try {
    // Sprawdź przez Windows API czy jest dostęp do internetu
    const { stdout } = await execAsync(
      'powershell -Command "$connectionProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile(); if ($connectionProfile -ne $null) { $connectionProfile.GetNetworkConnectivityLevel() } else { \'None\' }"',
      { encoding: 'utf8' }
    );

    const level = stdout.trim();
    // Poziomy: None, LocalAccess, ConstrainedInternetAccess, InternetAccess
    return level === 'InternetAccess';
  } catch (error) {
    console.error('Error checking internet access:', error);
    return false;
  }
}

/**
 * Sprawdza czy Hotspot jest aktywny
 * POPRAWKA: Działa nawet gdy WiFi jest rozłączone
 */
async function checkHotspotStatus(): Promise<boolean> {
  try {
    // Metoda 1: Sprawdź przez adapter "Local Area Connection* X" (hotspot)
    const { stdout } = await execAsync(
      'powershell -ExecutionPolicy Bypass -Command "Get-NetAdapter | Where-Object {$_.InterfaceDescription -like \'*Microsoft Wi-Fi Direct Virtual Adapter*\' -or $_.Name -like \'Local Area Connection**\'} | Where-Object {$_.Status -eq \'Up\'} | Measure-Object | Select-Object -ExpandProperty Count"',
      { encoding: 'utf8', timeout: 5000 }
    );

    const count = parseInt(stdout.trim());

    // Jeśli znaleziono aktywny adapter hotspota, to hotspot jest włączony
    if (count > 0) {
      return true;
    }

    // Metoda 2 (fallback): Sprawdź przez TetheringManager (działa gdy jest connection profile)
    try {
      const { stdout: stdout2 } = await execAsync(
        'powershell -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Runtime.WindowsRuntime; [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime] | Out-Null; $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile(); if ($connectionProfile -ne $null) { $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($connectionProfile); if ($tetheringManager -ne $null) { Write-Output $tetheringManager.TetheringOperationalState } else { Write-Output \'Off\' } } else { Write-Output \'Off\' }"',
        { encoding: 'utf8', timeout: 5000 }
      );

      const status = stdout2.trim();
      return status === 'On';
    } catch (error) {
      return false;
    }
  } catch (error) {
    console.error('Error checking Hotspot status:', error);
    return false;
  }
}