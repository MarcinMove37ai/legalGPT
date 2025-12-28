import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'Brak pliku' },
        { status: 400 }
      );
    }

    // Katalog docelowy
    const uploadDir = 'D:/legalGPT_pl/legalgpt_pl/legalGPT/uploads';

    // Utwórz katalog jeśli nie istnieje
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Generuj unikalną nazwę z timestamp
    const timestamp = new Date().getTime();
    const ext = path.extname(file.name);
    const baseName = path.basename(file.name, ext);
    const fileName = `${baseName}_${timestamp}${ext}`;
    const filePath = path.join(uploadDir, fileName);

    // Konwertuj File do Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Zapisz plik
    await writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      fileName: fileName,
      size: file.size,
      path: filePath
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Błąd zapisu pliku' },
      { status: 500 }
    );
  }
}