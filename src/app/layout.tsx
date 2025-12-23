// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Poppins } from 'next/font/google'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700']
})

export const metadata: Metadata = {
  title: "LegalGPT.pl | Asystent Prawny",
  description: "Czatuj z Polskimi Aktami Prawnymi",
  // ▼ DODAJ TEN FRAGMENT ▼
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className={poppins.className}>
        {children}
      </body>
    </html>
  );
}