// D:\hacknation_25\hacknation_25\src\app\api\assets\[filename]\route.ts
// ✅ POPRAWIONA WERSJA DLA NEXT.JS 15
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }  // ⬅️ params jest Promise
) {
  try {
    // ⬅️ AWAIT params przed użyciem!
    const { filename } = await params;

    console.log('📥 Żądanie pliku:', filename);

    // Walidacja nazwy pliku (zabezpieczenie przed path traversal)
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.error('❌ Nieprawidłowa nazwa pliku:', filename);
      return NextResponse.json(
        { error: 'Nieprawidłowa nazwa pliku' },
        { status: 400 }
      );
    }

    const filePath = path.join(UPLOAD_DIR, filename);
    console.log('📂 Pełna ścieżka:', filePath);

    // Sprawdzenie czy plik istnieje
    if (!existsSync(filePath)) {
      console.error('❌ Plik nie istnieje:', filePath);
      return NextResponse.json(
        { error: 'Plik nie został znaleziony' },
        { status: 404 }
      );
    }

    // Odczytanie pliku
    console.log('📖 Odczytywanie pliku...');
    const fileBuffer = await readFile(filePath);
    console.log('✅ Plik odczytany, rozmiar:', fileBuffer.length, 'bajtów');

    // Określenie typu MIME na podstawie rozszerzenia
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    console.log('📄 Content-Type:', contentType);

    // Zwrócenie pliku
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

  } catch (error) {
    console.error('❌ Błąd podczas pobierania pliku:', error);
    return NextResponse.json(
      {
        error: 'Błąd podczas pobierania pliku',
        details: error instanceof Error ? error.message : 'Nieznany błąd'
      },
      { status: 500 }
    );
  }
}