import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

// Helper do normalizacji nazw
function normalizeFilename(filename: string): string {
  const extension = path.extname(filename);
  const nameWithoutExt = path.basename(filename, extension);
  const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_');
  return `${cleanName}${extension}`;
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

export async function POST(request: NextRequest) {
  console.log('🚀 [Multi-File Upload] START');

  const formData = await request.formData();
  // Pobieramy WSZYSTKIE pliki przesłane pod kluczem 'files'
  const files = formData.getAll('files') as File[];

  if (!files || files.length === 0) {
    return new Response('No files uploaded', { status: 400 });
  }

  // Przygotowanie katalogu
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  // Nazwa scalonego pliku wyjściowego (bazujemy na nazwie pierwszego pliku lub timestampie)
  const timestamp = Date.now();
  const baseName = files.length === 1 ? normalizeFilename(files[0].name) : `merged_output_${files.length}_files`;
  // Usuwamy rozszerzenie z baseName dla pliku wynikowego TXT
  const outputTxtName = `${timestamp}_${path.parse(baseName).name}.txt`;
  const outputTxtPath = path.join(UPLOAD_DIR, outputTxtName);

  const pythonApiUrl = process.env.PYTHON_OCR_API_URL || 'http://localhost:8000';
  const encoder = new TextEncoder();

  // Tworzymy jeden strumień odpowiedzi dla całej paczki
  const stream = new ReadableStream({
    async start(controller) {
      let combinedText = "";

      try {
        // --- PĘTLA PO PLIKACH ---
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const currentFileNum = i + 1;
          const totalFiles = files.length;

          console.log(`Processing file ${currentFileNum}/${totalFiles}: ${file.name}`);

          // Informacja dla frontendu o zmianie pliku
          const startMsg = `data: ${JSON.stringify({
            status: 'start',
            total: 1,
            message: `Processing file ${currentFileNum}/${totalFiles}: ${file.name}`
          })}\n\n`;
          controller.enqueue(encoder.encode(startMsg));

          // 1. Zapis tymczasowy pliku (wymagane, by przesłać go dalej lub mieć kopię)
          const tempFileName = `${timestamp}_part${i}_${normalizeFilename(file.name)}`;
          const tempFilePath = path.join(UPLOAD_DIR, tempFileName);
          const bytes = await file.arrayBuffer();
          const buffer = Buffer.from(bytes);
          await writeFile(tempFilePath, buffer);

          // 2. Przygotowanie requestu do Pythona (Jeden plik na raz!)
          const ocrFormData = new FormData();
          const fileBlob = new Blob([buffer], { type: file.type });
          ocrFormData.append('file', fileBlob, file.name);

          // 3. Wywołanie Pythona
          const ocrResponse = await fetch(`${pythonApiUrl}/ocr-stream`, {
            method: 'POST',
            body: ocrFormData,
          });

          if (!ocrResponse.ok) {
            throw new Error(`Python API error for file ${file.name}: ${ocrResponse.status}`);
          }

          // 4. Czytanie strumienia z Pythona
          const reader = ocrResponse.body?.getReader();
          const decoder = new TextDecoder();
          let fileText = "";
          let lineBuffer = "";

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });

              // Proxy: Przekazujemy chunk do frontendu (dla pasków postępu),
              // ALE musimy uważać na status 'done', żeby frontend nie myślał, że to koniec wszystkiego.

              lineBuffer += chunk;
              const lines = lineBuffer.split('\n');
              lineBuffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                  try {
                    const jsonStr = trimmed.substring(6);
                    const data = JSON.parse(jsonStr);

                    if (data.status === 'done') {
                      // Zbieramy tekst, ale NIE wysyłamy 'done' do frontendu jeszcze
                      fileText = data.text;
                    } else {
                      // Wszystkie inne statusy (progress, preprocessing) przekazujemy dalej
                      // Modyfikujemy wiadomość, żeby było widać który to plik
                      if(data.message) {
                         data.message = `[File ${currentFileNum}/${totalFiles}] ${data.message}`;
                      }
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                    }
                  } catch (e) { /* ignore */ }
                }
              }
            }
          }

          // Dodajemy wynik tego pliku do głównego tekstu
          combinedText += `\n\n=== SOURCE FILE: ${file.name} ===\n\n`;
          combinedText += fileText;

        } // --- KONIEC PĘTLI ---

        // 5. Zapisujemy scalony plik TXT
        if (combinedText) {
            await writeFile(outputTxtPath, combinedText, 'utf-8');
            console.log(`💾 [Multi-Proxy] Saved merged file: ${outputTxtName}`);

            // Wysyłamy informację o zapisaniu
            const savedEvent = `data: ${JSON.stringify({
              status: 'saved',
              txtFile: outputTxtName,
              message: 'All files merged and saved!'
            })}\n\n`;
            controller.enqueue(encoder.encode(savedEvent));

            // Dopiero teraz wysyłamy ostateczne DONE
            const doneEvent = `data: ${JSON.stringify({
              status: 'done',
              text: combinedText,
              message: 'Process completed successfully.'
            })}\n\n`;
            controller.enqueue(encoder.encode(doneEvent));
        } else {
             throw new Error("No text extracted from any file.");
        }

        controller.close();

      } catch (error) {
        console.error('❌ [Multi-Proxy] Critical error:', error);
        const errString = error instanceof Error ? error.message : String(error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: errString })}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}