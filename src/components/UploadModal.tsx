"use client"

import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Wifi,
  WifiOff,
  ShieldCheck,
  Smartphone,
  X,
  Loader2,
  Check,
  FileJson,
  Lock,
  CheckCircle2,
  Shield,
} from 'lucide-react';

interface NetworkStatus {
  wifiCardActive: boolean;
  wifiConnected: boolean;
  internetAccess: boolean;
  hotspotActive: boolean;
}

interface UploadModalProps {
  isOpen: boolean;
  networkStatus: NetworkStatus;
  onClose: () => void;
}

const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  networkStatus,
  onClose
}) => {
  const [visualStep, setVisualStep] = useState(0);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [qrUrlCode, setQrUrlCode] = useState<string>('');
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const isMounted = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setVisualStep(0);
      setIsClosing(false);
      isMounted.current = false;
      return;
    }

    if (!isMounted.current) {
      isMounted.current = true;

      if (networkStatus.hotspotActive && connectedDevice) {
        setVisualStep(5);
      } else {
        setVisualStep(1);
      }
    }

    let timeout: NodeJS.Timeout;

    const handleSequence = async () => {
      if (visualStep === 1) {
        if (!networkStatus.internetAccess) {
          timeout = setTimeout(() => setVisualStep(2), 1500);
        }
      }

      if (visualStep === 2) {
        if (networkStatus.hotspotActive) {
          timeout = setTimeout(() => setVisualStep(3), 1500);
        }
      }

      if (visualStep === 3) {
        timeout = setTimeout(() => setVisualStep(4), 1500);
      }
    };

    handleSequence();
    return () => clearTimeout(timeout);
  }, [isOpen, visualStep, networkStatus.internetAccess, networkStatus.hotspotActive, connectedDevice]);

  useEffect(() => {
    if (networkStatus.hotspotActive && visualStep >= 4) {
      const wifiQrData = `WIFI:T:WPA;S:Laptop Lenovo LOQ;P:12345678;;`;

      QRCode.toDataURL(wifiQrData, {
        width: 260,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      }).then(url => {
        setQrCodeUrl(url);
      }).catch(err => {
        console.error('QR WiFi generation error:', err);
      });

      const uploadUrl = `http://192.168.137.1:3000/upload-page`;

      QRCode.toDataURL(uploadUrl, {
        width: 260,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      }).then(url => {
        setQrUrlCode(url);
      }).catch(err => {
        console.error('QR URL generation error:', err);
      });
    }
  }, [networkStatus.hotspotActive, visualStep]);

  useEffect(() => {
    if (!isOpen || !networkStatus.hotspotActive || visualStep !== 4) return;

    const checkClients = async () => {
      try {
        const response = await fetch('/api/network/hotspot/clients');
        const data = await response.json();

        if (data.success && data.count > 0 && !connectedDevice) {
          const deviceName = data.clients[0].name;
          setConnectedDevice(deviceName);

          setTimeout(() => {
            setVisualStep(5);
          }, 2000);
        }
      } catch (error) {
        console.error('Error checking clients:', error);
      }
    };

    const interval = setInterval(checkClients, 2000);
    checkClients();

    return () => clearInterval(interval);
  }, [isOpen, networkStatus.hotspotActive, visualStep, connectedDevice]);

  const handleSimpleClose = () => {
    console.log('↩️ Zamykam modal - hotspot pozostaje aktywny');
    onClose();
  };

  const handleEndSession = async () => {
    console.log('🔴 Zakończ sesję - pełna deaktywacja');

    setIsClosing(true);

    setConnectedDevice(null);

    try {
      await fetch('/api/network/deactivate', { method: 'POST' });
    } catch (e) {
      console.error('Deactivate error:', e);
    }

    setIsClosing(false);
    onClose();
  };

  if (!isOpen) return null;

  const showSetupView = visualStep >= 1 && visualStep <= 3;
  const showQrWiFiView = visualStep === 4;
  const showQrUrlView = visualStep === 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-500">
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-xl transition-opacity"
        onClick={handleSimpleClose}
      />

      <div className="relative w-full max-w-[480px] bg-white rounded-[40px] shadow-2xl flex flex-col ring-1 ring-white/10 transition-all duration-700 h-auto max-h-[90vh] overflow-y-auto overflow-x-hidden">

        <div className="sticky top-0 z-30 h-24 shrink-0 flex items-center justify-between px-8 sm:px-10 bg-white/95 backdrop-blur-sm border-b border-transparent">
          <div className="flex gap-4 sm:gap-8">
            <MicroStatus
              label="Internet"
              isActive={networkStatus.internetAccess}
              iconOn={<Wifi size={14} />}
              iconOff={<WifiOff size={14} />}
              isError={!networkStatus.internetAccess}
            />
            <MicroStatus
              label="Hotspot"
              isActive={networkStatus.hotspotActive}
              iconOn={<Smartphone size={14} />}
              iconOff={<Smartphone size={14} />}
              isHotspot
            />
          </div>
          <button
            onClick={handleSimpleClose}
            className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors -mr-2 cursor-pointer"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 w-full relative">

          <div
            className={`w-full px-8 sm:px-12 py-6 transition-all duration-700 ease-in-out ${
              showSetupView
                ? 'relative opacity-100 translate-y-0'
                : 'absolute inset-0 opacity-0 -translate-y-10 pointer-events-none'
            }`}
          >
            <div className="flex flex-col justify-center">
              <div className="text-center mb-10">
                <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-sm shadow-indigo-100">
                  <Lock size={36} />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Izolacja środowiska</h2>
                <p className="text-slate-500 text-base sm:text-lg mt-3 px-4">Przygotuję bezpieczny tunel transferu danych...</p>
              </div>

              <div className="space-y-10 relative pl-2 sm:pl-4 mb-4">
                <div className="absolute left-[23px] sm:left-[29px] top-6 bottom-6 w-0.5 bg-slate-100 -z-10" />
                <StepRow
                  state={visualStep > 1 ? 'done' : visualStep === 1 ? 'active' : 'pending'}
                  label="Odcięcie Internetu"
                  subLabel="Terminal przechodzi w tryb offline"
                />
                <StepRow
                  state={visualStep > 2 ? 'done' : visualStep === 2 ? 'active' : 'pending'}
                  label="Start Hotspota"
                  subLabel="Tworzenie sieci lokalnej"
                />
                <StepRow
                  state={visualStep >= 3 ? 'done' : 'pending'}
                  label="Gotowość systemu"
                  subLabel="Oczekiwanie na połączenie"
                  isLast
                />
              </div>
            </div>
          </div>

          <div
            className={`w-full p-8 text-center transition-all duration-1000 ease-in-out ${
              showQrWiFiView
                ? 'relative opacity-100 translate-y-0 delay-200'
                : 'absolute inset-0 opacity-0 translate-y-16 pointer-events-none'
            }`}
          >
            <div className="inline-flex items-start gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-full text-[13px] font-bold uppercase tracking-wider mb-8 shadow-md">
              <ShieldCheck size={18} /> <span>Terminal odłączony od Internetu</span>
            </div>

            <div className="relative group mb-8 inline-block">
              <div className="absolute -inset-8 bg-gradient-to-tr from-indigo-500/20 to-emerald-500/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <div className="relative bg-white p-4 rounded-[36px] border border-slate-100 shadow-2xl">
                <div className="w-[220px] h-[220px] sm:w-[260px] sm:h-[260px] bg-white rounded-[28px] flex items-center justify-center overflow-hidden">
                  {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt="QR WiFi" className="w-full h-full object-contain" />
                  ) : (
                    <div className="relative w-full h-full p-4 flex items-center justify-center bg-slate-900 rounded-[28px]">
                      <Smartphone size={100} strokeWidth={1} className="text-white/20" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 mx-auto max-w-[340px]">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Zeskanuj kod WiFi</h2>
              <p className="text-slate-500 text-base leading-relaxed">
                Telefon automatycznie połączy się z siecią terminala
              </p>

              {connectedDevice ? (
                <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="inline-flex items-start gap-2 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-lg shadow-emerald-200">
                    <Shield size={18} className="shrink-0" />
                    <div className="text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90 whitespace-nowrap">Bezpiecznie połączono z urządzeniem:</p>
                      <p className="text-sm font-bold whitespace-nowrap">{connectedDevice}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-8">
                  <div className="inline-flex items-start gap-3 bg-slate-50 border border-slate-200 px-6 py-4 rounded-2xl">
                    <Loader2 size={20} className="text-slate-400 animate-spin" />
                    <p className="text-sm text-slate-600 font-medium">Oczekiwanie na połączenie...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div
            className={`w-full p-8 text-center transition-all duration-1000 ease-in-out ${
              showQrUrlView
                ? 'relative opacity-100 translate-y-0 delay-300'
                : 'absolute inset-0 opacity-0 translate-y-16 pointer-events-none'
            }`}
          >
            <div className="inline-flex items-start gap-2 bg-blue-600 text-white px-6 py-3 rounded-full mb-8 shadow-lg shadow-blue-200">
              <Shield size={18} className="shrink-0" />
              <div className="text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90 whitespace-nowrap">Bezpiecznie połączono z urządzeniem:</p>
                <p className="text-sm font-bold whitespace-nowrap">{connectedDevice}</p>
              </div>
            </div>

            <div className="relative group mb-8 inline-block">
              <div className="absolute -inset-8 bg-gradient-to-tr from-purple-500/20 to-blue-500/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <div className="relative bg-white p-4 rounded-[36px] border border-slate-100 shadow-2xl">
                <div className="w-[220px] h-[220px] sm:w-[260px] sm:h-[260px] bg-white rounded-[28px] flex items-center justify-center overflow-hidden">
                  {qrUrlCode ? (
                    <img src={qrUrlCode} alt="QR URL" className="w-full h-full object-contain" />
                  ) : (
                    <div className="relative w-full h-full p-4 flex items-center justify-center bg-slate-900 rounded-[28px]">
                      <Smartphone size={100} strokeWidth={1} className="text-white/20" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 mx-auto max-w-[340px]">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Zeskanuj kod strony</h2>
              <p className="text-slate-500 text-base leading-relaxed">
                aby przesłać dokumenty
              </p>
            </div>
          </div>

        </div>

        <div className="shrink-0 bg-slate-50 border-t border-slate-100 z-20 mt-auto relative">
          <div className="p-8 sm:p-10">
            <div className="flex gap-4 sm:gap-5 items-start mb-2">
              <div className="shrink-0 mt-1 text-slate-400">
                <FileJson size={22} />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                  Gwarancja bezpieczeństwa danych
                </p>
                <p className="text-xs text-slate-400 leading-relaxed text-justify">
                  Przesłane pliki zostaną <strong>przetworzone i zanonimizowane lokalnie</strong>. Powrót do połączenia z internetem będzie możliwy dopiero po zakończeniu procesu i/lub <strong>trwałym usunięciu oryginałów</strong> z terminala.
                </p>
              </div>
            </div>

            <div
              className={`grid transition-all duration-700 ease-out relative ${
                visualStep >= 4 ? 'grid-rows-[1fr] mt-8 opacity-100' : 'grid-rows-[0fr] mt-0 opacity-0'
              }`}
            >
              <div className="overflow-hidden min-h-0 relative">
                <button
                  onClick={handleEndSession}
                  disabled={isClosing}
                  className="group w-full py-4 sm:py-5 bg-slate-900 hover:bg-black disabled:bg-slate-700 text-white rounded-2xl text-lg font-semibold transition-all shadow-xl shadow-slate-200 hover:shadow-slate-400 active:scale-[0.98] disabled:scale-100 cursor-pointer disabled:cursor-wait relative z-10 flex items-center justify-center gap-3"
                >
                  {isClosing ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>Zamykanie...</span>
                    </>
                  ) : (
                    <span>Zakończ sesję</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

const MicroStatus = ({ label, isActive, iconOn, iconOff, isHotspot, isError }: any) => {
  const activeColor = isHotspot
    ? "text-emerald-600 bg-emerald-50 border-emerald-100"
    : "text-slate-600 bg-slate-100 border-slate-200";

  const errorColor = "text-red-600 bg-red-50 border-red-100";

  let statusStyle = 'text-slate-400 bg-slate-50 border-slate-100';
  if (isActive) {
    statusStyle = activeColor;
  } else if (isError) {
    statusStyle = errorColor;
  }

  return (
    <div className="flex flex-col gap-1.5 items-center">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className={`flex items-center gap-2.5 px-3 py-2 sm:px-4 rounded-xl border transition-all duration-500 ${statusStyle}`}>
        {isActive ? iconOn : iconOff}
        <span className={`text-xs font-bold leading-none ${isActive ? 'text-slate-800' : (isError ? 'text-red-700' : 'text-slate-400')}`}>
          {isActive ? "ON" : "OFF"}
        </span>
      </div>
    </div>
  );
};

const StepRow = ({ state, label, subLabel, isLast }: { state: 'pending'|'active'|'done', label: string, subLabel: string, isLast?: boolean }) => {
  const isDone = state === 'done';
  const isActive = state === 'active';
  const isPending = state === 'pending';

  return (
    <div className="flex items-center gap-5 sm:gap-6 relative z-10">
      <div className={`
        w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border-2 transition-all duration-500 shrink-0
        ${isDone
          ? 'bg-emerald-500 border-emerald-500 text-white scale-100 shadow-emerald-200'
          : isActive
            ? 'bg-white border-indigo-600 text-indigo-600 scale-110 shadow-xl shadow-indigo-100'
            : 'bg-white border-slate-100 text-slate-200 scale-100'}
      `}>
        {isDone ? (
          <Check size={22} strokeWidth={4} className="animate-in zoom-in duration-300" />
        ) : isActive ? (
          <Loader2 size={26} className="animate-spin" />
        ) : (
          <div className="w-3 h-3 rounded-full bg-slate-100" />
        )}
      </div>

      <div className={`flex flex-col transition-all duration-500 ${isPending ? 'opacity-30 blur-[0.5px]' : 'opacity-100'}`}>
        <h3 className={`text-base sm:text-lg font-bold transition-colors duration-300 ${isActive ? 'text-indigo-950' : isDone ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-400'}`}>
          {label}
        </h3>
        {!isDone && (
          <p className="text-sm text-slate-500 mt-0.5 sm:mt-1 font-medium leading-normal animate-in fade-in slide-in-from-left-1">
            {subLabel}
          </p>
        )}
      </div>
    </div>
  );
};

export default UploadModal;