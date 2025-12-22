// acts2db_law2.js
// Voyage AI - model voyage-law-2 (1024 dimensions)
// Instalacja: npm install node-fetch pg
// Uruchom: VOYAGE_API_KEY=pa-... node acts2db_law2.js

import fetch from 'node-fetch';
import fs from 'fs';
import pg from 'pg';

// ========== KONFIGURACJA ==========
const TEST_MODE = false; // true = 5 losowych z każdego pliku, false = wszystkie dane
const GENERATE_EMBEDDINGS = false; // true = generuj embeddingi (wymaga API key), false = tylko struktura danych
const MIN_TOKEN_COUNT_FOR_ACTS = 20; // Embeduj tylko acts gdzie token_count >= ta wartość (0 = wszystkie)
const MIN_TOKEN_COUNT_FOR_CUMULATED = 10; // Embeduj tylko acts_cumulated gdzie token_count >= ta wartość (0 = wszystkie)

// Voyage AI API limits (voyage-law-2):
// - Free tier: 50M tokenów
// - Rate limits (Tier 1): 2000 RPM, 8M TPM
// - Max tokens per request: 120K
// - Max batch size: 128 items
// - Pricing: $0.12 per 1M tokens (po wykorzystaniu free tier)

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const MODEL = 'voyage-law-2'; // 1024 dimensions
const DB_URL = 'postgres://postgres:5f4-Jjbo1072_FE61.VzxO1uXoDd.dHh@tramway.proxy.rlwy.net:10971/railway';

// Definicja plików źródłowych
const SOURCE_FILES = [
  { path: './public/acts/KPA_articles.json', act: 'KPA' },
  { path: './public/acts/KPC_articles.json', act: 'KPC' },
  { path: './public/acts/KPE_articles.json', act: 'KPE' },
  { path: './public/acts/KPK_articles.json', act: 'KPK' },
  { path: './public/acts/SUS_articles.json', act: 'SUS' }
];

if (GENERATE_EMBEDDINGS && !VOYAGE_API_KEY) {
  console.error('❌ Brak VOYAGE_API_KEY w zmiennych środowiskowych!');
  console.log('Użyj: VOYAGE_API_KEY=pa-... node acts2db_law2.js');
  process.exit(1);
}

