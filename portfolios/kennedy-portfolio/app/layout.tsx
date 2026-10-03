import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://kennedymwanzia.dev"),
  title: "Kennedy Mwanzia, Software Engineer",
  description:
    "Distributed systems, multi-tenant SaaS and machine learning, built end to end. Nine systems, 35 microservices, 2,484 tests. Every number counted from the repository it describes.",
  openGraph: {
    title: "Kennedy Mwanzia, Software Engineer",
    description:
      "Nine systems, 35 microservices, 2,484 tests. Every number counted from the repository it describes.",
    type: "website",
  },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${jetbrains.variable} ${instrument.variable}`}
    >
      <body className="canvas">{children}</body>
    </html>
  );
}
