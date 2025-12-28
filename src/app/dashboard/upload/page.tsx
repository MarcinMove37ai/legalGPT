// src/app/dashboard/upload/page.tsx
"use client"

import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
  WifiOff,
  Radio,
  Upload,
  RefreshCw,
  FolderOpen,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
  X,
  MoreVertical,
  Trash2,
  Shield,
  AlertTriangle // Dodano ikonę do modala usuwania
} from 'lucide-react';
import UploadModal from '@/components/UploadModal';

// FLAGA TRYBU TESTOWEGO
const TEST_MODE = true;

interface FileItem {
  name: string;
  size: number;
  date: string;
}

interface NetworkStatus {
  wifiCardActive: boolean;
  wifiConnected: boolean;
  internetAccess: boolean;
  hotspotActive: boolean;
}

const UploadPage = () => {
  // --- STANY ---
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    wifiCardActive: false,
    wifiConnected: false,
    internetAccess: false,
    hotspotActive: false
  });
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isTogglingWifi, setIsTogglingWifi] = useState(false);
  const [isTogglingHotspot, setIsTogglingHotspot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Stan dla podglądu pliku
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  // Stan dla otwartego menu akcji
  const [openMenuFile, setOpenMenuFile] = useState<string | null>(null);

  // Stan dla modala potwierdzenia usunięcia (przechowuje nazwę usuwanego pliku)
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // --- API CALLS ---
  const refreshNetworkStatus = async () => {
    try {
      const response = await fetch('/api/network/status');
      if (response.ok) {
        const data = await response.json();
        setNetworkStatus(data);
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching network status:', err);
    }
  };

  const refreshFileList = async () => {
    try {
      const response = await fetch('/api/files/list');
      if (response.ok) {
        const data = await response.json();
        setFiles(data);
      }
    } catch (err) {
      console.error('Error fetching file list:', err);
    }
  };

  // --- HANDLER: KLIKNIĘCIE "USUŃ" W MENU (OTWIERA MODAL) ---
  const handleDeleteClick = (filename: string) => {
    setOpenMenuFile(null); // Zamknij menu
    setFileToDelete(filename); // Otwórz modal potwierdzenia
  };

  // --- HANDLER: POTWIERDZENIE USUNIĘCIA (WYKONANIE API) ---
  const confirmDelete = async () => {
    if (!fileToDelete) return;

    const filename = fileToDelete;

    try {
      const response = await fetch(`/api/files/list?filename=${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        refreshFileList();
        setFileToDelete(null); // Zamknij modal po sukcesie
      } else {
        const data = await response.json();
        alert(`Błąd usuwania: ${data.error || 'Nieznany błąd'}`);
        setFileToDelete(null);
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      alert('Wystąpił błąd połączenia z serwerem.');
      setFileToDelete(null);
    }
  };

  // --- HANDLER ANONIMIZACJI (MOCKUP) ---
  const handleAnonymize = (filename: string) => {
    setOpenMenuFile(null);
    alert(`Funkcja anonimizacji dla pliku:\n"${filename}"\n\n(Funkcja w przygotowaniu)`);
  };

  // --- EFEKTY ---
  useEffect(() => {
    refreshNetworkStatus();
    refreshFileList();
    const statusInterval = setInterval(refreshNetworkStatus, 2000);
    const filesInterval = setInterval(refreshFileList, 5000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(filesInterval);
    };
  }, []);

  useEffect(() => {
    if (isTogglingWifi) setIsTogglingWifi(false);
  }, [networkStatus.wifiCardActive]);

  useEffect(() => {
    if (isTogglingHotspot) setIsTogglingHotspot(false);
  }, [networkStatus.hotspotActive]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuFile(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- STEROWANIE SIECIĄ ---
  const handleWiFiToggle = async () => {
    if (!TEST_MODE || isTogglingWifi) return;
    setIsTogglingWifi(true);
    const endpoint = networkStatus.wifiCardActive
      ? '/api/network/wifi/disconnect'
      : '/api/network/wifi/connect';
    const delay = networkStatus.wifiCardActive ? 300 : 100;

    fetch(endpoint, { method: 'POST' })
      .then(() => new Promise(r => setTimeout(r, delay)))
      .then(() => refreshNetworkStatus())
      .catch(err => {
        console.error('WiFi toggle error:', err);
        setError('Błąd sterowania WiFi');
        setIsTogglingWifi(false);
      });
  };

  const handleHotspotToggle = async () => {
    if (!TEST_MODE || isTogglingHotspot) return;
    setIsTogglingHotspot(true);
    const endpoint = networkStatus.hotspotActive
      ? '/api/network/hotspot/stop'
      : '/api/network/hotspot/start';
    const delay = networkStatus.hotspotActive ? 300 : 100;

    fetch(endpoint, { method: 'POST' })
      .then(() => new Promise(r => setTimeout(r, delay)))
      .then(() => refreshNetworkStatus())
      .catch(err => {
        console.error('Hotspot toggle error:', err);
        setError('Błąd sterowania Hotspot');
        setIsTogglingHotspot(false);
      });
  };

  const handleActivateUploadMode = async () => {
    setShowUploadModal(true);
    try {
      const response = await fetch('/api/network/activate', { method: 'POST' });
      if (!response.ok) {
        setError('Nie udało się aktywować trybu przesyłania');
      }
    } catch (err) {
      console.error('Activate error:', err);
      setError('Błąd aktywacji trybu przesyłania');
    }
  };

  // --- HELPERS ---
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const baseClass = "w-5 h-5 flex-shrink-0";

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      return <ImageIcon className={`${baseClass} text-blue-500`} />;
    }
    if (ext === 'pdf') {
      return <FileText className={`${baseClass} text-red-500`} />;
    }
    return <FileIcon className={`${baseClass} text-gray-400`} />;
  };

  const isImage = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
  };

  const isPdf = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext === 'pdf';
  };

  return (
    <div className="h-full flex flex-col gap-6 p-6 relative">
      {/* Nagłówek */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Upload files offline</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bezpieczne przesyłanie dokumentów w trybie offline
          </p>
        </div>

        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-all"
          onClick={refreshNetworkStatus}
          title={networkStatus.internetAccess ? "Połączenie z internetem aktywne" : "Brak połączenia z internetem"}
        >
          {networkStatus.internetAccess ? (
            <>
              <Wifi className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-600">Online</span>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            </>
          ) : (
            <>
              <WifiOff className="w-5 h-5 text-red-600" />
              <span className="text-sm font-medium text-red-600">Offline</span>
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Panele Statusu */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Panel WiFi */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm cursor-default">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${networkStatus.wifiCardActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                {networkStatus.wifiCardActive ?
                  <Wifi className="w-6 h-6 text-green-600" /> :
                  <WifiOff className="w-6 h-6 text-gray-400" />
                }
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Karta WiFi</h3>
                <p className={`text-sm ${networkStatus.wifiCardActive ? 'text-green-600' : 'text-gray-500'}`}>
                  {networkStatus.wifiCardActive ? 'Aktywna' : 'Nieaktywna'}
                </p>
              </div>
            </div>
            {TEST_MODE && (
              <div className="flex items-center gap-2">
                {isTogglingWifi && <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />}
                <button
                  onClick={handleWiFiToggle}
                  disabled={isTogglingWifi}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer ${
                    networkStatus.wifiCardActive ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    networkStatus.wifiCardActive ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Panel Hotspot */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm cursor-default">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${networkStatus.hotspotActive ? 'bg-purple-100' : 'bg-gray-100'}`}>
                {networkStatus.hotspotActive ?
                  <Radio className="w-6 h-6 text-purple-600" /> :
                  <Radio className="w-6 h-6 text-gray-400" />
                }
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Punkt dostępu</h3>
                <p className={`text-sm ${networkStatus.hotspotActive ? 'text-purple-600' : 'text-gray-500'}`}>
                  {networkStatus.hotspotActive ? 'Aktywny' : 'Nieaktywny'}
                </p>
              </div>
            </div>
            {TEST_MODE && (
              <div className="flex items-center gap-2">
                {isTogglingHotspot && <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />}
                <button
                  onClick={handleHotspotToggle}
                  disabled={isTogglingHotspot}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer ${
                    networkStatus.hotspotActive ? 'bg-purple-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    networkStatus.hotspotActive ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Przycisk Upload */}
      <div className="flex justify-center">
        <button
          onClick={handleActivateUploadMode}
          disabled={showUploadModal}
          className="py-4 px-8 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-3 text-lg cursor-pointer"
        >
          <Upload className="w-6 h-6" />
          Prześlij pliki
        </button>
      </div>

      {/* Lista plików */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Przesłane pliki ({files.length})
          </h3>
          <button
            onClick={refreshFileList}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Odśwież
          </button>
        </div>

        {files.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <FileIcon className="w-16 h-16 mb-3 opacity-50" />
            <p className="text-sm">Brak przesłanych plików</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1" ref={menuRef}>
            <table className="w-full relative">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Nazwa pliku
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Rozmiar
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="w-16 py-3 px-4 text-xs font-semibold text-gray-600 uppercase text-right tracking-wider">
                    Akcja
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {files.map((file, index) => (
                  <tr
                    key={index}
                    className="hover:bg-blue-50 transition-colors group cursor-pointer"
                  >
                    <td
                      className="py-3 px-4 text-sm text-gray-800 font-medium flex items-center gap-3"
                      onClick={() => setPreviewFile(file)}
                    >
                      {getFileIcon(file.name)}
                      <span
                        className="truncate max-w-[150px] sm:max-w-[250px] md:max-w-[350px]"
                        title={file.name}
                      >
                        {file.name}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-sm text-gray-600" onClick={() => setPreviewFile(file)}>
                      {formatFileSize(file.size)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600" onClick={() => setPreviewFile(file)}>
                      {new Date(file.date).toLocaleString('pl-PL')}
                    </td>

                    <td className="py-3 px-4 text-right relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuFile(openMenuFile === file.name ? null : file.name);
                        }}
                        className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>

                      {openMenuFile === file.name && (
                        <div className="absolute right-8 top-8 w-48 bg-white rounded-md shadow-xl py-1 z-20 border border-gray-100 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(file.name);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Usuń plik
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnonymize(file.name);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer transition-colors"
                          >
                            <Shield className="w-4 h-4 text-blue-500" />
                            Anonimizuj (Mockup)
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL UPLOADU */}
      <UploadModal
        isOpen={showUploadModal}
        networkStatus={networkStatus}
        onClose={() => setShowUploadModal(false)}
      />

      {/* MODAL PODGLĄDU PLIKU */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity cursor-pointer"
            onClick={() => setPreviewFile(null)}
          />

          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white z-10">
              <div className="flex items-center gap-3 overflow-hidden">
                {getFileIcon(previewFile.name)}
                <div className="truncate">
                   <h3 className="font-semibold text-gray-800 truncate pr-4" title={previewFile.name}>
                     {previewFile.name}
                   </h3>
                   <p className="text-xs text-gray-500">
                     {formatFileSize(previewFile.size)} • {new Date(previewFile.date).toLocaleString('pl-PL')}
                   </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-800 cursor-pointer flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 bg-gray-50 relative overflow-auto flex items-center justify-center p-1">
              {isImage(previewFile.name) ? (
                 <div className="w-full h-full flex items-center justify-center p-4">
                    <img
                      src={`/api/files/list?filename=${encodeURIComponent(previewFile.name)}`}
                      alt={previewFile.name}
                      className="max-w-full max-h-[80vh] object-contain shadow-md rounded-md"
                    />
                 </div>
              ) : isPdf(previewFile.name) ? (
                 <iframe
                   // Ustawiono twardą wysokość i parametry URL
                   src={`/api/files/list?filename=${encodeURIComponent(previewFile.name)}`}
                   className="w-full h-[80vh] border-0 rounded-b-lg"
                   title="PDF Preview"
                 />
              ) : (
                 <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                   <FileIcon className="w-20 h-20 mb-4 opacity-20" />
                   <p className="text-lg font-medium text-gray-500">Podgląd niedostępny dla tego typu pliku</p>
                   <p className="text-sm">Możesz pobrać ten plik, aby go otworzyć.</p>
                 </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NOWY MODAL POTWIERDZENIA USUNIĘCIA */}
      {fileToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Tło backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setFileToDelete(null)}
          />

          {/* Kontent Modala */}
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 transform transition-all animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">

              {/* Ikona ostrzeżenia */}
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Usunąć plik?
              </h3>

              <p className="text-sm text-gray-500 mb-6">
                Czy na pewno chcesz usunąć plik <span className="font-medium text-gray-800 break-all">"{fileToDelete}"</span>?<br/>
                Tej operacji nie można cofnąć.
              </p>

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setFileToDelete(null)}
                  className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 transition-colors cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 shadow-sm transition-colors cursor-pointer"
                >
                  Usuń
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default UploadPage;