import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "MISSI — Voice AI Operating System",
  description: "Voice-first AI agent with intelligent multi-model routing across 4 Mistral models, 12 autonomous tools, and natural ElevenLabs voice. Built at the Mistral Worldwide Hackathon 2026 by MiMi Tech AI.",
  openGraph: {
    title: "MISSI — Voice AI Operating System",
    description: "Speak → MISSI plans → Executes tools autonomously → Speaks back. Powered by Mistral AI.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-white overflow-hidden`}>
        {children}
      </body>
    </html>
  );
}
