"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, MessageSquarePlus, X, Trash2, Menu, ChevronDown, ChevronUp } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { loadKPAData, type KPAChunk } from '@/utils/semanticSearch';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ============================================================================
// INTERFEJSY
// ============================================================================

interface Source {
  id: string;
  type?: 'c' | 's';
  act?: string;
  article?: string;
  paragraph?: string;
  point?: string;
  title: string;
  content: string;
  text_clean?: string;
  relevance_score?: number;
}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Source[];
}

interface Chat {
  id: number;
  title: string;
  messages: Message[];
  createdAt: Date;
}

// Interfejs dla wzbogaconego source z modelu
interface ModelSource {
  index: number;
  id: string;
  description: string;
}

// Funkcja do parsowania § i pkt z description
function extractParPktFromDescription(description: string): { paragraph: string | null; point: string | null } {
  // Przykłady:
  // "Art. 15 § 1 KPE - ..." → paragraph: "1"
  // "Art. 27 § 1 pkt 9 KPE - ..." → paragraph: "1", point: "9"

  const parMatch = description.match(/§\s*(\d+[a-z]?|\([0-9]+\)|[IVXLCDM]+)/i);
  const pktMatch = description.match(/pkt\s*(\d+[a-z]?)/i);

  return {
    paragraph: parMatch ? parMatch[1] : null,
    point: pktMatch ? pktMatch[1] : null
  };
}

// Funkcja do wzbogacania sources
async function enrichSourceWithContext(
  source: any,
  modelSource: ModelSource
): Promise<any> {
  // Parsuj description aby wyekstrahować § i pkt
  const extracted = extractParPktFromDescription(modelSource.description);

  // Sprawdź czy search nie miał tych danych
  const needsEnrichment =
    (extracted.paragraph && !source.paragraph) ||
    (extracted.point && !source.point);

  if (!needsEnrichment) {
    return source; // Nie trzeba nic robić
  }

  try {
    // Pobierz dokładny tekst z /api/context
    const contextResponse = await fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        act: source.act,
        article: source.article,
        paragraph: extracted.paragraph,
        point: extracted.point
      })
    });

    if (!contextResponse.ok) {
      console.warn(`⚠️ Nie udało się pobrać kontekstu dla source ${source.id}`);
      return source;
    }

    const contextData = await contextResponse.json();

    // Znajdź dokładny fragment
    const exactFragment = contextData.fragments.find((f: any) =>
      f.par_no === extracted.paragraph &&
      (!extracted.point || f.pkt_no === extracted.point)
    );

    if (exactFragment) {
      console.log(`✅ Wzbogacono source ${source.id}: dodano § ${extracted.paragraph}${extracted.point ? ` pkt ${extracted.point}` : ''}`);
      return {
        ...source,
        paragraph: extracted.paragraph || source.paragraph,
        point: extracted.point || source.point,
        content: exactFragment.text || source.content
      };
    }

  } catch (error) {
    console.error(`❌ Błąd wzbogacania source ${source.id}:`, error);
  }

  return source;
}

// ============================================================================
// NOWY KOMPONENT ŹRÓDŁA (POPUP) - UŻYWA /api/context API
// ============================================================================
// Zastąp TYLKO sekcję od linii ~40 do ~176 w ChatInterface.tsx

// Nowy interfejs dla fragmentu z API
interface ContextFragment {
  id: string;
  act: string;
  art_no: string;
  par_no: string | null;
  pkt_no: string | null;
  text: string;
  text_clean: string;
}

// PROFESJONALNY SourceCard - wersja FINALNA
// Zastąp stary SourceCard w ChatInterface.tsx tym kodem

// Mapowanie skrótów na pełne nazwy aktów
const ACT_FULL_NAMES: Record<string, string> = {
  'KPC': 'Kodeks Postępowania Cywilnego',
  'KPK': 'Kodeks Postępowania Karnego',
  'KPA': 'Kodeks Postępowania Administracyjnego',
  'KPE': 'Kodeks Postępowania Egzekucyjnego',
  'SUS': 'Ustawa o Systemie Ubezpieczeń Społecznych',
  'KK': 'Kodeks Karny'
};

