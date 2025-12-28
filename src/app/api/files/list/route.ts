// app/api/files/list/route.ts
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { type NextRequest } from 'next/server';

// Ścieżka do folderu z uploadami
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join('D:', 'legalGPT_pl', 'legalgpt_pl', 'legalGPT', 'uploads');

// Prosta mapa typów MIME
const getMimeType = (filename: string) => {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.pdf':
      return 'application/pdf';
    case '.txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
};

// Helper do sprawdzania/tworzenia folderu (opcjonalnie)
async function ensureUploadsDir() {
  try {
    await fs.access(UPLOADS_DIR);
  } catch (error) {
    // Można tu dodać logikę tworzenia folderu, jeśli nie istnieje
    throw new Error("Upload directory not found");
  }
}

// --- GET: Listowanie plików LUB pobieranie konkretnego pliku ---
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedFilename = searchParams.get('filename');

    await ensureUploadsDir();

    // 1. TRYB PODGLĄDU PLIKU
    if (requestedFilename) {
      // WAŻNE: Dekodujemy nazwę (zamiana %20 na spacje itp.)
      const decodedFilename = decodeURIComponent(requestedFilename);
      const safeFilename = path.basename(decodedFilename); // Zabezpieczenie ścieżki
      const filePath = path.join(UPLOADS_DIR, safeFilename);

      try {
        const fileBuffer = await fs.readFile(filePath);
        const mimeType = getMimeType(safeFilename);

        // Ustawiamy nagłówki tak, aby przeglądarka wyświetliła plik (inline) zamiast go pobierać
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': mimeType,
            'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
          },
        });
      } catch (error) {
        console.error('Error serving file:', error);
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
    }

    // 2. TRYB LISTOWANIA PLIKÓW
    const files = await fs.readdir(UPLOADS_DIR);

    const fileDetails = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(UPLOADS_DIR, filename);
        try {
          const stats = await fs.stat(filePath);

          if (stats.isDirectory()) return null;

          return {
            name: filename,
            size: stats.size,
            date: stats.mtime.toISOString(),
          };
        } catch (e) {
          return null;
        }
      })
    );

    // Sortowanie: najnowsze na górze
    const validFiles = fileDetails
      .filter((file): file is NonNullable<typeof file> => file !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json(validFiles);

  } catch (error) {
    console.error('Error in files API:', error);
    // Jeśli folder nie istnieje, zwracamy pustą tablicę zamiast błędu
    if (error instanceof Error && error.message === "Upload directory not found") {
      return NextResponse.json([]);
    }
    return NextResponse.json(
      { error: 'Nie można przetworzyć żądania' },
      { status: 500 }
    );
  }
}

// --- DELETE: Usuwanie pliku ---
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filenameToDelete = searchParams.get('filename');

    if (!filenameToDelete) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    await ensureUploadsDir();

    const decodedFilename = decodeURIComponent(filenameToDelete);
    const safeFilename = path.basename(decodedFilename);
    const filePath = path.join(UPLOADS_DIR, safeFilename);

    try {
      await fs.access(filePath); // Sprawdź czy istnieje
      await fs.unlink(filePath); // Usuń
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
      return NextResponse.json({ error: 'File not found or could not be deleted' }, { status: 404 });
    }

  } catch (error) {
    console.error('Error in DELETE API:', error);
    return NextResponse.json(
      { error: 'Internal server error during deletion' },
      { status: 500 }
    );
  }
}