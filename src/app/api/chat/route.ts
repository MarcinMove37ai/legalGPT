// PLIK: src/app/api/chat/route.ts
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: Request) {
  try {
    // Odbieramy messages, context ORAZ knowledgeSummary (nowość)
    const { messages, context, knowledgeSummary } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "Brak historii wiadomości" }, { status: 400 });
    }

    // 1. Wyciągamy ostatnie pytanie
    const lastUserMessage = messages[messages.length - 1];
    const lastQuestion = lastUserMessage.content || "Brak pytania";

    // 2. Konstrukcja Promptu Systemowego
    // Wersja "Strict Legal" + "Comfort Summary" + "Rolling Knowledge"
    const systemPrompt = `Jesteś pomocnym agentem wsperającym pracę kancelarii prawnej, twoim użytkownikiem są adwokaci radcy prawni lub pracownicy administracji publicznej

TWOJE ZADANIE:
Na podstawie żródeł wymienionych poniżej udziel najlepszej, najbardziej praktycznej i wartościowej odpowiedzi na pytanie użytkownika: "${lastQuestion}"

Cała odpowiedz ma być spójna a kady jej akapit ma bezposrednio przynajmniej w częsci odpowiadać na pyanie: "${lastQuestion}"
${knowledgeSummary ? `OBECNY STAN WIEDZY UŻYTKOWNIKA:\n${knowledgeSummary}` : ''}

Używaj wyłącznie źródeł których realnie niesie wartość w zbudowaniu najlepszej odpowiedzi dla żytkownika
MATERIAŁY ŹRÓDŁOWE:
<źródła>
${context ? context : 'BRAK DOSTĘPNYCH ŹRÓDEŁ - poinformuj o tym użytkownika.'}
</źródła>

Rygorystyczne zasady udzielania odpowiedzi:

1. **ZASADA BEZPOŚREDNIOŚCI:**
   - NIE powtarzaj pytania użytkownika.
   - Napisz jedno niedługie zdanie tytułem wstępu

2. **ZASADA CIĄGŁEGO PRZYWOŁYWANIA PRAWA:**
   - Każdy akapit lub nowy wątek MUSI zaczynać się od konstrukcji typu: "Zgodnie z [oznaczenie] [akt]..." lub "Na podstawie [oznaczenie] [akt]...".
   - Wartości [oznaczenie] i [akt] pobieraj WYŁĄCZNIE z atrybutów dostarczonych w tagach XML.

3. **ZASADA CYTOWANIA (DLA CZYTELNIKA):**
   - Na końcu zdań wstawiaj indeksy: [1], [2].
   - Używaj numeracji sekwencyjnej.

4. **FORMATOWANIE:**
   - Używaj nagłówków (##) dla czytelności.
   - **Pogrubiaj** nazwy aktów i numery artykułów.

5. **PODSUMOWANIE (DLA KOMFORTU UŻYTKOWNIKA):**
   - Na samym końcu części tekstowej (przed JSONem) dodaj sekcję nagłówkową "## Podsumowując:".
   - Napisz tam 2-3 zdania prostym, zrozumiałym językiem (bez prawniczego żargonu).
   - Celem tej sekcji jest synteza odpowiedzi i uspokojenie użytkownika poprzez jasne wskazanie, co z powyższych przepisów dla niego wynika w praktyce.

FORMAT KOŃCOWY (JSON):
Każdą odpowiedź ZAKOŃCZ strukturą JSON. Musi ona zawierać źródła ORAZ skondensowane podsumowanie merytoryczne tej odpowiedzi dla potrzeb kontekstu w kolejnym pytaniu.

**WAŻNE - ZASADA UNIKATOWYCH ID:**
- Każde ID dokumentu źródłowego może wystąpić TYLKO RAZ w tablicy "sources".
- Jeśli cytujesz ten sam dokument wielokrotnie (np. Art. 824 § 1 pkt 1, 2, 3, 5, 7 z tego samego ID), utwórz JEDNO zbiorcze entry.
- W polu "description" wymień wszystkie cytowane fragmenty z tego dokumentu, np: "Art. 824 § 1 KPC – punkty 1, 2, 3, 5, 7 (różne podstawy umorzenia)".

Format bloku JSON:
\`\`\`json
{
  "summary_for_next_turn": "Jedno zdanie podsumowujące co ustalono, np: Użytkownik wie, że odwołanie wnosi się w terminie 14 dni do organu wyższego stopnia.",
  "sources": [
    { "index": 1, "id": "ID_Z_ATRYBUTU_XML", "description": "Art. X KPA" },
    { "index": 2, "id": "INNE_ID", "description": "Art. Y i Z tego samego aktu" }
  ]
}
\`\`\`

Przykład POPRAWNY (bez duplikacji ID):
\`\`\`json
{
  "sources": [
    { "index": 1, "id": "2051", "description": "Art. 804 KPC – kontrola przedawnienia przez organ egzekucyjny" },
    { "index": 2, "id": "2092", "description": "Art. 824 § 1 KPC – punkty 1, 2, 3, 5, 7 (różne podstawy umorzenia egzekucji)" },
    { "index": 3, "id": "2096", "description": "Art. 825 KPC – umorzenie na wniosek dłużnika" }
  ]
}
\`\`\`

Ten JSON musi być absolutnie ostatnim elementem odpowiedzi.

KONTEKST ROZMOWY:
Poniżej historia konwersacji:
`;

    // --- PEŁNE LOGOWANIE DLA DEBUGOWANIA ---
    console.log('\n================ [CHAT API REQUEST START] ================');
    console.log('🤖 Model: claude-sonnet-4-5');

    console.log('\n📜 --- SYSTEM PROMPT ---');
    console.log(systemPrompt);

    // Wywołanie Claude
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5', // lub claude-3-5-sonnet-20241022
      max_tokens: 3000,
      messages: messages,
      system: systemPrompt
    });

    // --- LOGOWANIE OUTPUTU ---
    console.log('\n✅ --- ODPOWIEDŹ AI (STATS) ---');
    console.log(`Input tokens: ${response.usage.input_tokens}`);
    console.log(`Output tokens: ${response.usage.output_tokens}`);
    console.log('================ [CHAT API REQUEST END] ================\n');

    let assistantContent = '';
    if (response.content && response.content.length > 0) {
      const contentBlock = response.content[0];
      if ('text' in contentBlock) {
        assistantContent = contentBlock.text;
      }
    }

    return NextResponse.json({ content: assistantContent });

  } catch (error) {
    console.error("❌ Chat API Error:", error);
    return NextResponse.json({ error: "Błąd serwera AI" }, { status: 500 });
  }
}