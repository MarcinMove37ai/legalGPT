import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

export async function GET() {
  try {
    // Sprawdź czy folder istnieje
    if (!existsSync(UPLOAD_DIR)) {
      return NextResponse.json({
        exists: false,
        upload_dir: UPLOAD_DIR,
        cwd: process.cwd(),
        message: 'Folder uploads nie istnieje'
      });
    }

    // Lista plików
    const files = await readdir(UPLOAD_DIR);

    const fileDetails = await Promise.all(
      files.map(async (filename) => {
        const filepath = path.join(UPLOAD_DIR, filename);
        const stats = await stat(filepath);
        return {
          name: filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          isDirectory: stats.isDirectory()
        };
      })
    );

    return NextResponse.json({
      exists: true,
      upload_dir: UPLOAD_DIR,
      cwd: process.cwd(),
      count: fileDetails.length,
      files: fileDetails
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Błąd odczytu',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}