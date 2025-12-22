// D:\hacknation_25\hacknation_25\src\app\api\upload\route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

function normalizeFilename(filename: string): string {
  const extension = path.extname(filename);
  const nameWithoutExt = path.basename(filename, extension);

  const charMap: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
  };

  const normalizedName = nameWithoutExt
    .split('')
    .map(char => charMap[char] || char)
    .join('')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '');

  return `${normalizedName}${extension}`;
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Brak pliku' }, { status: 400 });
    }

    // Walidacja typu pliku
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Niedozwolony typ pliku' }, { status: 400 });
    }

    // Walidacja rozmiaru (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Plik za duży (max 10MB)' }, { status: 400 });
    }

    // Zapisz plik
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const timestamp = Date.now();
    const cleanName = normalizeFilename(file.name);
    const fileName = `${timestamp}_${cleanName}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    console.log(`✅ Plik zapisany: ${fileName}`);

    // STREAMING OCR
    if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
      const pythonApiUrl = process.env.PYTHON_OCR_API_URL || 'http://localhost:8000';

      const ocrFormData = new FormData();
      const fileBlob = new Blob([buffer], { type: file.type });
      ocrFormData.append('file', fileBlob, file.name);

      console.log(`📡 Streaming OCR: ${pythonApiUrl}/ocr-stream`);

      try {
        // Fetch streaming endpoint
        const ocrResponse = await fetch(`${pythonApiUrl}/ocr-stream`, {
          method: 'POST',
          body: ocrFormData,
          headers: { 'ngrok-skip-browser-warning': 'true' }
        });

        if (!ocrResponse.ok) {
          throw new Error(`OCR API error: ${ocrResponse.status}`);
        }

        // Czytaj stream i zapisz ostatni tekst
        const reader = ocrResponse.body?.getReader();
        const decoder = new TextDecoder();
        let finalText = '';
        let lastProgress = { current: 0, total: 0 };

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));

                  console.log(`📊 Progress: ${JSON.stringify(data)}`);

                  if (data.status === 'page') {
                    lastProgress = { current: data.current, total: data.total };
                  }

                  if (data.status === 'done') {
                    finalText = data.text;
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          }
        }

        // Zapisz jako TXT
        const fileExt = path.extname(fileName);
        const txtFileName = fileName.replace(fileExt, '.txt');
        const txtFilePath = path.join(UPLOAD_DIR, txtFileName);

        await writeFile(txtFilePath, finalText, 'utf-8');
        console.log(`💾 Zapisano TXT: ${txtFileName}`);

        return NextResponse.json({
          success: true,
          message: 'OCR zakończone',
          file: {
            name: file.name,
            savedAs: fileName,
            size: file.size,
            type: file.type,
            uploadedAt: new Date().toISOString()
          },
          ocr: {
            text: finalText,
            txtFile: txtFileName,
            pagesProcessed: lastProgress.total
          }
        });

      } catch (ocrError) {
        console.error('❌ OCR Error:', ocrError);
        return NextResponse.json({
          error: 'Błąd OCR',
          details: ocrError instanceof Error ? ocrError.message : 'Unknown'
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      file: { name: file.name, savedAs: fileName }
    });

  } catch (error) {
    console.error('❌ Upload Error:', error);
    return NextResponse.json({
      error: 'Błąd uploadu',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}

// GET - lista plików
export async function GET() {
  try {
    const { readdir, stat } = await import('fs/promises');

    if (!existsSync(UPLOAD_DIR)) {
      return NextResponse.json({ files: [] });
    }

    const files = await readdir(UPLOAD_DIR);
    const fileDetails = await Promise.all(
      files.map(async (fileName) => {
        const filePath = path.join(UPLOAD_DIR, fileName);
        const stats = await stat(filePath);
        return {
          name: fileName,
          size: stats.size,
          uploadedAt: stats.mtime,
        };
      })
    );

    return NextResponse.json({
      success: true,
      count: fileDetails.length,
      files: fileDetails
    });

  } catch (error) {
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}