// acts2context.js
// Tworzy tabelę 'context' BEZ kumulacji i BEZ embeddingów
// TYLKO czyste, oryginalne fragmenty do wyświetlania kontekstu
// Instalacja: npm install pg
// Uruchom: node acts2context.js

import fs from 'fs';
import pg from 'pg';

// ========== KONFIGURACJA ==========
const TEST_MODE = false; // true = 5 losowych z każdego pliku, false = wszystkie dane

const DB_URL = 'postgres://postgres:5f4-Jjbo1072_FE61.VzxO1uXoDd.dHh@tramway.proxy.rlwy.net:10971/railway';

// Definicja plików źródłowych
const SOURCE_FILES = [
  { path: './public/acts/KPA_articles.json', act: 'KPA' },
  { path: './public/acts/KPC_articles.json', act: 'KPC' },
  { path: './public/acts/KPE_articles.json', act: 'KPE' },
  { path: './public/acts/KPK_articles.json', act: 'KPK' },
  { path: './public/acts/SUS_articles.json', act: 'SUS' }
];

// Losowy wybór elementów z tablicy
function getRandomItems(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Liczenie tokenów (przybliżone)
function countTokens(text) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).length;
  const chars = text.length;
  const tokenEstimate = Math.max(
    Math.ceil(words * 1.3),
    Math.ceil(chars / 4)
  );
  return tokenEstimate;
}