// Komponent rozwijalnej sekcji - elegancki i wyrazisty
interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all duration-200 group border border-gray-200 cursor-pointer"
      >
        <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">{title}</span>
        <div className="flex items-center gap-1.5 md:gap-2">
          <span className="text-xs text-gray-500 group-hover:text-gray-700">
            {isOpen ? 'Zwiń' : 'Rozwiń'}
          </span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-gray-600 group-hover:text-gray-800 transition-transform" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600 group-hover:text-gray-800 transition-transform" />
          )}
        </div>
      </button>
      {isOpen && (
        <div className="mt-2 px-4 py-3 bg-gray-50/50 rounded-lg border border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
};

// Funkcja pomocnicza do parsowania odpowiedzi asystenta
function parseAssistantResponse(content: string): {
  justification: string;
  summary: string;
} {
  // Szukamy "Podsumowując:" lub podobnych wariantów
  const summaryMatch = content.match(/(Podsumowując|Podsumowanie|W skrócie|Konkludując):?\s*/im);

  if (summaryMatch && summaryMatch.index !== undefined) {
    // Justification: od początku DO "Podsumowując:" (bez tego słowa)
    const justification = content.substring(0, summaryMatch.index).trim();

    // Summary: od "Podsumowując:" DO struktury JSON, ale BEZ słowa "Podsumowując:"
    let summaryStart = summaryMatch.index + summaryMatch[0].length;
    let summaryContent = content.substring(summaryStart);

    // Usuń strukturę JSON z końca (jeśli istnieje)
    const jsonMatch = summaryContent.match(/```json[\s\S]*```\s*$/m);
    if (jsonMatch && jsonMatch.index !== undefined) {
      summaryContent = summaryContent.substring(0, jsonMatch.index).trim();
    }

    return { justification, summary: summaryContent.trim() };
  }

  // Jeśli nie znaleziono "Podsumowując", zwróć całą treść jako odpowiedź
  return { justification: '', summary: content };
}

interface SourceCardProps {
  source: Source;
  onClose: () => void;
}

const SourceCard: React.FC<SourceCardProps> = ({ source, onClose }) => {
  const [fragments, setFragments] = useState<ContextFragment[]>([]);
  const [highlightParagraph, setHighlightParagraph] = useState<string | null>(null);
  const [highlightPoint, setHighlightPoint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchContext();
  }, [source]);

  const fetchContext = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          act: source.act,
          article: source.article,
          paragraph: source.paragraph || null,
          point: source.point || null
        })
      });

      if (!response.ok) {
        throw new Error('Błąd pobierania kontekstu');
      }

      const data = await response.json();
      setFragments(data.fragments || []);
      setHighlightParagraph(data.highlightParagraph);
      setHighlightPoint(data.highlightPoint);
    } catch (error) {
      console.error('❌ Błąd ładowania kontekstu:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getHighlightLevel = (fragment: ContextFragment): 'none' | 'subtle' | 'full' => {
    const hasRealPar = !!(fragment.par_no &&
                      fragment.par_no !== 'cumulated' &&
                      fragment.par_no !== 'moved');
    const hasRealPkt = !!(fragment.pkt_no &&
                      fragment.pkt_no !== 'cumulated' &&
                      fragment.pkt_no !== 'moved');

    // Przypadek 1: Brak paragraph i point → subtelne zaznaczenie całego artykułu
    if (!highlightParagraph && !highlightPoint) {
      return 'subtle';
    }

    // Przypadek 2: Jest point → pełne zaznaczenie TYLKO tego punktu
    if (highlightPoint) {
      const matches = hasRealPar &&
             hasRealPkt &&
             fragment.par_no === highlightParagraph &&
             fragment.pkt_no === highlightPoint;
      return matches ? 'full' : 'none';
    }

    // Przypadek 3: Jest paragraph ale NIE MA point → pełne zaznaczenie całego paragrafu
    if (highlightParagraph) {
      const matches = hasRealPar && fragment.par_no === highlightParagraph;
      return matches ? 'full' : 'none';
    }

    return 'none';
  };

  const isHighlighted = (fragment: ContextFragment): boolean => {
    return getHighlightLevel(fragment) !== 'none';
  };

  // Grupuj fragmenty według struktury
  const groupedFragments = fragments.reduce((acc, fragment) => {
      // Przypadek 1: Fragment bez par_no i bez pkt_no → tytuł artykułu
      if ((!fragment.par_no || fragment.par_no === 'cumulated' || fragment.par_no === 'moved') &&
          (!fragment.pkt_no || fragment.pkt_no === 'cumulated' || fragment.pkt_no === 'moved')) {
        if (!acc.articleTitle) {
          acc.articleTitle = fragment;
        }
      }
      // Przypadek 2: Fragment ma pkt_no ale NIE MA par_no → punkt bezpośrednio pod artykułem
      else if ((!fragment.par_no || fragment.par_no === 'cumulated' || fragment.par_no === 'moved') &&
               fragment.pkt_no && fragment.pkt_no !== 'cumulated' && fragment.pkt_no !== 'moved') {
        acc.articlePoints.push(fragment);
      }
      // Przypadek 3: Fragment ma par_no → normalny paragraf lub punkt w paragrafie
      else if (fragment.par_no && fragment.par_no !== 'cumulated' && fragment.par_no !== 'moved') {
        const parKey = fragment.par_no;
        if (!acc.paragraphs[parKey]) {
          acc.paragraphs[parKey] = { main: null, points: [] };
        }

        if (!fragment.pkt_no || fragment.pkt_no === 'cumulated' || fragment.pkt_no === 'moved') {
          acc.paragraphs[parKey].main = fragment;
        } else {
          acc.paragraphs[parKey].points.push(fragment);
        }
      }
    return acc;
  }, {
    articleTitle: null,
    articlePoints: [],
    paragraphs: {}
  } as {
    articleTitle: ContextFragment | null;
    articlePoints: ContextFragment[];
    paragraphs: Record<string, { main: ContextFragment | null; points: ContextFragment[] }>;
  });

  // Pobierz pełną nazwę aktu
  const fullActName = source.act ? (ACT_FULL_NAMES[source.act] || source.act) : '';

  const renderArticleTitle = () => {
      if (!groupedFragments.articleTitle) {
        // Jeśli nie ma tytułu w fragmentach, nie renderuj nic
        return null;
      }

    const fragment = groupedFragments.articleTitle;
    const highlightLevel = getHighlightLevel(fragment);
    const highlighted = highlightLevel !== 'none';
    const isSubtle = highlightLevel === 'subtle';

    return (
      <div className="mb-8">
        <div className={`rounded-xl p-6 ${
          highlighted
            ? (isSubtle
                ? 'bg-blue-50/30 border border-blue-100 shadow-sm'
                : 'bg-blue-50 border border-blue-200 shadow-sm')
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <p className={`text-base leading-relaxed ${
            highlighted ? (isSubtle ? 'text-gray-800' : 'text-gray-900 font-medium') : 'text-gray-700'
          }`}>
            {fragment.text}
          </p>
        </div>
      </div>
    );
  };

  const renderParagraph = (parNo: string, data: { main: ContextFragment | null; points: ContextFragment[] }) => {
    const mainHighlightLevel = data.main ? getHighlightLevel(data.main) : 'none';
    const mainHighlighted = mainHighlightLevel !== 'none';
    const isMainSubtle = mainHighlightLevel === 'subtle';

    return (
      <div key={parNo} className="mb-6">
        {/* Nagłówek paragrafu */}
        <div className={`flex items-center gap-3 mb-3 pl-4 ${
          mainHighlighted ? 'opacity-100' : 'opacity-80'
        }`}>
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
            mainHighlighted
              ? (isMainSubtle ? 'bg-blue-700 text-white shadow-md' : 'bg-blue-900 text-white shadow-lg')
              : 'bg-gray-200 text-gray-700'
          }`}>
            <span className="text-sm font-bold">§</span>
          </div>
          <div className={`text-2xl font-bold ${
            mainHighlighted
              ? (isMainSubtle ? 'text-blue-800' : 'text-blue-900')
              : 'text-gray-700'
          }`}>
            {parNo}
          </div>
        </div>

        {/* Treść paragrafu */}
        {data.main && (
          <div className={`ml-4 pl-8 border-l-4 rounded-r-xl p-4 mb-3 transition-all ${
            mainHighlighted
              ? (isMainSubtle
                  ? 'border-blue-300 bg-gradient-to-r from-blue-50/30 to-blue-50 shadow-sm'
                  : 'border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100 shadow-md')
              : 'border-gray-300 bg-white hover:bg-gray-50'
          }`}>
            <p className={`text-base leading-relaxed ${
              mainHighlighted
                ? (isMainSubtle ? 'text-gray-800' : 'text-gray-900 font-medium')
                : 'text-gray-700'
            }`}>
              {data.main.text}
            </p>
          </div>
        )}

        {/* Punkty w paragrafie */}
        {data.points.length > 0 && (
          <div className="ml-12 space-y-2">
            {data.points.map((point) => {
              const pointHighlightLevel = getHighlightLevel(point);
              const pointHighlighted = pointHighlightLevel !== 'none';
              const isPointSubtle = pointHighlightLevel === 'subtle';

              return (
                <div
                  key={point.id}
                  className={`pl-6 border-l-2 rounded-r-lg p-3 transition-all ${
                    pointHighlighted
                      ? (isPointSubtle
                          ? 'border-blue-300 bg-gradient-to-r from-blue-50/30 to-blue-50 shadow-sm'
                          : 'border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100 shadow-md')
                      : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold ${
                      pointHighlighted
                        ? (isPointSubtle ? 'bg-blue-700 text-white' : 'bg-blue-900 text-white')
                        : 'bg-gray-300 text-gray-700'
                    }`}>
                      {point.pkt_no}
                    </div>
                    <p className={`text-sm leading-relaxed flex-1 ${
                      pointHighlighted
                        ? (isPointSubtle ? 'text-gray-800' : 'text-gray-900 font-medium')
                        : 'text-gray-600'
                    }`}>
                      {point.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col my-8 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-900 to-blue-800 text-white p-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm font-medium opacity-90 mb-1">
                {fullActName}
              </div>
              <h2 className="text-2xl font-bold">
                Art. {source.article}
                {highlightParagraph && ` § ${highlightParagraph}`}
                {highlightPoint && ` pkt ${highlightPoint}`}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50" style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#cbd5e1 #f1f5f9',
          WebkitOverflowScrolling: 'touch' // Dodaj tę linię
        }}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 w-full min-h-full">
              <Loader2 className="w-12 h-12 animate-spin text-blue-900 mb-4" />
              <p className="text-gray-600">Ładowanie treści artykułu...</p>
            </div>
          ) : fragments.length > 0 ? (
            <div className="p-8 w-full min-h-full flex flex-col justify-center">
              {/* Tytuł artykułu */}
              {renderArticleTitle()}

              {/* Punkty bezpośrednio pod artykułem (bez paragrafów) */}
              {groupedFragments.articlePoints.length > 0 && (
                <div className="mb-8 space-y-3">
                  {groupedFragments.articlePoints.map((point) => {
                    const pointHighlightLevel = getHighlightLevel(point);
                    const pointHighlighted = pointHighlightLevel !== 'none';
                    const isPointSubtle = pointHighlightLevel === 'subtle';

                    return (
                      <div
                        key={point.id}
                        className={`ml-4 pl-6 border-l-3 rounded-r-xl p-4 transition-all ${
                          pointHighlighted
                            ? (isPointSubtle
                                ? 'border-blue-300 bg-gradient-to-r from-blue-50/30 to-blue-50 shadow-sm'
                                : 'border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100 shadow-md')
                            : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                            pointHighlighted
                              ? (isPointSubtle ? 'bg-blue-700 text-white' : 'bg-blue-900 text-white')
                              : 'bg-gray-400 text-white'
                          }`}>
                            {point.pkt_no}
                          </div>
                          <div className="flex-1">
                            <p className={`text-base leading-relaxed ${
                              pointHighlighted
                                ? (isPointSubtle ? 'text-gray-800' : 'text-gray-900 font-medium')
                                : 'text-gray-700'
                            }`}>
                              {point.text}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Paragrafy */}
              <div className="space-y-6">
                {Object.entries(groupedFragments.paragraphs)
                  .sort(([a], [b]) => {
                    const numA = parseInt(a);
                    const numB = parseInt(b);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return a.localeCompare(b);
                  })
                  .map(([parNo, data]) => renderParagraph(parNo, data))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-gray-500 w-full min-h-full">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                <span className="text-3xl">📄</span>
              </div>
              <p className="text-lg font-medium">Nie znaleziono treści artykułu</p>
            </div>
          )}
        </div>

        {/* Footer - subtelna stopka */}
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200 px-6 py-3">
          <p className="text-center text-xs text-gray-500">
            <span className="font-semibold text-gray-700">LegalGPT.pl</span> - Twój partner w codziennej pracy z Aktami Prawnymi
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SIDEBAR (DESKTOP)
// ============================================================================

interface SidebarProps {
  chats: Chat[];
  currentChatId: number | null;
  onNewChat: () => void;
  onSelectChat: (chatId: number) => void;
  onDeleteChat: (chatId: number) => void;
  isNewChatDisabled: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  chats,
  currentChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  isNewChatDisabled
}) => {
  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewChat}
          disabled={isNewChatDisabled}
          className={`w-full p-3 rounded-lg flex items-center justify-between transition-colors ${
            isNewChatDisabled
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-900 text-white hover:bg-blue-800 cursor-pointer'
          }`}
        >
          <span>Nowy czat</span>
          <MessageSquarePlus className="w-5 h-5" />
        </button>
      </div>

      {/* Historia czatów */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group relative p-3 rounded-lg transition-colors cursor-pointer ${
                currentChatId === chat.id
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => onSelectChat(chat.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-sm font-medium text-gray-800 break-words line-clamp-2">
                    {chat.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {chat.createdAt.toLocaleDateString('pl-PL')}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 cursor-pointer rounded transition-all"
                >
                  <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

// ============================================================================
// MOBILE MENU
// ============================================================================

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  chats: Chat[];
  currentChatId: number | null;
  onNewChat: () => void;
  onSelectChat: (chatId: number) => void;
  onDeleteChat: (chatId: number) => void;
  isNewChatDisabled: boolean;
}

const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  chats,
  currentChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  isNewChatDisabled,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm">
      <div className="h-full flex flex-col bg-white/95 backdrop-blur-sm shadow-lg m-4 rounded-2xl">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">Menu</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Nowy czat */}
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            disabled={isNewChatDisabled}
            className={`w-full p-3 rounded-xl flex items-center justify-between transition-colors ${
              isNewChatDisabled
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-900 text-white hover:bg-blue-800 cursor-pointer'
            }`}
          >
            <span>Nowy czat</span>
            <MessageSquarePlus className="w-5 h-5" />
          </button>

          <div className="w-full h-px bg-gray-200" />

          {/* Historia */}
          <div className="space-y-2">
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => {
                  onSelectChat(chat.id);
                  onClose();
                }}
                className={`relative p-3 rounded-xl border transition-colors cursor-pointer hover:bg-gray-50 ${
                  currentChatId === chat.id
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="pr-10">
                  <p className="text-sm font-medium text-gray-800 break-words line-clamp-2">
                    {chat.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {chat.createdAt.toLocaleDateString('pl-PL')}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                    onClose();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-red-50 cursor-pointer rounded-lg transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// GŁÓWNY KOMPONENT CZATU
// ============================================================================

const ChatInterface: React.FC = () => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [kpaData, setKpaData] = useState<KPAChunk[]>([]);

  // Filtry aktów prawnych
  const [selectedActs, setSelectedActs] = useState({
    KPK: true,
    KPA: true,
    KPC: true,
    KPE: true,
    SUS: true,
    KK: false // Kodeks Karny - wkrótce
  });

  // Zmiana: Przechowujemy historię wiedzy jako tablicę (do 3 ostatnich wpisów)
  const [knowledgeHistory, setKnowledgeHistory] = useState<string[]>([]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Załaduj KPA data przy mount
  useEffect(() => {
    loadKPAData().then(data => {
      setKpaData(data);
      console.log(`📚 KPA data loaded: ${data.length} chunks`);
    });
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Nowy czat
  const handleNewChat = () => {
    // Blokada: nie można utworzyć nowego czatu jeśli aktualny jest pusty
    if (currentChatId && messages.length === 0) {
      return; // Ignoruj próbę utworzenia nowego czatu
    }

    const newChat: Chat = {
      id: Date.now(),
      title: 'Nowy czat',
      messages: [],
      createdAt: new Date()
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setMessages([]);
    setKnowledgeHistory([]); // Resetujemy wiedzę przy nowym czacie
  };

  // Wybór czatu
  const handleSelectChat = (chatId: number) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setCurrentChatId(chatId);
      setMessages(chat.messages);
    }
  };

  // Usuń czat
  const handleDeleteChat = (chatId: number) => {
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (currentChatId === chatId) {
      setCurrentChatId(null);
      setMessages([]);
      setKnowledgeHistory([]);
    }
  };

  // Generowanie tytułu czatu przez API
  const generateChatTitle = async (chatId: number, firstMessage: string) => {
    try {
      const response = await fetch('/api/chat-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: firstMessage })
      });

      if (!response.ok) throw new Error('Błąd generowania tytułu');

      const data = await response.json();

      setChats(prev => prev.map(chat =>
        chat.id === chatId
          ? { ...chat, title: data.title }
          : chat
      ));

    } catch (error) {
      console.error('Nie udało się wygenerować tytułu:', error);
      const fallbackTitle = firstMessage.split(' ').slice(0, 4).join(' ') + '...';

      setChats(prev => prev.map(chat =>
        chat.id === chatId
          ? { ...chat, title: fallbackTitle }
          : chat
      ));
    }
  };

  // Wysłanie wiadomości
  // Wysłanie wiadomości
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Utwórz nowy czat jeśli nie ma aktywnego
    let chatId = currentChatId;
    if (!chatId) {
      const newChat: Chat = {
        id: Date.now(),
        title: input.trim().slice(0, 50) + '...',
        messages: [],
        createdAt: new Date()
      };
      setChats(prev => [newChat, ...prev]);
      setCurrentChatId(newChat.id);
      chatId = newChat.id;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      console.log('\n🔵 --- DIAGNOSTYKA: START TURY ROZMOWY ---');

      // 1. PRZYGOTOWANIE KONTEKSTU DLA WYSZUKIWARKI
      // Łączymy ostatnie 3 podsumowania w jeden ciąg tekstu
      const contextString = knowledgeHistory.join(' ');

      // Tworzymy "Wzbogacone Zapytanie" dla bazy wektorowej
      const queryForSearch = contextString
        ? `${userMessage.content} (Kontekst z poprzednich pytań: ${contextString})`
        : userMessage.content;

      // LOG DIAGNOSTYCZNY 1
      console.log('🔵 Query do VDB (Search):', queryForSearch);

      // 1. SEMANTIC SEARCH
      const searchResponse = await fetch('/api/acts-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryForSearch,
          selectedActs: Object.keys(selectedActs).filter(act => selectedActs[act as keyof typeof selectedActs])
        }),
      });

      if (!searchResponse.ok) {
        throw new Error(`Błąd API wyszukiwania: ${searchResponse.statusText}`);
      }

      const searchData = await searchResponse.json();
      console.log(`📊 Wyniki VDB: ${searchData.cumulated.length} cumulated, ${searchData.detailed.length} detailed`);

      // 2. CONTEXT BUILDING
      console.log('🏗️ Budowanie kontekstu XML...');
      const cumulatedIds = searchData.cumulated.map((r: any) => parseInt(r.id));
      const actsIds = searchData.detailed.map((r: any) => parseInt(r.id));

      const contextResponse = await fetch('/api/build-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cumulatedIds: cumulatedIds,
          actsIds: actsIds
        })
      });

      if (!contextResponse.ok) {
        throw new Error('Błąd podczas budowania kontekstu');
      }

      const { context } = await contextResponse.json();

      // PAMIĘĆ KONWERSACJI
      const recentMessages = newMessages.slice(-6);
      const conversationHistory = recentMessages.map(msg => ({
        role: msg.type === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content
      }));

      // LOG DIAGNOSTYCZNY 2
      const fullKnowledgeSummary = knowledgeHistory.join('\n\n');
      console.log('🟣 Query do LLM (Payload):', {
        messagesCount: conversationHistory.length,
        knowledgeHistoryLength: knowledgeHistory.length,
        knowledgeContent: fullKnowledgeSummary
      });

      // 3. WYWOŁANIE API CHATU
      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          context: context,
          knowledgeSummary: fullKnowledgeSummary // Wysyłamy złączoną wiedzę
        }),
      });

      if (!chatResponse.ok) {
        throw new Error(`Chat API Error: ${chatResponse.statusText}`);
      }

      const chatData = await chatResponse.json();
      let rawContent = chatData.content || '';
      let cleanContent = rawContent;
      let usedSourceIds: string[] = [];
      let finalSources: any[] = []; // DODAJ TUTAJ DEKLARACJĘ

      // --- LOGIKA: Parsowanie i Ukrywanie JSON ---
      // POPRAWKA: Regex akceptuje teraz brak słowa "json" po ``` (np. ``` { ... } ```)
      const jsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
      const match = rawContent.match(jsonRegex);

      if (match) {
        try {
          const jsonBlock = JSON.parse(match[1]);

          // LOG DIAGNOSTYCZNY 3
          console.log('🟢 JSON Odpowiedzi:', JSON.stringify(jsonBlock, null, 2));

          // Logika Rolling Window (Max 3 ostatnie podsumowania)
          if (jsonBlock.summary_for_next_turn) {
            console.log('🧠 Dodaję nowe podsumowanie do historii:', jsonBlock.summary_for_next_turn);

            setKnowledgeHistory(prev => {
              const newHistory = [...prev, jsonBlock.summary_for_next_turn];
              // Zatrzymujemy tylko 3 ostatnie
              return newHistory.slice(-3);
            });
          }

          if (jsonBlock.sources && Array.isArray(jsonBlock.sources)) {
            usedSourceIds = jsonBlock.sources.map((s: any) => s.id.toString());

            // NOWE: Zapisz pełne źródła z modelu (z description)
            const modelSources: ModelSource[] = jsonBlock.sources.map((s: any) => ({
              index: s.index,
              id: s.id.toString(),
              description: s.description || ''
            }));

            // Przygotowanie źródeł z wzbogacaniem
            const allAvailableData = [...searchData.cumulated, ...searchData.detailed];

            const baseSources = usedSourceIds.map(id => {
              const found = allAvailableData.find((item: any) => item.id.toString() === id);
              return found;
            }).filter(Boolean);

            // WZBOGACANIE: Sprawdź każde źródło czy potrzebuje dodatkowego kontekstu
            console.log('🔍 Sprawdzam czy sources potrzebują wzbogacenia...');
            const enrichedSources = await Promise.all(
              baseSources.map(async (source, idx) => {
                const modelSource = modelSources[idx];
                if (modelSource) {
                  return await enrichSourceWithContext(source, modelSource);
                }
                return source;
              })
            );

            // Użyj wzbogaconych sources
            finalSources = enrichedSources;
          }

          // Usuwamy JSON z widoku
          cleanContent = rawContent.replace(match[0], '').trim();

        } catch (e) {
          console.error('❌ Błąd parsowania ukrytego JSON-a:', e);
          // Jeśli parsowanie zawiedzie, usuwamy surowy blok, ale content zostaje
          cleanContent = rawContent.replace(jsonRegex, '').trim();
        }
      } else {
        console.warn('⚠️ Brak bloku JSON w odpowiedzi modelu.');
      }
      // -------------------------------------------

      // 4. Przygotowanie źródeł (finalSources już ustawione w bloku parsowania JSON)
      const sourcesToDisplay = finalSources;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: cleanContent || 'Przepraszam, nie udało mi się wygenerować odpowiedzi.',
        timestamp: new Date(),
        sources: sourcesToDisplay.map((r: any) => ({
          id: r.id,
          type: r.type,
          act: r.act,
          article: r.article,
          paragraph: r.paragraph,
          title: r.title,
          content: r.content,
          text_clean: r.text_clean,
          relevance_score: r.relevance_score
        }))
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);

      setChats(prev => prev.map(chat =>
        chat.id === chatId
          ? { ...chat, messages: updatedMessages }
          : chat
      ));

      if (newMessages.length === 1) {
        generateChatTitle(chatId, userMessage.content);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('❌ Błąd wywołania API:', error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'Przepraszam, wystąpił błąd podczas przetwarzania Twojego pytania. Sprawdź klucze API lub spróbuj ponownie.',
        timestamp: new Date(),
        sources: []
      };

      const updatedMessages = [...newMessages, errorMessage];
      setMessages(updatedMessages);

      setChats(prev => prev.map(chat =>
        chat.id === chatId
          ? { ...chat, messages: updatedMessages }
          : chat
      ));

      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
      <div className="flex flex-col md:flex-row h-full w-full bg-gradient-to-b from-blue-50/30 to-white overflow-hidden">
        {/* Sidebar - Desktop (Kontener zapewniający stałą szerokość) */}
        {!isMobile && (
          <div className="hidden md:flex md:w-64 md:flex-shrink-0 h-full border-r border-gray-200">
            <Sidebar
              chats={chats}
              currentChatId={currentChatId}
              onNewChat={handleNewChat}
              onSelectChat={handleSelectChat}
              onDeleteChat={handleDeleteChat}
              isNewChatDisabled={currentChatId !== null && messages.length === 0}
            />
          </div>
      )}

      {/* Główny obszar czatu */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Mobile header */}
        {isMobile && (
          <div className="bg-white border-b border-gray-200 px-2 py-2 flex items-center justify-between">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
            >
              <MessageSquarePlus className="w-5 h-5 text-blue-900" />
            </button>

            {/* ŚRODKOWA CZĘŚĆ NAGŁÓWKA */}
            <div className="flex-1 px-2 text-center">
              {messages.length === 0 ? (
                // Wersja startowa: Tekst instrukcji przeniesiony tutaj
                <span className="text-xs font-medium text-gray-600 leading-tight block">
                  Wybierz akty prawne z których ma korzystać Asystent w czasie tej rozmowy:
                </span>
              ) : (
                // Wersja w trakcie rozmowy: Tytuł aplikacji
                <div className="text-sm font-semibold text-blue-900">
                  <span className="font-light"> Legal Chat</span>
                </div>
              )}
            </div>

            {/* Pusty element dla zachowania symetrii */}
            <div className="w-8 flex-shrink-0" />
          </div>
        )}

        {/* Banner z aktywnymi aktami prawnymi - pokazuje się tylko gdy są wiadomości */}
        {messages.length > 0 && (
          <div className="bg-white border-b border-gray-200 px-2 py-1.5 sticky top-0 z-10">
            <div className="max-w-6xl mx-auto flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-600">
                <span className="hidden md:inline">Aktywne Akty Prawne:</span>
                <span className="md:hidden">Aktywne:</span>
              </span>
              {Object.entries(selectedActs)
                .filter(([_, isSelected]) => isSelected)
                .map(([act]) => (
                  <span
                    key={act}
                    className="relative px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-md border border-gray-200 cursor-default group"
                    title={ACT_FULL_NAMES[act] || act}
                  >
                    {act}
                    {/* Tooltip */}
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-white text-gray-700 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap shadow-lg border border-gray-200">
                      {ACT_FULL_NAMES[act] || act}
                      {/* Strzałka */}
                      <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                        <span className="block w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></span>
                      </span>
                    </span>
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* Obszar wiadomości */}
        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea
            className="h-full no-scrollbar"
            ref={scrollAreaRef}
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="max-w-6xl mx-auto px-2 py-3 pb-24 md:pb-3 space-y-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-2">
                  {/* Logo i opis */}
                  <div className="space-y-3 mb-4">
                    {/* Filtry aktów prawnych */}
                    <div className="max-w-3xl mx-auto">
                      <p className="hidden md:block text-gray-600 text-sm mb-8">Wybierz akty prawne z których ma korzystać Asystent w czasie tej rozmowy:</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 md:gap-2">
                        {/* KPK */}
                        <button
                          onClick={() => setSelectedActs(prev => ({ ...prev, KPK: !prev.KPK }))}
                          className={`px-2 py-1.5 md:px-3 md:py-2 rounded-lg border transition-all ${
                            selectedActs.KPK
                              ? 'border-blue-400 bg-blue-50/50'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 md:gap-2">
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                              selectedActs.KPK
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-gray-300 bg-white'
                            }`}>
                              {selectedActs.KPK && (
                                <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <div className="font-semibold text-xs md:text-sm text-gray-800">KPK</div>
                              <div className="text-[10px] md:text-xs text-gray-500 truncate">Postępowanie Karne</div>
                            </div>
                          </div>
                        </button>

                        {/* KPA */}
                        <button
                          onClick={() => setSelectedActs(prev => ({ ...prev, KPA: !prev.KPA }))}
                          className={`px-2 py-1.5 md:px-3 md:py-2 rounded-lg border transition-all ${
                            selectedActs.KPA
                              ? 'border-blue-400 bg-blue-50/50'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 md:gap-2">
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                              selectedActs.KPA
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-gray-300 bg-white'
                            }`}>
                              {selectedActs.KPA && (
                                <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <div className="font-semibold text-xs md:text-sm text-gray-800">KPA</div>
                              <div className="text-[10px] md:text-xs text-gray-500 truncate">Postępowanie Administracyjne</div>
                            </div>
                          </div>
                        </button>

                        {/* KPC */}
                        <button
                          onClick={() => setSelectedActs(prev => ({ ...prev, KPC: !prev.KPC }))}
                          className={`px-2 py-1.5 md:px-3 md:py-2 rounded-lg border transition-all ${
                            selectedActs.KPC
                              ? 'border-blue-400 bg-blue-50/50'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 md:gap-2">
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                              selectedActs.KPC
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-gray-300 bg-white'
                            }`}>
                              {selectedActs.KPC && (
                                <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <div className="font-semibold text-xs md:text-sm text-gray-800">KPC</div>
                              <div className="text-[10px] md:text-xs text-gray-500 truncate">Postępowanie Cywilne</div>
                            </div>
                          </div>
                        </button>

                        {/* KPE */}
                        <button
                          onClick={() => setSelectedActs(prev => ({ ...prev, KPE: !prev.KPE }))}
                          className={`px-2 py-1.5 md:px-3 md:py-2 rounded-lg border transition-all ${
                            selectedActs.KPE
                              ? 'border-blue-400 bg-blue-50/50'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 md:gap-2">
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                              selectedActs.KPE
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-gray-300 bg-white'
                            }`}>
                              {selectedActs.KPE && (
                                <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <div className="font-semibold text-xs md:text-sm text-gray-800">KPE</div>
                              <div className="text-[10px] md:text-xs text-gray-500 truncate">Postępowanie Egzekucyjne</div>
                            </div>
                          </div>
                        </button>

                        {/* SUS */}
                        <button
                          onClick={() => setSelectedActs(prev => ({ ...prev, SUS: !prev.SUS }))}
                          className={`px-2 py-1.5 md:px-3 md:py-2 rounded-lg border transition-all ${
                            selectedActs.SUS
                              ? 'border-blue-400 bg-blue-50/50'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 md:gap-2">
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                              selectedActs.SUS
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-gray-300 bg-white'
                            }`}>
                              {selectedActs.SUS && (
                                <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <div className="font-semibold text-xs md:text-sm text-gray-800">SUS</div>
                              <div className="text-[10px] md:text-xs text-gray-500 truncate">System Ubezpieczeń Społ.</div>
                            </div>
                          </div>
                        </button>

                        {/* KK - Wkrótce */}
                        <button
                          disabled
                          className="px-2 py-1.5 md:px-3 md:py-2 rounded-lg border border-gray-200 bg-gray-50/50 opacity-50 cursor-not-allowed"
                        >
                          <div className="flex items-center gap-1.5 md:gap-2">
                            <div className="w-3.5 h-3.5 rounded border border-gray-300 bg-white flex-shrink-0"></div>
                            <div className="text-left flex-1 min-w-0">
                              <div className="font-semibold text-xs md:text-sm text-gray-500">KK</div>
                              <div className="text-[10px] md:text-xs text-gray-400 truncate">Kodeks Karny • Wkrótce</div>
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[95%] md:max-w-[90%] rounded-2xl px-4 py-3 break-words overflow-hidden ${ // <--- DODANO break-words overflow-hidden
                        message.type === 'user'
                          ? 'bg-blue-900 text-white rounded-br-sm'
                          : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                      }`}
                    >
                      {/* Treść wiadomości z markdown */}
                      {message.type === 'user' ? (
                        <div className="markdown-content">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                // Nagłówki (bez zmian)
                                h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-4 mb-2" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-3 mb-2" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-base font-bold mt-2 mb-1" {...props} />,

                                // --- POPRAWKA LISTOWANIA ---
                                ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 my-2 space-y-1" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 my-2 space-y-1" {...props} />,

                                li: ({node, ...props}) => <li className="pl-1" {...props} />,

                                // Pogrubienie i kursywa (bez zmian)
                                strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
                                em: ({node, ...props}) => <em className="italic" {...props} />,

                                // UNIWERSALNE PARSOWANIE PRZYPISÓW (bez zmian)
                                text: ({value}: any) => {
                                  if (typeof value !== 'string') return value;
                                  const parts = [];
                                  const regex = /\[(\d+)\]/g;
                                  let lastIndex = 0;
                                  let match;
                                  while ((match = regex.exec(value)) !== null) {
                                    if (match.index > lastIndex) {
                                      parts.push(value.slice(lastIndex, match.index));
                                    }
                                    parts.push(
                                      <sup key={`fn-${match.index}`} className="text-red-600 font-semibold mx-0.5">
                                        [{match[1]}]
                                      </sup>
                                    );
                                    lastIndex = regex.lastIndex;
                                  }
                                  if (lastIndex < value.length) {
                                    parts.push(value.slice(lastIndex));
                                  }
                                  return parts.length > 1 ? <>{parts}</> : value;
                                },

                                // Akapity
                                p: ({node, ...props}: any) => <p className="my-2 leading-relaxed" {...props} />,

                                // Kod (bez zmian)
                                code: ({node, inline, ...props}: any) =>
                                  inline
                                    ? <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props} />
                                    : <code className="block bg-gray-100 p-2 rounded my-2 text-sm" {...props} />,
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        // Wiadomość asystenta - nowa struktura z zakładkami
                        <>
                          {(() => {
                            const { justification, summary } = parseAssistantResponse(message.content);
                            return (
                              <>
                                {/* Szybka odpowiedź */}
                                {summary && (
                                  <div className="markdown-content">
                                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Szybka odpowiedź:</h3>
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm]}
                                      components={{
                                          h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-4 mb-2" {...props} />,
                                          h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-3 mb-2" {...props} />,
                                          h3: ({node, ...props}) => <h3 className="text-base font-bold mt-2 mb-1" {...props} />,
                                          ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 my-2 space-y-1" {...props} />,
                                          ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 my-2 space-y-1" {...props} />,
                                          li: ({node, ...props}) => <li className="pl-1" {...props} />,
                                          strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
                                          em: ({node, ...props}) => <em className="italic" {...props} />,
                                          text: ({value}: any) => {
                                            if (typeof value !== 'string') return value;
                                            const parts = [];
                                            const regex = /\[(\d+)\]/g;
                                            let lastIndex = 0;
                                            let match;
                                            while ((match = regex.exec(value)) !== null) {
                                              if (match.index > lastIndex) {
                                                parts.push(value.slice(lastIndex, match.index));
                                              }
                                              parts.push(
                                                <sup key={`fn-${match.index}`} className="text-red-600 font-semibold mx-0.5">
                                                  [{match[1]}]
                                                </sup>
                                              );
                                              lastIndex = regex.lastIndex;
                                            }
                                            if (lastIndex < value.length) {
                                              parts.push(value.slice(lastIndex));
                                            }
                                            return parts.length > 1 ? <>{parts}</> : value;
                                          },
                                          p: ({node, ...props}: any) => <p className="my-2 leading-relaxed" {...props} />,
                                          code: ({node, inline, ...props}: any) =>
                                            inline
                                              ? <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props} />
                                              : <code className="block bg-gray-100 p-2 rounded my-2 text-sm" {...props} />,
                                      }}
                                    >
                                      {summary}
                                    </ReactMarkdown>
                                  </div>
                                )}

                                {/* Uzasadnienie - zakładka rozwijana */}
                                {justification && (
                                  <CollapsibleSection title="Uzasadnienie">
                                    <div className="markdown-content">
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-4 mb-2" {...props} />,
                                            h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-3 mb-2" {...props} />,
                                            h3: ({node, ...props}) => <h3 className="text-base font-bold mt-2 mb-1" {...props} />,
                                            ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 my-2 space-y-1" {...props} />,
                                            ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 my-2 space-y-1" {...props} />,
                                            li: ({node, ...props}) => <li className="pl-1" {...props} />,
                                            strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
                                            em: ({node, ...props}) => <em className="italic" {...props} />,
                                            text: ({value}: any) => {
                                              if (typeof value !== 'string') return value;
                                              const parts = [];
                                              const regex = /\[(\d+)\]/g;
                                              let lastIndex = 0;
                                              let match;
                                              while ((match = regex.exec(value)) !== null) {
                                                if (match.index > lastIndex) {
                                                  parts.push(value.slice(lastIndex, match.index));
                                                }
                                                parts.push(
                                                  <sup key={`fn-${match.index}`} className="text-red-600 font-semibold mx-0.5">
                                                    [{match[1]}]
                                                  </sup>
                                                );
                                                lastIndex = regex.lastIndex;
                                              }
                                              if (lastIndex < value.length) {
                                                parts.push(value.slice(lastIndex));
                                              }
                                              return parts.length > 1 ? <>{parts}</> : value;
                                            },
                                            p: ({node, ...props}: any) => <p className="my-2 leading-relaxed" {...props} />,
                                            code: ({node, inline, ...props}: any) =>
                                              inline
                                                ? <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props} />
                                                : <code className="block bg-gray-100 p-2 rounded my-2 text-sm" {...props} />,
                                        }}
                                      >
                                        {justification}
                                      </ReactMarkdown>
                                    </div>
                                  </CollapsibleSection>
                                )}
                              </>
                            );
                          })()}
                        </>
                      )}

                      {/* Źródła jako klikalne linki w stopce - teraz jako zakładka rozwijana dla asystenta */}
                      {message.sources && message.sources.length > 0 && (
                        message.type === 'user' ? (
                          <div className="mt-4 pt-3 border-t border-gray-300">
                            <p className="text-xs font-medium text-gray-600 mb-2">Przypisy:</p>
                            <div className="space-y-1">
                              {message.sources.map((source, idx) => {
                                return (
                                  <button
                                    key={`${source.id}-${idx}`}
                                    onClick={() => setSelectedSource(source)}
                                    className="block w-full text-left text-xs text-gray-700 hover:text-blue-900 hover:bg-gray-50 px-2 py-1.5 rounded transition-colors cursor-pointer"
                                  >
                                    <div className="flex items-start gap-1.5">
                                      <span className="font-medium text-blue-900 shrink-0">[{idx + 1}]</span>
                                      <span className="font-medium shrink-0">({source.type || '?'})</span>
                                      {source.act && (
                                        <span className="font-medium shrink-0">{source.act}</span>
                                      )}
                                      {source.article && (
                                        <span className="font-medium shrink-0">Art. {source.article}</span>
                                      )}
                                      {source.paragraph && (
                                        <span className="font-medium shrink-0">§ {source.paragraph}</span>
                                      )}
                                      <span className="shrink-0">-</span>
                                      <span className="text-gray-600 flex-1 min-w-0 line-clamp-2 sm:line-clamp-2 md:line-clamp-1">
                                        {source.content}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <CollapsibleSection title="Podstawy prawne">
                            <div className="space-y-1">
                              {message.sources.map((source, idx) => {
                                return (
                                  <button
                                    key={`${source.id}-${idx}`}
                                    onClick={() => setSelectedSource(source)}
                                    className="block w-full text-left text-xs text-gray-700 hover:text-blue-900 hover:bg-gray-50 px-2 py-1.5 rounded transition-colors cursor-pointer"
                                  >
                                    <div className="flex items-start gap-1.5">
                                      <span className="font-medium text-blue-900 shrink-0">[{idx + 1}]</span>
                                      <span className="font-medium shrink-0">({source.type || '?'})</span>
                                      {source.act && (
                                        <span className="font-medium shrink-0">{source.act}</span>
                                      )}
                                      {source.article && (
                                        <span className="font-medium shrink-0">Art. {source.article}</span>
                                      )}
                                      {source.paragraph && (
                                        <span className="font-medium shrink-0">§ {source.paragraph}</span>
                                      )}
                                      <span className="shrink-0">-</span>
                                      <span className="text-gray-600 flex-1 min-w-0 line-clamp-2 sm:line-clamp-2 md:line-clamp-1">
                                        {source.content}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </CollapsibleSection>
                        )
                      )}

                      <div
                        className={`text-xs mt-2 ${
                          message.type === 'user' ? 'text-blue-200' : 'text-gray-400'
                        }`}
                      >
                        {message.timestamp.toLocaleTimeString('pl-PL', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Loader */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-900 flex-shrink-0" />
                      <span className="text-sm text-gray-600">
                        Przeszukuję dostępne Akty Prawne aby udzielić najlepszej odpowiedzi...
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Input - ZAWSZE WIDOCZNY - przyklejony nad stopką */}
        <div className="fixed md:sticky bottom-[40px] md:bottom-0 left-0 right-0 border-t border-gray-200 bg-white backdrop-blur-sm md:bg-white/80 z-20 mt-auto">
          <div className="max-w-6xl mx-auto px-2 py-2 md:px-4 md:py-3">
            <form onSubmit={handleSubmit} className="relative">
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-2xl shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={messages.length === 0 ? "Rozpocznij rozmowę..." : "Kontynuuj rozmowę..."}
                  className="flex-1 px-3 py-[13px] md:py-[15px] bg-transparent border-0 outline-none resize-none max-h-[200px] min-h-[44px] md:min-h-[52px] text-gray-900 placeholder:text-gray-400 text-sm "
                  rows={1}
                  disabled={isLoading}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={`m-1.5 md:m-2 p-2 rounded-xl transition-all ${
                    input.trim() && !isLoading
                      ? 'bg-blue-900 text-white hover:bg-blue-800 shadow-sm'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1 text-center hidden md:block">
                Naciśnij Enter aby wysłać, Shift+Enter dla nowej linii
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        chats={chats}
        currentChatId={currentChatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        isNewChatDisabled={currentChatId !== null && messages.length === 0}
      />

      {/* Source Card Popup */}
      {selectedSource && (
        <SourceCard
          source={selectedSource}
          onClose={() => setSelectedSource(null)}
        />
      )}
    </div>
  );
};

export default ChatInterface;