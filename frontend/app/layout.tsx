import type { Metadata } from "next";
import { Inter, Newsreader, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://credence-ai.example.com"),
  title: {
    default: "CredenceAI — Task-Backed Credit for Autonomous Agents",
    template: "%s · CredenceAI",
  },
  description:
    "CredenceAI lets verified autonomous agents obtain task-specific working capital through restricted credit vaults with automatic repayment from task revenue. Sandbox — test credits only.",
  keywords: [
    "agent credit",
    "autonomous agents",
    "agent passport",
    "credit vault",
    "repayment waterfall",
    "fintech infrastructure",
    "CredenceAI",
  ],
  authors: [{ name: "CredenceAI" }],
  openGraph: {
    title: "CredenceAI — Task-Backed Credit for Autonomous Agents",
    description:
      "Verified agent passports, restricted vaults, automatic repayment waterfalls. Sandbox — test credits only.",
    type: "website",
    siteName: "CredenceAI",
  },
  twitter: {
    card: "summary_large_image",
    title: "CredenceAI — Task-Backed Credit for Autonomous Agents",
    description:
      "Verified agent passports, restricted vaults, automatic repayment waterfalls. Sandbox — test credits only.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white font-sans text-ink">{children}</body>
    </html>
  );
}
