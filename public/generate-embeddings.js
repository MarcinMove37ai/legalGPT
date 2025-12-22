// generate-embeddings.js
// Voyage AI - model voyage-3.5-lite (512 dimensions)
// Instalacja: npm install node-fetch
// Uruchom: VOYAGE_API_KEY=pa-... node generate-embeddings.js

import fetch from 'node-fetch';
import fs from 'fs';

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const MODEL = 'voyage-3.5-lite'; // 512 dimensions

if (!VOYAGE_API_KEY) {
  console.error('❌ Brak VOYAGE_API_KEY w zmiennych środowiskowych!');
  console.log('Użyj: VOYAGE_API_KEY=pa-... node generate-embeddings.js');
  process.exit(1);
}

// Wczytaj KPA JSON
const kpaData = JSON.parse(fs.readFileSync('./kpa.json', 'utf8'));
console.log(`📚 Załadowano ${kpaData.length} chunków z KPA\n`);

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

async function generateEmbeddings() {
  const results = [];
  const batchSize = 128; // Voyage AI limit

  for (let i = 0; i < kpaData.length; i += batchSize) {
    const batch = kpaData.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(kpaData.length / batchSize);

    console.log(`🔄 Batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

    try {
      // Przygotuj teksty do embedowania
      const textsToEmbed = batch.map(chunk => {
        const parts = [
          chunk.art_no ? `Artykuł ${chunk.art_no}` : '',
          chunk.par_no ? `Paragraf ${chunk.par_no}` : '',
          chunk.pkt_no ? `Punkt ${chunk.pkt_no}` : '',
          chunk.text
        ].filter(Boolean);

        return parts.join('. ');
      });

      // Wywołaj Voyage AI API
      const embeddings = await getEmbeddings(textsToEmbed);

      // Połącz dane z embeddingami
      for (let j = 0; j < batch.length; j++) {
        results.push({
          ...batch[j],
          embedding: embeddings[j]
        });
      }

      console.log(`✅ Batch ${batchNum} done (${results.length} total)`);

      // Rate limiting - 0.5s pauza między batches
      if (i + batchSize < kpaData.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      console.error(`❌ Błąd w batch ${batchNum}:`, error.message);
      // Dodaj bez embeddingów
      for (const chunk of batch) {
        results.push({ ...chunk, embedding: null });
      }
    }
  }

  return results;
}

// Uruchom
(async () => {
  console.log('🚀 Start generowania embeddingów (Voyage AI)...\n');
  console.log(`📊 Model: ${MODEL} (512 dimensions)\n`);

  const startTime = Date.now();
  const embedded = await generateEmbeddings();
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Zapisz wynik
  fs.writeFileSync(
    './kpa-embeddings.json',
    JSON.stringify(embedded, null, 2)
  );

  const fileSize = (fs.statSync('./kpa-embeddings.json').size / 1024 / 1024).toFixed(2);

  console.log(`\n✅ GOTOWE w ${duration}s!`);
  console.log(`📁 Zapisano: kpa-embeddings.json (${fileSize} MB)`);
  console.log(`📊 Chunks: ${embedded.length}`);
  console.log(`🎯 Z embeddingami: ${embedded.filter(e => e.embedding).length}`);
  console.log(`❌ Bez embeddingów: ${embedded.filter(e => !e.embedding).length}`);
})();