// PLIK: src/app/api/acts-search/route.ts
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getVoyageEmbedding(text: string): Promise<number[]> {
  const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY || process.env.NEXT_PUBLIC_VOYAGE_API_KEY;
  if (!VOYAGE_API_KEY) throw new Error('Brak klucza API Voyage');

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_API_KEY}`
    },
    body: JSON.stringify({
      input: [text],
      model: 'voyage-law-2'
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Voyage API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Helper do mapowania wyników
const mapRow = (row: any, type: string) => {
  const titleParts = [];
  if (row.act) titleParts.push(row.act);
  if (row.art_no) titleParts.push(`Art. ${row.art_no}`);

  // Ukrywamy par/pkt jeśli są oznaczone jako 'cumulated' lub 'moved'
  if (row.par_no && row.par_no !== 'cumulated' && row.par_no !== 'moved') {
    titleParts.push(`§ ${row.par_no}`);
  }
  if (row.pkt_no && row.pkt_no !== 'cumulated' && row.pkt_no !== 'moved') {
    titleParts.push(`pkt ${row.pkt_no}`);
  }

  return {
    id: row.id.toString(),
    type: type, // 'c' dla cumulated, 's' dla single
    act: row.act,
    article: row.art_no,
    paragraph: (row.par_no === 'cumulated' || row.par_no === 'moved') ? null : row.par_no,
    point: (row.pkt_no === 'cumulated' || row.pkt_no === 'moved') ? null : row.pkt_no,
    title: titleParts.join(' ') || 'Fragment aktu prawnego',
    content: row.text,
    text_clean: row.text_clean,
    relevance_score: row.similarity
  };
};

export async function POST(req: Request) {
  try {
    const { query, selectedActs } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Brak zapytania" }, { status: 400 });
    }

    console.log('\n==================== [API SEARCH START] ====================');
    console.log('🔍 Pytanie:', query);
    console.log('📚 Wybrane akty:', selectedActs || 'wszystkie');

    // 1. Generowanie embeddingu
    const queryEmbedding = await getVoyageEmbedding(query);
    const vectorString = JSON.stringify(queryEmbedding);

    // 2. Przygotowanie warunku filtrowania aktów
    let actFilter = '';
    let actFilterParams: any[] = [vectorString];

    if (selectedActs && selectedActs.length > 0) {
      // Filtrujemy tylko po wybranych aktach
      actFilter = `AND act = ANY($2::text[])`;
      actFilterParams.push(selectedActs);
    }

    // 3. Przygotowanie zapytań wektorowych (RÓWNOLEGLE)
    // WSZYSTKO Z JEDNEJ TABELI: acts_cumulated

    // A. SKUMULOWANE: gdzie par_no='cumulated' LUB pkt_no='cumulated'
    const sqlCumulatedSearch = `
      SELECT id, act, art_no, par_no, pkt_no, text, text_clean,
             1 - (embedding <=> $1::vector) as similarity
      FROM acts_cumulated
      WHERE (par_no = 'cumulated' OR pkt_no = 'cumulated')
      ${actFilter}
      ORDER BY embedding <=> $1::vector
      LIMIT 10;
    `;

    // B. POJEDYNCZE: gdzie ani par_no ani pkt_no NIE są 'cumulated'
    const sqlSingleSearch = `
      SELECT id, act, art_no, par_no, pkt_no, text, text_clean,
             1 - (embedding <=> $1::vector) as similarity
      FROM acts_cumulated
      WHERE COALESCE(par_no, '') != 'cumulated'
        AND COALESCE(pkt_no, '') != 'cumulated'
      ${actFilter}
      ORDER BY embedding <=> $1::vector
      LIMIT 10;
    `;

    // 4. Wykonanie obu wyszukiwań równolegle
    const [resCumulated, resSingle] = await Promise.all([
      pool.query(sqlCumulatedSearch, actFilterParams),
      pool.query(sqlSingleSearch, actFilterParams)
    ]);

    console.log(`\n📊 WYNIKI WEKTOROWE (z acts_cumulated):`);
    console.log(`   • Skumulowane (par_no/pkt_no='cumulated'): ${resCumulated.rows.length}`);
    console.log(`   • Pojedyncze (bez 'cumulated'): ${resSingle.rows.length}`);

    console.log(`\n📊 WYNIKI WEKTOROWE (z acts_cumulated):`);
    console.log(`   • Skumulowane (par_no/pkt_no='cumulated'): ${resCumulated.rows.length}`);
    console.log(`   • Pojedyncze (bez 'cumulated'): ${resSingle.rows.length}`);

    // 4. Przetwarzanie wyników - proste mapowanie bez dekompozycji
    const cumulatedResults = resCumulated.rows.map(row => mapRow(row, 'c'));
    const singleResults = resSingle.rows.map(row => mapRow(row, 's'));

    console.log(`\n✅ Przetworzono:`);
    console.log(`   • ${cumulatedResults.length} wyników skumulowanych (type: c)`);
    console.log(`   • ${singleResults.length} wyników pojedynczych (type: s)`);

    const responseData = {
      cumulated: cumulatedResults,
      detailed: singleResults
    };

    console.log('\n📤 ZWRACANA ODPOWIEDŹ:');
    console.log(JSON.stringify(responseData, null, 2));
    console.log('==================== [API SEARCH END] ====================\n');

    return NextResponse.json(responseData);

  } catch (error) {
    console.error("❌ Database Search API Error:", error);
    return NextResponse.json({
        error: "Błąd serwera bazy danych",
        details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}