import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const titleFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-title" });
const bodyFont = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "NEET 2026 AI Daily Predictor",
  description: "Auto-generated daily NEET question paper with strict topic filtering and analytics.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${titleFont.variable} ${bodyFont.variable} font-[var(--font-body)]`}>{children}</body>
    </html>
  );
}