// Losowy wybór elementów z tablicy
function getRandomItems(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Liczenie tokenów (przybliżone jak Voyage AI)
// Voyage używa własnego tokenizera, to jest aproksymacja
function countTokens(text) {
  if (!text) return 0;

  // Voyage tokenizer jest podobny do GPT - ~1.3 tokena na słowo dla języka polskiego
  // Dokładniejsze byłoby użycie tiktoken, ale to wystarczające przybliżenie
  const words = text.trim().split(/\s+/).length;
  const chars = text.length;

  // Heurystyka: bierzemy większą z wartości
  // - słowa * 1.3 (dla tekstu z długimi słowami)
  // - znaki / 4 (dla tekstu z krótkimi słowami/liczbami)
  const tokenEstimate = Math.max(
    Math.ceil(words * 1.3),
    Math.ceil(chars / 4)
  );

  return tokenEstimate;
}

// Czyszczenie oryginalnego tekstu - usuwa tylko §None. (zachowuje numerację Art./§/punkty)
function cleanOriginalText(text) {
  if (!text) return '';

  // Usuń wszystkie wystąpienia §None. (na początku lub w środku)
  let cleaned = text.replace(/§\s*None\.\s*/gi, '');

  // Usuń nadmiarowe spacje
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

// Wczytaj wszystkie pliki
function loadAllData() {
  const allData = [];

  for (const { path, act } of SOURCE_FILES) {
    if (!fs.existsSync(path)) {
      console.warn(`⚠️  Plik nie istnieje: ${path}, pomijam...`);
      continue;
    }

    let data = JSON.parse(fs.readFileSync(path, 'utf8'));

    // Tryb testowy - 5 losowych
    if (TEST_MODE) {
      data = getRandomItems(data, 5);
      console.log(`🧪 TEST MODE: ${act} - ${data.length} losowych rekordów`);
    } else {
      console.log(`📚 ${act} - ${data.length} rekordów`);
    }

    // Dodaj pole 'act', scal indeksy, wyczyść teksty, policz tokeny i FILTRUJ
    data.forEach(item => {
      item.act = act;

      // Scal art_no + art_index jeśli art_index istnieje
      if (item.art_index && item.art_index !== null && item.art_index !== 'null') {
        item.art_no = `${item.art_no}${item.art_index}`;
      }

      // Scal par_no + par_index jeśli par_index istnieje
      if (item.par_index && item.par_index !== null && item.par_index !== 'null') {
        item.par_no = `${item.par_no}${item.par_index}`;
      }

      item.text = cleanOriginalText(item.text); // Usuń §None. z oryginalnego tekstu
      item.text_clean = cleanText(item.text); // Pełne czyszczenie dla embeddingu
      item.token_count = countTokens(item.text_clean); // Liczba tokenów dla embeddingu

      // FILTRUJ: pomijaj rekordy bez art_no lub uchylone
      if (item.art_no && item.text_clean !== '(uchylony)') {
        allData.push(item);
      }
    });
  }

  return allData;
}

// Kumulacja danych według reguł
function cumulateData(data) {
  console.log('\n🔄 Kumulacja danych według reguł...');

  // Grupuj dane po act + art_no
  const grouped = {};

  data.forEach(item => {
    const key = `${item.act}|${item.art_no}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(item);
  });

  const cumulated = [];

  // Przetwórz każdą grupę artykułów
  Object.entries(grouped).forEach(([key, items]) => {
    const [act, art_no] = key.split('|');

    // FILTRUJ: pomijaj rekordy uchylone
    const validItems = items.filter(i => i.text_clean !== '(uchylony)');

    if (validItems.length === 0) return; // Pomiń jeśli wszystkie uchylone

    // Sprawdź co występuje w tej grupie
    const hasPar = validItems.some(i => i.par_no !== null && i.par_no !== 'null');
    const hasPkt = validItems.some(i => i.pkt_no !== null && i.pkt_no !== 'null');

    if (!hasPar && !hasPkt) {
      // Brak par i pkt - zostaw jako jeden rekord
      // NATURALNA KOLEJNOŚĆ - bez sortowania
      const combinedText = validItems.map(i => i.text).join(' ');
      const combinedClean = validItems.map(i => i.text_clean).join(' ');

      const combined = {
        act,
        art_no,
        par_no: null,
        pkt_no: null,
        text: combinedText,
        text_clean: combinedClean,
        token_count: countTokens(combinedClean)
      };
      cumulated.push(combined);

    } else if (!hasPar && hasPkt) {
      // REGUŁA 1: Wszystkie par_no = null, ale są różne pkt_no
      // Sortuj: null na początku, potem naturalnie według id
      const sorted = [...validItems].sort((a, b) => {
        const aIsNull = a.pkt_no === null || a.pkt_no === 'null';
        const bIsNull = b.pkt_no === null || b.pkt_no === 'null';

        if (aIsNull && !bIsNull) return -1; // null idzie na początek
        if (!aIsNull && bIsNull) return 1;
        return 0; // zachowaj naturalną kolejność (id)
      });

      const combinedText = sorted.map(i => i.text).join(' ');
      const combinedClean = sorted.map(i => i.text_clean).join(' ');

      // Określ czy to prawdziwa kumulacja czy przeniesienie
      const isTrueCumulation = validItems.length > 1;

      const combined = {
        act,
        art_no,
        par_no: null,
        pkt_no: isTrueCumulation ? 'cumulated' : 'moved',
        text: combinedText,
        text_clean: combinedClean,
        token_count: countTokens(combinedClean)
      };
      cumulated.push(combined);

    } else if (hasPar && !hasPkt) {
      // REGUŁA 2: Wszystkie pkt_no = null, ale są różne par_no
      // Sortuj: null na początku, potem naturalnie według id
      const sorted = [...validItems].sort((a, b) => {
        const aIsNull = a.par_no === null || a.par_no === 'null';
        const bIsNull = b.par_no === null || b.par_no === 'null';

        if (aIsNull && !bIsNull) return -1; // null idzie na początek
        if (!aIsNull && bIsNull) return 1;
        return 0; // zachowaj naturalną kolejność (id)
      });

      const combinedText = sorted.map(i => i.text).join(' ');
      const combinedClean = sorted.map(i => i.text_clean).join(' ');

      // Określ czy to prawdziwa kumulacja czy przeniesienie
      const isTrueCumulation = validItems.length > 1;

      const combined = {
        act,
        art_no,
        par_no: isTrueCumulation ? 'cumulated' : 'moved',
        pkt_no: null,
        text: combinedText,
        text_clean: combinedClean,
        token_count: countTokens(combinedClean)
      };
      cumulated.push(combined);

    } else {
      // REGUŁA 3: Występują zarówno par_no i pkt_no
      // Kumuluj punkty OSOBNO dla każdego paragrafu W NATURALNEJ KOLEJNOŚCI
      const byPar = {};

      validItems.forEach(item => {
        const parKey = item.par_no || 'null';
        if (!byPar[parKey]) {
          byPar[parKey] = [];
        }
        byPar[parKey].push(item);
      });

      Object.entries(byPar).forEach(([par_no, parItems]) => {
        // Sortuj: null na początku, potem naturalnie według id
        const sorted = [...parItems].sort((a, b) => {
          const aIsNull = a.pkt_no === null || a.pkt_no === 'null';
          const bIsNull = b.pkt_no === null || b.pkt_no === 'null';

          if (aIsNull && !bIsNull) return -1; // null idzie na początek
          if (!aIsNull && bIsNull) return 1;
          return 0; // zachowaj naturalną kolejność (id)
        });

        const combinedText = sorted.map(i => i.text).join(' ');
        const combinedClean = sorted.map(i => i.text_clean).join(' ');

        // Określ czy to prawdziwa kumulacja czy przeniesienie
        const isTrueCumulation = parItems.length > 1;

        const combined = {
          act,
          art_no,
          par_no: par_no === 'null' ? null : par_no,
          pkt_no: isTrueCumulation ? 'cumulated' : 'moved',
          text: combinedText,
          text_clean: combinedClean,
          token_count: countTokens(combinedClean)
        };
        cumulated.push(combined);
      });
    }
  });

  console.log(`✅ Kumulacja: ${data.length} → ${cumulated.length} rekordów`);
  return cumulated;
}

// Usuń duplikaty z acts (rekordy które są w cumulated jako "moved")
function removeDuplicatesFromActs(actsData, cumulatedData) {
  console.log('\n🔍 Usuwanie duplikatów z tabeli acts...');

  // Zbuduj Set kluczy z cumulated gdzie status="moved"
  const movedKeys = new Set();

  cumulatedData.forEach(item => {
    // "moved" oznacza że był tylko 1 rekord (pseudo-kumulacja)
    // Musimy usunąć odpowiednie rekordy z acts

    if (item.pkt_no === 'moved') {
      // Paragraf został "przeniesiony" (był tylko 1 rekord w tym paragrafie)
      // Usuń z acts wszystkie rekordy z tym act+art_no+par_no
      const key = `${item.act}|${item.art_no}|${item.par_no || 'null'}`;
      movedKeys.add(key);
    }

    if (item.par_no === 'moved') {
      // Artykuł został "przeniesiony" (był tylko 1 rekord w tym artykule)
      // Usuń z acts wszystkie rekordy z tym act+art_no gdzie par_no=null
      const key = `${item.act}|${item.art_no}|null`;
      movedKeys.add(key);
    }

    // Jeśli par_no=null i pkt_no=null (artykuł bez struktury)
    const parIsNull = item.par_no === null || item.par_no === 'null';
    const pktIsNull = item.pkt_no === null || item.pkt_no === 'null';
    if (parIsNull && pktIsNull) {
      // Cały artykuł bez podziału - usuń z acts
      const key = `${item.act}|${item.art_no}|null`;
      movedKeys.add(key);
    }
  });

  console.log(`   Znaleziono ${movedKeys.size} kluczy do usunięcia z acts (status "moved" lub bez struktury)`);

  // Filtruj acts - usuń rekordy które pasują do movedKeys
  const beforeCount = actsData.length;
  const filtered = actsData.filter(item => {
    // Zbuduj klucz dla tego rekordu
    const key = `${item.act}|${item.art_no}|${item.par_no || 'null'}`;

    // Zachowaj jeśli NIE jest w movedKeys
    return !movedKeys.has(key);
  });

  const removed = beforeCount - filtered.length;
  console.log(`🗑️  Usunięto ${removed} rekordów z acts (duplikaty "moved")`);

  return filtered;
}

// Czyszczenie tekstu dla embeddingu - usuwa wszystkie prefiksy Art./§/Punkt
// (text_clean służy wyłącznie do generowania embeddingów)
function cleanText(text) {
  if (!text) return '';

  let cleaned = text.trim();

  // KROK 1: Usuń pełny prefix "Art. XXX(yyy). §ZZZ(www). N)"
  // Obsługuje: Art. 479(13). §6. Do wniosku...
  //           Art. 111(m). §4. Gdy przejęcie...
  //           Art. 110(v). §5a. Organ egzekucyjny...
  cleaned = cleaned.replace(/^Art\.\s*\d+[a-z]*(\([^)]+\))?\.\s*§\s*\d+[a-z]*(\([^)]+\))?\.\s*/i, '');

  // KROK 2: Usuń sam prefix "Art. XXX."
  // Obsługuje: Art. 218. Sąd może...
  cleaned = cleaned.replace(/^Art\.\s*\d+[a-z]*(\([^)]+\))?\.\s*/i, '');
  cleaned = cleaned.replace(/^Artykuł\s*\d+[a-z]*(\([^)]+\))?\.\s*/i, '');

  // KROK 3: Usuń sam "§XXX." (jeśli został)
  // Obsługuje: §5. (uchylony)
  //           §2. W razie...
  cleaned = cleaned.replace(/^§\s*\d+[a-z]*(\([^)]+\))?\.\s*/i, '');

  // KROK 4: Usuń "§None." (specjalny przypadek - zarówno na początku jak i w środku)
  // Obsługuje: §None. h) adres siedziby,
  //           Art. 1. §None. 5) nakładanie...
  cleaned = cleaned.replace(/§\s*None\.\s*/gi, '');

  // KROK 5: Usuń punkty numeryczne/literowe na początku
  // Obsługuje: h) adres siedziby,
  //           2) kwota...
  //           9) oświadczenie...
  cleaned = cleaned.replace(/^[0-9]+[a-z]?[.)]\s*/i, '');
  cleaned = cleaned.replace(/^[a-z]+\)\s*/i, '');

  // KROK 6: Normalizacja spacji
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // KROK 7: Pierwsza litera wielka
  if (cleaned.length > 0 && /^[a-ząćęłńóśźż]/i.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // KROK 8: Jeśli wynik jest pusty lub bardzo krótki, zwróć oryginalny tekst
  if (!cleaned || cleaned.length < 3) {
    return text;
  }

  return cleaned;
}

// Voyage AI API call z retry logic
async function getEmbeddings(texts, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(VOYAGE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${VOYAGE_API_KEY}`
        },
        body: JSON.stringify({
          input: texts,
          model: MODEL
        })
      });

      if (!response.ok) {
        const error = await response.text();

        // Rate limit error - poczekaj i retry
        if (response.status === 429) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.warn(`⚠️  Rate limit hit, waiting ${waitTime/1000}s before retry ${attempt + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        throw new Error(`Voyage API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.data.map(item => item.embedding);

    } catch (error) {
      if (attempt === retries - 1) {
        throw error; // Ostatnia próba - rzuć błąd
      }

      console.warn(`⚠️  API error (attempt ${attempt + 1}/${retries}): ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

// Generuj embeddingi
async function generateEmbeddings(data, minTokenCount = 0, tableName = 'unknown') {
  // Jeśli nie generujemy embeddingów, po prostu zwróć dane bez nich
  if (!GENERATE_EMBEDDINGS) {
    console.log(`⏭️  Pomijam generowanie embeddingów dla ${tableName} (GENERATE_EMBEDDINGS = false)`);
    return data.map(item => ({
      ...item,
      embedding: null
    }));
  }

  // Filtruj dane według minTokenCount
  const toEmbed = minTokenCount > 0
    ? data.filter(item => (item.token_count || 0) >= minTokenCount)
    : data;

  const skipped = data.length - toEmbed.length;

  if (skipped > 0) {
    console.log(`⏭️  Pomijam ${skipped} rekordów z token_count < ${minTokenCount} w ${tableName}`);
  }

  console.log(`🤖 Generowanie embeddingów dla ${toEmbed.length} rekordów z ${tableName}...`);
  console.log(`   Limity API: 120K tokens/request, 8M tokens/min`);

  const results = [];
  const MAX_TOKENS_PER_REQUEST = 120000; // Voyage law-2 limit
  const MAX_BATCH_SIZE = 128;

  let currentBatch = [];
  let currentBatchTokens = 0;
  let processedCount = 0;
  let totalBatches = 0;

  // Dynamicznie twórz batche respektując limit 120K tokenów
  const batches = [];
  for (const item of toEmbed) {
    const itemTokens = item.token_count || 0;

    // Jeśli dodanie tego item przekroczy limit LUB osiągniemy max batch size
    if ((currentBatchTokens + itemTokens > MAX_TOKENS_PER_REQUEST) ||
        (currentBatch.length >= MAX_BATCH_SIZE)) {
      if (currentBatch.length > 0) {
        batches.push({ items: currentBatch, tokens: currentBatchTokens });
        currentBatch = [];
        currentBatchTokens = 0;
      }
    }

    currentBatch.push(item);
    currentBatchTokens += itemTokens;
  }

  // Dodaj ostatni batch
  if (currentBatch.length > 0) {
    batches.push({ items: currentBatch, tokens: currentBatchTokens });
  }

  totalBatches = batches.length;
  console.log(`   Utworzono ${totalBatches} batchy (avg ${Math.round(batches.reduce((s,b) => s + b.items.length, 0) / totalBatches)} items/batch)\n`);

  const startTime = Date.now();

  for (let i = 0; i < batches.length; i++) {
    const { items: batch, tokens: batchTokens } = batches[i];
    const batchNum = i + 1;

    console.log(`🔄 Batch ${batchNum}/${totalBatches} (${batch.length} items, ${batchTokens.toLocaleString()} tokens)...`);

    try {
      const textsToEmbed = batch.map(chunk => {
        const parts = [
          chunk.art_no ? `Artykuł ${chunk.art_no}` : '',
          chunk.par_no ? `Paragraf ${chunk.par_no}` : '',
          chunk.pkt_no ? `Punkt ${chunk.pkt_no}` : '',
          chunk.text_clean || chunk.text
        ].filter(Boolean);

        return parts.join('. ');
      });

      const embeddings = await getEmbeddings(textsToEmbed);

      for (let j = 0; j < batch.length; j++) {
        results.push({
          ...batch[j],
          embedding: embeddings[j]
        });
      }

      processedCount += batch.length;
      const progress = ((processedCount / toEmbed.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = Math.round(processedCount / (elapsed / 60)); // items per minute

      console.log(`✅ Batch ${batchNum} done | Progress: ${processedCount}/${toEmbed.length} (${progress}%) | ${elapsed}s elapsed | ~${rate} items/min`);

      // Brak delay - przy naszym wolumenie i limicie 8M TPM nie jest potrzebny
      // Voyage API radzi sobie z tym automatycznie

    } catch (error) {
      console.error(`❌ Błąd w batch ${batchNum}:`, error.message);
      // Dodaj bez embeddingów
      for (const chunk of batch) {
        results.push({ ...chunk, embedding: null });
      }
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgRate = Math.round(processedCount / (totalTime / 60));
  console.log(`\n✅ Embeddingi ${tableName} zakończone w ${totalTime}s (avg ${avgRate} items/min)\n`);

  // Scal wyniki z embeddingami z pominiętymi rekordami (embedding=null)
  if (minTokenCount > 0 && skipped > 0) {
    const embeddedMap = new Map();
    results.forEach(item => {
      const key = `${item.act}|${item.art_no}|${item.par_no}|${item.pkt_no}`;
      embeddedMap.set(key, item);
    });

    const finalResults = data.map(item => {
      const key = `${item.act}|${item.art_no}|${item.par_no}|${item.pkt_no}`;
      return embeddedMap.get(key) || { ...item, embedding: null };
    });

    return finalResults;
  }

  return results;
}

// Przygotuj bazę danych
async function setupDatabase(client) {
  console.log('\n🗄️  Przygotowanie bazy danych...');

  // Usuń tabele jeśli istnieją
  await client.query('DROP TABLE IF EXISTS acts_cumulated');
  await client.query('DROP TABLE IF EXISTS acts');
  console.log('✅ Usunięto stare tabele (jeśli istniały)');

  // Utwórz tabelę acts (szczegółowe chunki)
  await client.query(`
    CREATE TABLE acts (
      id SERIAL PRIMARY KEY,
      act TEXT NOT NULL,
      art_no TEXT,
      par_no TEXT,
      pkt_no TEXT,
      text TEXT NOT NULL,
      text_clean TEXT,
      token_count INTEGER,
      embedding JSONB
    )
  `);
  console.log('✅ Utworzono tabelę acts (szczegółowe chunki)');

  // Utwórz tabelę acts_cumulated (kumulowane według reguł)
  await client.query(`
    CREATE TABLE acts_cumulated (
      id SERIAL PRIMARY KEY,
      act TEXT NOT NULL,
      art_no TEXT,
      par_no TEXT,
      pkt_no TEXT,
      text TEXT NOT NULL,
      text_clean TEXT,
      token_count INTEGER,
      embedding JSONB
    )
  `);
  console.log('✅ Utworzono tabelę acts_cumulated (kumulowane)');

  // Dodaj indeksy
  await client.query('CREATE INDEX idx_acts_act ON acts(act)');
  await client.query('CREATE INDEX idx_acts_art_no ON acts(act, art_no)');
  await client.query('CREATE INDEX idx_acts_cumulated_act ON acts_cumulated(act)');
  await client.query('CREATE INDEX idx_acts_cumulated_art_no ON acts_cumulated(act, art_no)');
  console.log('✅ Utworzono indeksy');
}

// Załaduj dane do bazy
async function loadToDatabase(client, data, tableName = 'acts') {
  console.log(`\n📥 Ładowanie danych do tabeli ${tableName}...`);

  const batchSize = 1000; // Batch INSERT dla szybkości
  let loaded = 0;

  // Rozpocznij transakcję dla szybszego zapisu
  await client.query('BEGIN');

  try {
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      // Przygotuj wartości dla batch INSERT
      const values = [];
      const placeholders = [];
      let paramIndex = 1;

      batch.forEach((item, idx) => {
        placeholders.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`
        );
        values.push(
          item.act,
          item.art_no || null,
          item.par_no || null,
          item.pkt_no || null,
          item.text,
          item.text_clean || null,
          item.token_count || 0,
          item.embedding ? JSON.stringify(item.embedding) : null
        );
        paramIndex += 8;
      });

      // Wykonaj batch INSERT
      const query = `
        INSERT INTO ${tableName} (act, art_no, par_no, pkt_no, text, text_clean, token_count, embedding)
        VALUES ${placeholders.join(', ')}
      `;

      await client.query(query, values);
      loaded += batch.length;

      console.log(`  ... ${loaded}/${data.length} (${((loaded/data.length)*100).toFixed(1)}%)`);
    }

    // Zatwierdź transakcję
    await client.query('COMMIT');
    console.log(`✅ Załadowano ${loaded} rekordów do ${tableName}`);

  } catch (error) {
    // W razie błędu, wycofaj wszystkie zmiany
    await client.query('ROLLBACK');
    throw error;
  }
}

