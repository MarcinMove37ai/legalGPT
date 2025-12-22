// src/app/dashboard/layout.tsx
"use client"

import React, { useState, ReactNode, useEffect, createContext, useContext, Suspense } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import {
  Home,
  Menu,
  X,
  Scale, // Waga
  Wallet,
  UserX,
  Lock,
  FileText, // Kartka
  Library,
  Bot,
  ChevronDown,
  ChevronRight,
  Gavel,
  MessageSquare, // Dymek
  EyeOff, // Przekreślone oko
  ArrowRight
} from 'lucide-react';
import { getDecisionStatsAction } from '@/app/actions';

// Custom Icon Components
interface CustomIconProps {
  size?: number;
  className?: string;
  isActive?: boolean;
}

const InstagramIcon: React.FC<CustomIconProps> = ({ size = 20, className = '', isActive = false }) => {
  return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <img
        src="/ig.png"
        alt="Instagram"
        className={`transition-all duration-200 ${className}`}
        style={{
          width: size,
          height: size,
          opacity: isActive ? 1 : 0.7,
          transform: isActive ? 'scale(1.1)' : 'scale(1)',
        }}
      />
    </div>
  );
};

const LinkedInIcon: React.FC<CustomIconProps> = ({ size = 20, className = '', isActive = false }) => {
  return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <img
        src="/linkedin.png"
        alt="LinkedIn"
        className={`transition-all duration-200 ${className}`}
        style={{
          width: size,
          height: size,
          opacity: isActive ? 1 : 0.7,
          transform: isActive ? 'scale(1.1)' : 'scale(1)',
        }}
      />
    </div>
  );
};

// Menu items configuration
interface SubMenuItem {
  label: string;
  path: string;
  count?: number;
  statusKey?: 'total' | 'new' | 'in_progress' | 'pending' | 'closed';
}

interface MenuItem {
  IconComponent: LucideIcon | React.FC<CustomIconProps>;
  label: string;
  path: string;
  fullWidth?: boolean;
  iconType?: 'instagram' | 'linkedin';
  subItems?: SubMenuItem[];
  disabled?: boolean; // Dodane pole disabled
}

interface DecisionStats {
  total: number;
  new: number;
  in_progress: number;
  pending: number;
  closed: number;
}

const getMenuItems = (lang: 'pl', stats?: DecisionStats): MenuItem[] => [
  {
    IconComponent: MessageSquare, // Dymek wiadomości
    label: 'Legal Chat',
    path: '/dashboard/chat',
    disabled: false // Aktywne
  },
  {
    IconComponent: EyeOff, // Przekreślone oko
    label: 'Anonimizacja',
    path: '/dashboard/ocr',
    disabled: true // Zablokowane
  },
  {
    IconComponent: Scale, // Waga
    label: 'Baza orzeczeń',
    path: '/dashboard/judgments',
    disabled: true // Zablokowane
  },
  {
    IconComponent: FileText, // Kartka
    label: 'Dokumenty kancelarii',
    path: '/dashboard/documents', // Unikalna ścieżka (naprawa błędu kluczy)
    disabled: true // Zablokowane
  }
];

const getCurrentPageLabel = (path: string | null, lang: 'pl' = 'pl') => {
  if (!path) return 'Dashboard';

  if (path.includes('/dashboard/ocr')) {
    return 'AI Powered OCR';
  }

  const menuItems = getMenuItems(lang);
  let menuItem = menuItems.find(item => path.split('?')[0] === item.path);

  if (!menuItem) {
    menuItem = menuItems.find(item => item.subItems?.some(sub => sub.path.split('?')[0] === path.split('?')[0]));
  }

  return menuItem?.label || 'Dashboard';
};

// Context Definitions
interface LayoutContextType {
  hoveredSidebar: boolean;
  setHoveredSidebar: (value: boolean) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (value: boolean) => void;
  isNavigating: boolean;
  setIsNavigating: (value: boolean) => void;
  decisionStats: DecisionStats;
  refreshStats: () => Promise<void>;
}

const LayoutContext = createContext<LayoutContextType | null>(null);

