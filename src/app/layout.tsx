import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";
import Script from "next/script";

// Read the base path from the environment for GitHub Pages deployment
// Your workflow sets this to "/bunsanjisho" during the build
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Bunsan Jisho — 分散辞書 | Advanced Japanese Dictionary",
  description:
    "Bunsan Jisho is an advanced, feature-rich Japanese dictionary & study platform — words, kanji, radicals, sentences, SRS flashcards, quizzes and more. Created by Aishik Dutta.",
  keywords: [
    "Japanese dictionary",
    "Bunsan Jisho",
    "Tagaini Jisho",
    "JLPT",
    "kanji",
    "flashcards",
    "SRS",
    "Aishik Dutta",
  ],
  authors: [{ name: "Aishik Dutta" }],
  applicationName: "Bunsan Jisho",
  // FIX 1: Prepend basePath so the browser requests /bunsanjisho/manifest.webmanifest instead of /manifest.webmanifest
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
        {/* UncloseAI Configuration */}
        <Script id="uncloseai-config" strategy="beforeInteractive">
          {`
            window.UNCLOSEAI_FLOATING_BUTTON = false;
            window.UNCLOSEAI_CUSTOM_STYLING = false;
            window.UNCLOSEAI_LANGUAGE = "en";
            window.UNCLOSEAI_SYSTEM_PROMPT = "You are the AI service used by Bunsan Jisho, an educational Japanese dictionary and study app. Be accurate, concise, supportive, and appropriate for language learning. When answering about Japanese, prefer natural modern Japanese and explain corrections clearly.";
          `}
        </Script>

        {/* UncloseAI Main Script */}
        {/* FIX 2: Added crossOrigin="anonymous" to match the preload request credentials mode */}
        <Script
          id="uncloseai"
          src="https://uncloseai.com/uncloseai.js"
          type="module"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />

        {/* FIX 3: Model Fallback Patch */}
        {/* The UncloseAI library has a hardcoded fallback to 'adamo1139/Hermes-3-Llama-3.1-8B-FP8-Dynamic', which no longer exists on their backend. 
            This script pre-fetches the available models (currently 'turboderp/Qwen3.8-27B-exl3') and patches the internal getter functions to prevent 404 errors. */}
        <Script
          id="uncloseai-fix"
          type="module"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              import("https://uncloseai.com/uncloseai.js").then(async (module) => {
                // 1. Pre-fetch models to populate the registry and dropdown
                if (module.fetchModelsFromEndpoints) {
                  await module.fetchModelsFromEndpoints();
                  console.log("✅ Pre-fetched UncloseAI models to fix hardcoded fallback.");
                }

                // 2. Monkey-patch the fallback model to fix immediate TTS/Chat requests
                if (window.uncloseai && window.uncloseai.getSelectedModel) {
                  window.uncloseai.getSelectedModel = () => {
                    if (module.modelRegistry && Object.keys(module.modelRegistry).length > 0) {
                      return module.modelRegistry[Object.keys(module.modelRegistry)[0]].modelName;
                    }
                    return "turboderp/Qwen3.8-27B-exl3";
                  };

                  window.uncloseai.getSelectedModelEndpoint = () => {
                    if (module.modelRegistry && Object.keys(module.modelRegistry).length > 0) {
                      return module.modelRegistry[Object.keys(module.modelRegistry)[0]].url;
                    }
                    return "https://hermes.ai.unturf.com/v1";
                  };
                }
              });
            `
          }}
        />

        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
