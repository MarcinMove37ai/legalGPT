// src/app/dashboard/page.tsx
"use client"

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    // Przekierowanie na /dashboard/ocr
    router.replace('/dashboard/ocr');
  }, [router]);

  // Loading state podczas przekierowania
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-red-600 border-r-transparent"></div>
        <p className="mt-4 text-gray-600">Przekierowanie...</p>
      </div>
    </div>
  );
}