export const LayoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [hoveredSidebar, setHoveredSidebar] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('sidebarExpanded') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [decisionStats, setDecisionStats] = useState<DecisionStats>({
    total: 0,
    new: 0,
    in_progress: 0,
    pending: 0,
    closed: 0
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebarExpanded', hoveredSidebar.toString());
    }
  }, [hoveredSidebar]);

  const refreshStats = async () => {
    const result = await getDecisionStatsAction();
    if (result.success) {
      setDecisionStats(result.data);
    }
  };

  useEffect(() => {
    refreshStats();
  }, []);

  return (
    <LayoutContext.Provider value={{
      hoveredSidebar,
      setHoveredSidebar,
      isMobileMenuOpen,
      setIsMobileMenuOpen,
      isNavigating,
      setIsNavigating,
      decisionStats,
      refreshStats
    }}>
      {children}
    </LayoutContext.Provider>
  );
};

const useLayout = () => {
  const context = useContext(LayoutContext);
  if (!context) throw new Error('useLayout must be used within LayoutProvider');
  return context;
};

const renderMenuIcon = (item: MenuItem, isActive: boolean, size: number = 20) => {
  const IconComponent = item.IconComponent;
  if (item.iconType === 'instagram' || item.iconType === 'linkedin') {
    return <IconComponent size={size} isActive={isActive} />;
  }
  return <IconComponent size={size} />;
};

// Sidebar Component
interface SidebarProps { currentLang: 'pl'; }

