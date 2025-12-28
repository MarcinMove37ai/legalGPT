// src/app/api/test/hotspot/route.ts
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * GET /api/test/hotspot
 * Testowy endpoint - sprawdza czy PowerShell działa
 */
export async function GET() {
  try {
    console.log('🧪 TEST: Próba wykonania PowerShell...');

    // Prosty test - sprawdź stan hotspota
    const command = `powershell -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Runtime.WindowsRuntime; [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime] | Out-Null; $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile(); $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($connectionProfile); Write-Output $tetheringManager.TetheringOperationalState"`;

    console.log('🧪 Wykonuję komendę...');
    const { stdout, stderr } = await execAsync(command, { encoding: 'utf8' });

    console.log('🧪 stdout:', stdout);
    console.log('🧪 stderr:', stderr);

    return NextResponse.json({
      success: true,
      stdout: stdout,
      stderr: stderr,
      state: stdout.trim()
    });
  } catch (error) {
    console.error('🧪 BŁĄD:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/test/hotspot
 * Testowy endpoint - próba włączenia hotspota
 */
export async function POST() {
  try {
    console.log('🧪 TEST START: Próba włączenia hotspota...');

    const command = `powershell -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Runtime.WindowsRuntime; [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime] | Out-Null; $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile(); $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($connectionProfile); Write-Output 'Before:'; Write-Output $tetheringManager.TetheringOperationalState; $result = $tetheringManager.StartTetheringAsync(); Start-Sleep -Seconds 1; Write-Output 'After:'; Write-Output $tetheringManager.TetheringOperationalState"`;

    console.log('🧪 Wykonuję komendę START...');
    const { stdout, stderr } = await execAsync(command, {
      encoding: 'utf8',
      timeout: 10000 // 10 sekund timeout
    });

    console.log('🧪 stdout:', stdout);
    console.log('🧪 stderr:', stderr);

    return NextResponse.json({
      success: true,
      stdout: stdout,
      stderr: stderr
    });
  } catch (error) {
    console.error('🧪 BŁĄD START:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}