// test-embeddings.js
// TEST NA 10 REKORDACH - wynik w terminalu
// Uruchom: VOYAGE_API_KEY=pa-... node test-embeddings.js

import fetch from 'node-fetch';
import fs from 'fs';

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const MODEL = 'voyage-3.5-lite';

if (!VOYAGE_API_KEY) {
  console.error('❌ Brak VOYAGE_API_KEY!');
  console.log('Użyj: VOYAGE_API_KEY=pa-... node test-embeddings.js');
  process.exit(1);
}

console.log('🧪 TEST EMBEDDINGÓW - 10 REKORDÓW\n');
console.log(`📊 Model: ${MODEL} (512 dimensions)\n`);

// Nazwa pliku z linii komend lub domyślna
const filename = process.argv[2] || 'kpa.json';

console.log(`📂 Plik źródłowy: ${filename}\n`);

// Sprawdź czy plik istnieje
if (!fs.existsSync(`./${filename}`)) {
  console.error(`❌ Nie znaleziono pliku: ${filename}`);
  console.log('\n💡 Użycie:');
  console.log('   VOYAGE_API_KEY=pa-... node test-embeddings.js nazwa-pliku.json');
  console.log('\nLub zmień nazwę pliku na: kpa.json');
  process.exit(1);
}

// Wczytaj TYLKO 10 pierwszych rekordów
const allData = JSON.parse(fs.readFileSync(`./${filename}`, 'utf8'));
const testData = allData.slice(0, 10);

console.log(`📚 Załadowano ${testData.length} testowych chunków\n`);

// Voyage AI API call
async function getEmbeddings(texts) {
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
    throw new Error(`Voyage API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data.map(item => item.embedding);
}

// Test function
async function testEmbeddings() {
  console.log('🔄 Generuję embeddingi...\n');

  try {
    // Przygotuj teksty
    const textsToEmbed = testData.map(chunk => {
      const parts = [
        chunk.art_no ? `Artykuł ${chunk.art_no}` : '',
        chunk.par_no ? `Paragraf ${chunk.par_no}` : '',
        chunk.pkt_no ? `Punkt ${chunk.pkt_no}` : '',
        chunk.text
      ].filter(Boolean);

      return parts.join('. ');
    });

    // Wywołaj API
    const startTime = Date.now();
    const embeddings = await getEmbeddings(textsToEmbed);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Embeddingi wygenerowane w ${duration}s\n`);
    console.log('━'.repeat(60));
    console.log('📊 WYNIKI:\n');

    // Wyświetl wyniki dla każdego rekordu
    testData.forEach((chunk, idx) => {
      const embedding = embeddings[idx];

      console.log(`\n[${idx + 1}] ${chunk.art_no ? `Art. ${chunk.art_no}` : 'Nagłówek'}`);
      console.log(`    Tekst: ${chunk.text.substring(0, 80)}...`);
      console.log(`    Embedding dim: ${embedding.length}`);
      console.log(`    Pierwsze 5 wartości: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
      console.log(`    Norma: ${Math.sqrt(embedding.reduce((sum, v) => sum + v*v, 0)).toFixed(4)}`);
    });

    console.log('\n' + '━'.repeat(60));
    console.log('\n✅ TEST ZAKOŃCZONY SUKCESEM!');
    console.log(`\n📈 Statystyki:`);
    console.log(`   • Przetworzonych chunków: ${testData.length}`);
    console.log(`   • Wymiar embeddingów: ${embeddings[0].length}`);
    console.log(`   • Średni czas/chunk: ${(parseFloat(duration) / testData.length).toFixed(3)}s`);
    console.log(`   • Szacowany czas dla ${allData.length} chunków: ${((parseFloat(duration) / testData.length) * allData.length / 60).toFixed(1)} min`);

    // ZAPISZ WYNIK DO PLIKU
    const results = testData.map((chunk, idx) => ({
      ...chunk,
      embedding: embeddings[idx]
    }));

    const outputFilename = 'test-kpa-embeddings.json';
    fs.writeFileSync(
      `./${outputFilename}`,
      JSON.stringify(results, null, 2)
    );

    const fileSize = (fs.statSync(`./${outputFilename}`).size / 1024).toFixed(2);

    console.log(`\n📁 Zapisano wynik:`);
    console.log(`   • Plik: ${outputFilename}`);
    console.log(`   • Rozmiar: ${fileSize} KB`);
    console.log(`   • Struktura: ${testData.length} chunków z embeddingami`);

    console.log('\n🚀 Jeśli test OK, uruchom pełną wersję:');
    console.log(`   VOYAGE_API_KEY=pa-... node generate-embeddings.js ${filename}\n`);

  } catch (error) {
    console.error('\n❌ BŁĄD:', error.message);
    console.error('\n🔍 Sprawdź:');
    console.error('   1. Czy VOYAGE_API_KEY jest poprawny');
    console.error('   2. Czy masz dostęp do internetu');
    console.error('   3. Czy Voyage AI API działa');
    process.exit(1);
  }
}

// Uruchom test
testEmbeddings();