// Czyszczenie oryginalnego tekstu - usuwa tylko §None.
function cleanOriginalText(text) {
  if (!text) return '';
  let cleaned = text.replace(/§\s*None\.\s*/gi, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

// Wczytaj wszystkie pliki
function loadAllData() {
  console.log('📖 Wczytywanie danych...\n');
  const allData = [];

  for (const { path, act } of SOURCE_FILES) {
    if (!fs.existsSync(path)) {
      console.warn(`⚠️  Plik nie istnieje: ${path}, pomijam...`);
      continue;
    }

    let data = JSON.parse(fs.readFileSync(path, 'utf8'));

    if (TEST_MODE) {
      data = getRandomItems(data, 5);
      console.log(`🧪 TEST MODE: ${act} - ${data.length} losowych rekordów`);
    } else {
      console.log(`📚 ${act} - ${data.length} rekordów`);
    }

    // Dodaj akt i przetworz dane
    data.forEach(item => {
      const processed = {
        act,
        art_no: item.art_index ? `${item.art_no}(${item.art_index})` : item.art_no,
        par_no: item.par_no === 'None' || item.par_no === null ? null :
                (item.par_index && item.par_index !== 'None'
                  ? `${item.par_no}(${item.par_index})`
                  : item.par_no),
        pkt_no: item.pkt_no === 'None' || item.pkt_no === null ? null : item.pkt_no,
        text: cleanOriginalText(item.text),
        text_clean: item.text || ''
      };

      // Usuń prefixy z text_clean
      processed.text_clean = processed.text_clean
        .replace(/^Art\.\s*\d+[a-z]*\.\s*/i, '')
        .replace(/§\s*\d+[a-z]*\.\s*/gi, '')
        .replace(/^\d+\)\s*/gm, '')
        .replace(/§\s*None\.\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      processed.token_count = countTokens(processed.text_clean);

      // Filtruj uchylone
      if (!processed.text_clean.toLowerCase().includes('uchylony')) {
        allData.push(processed);
      }
    });
  }

  console.log(`\n✅ Załadowano łącznie: ${allData.length} rekordów`);
  return allData;
}

// Sortuj naturalnie - NULL na początku, potem według kolejności naturalnej
function sortNaturally(data) {
  console.log('\n🔢 Sortowanie danych...');

  const actOrder = { 'KPA': 1, 'KPC': 2, 'KPE': 3, 'KPK': 4, 'SUS': 5 };

  const sorted = [...data].sort((a, b) => {
    // 1. Sortuj po akcie
    if (actOrder[a.act] !== actOrder[b.act]) {
      return actOrder[a.act] - actOrder[b.act];
    }

    // 2. Sortuj po art_no (numerycznie)
    const artA = a.art_no || '';
    const artB = b.art_no || '';
    const numA = parseInt(artA.match(/^\d+/)?.[0] || '0');
    const numB = parseInt(artB.match(/^\d+/)?.[0] || '0');
    if (numA !== numB) return numA - numB;
    if (artA !== artB) return artA.localeCompare(artB);

    // 3. NULL par_no ZAWSZE na początku
    const parA = a.par_no;
    const parB = b.par_no;
    if (parA === null && parB !== null) return -1;
    if (parA !== null && parB === null) return 1;

    // 4. Sortuj par_no numerycznie
    if (parA && parB) {
      const parNumA = parseInt(parA.match(/^\d+/)?.[0] || '0');
      const parNumB = parseInt(parB.match(/^\d+/)?.[0] || '0');
      if (parNumA !== parNumB) return parNumA - parNumB;
      if (parA !== parB) return parA.localeCompare(parB);
    }

    // 5. NULL pkt_no ZAWSZE na początku
    const pktA = a.pkt_no;
    const pktB = b.pkt_no;
    if (pktA === null && pktB !== null) return -1;
    if (pktA !== null && pktB === null) return 1;

    // 6. Sortuj pkt_no numerycznie
    if (pktA && pktB) {
      const pktNumA = parseInt(pktA) || 0;
      const pktNumB = parseInt(pktB) || 0;
      return pktNumA - pktNumB;
    }

    return 0;
  });

  console.log(`✅ Posortowano ${sorted.length} rekordów (NULL zawsze na początku)`);
  return sorted;
}

// Przygotuj bazę - stwórz tabelę context
async function setupDatabase(client) {
  console.log('\n🗄️  Przygotowanie bazy danych...');

  // Usuń tabelę jeśli istnieje
  await client.query('DROP TABLE IF EXISTS context CASCADE');
  console.log('✅ Usunięto starą tabelę context (jeśli istniała)');

  // Stwórz tabelę context (BEZ embedding!)
  await client.query(`
    CREATE TABLE context (
      id SERIAL PRIMARY KEY,
      act TEXT NOT NULL,
      art_no TEXT,
      par_no TEXT,
      pkt_no TEXT,
      text TEXT,
      text_clean TEXT,
      token_count INTEGER DEFAULT 0
    )
  `);
  console.log('✅ Utworzono tabelę context (bez embeddingów, bez kumulacji)');

  // Dodaj indeksy dla szybszego wyszukiwania
  await client.query('CREATE INDEX idx_context_act ON context(act)');
  await client.query('CREATE INDEX idx_context_art ON context(act, art_no)');
  await client.query('CREATE INDEX idx_context_full ON context(act, art_no, par_no, pkt_no)');
  console.log('✅ Utworzono indeksy');
}

// Załaduj dane do bazy
async function loadToDatabase(client, data) {
  console.log(`\n📥 Ładowanie danych do tabeli context...`);

  const batchSize = 1000;
  let loaded = 0;

  await client.query('BEGIN');

  try {
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      const values = [];
      const placeholders = [];
      let paramIndex = 1;

      batch.forEach((item) => {
        placeholders.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`
        );
        values.push(
          item.act,
          item.art_no || null,
          item.par_no || null,
          item.pkt_no || null,
          item.text,
          item.text_clean || null,
          item.token_count || 0
        );
        paramIndex += 7;
      });

      const query = `
        INSERT INTO context (act, art_no, par_no, pkt_no, text, text_clean, token_count)
        VALUES ${placeholders.join(', ')}
      `;

      await client.query(query, values);
      loaded += batch.length;

      console.log(`  ... ${loaded}/${data.length} (${((loaded/data.length)*100).toFixed(1)}%)`);
    }

    await client.query('COMMIT');
    console.log(`✅ Załadowano ${loaded} rekordów do context`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

// Główna funkcja
(async () => {
  console.log('🚀 START: Generowanie tabeli context\n');
  console.log(`🧪 Tryb: ${TEST_MODE ? 'TEST (5 losowych z każdego)' : 'FULL (wszystkie dane)'}`);
  console.log(`📝 Tabela: context (BEZ kumulacji, BEZ embeddingów - TYLKO czyste dane)\n`);

  const startTime = Date.now();

  try {
    // ===== KROK 1: Wczytaj dane (WSZYSTKIE oryginalne) =====
    const allData = loadAllData();

    // ===== KROK 2: Sortuj (NULL na początku artykułu/paragrafu) =====
    const sortedData = sortNaturally(allData);

    // ===== KROK 3: Zapis do bazy =====
    console.log('\n🔌 Łączenie z bazą danych...');
    const client = new pg.Client({ connectionString: DB_URL });
    await client.connect();
    console.log('✅ Połączono z bazą');

    await setupDatabase(client);
    await loadToDatabase(client, sortedData);

    await client.end();
    console.log('\n✅ Zamknięto połączenie z bazą');

    // ===== PODSUMOWANIE =====
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ GOTOWE w ${duration}s!`);

    console.log(`\n📊 TABELA: context`);
    console.log(`   Liczba rekordów: ${sortedData.length} (TYLKO oryginalne, bez kumulacji)`);

    const avgTokens = Math.round(sortedData.reduce((sum, e) => sum + (e.token_count || 0), 0) / sortedData.length);
    const maxTokens = Math.max(...sortedData.map(e => e.token_count || 0));
    console.log(`   Średnia tokenów: ${avgTokens}, Max: ${maxTokens}`);

    const byAct = {};
    sortedData.forEach(item => {
      byAct[item.act] = (byAct[item.act] || 0) + 1;
    });
    console.log(`\n   Rozkład po aktach:`);
    Object.entries(byAct).forEach(([act, count]) => {
      console.log(`   - ${act}: ${count} rekordów`);
    });

    console.log(`\n🗄️  Baza danych gotowa - tabela 'context' (czyste dane, NULL na początku)`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('\n❌ BŁĄD:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();