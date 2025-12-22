// PLIK: src/app/api/chat-title/route.ts
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // Pobiera bezpiecznie z serwera
});

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ title: 'Nowy czat' });
    }

    // Używamy Haiku - jest szybki i tani
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: `Jesteś botem generującym tytuły do historii czatu.

          Zadanie: Przeczytaj poniższą wiadomość użytkownika i stwórz krótki, zwięzły tytuł (max 4-6 słów) oddający sedno problemu.

          Zasady:
          1. Tytuł ma być w języku polskim.
          2. Nie używaj cudzysłowów ani kropki na końcu.
          3. Nie pisz "Tytuł:", po prostu podaj treść.

          Wiadomość użytkownika: "${message}"`
        }
      ]
    });

    let title = 'Nowy czat';
    if (response.content && response.content.length > 0) {
      const block = response.content[0];
      if ('text' in block) {
        title = block.text.trim();
      }
    }

    // Usuwamy ewentualne cudzysłowy, gdyby AI nie posłuchało
    title = title.replace(/^["']|["']$/g, '');

    return NextResponse.json({ title });

  } catch (error) {
    console.error('Chat Title API Error:', error);
    // W razie błędu zwracamy generyczny tytuł, żeby nie wysypać frontu
    return NextResponse.json({ title: 'Rozmowa o KPA' });
  }
}