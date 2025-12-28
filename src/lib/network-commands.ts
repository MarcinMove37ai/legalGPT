// src/lib/network-commands.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Wyłącza hotspot WiFi
 * POPRAWIONA WERSJA - działa niezależnie od stanu WiFi
 * Używa GetConnectionProfiles() zamiast GetInternetConnectionProfile()
 */
export async function stopHotspotCommand() {
  const command = `powershell -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Runtime.WindowsRuntime; [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime] | Out-Null; $profiles = [Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles(); foreach ($profile in $profiles) { try { $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile); if ($tetheringManager -ne $null -and $tetheringManager.TetheringOperationalState -eq 'On') { $tetheringManager.StopTetheringAsync() | Out-Null; Write-Output 'OK'; exit 0; } } catch { continue; } }; Write-Output 'OK'"`;

  await execAsync(command, { encoding: 'utf8', timeout: 5000 });
}

/**
 * Włącza hotspot WiFi
 * Działa niezależnie od stanu WiFi
 * Używa GetConnectionProfiles() zamiast GetInternetConnectionProfile()
 */
export async function startHotspotCommand() {
  const command = `powershell -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Runtime.WindowsRuntime; [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime] | Out-Null; $profiles = [Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles(); foreach ($profile in $profiles) { try { $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile); if ($tetheringManager -ne $null -and $tetheringManager.TetheringOperationalState -eq 'Off') { $tetheringManager.StartTetheringAsync() | Out-Null; Write-Output 'OK'; exit 0; } } catch { continue; } }; Write-Output 'OK'"`;

  await execAsync(command, { encoding: 'utf8', timeout: 5000 });
}

/**
 * Łączy z siecią WiFi
 */
export async function connectWiFiCommand(ssid: string) {
  await execAsync(`netsh wlan connect name="${ssid}"`, {
    encoding: 'utf8',
    timeout: 5000
  });
}

/**
 * Sprawdza czy hotspot jest aktywny
 * Sprawdza adapter wirtualny Microsoft Wi-Fi Direct
 */
export async function checkHotspotStatus(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      'powershell -ExecutionPolicy Bypass -Command "Get-NetAdapter | Where-Object {$_.InterfaceDescription -like \'*Microsoft Wi-Fi Direct Virtual Adapter*\' -or $_.Name -like \'Local Area Connection**\'} | Where-Object {$_.Status -eq \'Up\'} | Measure-Object | Select-Object -ExpandProperty Count"',
      { encoding: 'utf8', timeout: 5000 }
    );

    const count = parseInt(stdout.trim());
    return count > 0;
  } catch (error) {
    return false;
  }
}