// Zapisz backup (tylko gdy są embeddingi)
function saveBackup(data, filename) {
  if (!GENERATE_EMBEDDINGS) {
    return;
  }

  console.log(`\n💾 Zapisywanie backupu: ${filename}...`);
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  const fileSize = (fs.statSync(filename).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Backup zapisany: ${filename} (${fileSize} MB)`);
}

// Główna funkcja
(async () => {
  console.log('🚀 START: Acts to Database (Voyage Law-2)\n');
  console.log(`📊 Model: ${MODEL} (1024 dimensions)`);
  console.log(`🧪 Tryb: ${TEST_MODE ? 'TEST (5 losowych z każdego)' : 'FULL (wszystkie dane)'}`);
  console.log(`🤖 Embeddingi: ${GENERATE_EMBEDDINGS ? 'TAK' : 'NIE'}`);
  if (GENERATE_EMBEDDINGS) {
    console.log(`   - acts_cumulated: ${MIN_TOKEN_COUNT_FOR_CUMULATED === 0 ? 'WSZYSTKIE rekordy' : `tylko token_count >= ${MIN_TOKEN_COUNT_FOR_CUMULATED}`}`);
    console.log(`   - acts: ${MIN_TOKEN_COUNT_FOR_ACTS === 0 ? 'WSZYSTKIE rekordy' : `tylko token_count >= ${MIN_TOKEN_COUNT_FOR_ACTS}`}`);
  }
  console.log('');

  const startTime = Date.now();

  try {
    // ===== KROK 1: Wczytaj dane szczegółowe =====
    console.log('📖 KROK 1: Wczytywanie danych szczegółowych...\n');
    const allData = loadAllData();
    console.log(`\n✅ Załadowano łącznie: ${allData.length} rekordów szczegółowych`);

    // ===== KROK 2: Kumuluj dane (bez embeddingów) =====
    console.log('\n📖 KROK 2: Kumulacja danych...');
    const cumulatedData = cumulateData(allData);

    // ===== KROK 3: Usuń duplikaty z acts =====
    const filteredActs = removeDuplicatesFromActs(allData, cumulatedData);

    // Estymacja czasu embedowania
    if (GENERATE_EMBEDDINGS) {
      const cumulatedToEmbedCount = cumulatedData.filter(e => (e.token_count || 0) >= MIN_TOKEN_COUNT_FOR_CUMULATED).length;
      const cumulatedTokens = cumulatedData
        .filter(e => (e.token_count || 0) >= MIN_TOKEN_COUNT_FOR_CUMULATED)
        .reduce((sum, e) => sum + (e.token_count || 0), 0);
      const actsToEmbedCount = filteredActs.filter(e => (e.token_count || 0) >= MIN_TOKEN_COUNT_FOR_ACTS).length;
      const actsTokens = filteredActs
        .filter(e => (e.token_count || 0) >= MIN_TOKEN_COUNT_FOR_ACTS)
        .reduce((sum, e) => sum + (e.token_count || 0), 0);
      const totalTokens = cumulatedTokens + actsTokens;
      const totalItems = cumulatedToEmbedCount + actsToEmbedCount;
      const estimatedMinutes = Math.ceil(totalItems / 500); // Conservative estimate: ~500 items/min

      console.log(`\n📊 Estymacja embedowania:`);
      console.log(`   acts_cumulated: ${cumulatedToEmbedCount} items (>=${MIN_TOKEN_COUNT_FOR_CUMULATED} tokens), ${cumulatedTokens.toLocaleString()} tokens`);
      console.log(`   acts: ${actsToEmbedCount} items (>=${MIN_TOKEN_COUNT_FOR_ACTS} tokens), ${actsTokens.toLocaleString()} tokens`);
      console.log(`   TOTAL: ${totalItems} items, ${totalTokens.toLocaleString()} tokens`);
      console.log(`   Szacowany czas: ~${estimatedMinutes} min`);
      console.log(`   Free tier: 50M tokens - ${totalTokens < 50000000 ? 'wystarczy! ✅' : 'przekroczony ⚠️'}\n`);
    }

    // ===== KROK 4: Generuj embeddingi dla acts_cumulated =====
    console.log(`\n🤖 KROK 4: Embeddingi dla acts_cumulated (token_count >= ${MIN_TOKEN_COUNT_FOR_CUMULATED})...\n`);
    const embeddedCumulated = await generateEmbeddings(cumulatedData, MIN_TOKEN_COUNT_FOR_CUMULATED, 'acts_cumulated');
    saveBackup(embeddedCumulated, './acts-cumulated-backup.json');

    // ===== KROK 5: Generuj embeddingi dla acts (tylko >= threshold) =====
    console.log(`\n🤖 KROK 5: Embeddingi dla acts (token_count >= ${MIN_TOKEN_COUNT_FOR_ACTS})...\n`);
    const embeddedActs = await generateEmbeddings(filteredActs, MIN_TOKEN_COUNT_FOR_ACTS, 'acts');
    saveBackup(embeddedActs, './acts-details-backup.json');

    // ===== KROK 6: Zapis do bazy =====
    console.log('\n🔌 KROK 6: Łączenie z bazą danych...');
    const client = new pg.Client({ connectionString: DB_URL });
    await client.connect();
    console.log('✅ Połączono z bazą');

    // Przygotuj bazę (DROP + CREATE obu tabel)
    await setupDatabase(client);

    // Załaduj dane
    await loadToDatabase(client, embeddedActs, 'acts');
    await loadToDatabase(client, embeddedCumulated, 'acts_cumulated');

    // Zamknij połączenie
    await client.end();
    console.log('\n✅ Zamknięto połączenie z bazą');

    // ===== PODSUMOWANIE =====
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ GOTOWE w ${duration}s!`);

    console.log(`\n📊 TABELA: acts (szczegółowe, bez duplikatów)`);
    console.log(`   Rekordów: ${embeddedActs.length}`);
    console.log(`   Z embeddingami: ${embeddedActs.filter(e => e.embedding).length}`);
    console.log(`   Bez embeddingów: ${embeddedActs.filter(e => !e.embedding).length}`);
    const avgTokensActs = Math.round(embeddedActs.reduce((sum, e) => sum + (e.token_count || 0), 0) / embeddedActs.length);
    const maxTokensActs = Math.max(...embeddedActs.map(e => e.token_count || 0));
    console.log(`   Średnia tokenów: ${avgTokensActs}, Max: ${maxTokensActs}`);
    if (GENERATE_EMBEDDINGS) {
      const embedThreshold = embeddedActs.filter(e => (e.token_count || 0) >= MIN_TOKEN_COUNT_FOR_ACTS).length;
      console.log(`   Embedowane (>=${MIN_TOKEN_COUNT_FOR_ACTS} tokenów): ${embedThreshold}`);
      console.log(`   Backup: ./acts-details-backup.json`);
    }

    console.log(`\n📊 TABELA: acts_cumulated (kumulowane)`);
    console.log(`   Rekordów: ${embeddedCumulated.length}`);
    console.log(`   Z embeddingami: ${embeddedCumulated.filter(e => e.embedding).length}`);
    console.log(`   Bez embeddingów: ${embeddedCumulated.filter(e => !e.embedding).length}`);
    const cumulatedCount = embeddedCumulated.filter(e => e.pkt_no === 'cumulated' || e.par_no === 'cumulated').length;
    const movedCount = embeddedCumulated.filter(e => e.pkt_no === 'moved' || e.par_no === 'moved').length;
    console.log(`   Status "cumulated": ${cumulatedCount} (prawdziwe kumulacje)`);
    console.log(`   Status "moved": ${movedCount} (przeniesienia pojedyncze)`);
    const avgTokensCumulated = Math.round(embeddedCumulated.reduce((sum, e) => sum + (e.token_count || 0), 0) / embeddedCumulated.length);
    const maxTokensCumulated = Math.max(...embeddedCumulated.map(e => e.token_count || 0));
    console.log(`   Średnia tokenów: ${avgTokensCumulated}, Max: ${maxTokensCumulated}`);
    if (GENERATE_EMBEDDINGS && MIN_TOKEN_COUNT_FOR_CUMULATED > 0) {
      const embedThreshold = embeddedCumulated.filter(e => (e.token_count || 0) >= MIN_TOKEN_COUNT_FOR_CUMULATED).length;
      console.log(`   Embedowane (>=${MIN_TOKEN_COUNT_FOR_CUMULATED} tokenów): ${embedThreshold}`);
    }
    if (GENERATE_EMBEDDINGS) {
      console.log(`   Backup: ./acts-cumulated-backup.json`);
    }

    console.log(`\n🗄️  Baza danych gotowa z 2 tabelami`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('\n❌ BŁĄD:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();