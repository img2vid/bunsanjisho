import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";
import Script from "next/script";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const siteUrl = `https://img2vid.github.io${basePath}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl), // Crucial for Next.js to resolve relative URLs
  title: "Bunsan Jisho — 分散辞書 | Advanced Japanese Dictionary & Study App",
  description:
    "Bunsan Jisho is a free, advanced Japanese dictionary & study platform. Search words, kanji, radicals, and sentences. Features SRS flashcards, quizzes, AI Tutor, and pitch accent visualization.",
  keywords: [
    "Japanese dictionary", "Bunsan Jisho", "Tagaini Jisho", "JLPT", "kanji", 
    "flashcards", "SRS", "Anki", "Japanese grammar", "learn Japanese", "日本語辞書"
  ],
  authors: [{ name: "Aishik Dutta" }],
  applicationName: "Bunsan Jisho",
  
  // Canonical URL (Prevents duplicate content issues)
  alternates: {
    canonical: siteUrl,
  },

  // Open Graph (Facebook, LinkedIn, Discord, Slack previews)
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    title: "Bunsan Jisho — 分散辞書 | Advanced Japanese Dictionary",
    description: "A free, advanced Japanese dictionary & study platform with SRS flashcards, AI Tutor, and pitch accent visualization.",
    siteName: "Bunsan Jisho",
    // Note: You should add a 1200x630 image to your /public folder named 'og-image.png'
    images: [
      {
        url: `${basePath}/og-image.png`, 
        width: 1200,
        height: 630,
        alt: "Bunsan Jisho Interface Preview",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "Bunsan Jisho — 分散辞書 | Advanced Japanese Dictionary",
    description: "A free, advanced Japanese dictionary & study platform with SRS flashcards, AI Tutor, and pitch accent visualization.",
    images: [`${basePath}/og-image.png`],
  },

  verification: {
    google: "n6NeOnmuOqAe2pYbqYbPj0p4pTz9tPBKXNMQhldEEa4", 
  },

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

// Structured Data (JSON-LD) for Google Rich Results
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Bunsan Jisho",
  "url": siteUrl,
  "description": "An advanced, feature-rich Japanese dictionary & study platform.",
  "applicationCategory": "EducationalApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "author": {
    "@type": "Person",
    "name": "Aishik Dutta"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        {/* ... Your existing UncloseAI scripts and ThemeProvider ... */}
        
        <Script id="uncloseai-config" strategy="beforeInteractive">
          {`
            window.UNCLOSEAI_FLOATING_BUTTON = false;
            window.UNCLOSEAI_CUSTOM_STYLING = false;
            window.UNCLOSEAI_LANGUAGE = "en";
            window.UNCLOSEAI_SYSTEM_PROMPT = "You are the AI service used by Bunsan Jisho, an educational Japanese dictionary and study app. Be accurate, concise, supportive, and appropriate for language learning.";
          `}
        </Script>

        <Script
          id="uncloseai"
          src="https://uncloseai.com/uncloseai.js"
          type="module"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />

        <Script
          id="uncloseai-fix"
          type="module"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              import("https://uncloseai.com/uncloseai.js").then(async (module) => {
                if (module.fetchModelsFromEndpoints) {
                  await module.fetchModelsFromEndpoints();
                }
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

        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
