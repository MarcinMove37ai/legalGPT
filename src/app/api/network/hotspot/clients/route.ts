// src/app/api/network/hotspot/clients/route.ts
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // KROK 1: Pobierz DNS cache dla sieci hotspot
    const dnsCommand = `Get-DnsClientCache | Where-Object { $_.Data -like '192.168.137.*' -and $_.Data -ne '192.168.137.1' } | Select-Object Entry, Data | ConvertTo-Json`;

    const { stdout: dnsOutput } = await execAsync(
      `powershell -Command "${dnsCommand}"`,
      { encoding: 'utf8', timeout: 3000 }
    );

    // Parse DNS records
    let dnsRecords: any[] = [];
    try {
      const parsed = JSON.parse(dnsOutput || '[]');
      dnsRecords = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      dnsRecords = [];
    }

    // KROK 2: Pobierz ARP table - BEZ PARAMETRU!
    const { stdout: arpOutput } = await execAsync(
      'arp -a',
      { encoding: 'utf8', timeout: 3000 }
    );

    const arpLines = arpOutput.split('\n');
    const arpMap = new Map<string, string>();

    for (const line of arpLines) {
      // Szukaj TYLKO linii z 192.168.137.x
      const match = line.match(/192\.168\.137\.(\d+)\s+([\w-]+)\s+/);
      if (match && match[1] !== '1' && match[1] !== '255') {
        const ip = `192.168.137.${match[1]}`;
        const mac = match[2].toUpperCase();
        arpMap.set(ip, mac);
      }
    }

    // KROK 3: Urządzenia z DNS (Galaxy-S23 itp.)
    const clientsFromDns = dnsRecords
      .filter((record: any) => record.Data && record.Entry)
      .map((record: any) => {
        const ip = record.Data;
        const mac = arpMap.get(ip) || 'Unknown';

        // Wyczyść nazwę: "galaxy-s23.mshome.net" -> "Galaxy-S23"
        let name = record.Entry
          .replace('.mshome.net', '')
          .replace('.local', '')
          .trim();

        // Capitalize pierwszą literę każdego słowa
        name = name
          .split('-')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join('-');

        return {
          ip,
          mac,
          name
        };
      });

    // KROK 4: Urządzenia z ARP BEZ DNS (iPhone itp.) - FALLBACK
    const ipsFromDns = new Set(clientsFromDns.map(c => c.ip));
    const clientsFromArpOnly = Array.from(arpMap.entries())
      .filter(([ip]) => !ipsFromDns.has(ip))
      .map(([ip, mac]) => ({
        ip,
        mac,
        name: 'Urządzenie mobilne'
      }));

    // KROK 5: Połącz obie listy
    const clients = [...clientsFromDns, ...clientsFromArpOnly];

    return NextResponse.json({
      success: true,
      clients,
      count: clients.length
    });
  } catch (error) {
    console.error('Error fetching hotspot clients:', error);
    return NextResponse.json({
      success: true,
      clients: [],
      count: 0
    });
  }
}