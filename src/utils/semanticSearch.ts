// PLIK: src/utils/semanticSearch.ts

export interface KPAChunk {
  art_no: string | null;
  art_index: string | null;
  par_no: string | null;
  par_index: string | null;
  pkt_no: string | null;
  text: string;
  embedding?: number[];
}

// Pozostawiamy tylko prostą funkcję fetch dla Frontendu,
// aby komponent SourceCard mógł wyświetlić kontekst (poprzednie/następne artykuły).
export async function loadKPAData(): Promise<KPAChunk[]> {
  try {
    console.log('📚 Loading KPA data for frontend context...');
    const response = await fetch('/kpa-embeddings.json');
    if (!response.ok) throw new Error('Failed to load KPA data');
    const data: KPAChunk[] = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Błąd ładowania KPA data:', error);
    return [];
  }
}