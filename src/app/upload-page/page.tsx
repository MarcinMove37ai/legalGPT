"use client"

import React, { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setSuccess(false);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError('Wybierz plik');
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload/offline', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setSuccess(true);
        setFile(null);
        // Reset input
        const input = document.getElementById('file-input') as HTMLInputElement;
        if (input) input.value = '';
      } else {
        const data = await response.json();
        setError(data.error || 'Błąd przesyłania pliku');
      }
    } catch (err) {
      setError('Błąd połączenia z terminalem');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-blue-500/50">
            <Upload className="w-10 h-10 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Terminal AI</h1>
          <p className="text-slate-400 text-sm mb-1">Tryb offline • Przesyłanie bezpieczne</p>
          <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-slate-800 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs text-slate-300 font-medium">Laptop Lenovo LOQ</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* File Input */}
            <div>
              <label
                htmlFor="file-input"
                className="block text-sm font-semibold text-slate-700 mb-3"
              >
                Wybierz dokument
              </label>
              <div className="relative">
                <input
                  id="file-input"
                  type="file"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-slate-600 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer cursor-pointer"
                  disabled={uploading}
                />
              </div>
              {file && (
                <p className="mt-2 text-sm text-slate-600">
                  Wybrany: <span className="font-semibold">{file.name}</span>
                </p>
              )}
            </div>

            {/* Success Message */}
            {success && (
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-700 font-medium">
                  Plik przesłany pomyślnie!
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!file || uploading}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-slate-300 disabled:to-slate-400 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-3 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Przesyłanie...</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  <span>Wyślij plik</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer Info */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-slate-300 font-medium">
              Połączenie lokalne aktywne
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}