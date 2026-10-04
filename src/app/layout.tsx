// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";
import Script from "next/script";

// 1. Read the base path from the environment
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Bunsan Jisho — 分散辞書 | Advanced Japanese Dictionary",
  description: "Bunsan Jisho is an advanced, feature-rich Japanese dictionary & study platform...",
  // ... other metadata ...
  
  // 2. Prepend basePath to manifest and icons
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${basePath}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${basePath}/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: `${basePath}/icon-192.png`, sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Bunsan Jisho",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#d05a6e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <Script id="uncloseai-config" strategy="beforeInteractive">{`window.UNCLOSEAI_FLOATING_BUTTON = false;
window.UNCLOSEAI_CUSTOM_STYLING = false;
window.UNCLOSEAI_LANGUAGE = "en";
window.UNCLOSEAI_SYSTEM_PROMPT = "You are the AI service used by Bunsan Jisho, an educational Japanese dictionary and study app. Be accurate, concise, supportive, and appropriate for language learning. When answering about Japanese, prefer natural modern Japanese and explain corrections clearly.";
`}</Script>
        <Script id="uncloseai" src="https://uncloseai.com/uncloseai.js" type="module" strategy="afterInteractive" />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
