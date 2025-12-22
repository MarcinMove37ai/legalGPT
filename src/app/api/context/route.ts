// PLIK: src/app/api/context/route.ts
// WERSJA 3.0 - Pobiera CAŁY artykuł zamiast 3+1+3
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: Request) {
  try {
    const { act, article, paragraph, point } = await req.json();

    console.log('\n==================== [API CONTEXT START] ====================');
    console.log('🔍 Żądanie kontekstu dla:');
    console.log(`   Act: ${act || 'NULL'}`);
    console.log(`   Art (input): ${article || 'NULL'}`);
    console.log(`   Par (input): ${paragraph || 'NULL'}`);
    console.log(`   Pkt (input): ${point || 'NULL'}`);

    if (!act || !article) {
      return NextResponse.json(
        { error: "Brak wymaganych parametrów: act i article" },
        { status: 400 }
      );
    }

    // =========================================================================
    // KROK 1: Znajdź artykuł z obsługą FALLBACK dla art_no
    // =========================================================================

    let foundArticleVariant = null;
    let allFragments: any[] = [];

    // Próbujemy 4 warianty art_no:
    // i=0: Oryginał (np. "115320")
    // i=1: Ostatni znak w nawias (np. "11532(0)")
    // i=2: Ostatnie 2 znaki w nawias (np. "1153(20)")
    // i=3: Ostatnie 3 znaki w nawias (np. "115(320)")

    for (let i = 0; i <= 3; i++) {
      let candidateArticle = article;

      if (i > 0) {
        if (article.length <= i) break;
        const mainPart = article.slice(0, article.length - i);
        const parenPart = article.slice(article.length - i);
        candidateArticle = `${mainPart}(${parenPart})`;
      }

      console.log(`\n🔍 Próba ${i + 1}/4: Szukam Art. "${candidateArticle}"...`);

      // Pobierz WSZYSTKIE fragmenty artykułu
      const sql = `
        SELECT id, act, art_no, par_no, pkt_no, text, text_clean
        FROM context
        WHERE act = $1 AND art_no = $2
        ORDER BY id ASC;
      `;

      const result = await pool.query(sql, [act, candidateArticle]);

      if (result.rows.length > 0) {
        allFragments = result.rows;
        foundArticleVariant = candidateArticle;
        console.log(`✅ SUKCES! Znaleziono ${allFragments.length} fragmentów artykułu "${candidateArticle}"`);
        break;
      } else {
        console.log(`   Nie znaleziono.`);
      }
    }

    if (allFragments.length === 0) {
      console.log('❌ Ostatecznie nie znaleziono artykułu po wszystkich próbach.');
      console.log('==================== [API CONTEXT END] ====================\n');
      return NextResponse.json({
        fragments: [],
        highlightParagraph: null,
        highlightPoint: null
      });
    }

    // =========================================================================
    // KROK 2: Znajdź pasujący fragment i wyekstrahuj DOKŁADNE wartości par_no/pkt_no
    // =========================================================================

    let highlightParagraph: string | null = null;
    let highlightPoint: string | null = null;

    console.log(`\n🔍 Szukam fragmentu do zaznaczenia:`);
    console.log(`   paragraph (input): "${paragraph || 'NULL'}"`);
    console.log(`   point (input): "${point || 'NULL'}"`);

    if (paragraph) {
      // KROK A: Znajdź fragment który pasuje do inputowego paragraph
      // Próbujemy różnych wariantów (z nawiasami, bez, cyfry rzymskie)
      const matchingFragment = allFragments.find(f => {
        if (!f.par_no || f.par_no === 'cumulated' || f.par_no === 'moved') {
          return false;
        }

        // Porównaj różne warianty:
        return f.par_no === paragraph ||           // "1" === "1"
               f.par_no === `(${paragraph})` ||    // "(1)" vs "1"
               f.par_no === paragraph.replace(/[()]/g, '') || // "1" vs "(1)"
               f.par_no.replace(/[()]/g, '') === paragraph.replace(/[()]/g, ''); // normalize both
      });

      if (matchingFragment) {
        // UŻYJ DOKŁADNEJ WARTOŚCI Z BAZY
        highlightParagraph = matchingFragment.par_no;
        console.log(`✅ Znaleziono paragraf w bazie: "${highlightParagraph}"`);

        // KROK B: Jeśli jest point, znajdź go też
        if (point) {
          const matchingPoint = allFragments.find(f =>
            f.par_no === highlightParagraph &&
            f.pkt_no &&
            f.pkt_no !== 'cumulated' &&
            f.pkt_no !== 'moved' &&
            f.pkt_no === point
          );

          if (matchingPoint) {
            highlightPoint = matchingPoint.pkt_no;
            console.log(`✅ Znaleziono punkt w bazie: "${highlightPoint}"`);
          } else {
            console.log(`⚠️ Nie znaleziono punktu: "${point}"`);
          }
        }
      } else {
        console.log(`⚠️ Nie znaleziono paragrafu pasującego do: "${paragraph}"`);
        console.log(`   Dostępne par_no w fragmentach:`);
        allFragments.forEach(f => {
          if (f.par_no && f.par_no !== 'cumulated' && f.par_no !== 'moved') {
            console.log(`     - "${f.par_no}"`);
          }
        });
      }
    } else {
      console.log(`ℹ️ Brak paragrafu - zaznaczamy tytuł artykułu`);
    }

    // =========================================================================
    // KROK 3: Formatowanie wyników
    // =========================================================================

    const formatRow = (row: any) => ({
      id: row.id.toString(),
      act: row.act,
      art_no: row.art_no,
      par_no: row.par_no,
      pkt_no: row.pkt_no,
      text: row.text,
      text_clean: row.text_clean
    });

    const response = {
      fragments: allFragments.map(formatRow),
      highlightParagraph: highlightParagraph,
      highlightPoint: highlightPoint
    };

    console.log('\n📦 WYNIK:');
    console.log(`   Artykuł: ${foundArticleVariant}`);
    console.log(`   Fragmentów: ${response.fragments.length}`);
    if (highlightParagraph && highlightPoint) {
      console.log(`   Zaznacz: § ${highlightParagraph} pkt ${highlightPoint} (TYLKO PUNKT)`);
    } else if (highlightParagraph) {
      console.log(`   Zaznacz: CAŁY § ${highlightParagraph} (wraz z punktami)`);
    } else {
      console.log(`   Zaznacz: Tytuł artykułu`);
    }

    // Log fragmentów z oznaczeniem co będzie podświetlone
    allFragments.forEach(row => {
      const label = formatLabel(row);
      const hasRealPar = row.par_no && row.par_no !== 'cumulated' && row.par_no !== 'moved';
      const hasRealPkt = row.pkt_no && row.pkt_no !== 'cumulated' && row.pkt_no !== 'moved';

      let isHighlight = false;
      if (!highlightParagraph && !highlightPoint) {
        // Zaznacz tytuł artykułu
        isHighlight = !hasRealPar && !hasRealPkt;
      } else if (highlightPoint) {
        // Zaznacz konkretny punkt
        isHighlight = hasRealPar && hasRealPkt &&
                     row.par_no === highlightParagraph &&
                     row.pkt_no === highlightPoint;
      } else if (highlightParagraph) {
        // Zaznacz cały paragraf (z punktami)
        isHighlight = hasRealPar && row.par_no === highlightParagraph;
      }

      console.log(`   ${isHighlight ? '► ' : '  '}${label}`);
    });

    console.log('==================== [API CONTEXT END] ====================\n');

    return NextResponse.json(response);

  } catch (error) {
    console.error("❌ Context API Error:", error);
    return NextResponse.json(
      { error: "Błąd serwera bazy danych" },
      { status: 500 }
    );
  }
}

// Funkcja pomocnicza do formatowania etykiet w logach
function formatLabel(row: any): string {
  const parts = [];
  if (row.act) parts.push(row.act);
  if (row.art_no) parts.push(`Art. ${row.art_no}`);
  if (row.par_no && row.par_no !== 'cumulated' && row.par_no !== 'moved') {
    parts.push(`§ ${row.par_no}`);
  }
  if (row.pkt_no && row.pkt_no !== 'cumulated' && row.pkt_no !== 'moved') {
    parts.push(`pkt ${row.pkt_no}`);
  }
  return parts.join(' ') || `ID: ${row.id}`;
}