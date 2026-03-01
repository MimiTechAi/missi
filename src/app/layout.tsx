import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "MISSI — Voice AI Operating System",
  description: "Voice-first AI agent with intelligent multi-model routing across 4 Mistral models, 25 autonomous tools, and natural ElevenLabs voice. Built at the Mistral Worldwide Hackathon 2026 by MiMi Tech AI.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MISSI",
  },
  openGraph: {
    title: "MISSI — Voice AI Operating System",
    description: "Speak → MISSI plans → Executes 25 tools autonomously → Speaks back in real-time. Powered by Mistral AI's full model ecosystem.",
    type: "website",
    siteName: "MISSI by MiMi Tech AI",
  },
  twitter: {
    card: "summary",
    title: "MISSI — Voice AI Operating System",
    description: "Voice-first AI with 4 Mistral models, 25 tools, Voxtral STT, and ElevenLabs TTS.",
  },
  robots: "index, follow",
  keywords: ["MISSI", "Mistral AI", "Voice AI", "AI Agent", "Hackathon", "Voxtral", "ElevenLabs", "MiMi Tech AI"],
};

export const viewport: Viewport = {
  themeColor: "#f97316",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${inter.className} antialiased bg-white overflow-hidden`}>
        {children}
      </body>
    </html>
  );
}
