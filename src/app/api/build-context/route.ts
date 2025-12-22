// PLIK: src/app/api/build-context/route.ts
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 1. Funkcja czyszcząca tekst (naprawia błąd "ucyjne;ent")
function sanitizeContent(text: string | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// 2. Funkcja budująca oznaczenie artykułu (np. "Art. 10 § 1")
function buildLabel(row: any): string {
  const parts = [];

  if (row.art_no) parts.push(`Art. ${row.art_no}`);
  if (row.par_no && row.par_no !== 'cumulated') parts.push(`§ ${row.par_no}`);
  if (row.pkt_no && row.pkt_no !== 'cumulated' && row.pkt_no !== 'moved') parts.push(`pkt ${row.pkt_no}`);

  return parts.join(' ');
}

export async function POST(req: Request) {
  try {
    const { cumulatedIds, actsIds } = await req.json();

    const cIds = Array.isArray(cumulatedIds) ? cumulatedIds : [];
    const aIds = Array.isArray(actsIds) ? actsIds : [];

    if (cIds.length === 0 && aIds.length === 0) {
      return NextResponse.json({ context: '' });
    }

    let contextParts: string[] = [];

    // --- POBIERANIE Z ACTS_CUMULATED ---
    if (cIds.length > 0) {
      // WAŻNE: Dodaliśmy art_no, par_no, pkt_no do SELECT
      const sqlCumulated = `
        SELECT id, act, art_no, par_no, pkt_no, text_clean, text
        FROM acts_cumulated
        WHERE id = ANY($1::int[])
      `;
      const { rows: cumulatedRows } = await pool.query(sqlCumulated, [cIds]);

      const cumulatedContext = cumulatedRows.map(row => {
        const label = buildLabel(row);
        const content = sanitizeContent(row.text_clean || row.text);

        // Format: id -> oznaczenie -> akt
        return `<dokument id="${row.id}" oznaczenie="${label}" akt="${row.act || 'KPA'}">
${content}
</dokument>`;
      });
      contextParts = [...contextParts, ...cumulatedContext];
    }

    // --- POBIERANIE Z ACTS (DETAILED) ---
    if (aIds.length > 0) {
      // WAŻNE: Dodaliśmy art_no, par_no, pkt_no do SELECT
      const sqlActs = `
        SELECT id, act, art_no, par_no, pkt_no, text_clean, text
        FROM acts
        WHERE id = ANY($1::int[])
      `;
      const { rows: actsRows } = await pool.query(sqlActs, [aIds]);

      const actsContext = actsRows.map(row => {
        const label = buildLabel(row);
        const content = sanitizeContent(row.text_clean || row.text);

        // Format: id -> oznaczenie -> akt
        return `<dokument id="${row.id}" oznaczenie="${label}" akt="${row.act || 'KPA'}">
${content}
</dokument>`;
      });
      contextParts = [...contextParts, ...actsContext];
    }

    const fullContext = contextParts.join('\n\n');

    return NextResponse.json({ context: fullContext });

  } catch (error) {
    console.error("❌ Context Builder Error:", error);
    return NextResponse.json({ error: "Błąd budowania kontekstu" }, { status: 500 });
  }
}