const Sidebar: React.FC<SidebarProps> = ({ currentLang }) => {
  const { hoveredSidebar, setHoveredSidebar, isMobileMenuOpen, setIsMobileMenuOpen, setIsNavigating, decisionStats } = useLayout();
  const pathname = usePathname();
  const menuItems = getMenuItems(currentLang, decisionStats);
  const [isMobile, setIsMobile] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isScreenSizeDetected, setIsScreenSizeDetected] = useState(false);

  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  const normalizedPathname = pathname?.endsWith('/') ? pathname.slice(0, -1) : pathname;

  useEffect(() => setIsClient(true), []);

  useEffect(() => {
    if (pathname) {
      const activeParent = menuItems.find(item =>
        item.path === pathname || item.subItems?.some(sub => pathname.startsWith(sub.path.split('?')[0]))
      );
      if (activeParent && activeParent.subItems && !expandedMenus.includes(activeParent.path)) {
        setExpandedMenus(prev => [...prev, activeParent.path]);
      }
    }
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = window.innerWidth < 768;
      setIsMobile(newIsMobile);
      setIsScreenSizeDetected(true);
      if (newIsMobile && hoveredSidebar) setHoveredSidebar(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [hoveredSidebar, setHoveredSidebar]);

  const handleNavigation = () => {
    setIsNavigating(true);
    if (isMobile) setIsMobileMenuOpen(false);
    setTimeout(() => setIsNavigating(false), 500);
  };

  const toggleMenu = (path: string) => {
    setExpandedMenus(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const renderMenuItem = (item: MenuItem, index: number, isMobileRender: boolean) => {
    const isActive = !!(normalizedPathname === item.path || item.subItems?.some(sub => normalizedPathname === sub.path.split('?')[0]));
    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isExpanded = expandedMenus.includes(item.path);
    const showExpandedContent = isExpanded && (isMobileRender || hoveredSidebar);

    const menuItemContent = (
      <>
        <div className={`flex-shrink-0 w-6 h-6 flex items-center justify-center transition-all duration-200 ${isActive ? 'text-blue-600 scale-110' : 'text-gray-600 group-hover/link:text-gray-700 group-hover/link:scale-105'}`}>
          {renderMenuIcon(item, isActive, 20)}
        </div>

        <span className={`ml-4 whitespace-nowrap font-medium overflow-hidden transition-all duration-300 ease-out flex-1 flex items-center justify-between
          ${(hoveredSidebar || isMobileRender) ? 'opacity-100 translate-x-0 w-auto' : 'opacity-0 translate-x-2 w-0'}`}>
          {item.label}
          {hasSubItems && (
            <span className="ml-2 text-gray-400">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          )}
        </span>
      </>
    );

    // Logic for disabled state
    const isDisabled = item.disabled;

    const commonClasses = `relative flex items-center min-h-[48px] px-3 group/link rounded-xl transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1
      ${isDisabled
        ? 'opacity-40 cursor-not-allowed pointer-events-none grayscale' // Style dla zablokowanych
        : 'cursor-pointer hover:bg-gray-50 hover:shadow-sm hover:scale-[1.02]' // Style dla aktywnych
      }
      ${isActive && !hasSubItems && !isDisabled
        ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 shadow-sm border border-blue-200'
        : 'border border-transparent text-gray-700'
      }
    `;

    return (
      <li key={item.path} className="mb-1" style={{ transitionDelay: isMobileRender ? `${index * 50}ms` : '0ms' }}>
        <div className="relative group">

          {hasSubItems ? (
            <div
              onClick={() => !isDisabled && toggleMenu(item.path)}
              className={commonClasses}
            >
              {menuItemContent}
            </div>
          ) : (
            <Link
              href={isDisabled ? '#' : item.path}
              onClick={(e) => {
                if(isDisabled) e.preventDefault();
                else handleNavigation();
              }}
              className={commonClasses}
            >
              {menuItemContent}
            </Link>
          )}

          {hasSubItems && !isDisabled && (
            <div className={`overflow-hidden transition-all duration-300 ease-in-out bg-white ${(showExpandedContent) ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
              <ul className="space-y-1 pt-1 pb-2">
                {item.subItems!.map((subItem) => {
                   const isSubActive = pathname === subItem.path.split('?')[0] && (
                     subItem.path.includes('?')
                       ? window.location.search.includes(subItem.path.split('?')[1])
                       : window.location.search === ''
                   );

                   return (
                    <li key={subItem.path}>
                      <Link
                        href={subItem.path}
                        onClick={handleNavigation}
                        className={`flex items-center justify-between h-9 pl-12 pr-3 text-sm rounded-lg transition-colors
                          ${isSubActive ? 'text-blue-700 bg-blue-50 font-medium' : 'text-gray-500 hover:text-blue-600 hover:bg-gray-50'}
                        `}
                      >
                        <span className="truncate">{subItem.label}</span>
                        {subItem.count !== undefined && (
                          <span className={`
                            ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full border
                            ${subItem.count > 0
                              ? 'bg-blue-100 text-blue-600 border-blue-200'
                              : 'bg-gray-100 text-gray-400 border-gray-200'}
                          `}>
                            {subItem.count}
                          </span>
                        )}
                      </Link>
                    </li>
                   );
                })}
              </ul>
            </div>
          )}

          {!hoveredSidebar && !isMobileRender && (
            <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
              {item.label}
              <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          )}
        </div>
      </li>
    );
  };

  if (!isScreenSizeDetected) return null;

  if (isMobile) {
    if (!isClient) return null;
    return (
      <div className={`fixed left-0 z-50 top-25 bottom-1 w-80 bg-white/95 backdrop-blur-xl backdrop-saturate-150 shadow-2xl rounded-r-3xl transition-all duration-300 ease-out overflow-y-auto border-r border-gray-100 ${isMobileMenuOpen ? 'transform translate-x-0' : 'transform -translate-x-full'}`} style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
        <div className="flex flex-col h-full">
          <nav className="flex-1 py-6">
            <ul className="space-y-2 px-4">
              {menuItems.map((item, index) => renderMenuItem(item, index, true))}
            </ul>
          </nav>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed left-0 z-40 top-25 h-[calc(100vh-6.25rem)] bg-white shadow-xl rounded-r-3xl overflow-hidden backdrop-blur-sm transition-all duration-300 ease-out border-r border-gray-100 ${hoveredSidebar ? 'w-80' : 'w-20'}`}
      onMouseEnter={() => !isMobile && setHoveredSidebar(true)}
      onMouseLeave={() => !isMobile && setHoveredSidebar(false)}
      style={{ transform: 'translateX(0)', boxShadow: hoveredSidebar ? '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 10px 20px -5px rgba(0, 0, 0, 0.1)' : '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }}
    >
      <nav className="py-4 h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-200">
        <ul className="space-y-1 px-3">
          {menuItems.map((item, index) => renderMenuItem(item, index, false))}
        </ul>
      </nav>
    </div>
  );
};

// Header Component
interface HeaderProps { currentLang: 'pl'; langReady: boolean; }

const Header: React.FC<HeaderProps> = ({ currentLang, langReady }) => {
  const { isMobileMenuOpen, setIsMobileMenuOpen } = useLayout();

  const pathname = usePathname();
  const isEzdPage = pathname?.includes('/dashboard/ezd');

  const [isMobile, setIsMobile] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isScreenSizeDetected, setIsScreenSizeDetected] = useState(false);

  useEffect(() => setIsClient(true), []);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsScreenSizeDetected(true);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 h-25 bg-white shadow-sm border-b border-gray-200 z-50 flex items-center justify-between px-4 md:px-6" style={{ transition: 'padding 0.3s ease-out' }}>
      {/* Lewa strona - tylko hamburger na mobile */}
      <div className="flex items-center flex-shrink-0">
        {isMobile && isScreenSizeDetected && (
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95">
            <div className="relative w-6 h-6">
              {isMobileMenuOpen ? (isClient && <X className="h-6 w-6 text-gray-600 transition-transform duration-200 rotate-0 hover:rotate-90" />) : (isClient && <Menu className="h-6 w-6 text-gray-600 transition-transform duration-200" />)}
            </div>
          </button>
        )}

        {/* Logo na desktop - po lewej, klikalny */}
        {!isMobile && (
          <Link
            href="/dashboard/chat"
            className="ml-0 cursor-pointer group"
          >
            <div className="flex items-center">
              <div className="h-16 w-auto bg-white rounded-xl shadow-lg border border-gray-200 flex items-center justify-center px-3 py-2 transition-all duration-200 group-hover:shadow-xl group-hover:scale-105">
                <img src="/logo.webp" alt="Logo" className="h-full w-auto object-contain" />
              </div>
            </div>
          </Link>
        )}
      </div>


      {/* Prawa strona */}
      <div className="flex items-center space-x-4">
        {/* Logo na mobile - po prawej, NIE klikalny */}
        {isMobile && isScreenSizeDetected && (
          <div className="flex items-center">
            <div className="h-14 w-auto bg-white rounded-xl shadow-lg border border-gray-200 flex items-center justify-center px-3 py-2">
              <img src="/logo.webp" alt="Logo" className="h-full w-auto object-contain" />
            </div>
          </div>
        )}

        {/* Marcin Lisiak - tylko desktop */}
        {!isMobile && isClient && (
          !isEzdPage ? (
            <a href="https://www.linkedin.com/in/move37th/" target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer hover:scale-105">
              <div className="flex items-center gap-2 font-['Poppins']">
                <span className="text-sm font-medium text-gray-800">Marcin Lisiak</span>
                <span className="text-gray-300">|</span>
                <span className="text-sm text-gray-500">move37th.ai</span>
              </div>
            </a>
          ) : (
            <div className="px-4 py-2 bg-white rounded-xl border border-gray-200 shadow-sm cursor-default">
              <div className="flex items-center gap-2 font-['Poppins']">
                <span className="text-sm font-medium text-gray-800">Marcin Lisiak</span>
                <span className="text-gray-300">|</span>
                <span className="text-sm text-gray-500">move37th.ai</span>
              </div>
            </div>
          )
        )}
      </div>
    </header>
  );
};

const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-gray-200 z-50 shrink-0 text-xs
      /* Mobile: Siatka 2x2 z paddingiem */
      grid grid-cols-2 gap-x-2 p-4
      /* Desktop: Flexbox w jednej linii */
      md:flex md:items-center md:justify-between md:px-6 md:py-3">

      {/* 1. Copyright
          Mobile: Lewa Góra (Order 1)
          Desktop: Lewa strona (Order 1)
      */}
      <div className="text-gray-400 leading-tight order-1 text-left md:order-1">
        &copy; 2026{' '}
        <a
          href="https://rejestr.io/krs/1044483/aquatrek-solutions"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-600 transition-colors"
        >
          Aquatrek Solutions P.S.A
        </a>
        <span className="hidden md:inline"> | Kapitał akcyjny 50.000 PLN</span>
      </div>

      {/* 2. Wersja
          Mobile: Prawa Góra (Order 2)
          Desktop: Prawa krawędź (Order 4)
      */}
      <span className="text-blue-300 whitespace-nowrap order-2 text-right md:order-4 md:ml-4 md:text-left">
        v.4 beta/MVP/22dec
      </span>

      {/* 3. Linia podziału (TYLKO MOBILE) */}
      <div className="col-span-2 border-t border-gray-100 my-2 order-3 md:hidden"></div>

      {/* 4. Polityka Prywatności
          Mobile: Lewy Dół (Order 4)
          Desktop: Prawa strona (Order 2)
      */}
      <a
        href="#"
        className="text-gray-500 hover:text-blue-600 transition-colors font-medium order-4 text-left md:order-2 md:ml-auto"
      >
        Polityka Prywatności
      </a>

      {/* 5. Regulamin
          Mobile: Prawy Dół (Order 5)
          Desktop: Prawa strona (Order 3)
      */}
      <a
        href="#"
        className="text-gray-500 hover:text-blue-600 transition-colors font-medium order-5 text-right md:order-3 md:ml-4 md:text-left"
      >
        Regulamin
      </a>
    </footer>
  );
};

// Main Layout with Login Logic
interface DashboardLayoutProps {
  children: ReactNode;
  disableMenu?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  disableMenu = false
}) => {
  const { hoveredSidebar, isNavigating, isMobileMenuOpen, setIsMobileMenuOpen } = useLayout();
  const pathname = usePathname();
  const isEzdPage = pathname?.includes('/dashboard/ezd');
  const [isMobile, setIsMobile] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isScreenSizeDetected, setIsScreenSizeDetected] = useState(false);
  const [isVerySmallScreen, setIsVerySmallScreen] = useState(false);
  const [currentLang] = useState<'pl'>('pl');
  const [langReady, setLangReady] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const auth = localStorage.getItem('dashboard_auth_token');
    if (auth === 'valid') {
      setIsAuthenticated(true);
    }
    setIsCheckingAuth(false);
    setIsClient(true);
    setLangReady(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'marcin') {
      localStorage.setItem('dashboard_auth_token', 'valid');
      setIsAuthenticated(true);
      setLoginError(false);
    } else {
      setLoginError(true);
      setTimeout(() => setLoginError(false), 2000);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsVerySmallScreen(window.innerWidth < 460);
      setIsScreenSizeDetected(true);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isCheckingAuth) {
    return null;
  }

  const menuItems = getMenuItems(currentLang);
  const currentMenuItem = menuItems.find(item =>
    (pathname?.endsWith('/') ? pathname.slice(0, -1) : pathname) === item.path
  );
  const isFullWidthPage = currentMenuItem?.fullWidth || false;

  return (
    <>
      {!isAuthenticated && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-md transition-all duration-500">
          <div className="w-full max-w-sm p-8 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 flex flex-col items-center transform transition-all animate-in fade-in zoom-in-95 duration-300">

            <div className="mb-6 p-4 bg-gray-50 rounded-full shadow-inner">
              <Lock className="w-8 h-8 text-gray-600" />
            </div>

            <h2 className="text-xl font-semibold text-gray-800 mb-2">Dostęp chroniony</h2>
            <p className="text-gray-500 text-sm mb-6 text-center">
              Wprowadź hasło, aby uzyskać dostęp do panelu.
            </p>

            <form onSubmit={handleLogin} className="w-full space-y-4">
              <div className="relative">
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  style={{ display: 'none' }}
                  aria-hidden="true"
                />

                <input
                  id="dashboard-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Hasło"
                  className={`
                    w-full px-4 py-3 rounded-xl border bg-white/50 focus:bg-white transition-all outline-none
                    focus:ring-2 focus:ring-offset-0 placeholder:text-gray-400 text-gray-800
                    ${loginError
                      ? 'border-red-300 focus:ring-red-200 animate-pulse'
                      : 'border-gray-200 focus:border-blue-300 focus:ring-blue-100'
                    }
                  `}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 bg-gradient-to-r from-gray-800 to-black hover:from-gray-700 hover:to-gray-900 text-white font-medium rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group"
              >
                <span>Wejdź</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>

            {loginError && (
              <p className="mt-4 text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1">
                Nieprawidłowe hasło
              </p>
            )}

            <div className="mt-8 text-xs text-gray-400">
               move37th.ai
            </div>
          </div>
        </div>
      )}

      {/* Zmieniono strukturę na flex-col, aby Footer był na samym dole całej strony */}
      <div className={`flex flex-col h-screen bg-gray-100 font-sans overflow-hidden transition-all duration-500 ${!isAuthenticated ? 'blur-sm scale-[0.99] pointer-events-none select-none' : 'blur-0 scale-100'}`}>

        {/* Środkowy kontener: Menu + Treść */}
        <div className="flex-1 flex overflow-hidden relative">
            {!disableMenu && !isEzdPage && <Sidebar currentLang={currentLang} />}

            {isMobile && isMobileMenuOpen && (
              <div
                className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-hidden="true"
              />
            )}

            {/* Kontener treści z marginesem dynamicznym */}
            <div
              className={`flex-1 flex flex-col transition-all duration-300 ease-out ${
              isMobile || disableMenu || isEzdPage || !isScreenSizeDetected
                ? 'ml-0'
                : hoveredSidebar
                  ? 'ml-80' // Zsynchronizowane z szerokością Sidebar (w-80)
                  : 'ml-20'
            }`}
              style={{
                paddingTop: '100px',
                height: '100%' // Wypełnia dostępną przestrzeń flexa
              }}
            >
              <Header currentLang={currentLang} langReady={langReady} />

              <main className="flex-1 px-1 min-[360px]:px-1.5 sm:px-2 pb-4 pt-1.5 overflow-y-auto no-scrollbar bg-gray-100 relative">
                {isNavigating && (
                  <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent"></div>
                  </div>
                )}

                {!isFullWidthPage && !disableMenu && (
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-2 pt-2 px-1 transition-all duration-300">

                    {/* LEWA STRONA: Minimalistyczna etykieta */}
                    <div className="flex items-center">
                        <h2 className="text-xl font-semibold text-gray-500 tracking-tight leading-none">
                          {getCurrentPageLabel(pathname, currentLang)}
                        </h2>
                    </div>

                    {/* PRAWA STRONA: Elegancka data */}
                    <div className="hidden md:flex items-center">
                      {isClient && (
                        <div className="flex items-center gap-3">
                          {/* Opcjonalna pionowa kreska separatora */}
                          <div className="h-8 w-px bg-gray-200 mx-2"></div>

                          <span className="text-sm font-medium text-gray-500 capitalize tracking-wide">
                            {new Date().toLocaleDateString('pl-PL', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className={`
                  transition-all duration-300 ease-out
                  ${isVerySmallScreen
                    ? 'bg-gray-100 p-0 h-full'
                    : isFullWidthPage || disableMenu
                      ? 'bg-white rounded-xl shadow-sm p-0 h-full overflow-hidden border border-gray-200 hover:shadow-md'
                      : 'bg-white rounded-xl shadow-sm p-2 min-[360px]:p-3 sm:p-4 md:p-8 h-full border border-gray-200 hover:shadow-md'
                  }`}
                >
                  {children}
                </div>
              </main>
            </div>
        </div>

        {/* Footer wyciągnięty na zewnątrz - zajmuje pełną szerokość */}
        <Footer />

      </div>
    </>
  );
};

const DashboardLayoutWithProvider: React.FC<DashboardLayoutProps> = (props) => {
  return (
    <LayoutProvider>
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-gradient-to-b from-blue-50/30 to-white">
          <div className="text-center space-y-6">
            <Link
              href="/dashboard/ocr"
              className="inline-block group cursor-pointer transition-all duration-300 hover:scale-105"
            >
              <h1 className="text-6xl font-bold text-blue-900 transition-colors duration-300 group-hover:text-blue-700">
                move<span className="font-light">37th</span>
              </h1>
              <p className="text-gray-500 text-sm mt-2 transition-colors duration-300 group-hover:text-gray-700">
                AI Powered OCR
              </p>
            </Link>

            <div className="flex flex-col items-center gap-3 mt-8">
              <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-blue-900 border-r-transparent"></div>
              <p className="text-gray-600 animate-pulse">Ładowanie...</p>
            </div>
          </div>
        </div>
      }>
        <DashboardLayout {...props} />
      </Suspense>
    </LayoutProvider>
  );
};

export default DashboardLayoutWithProvider;

export { useLayout };