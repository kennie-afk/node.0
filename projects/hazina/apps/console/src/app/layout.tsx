import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hazina",
  description: "Member book, loans, M-Pesa reconciliation and ledger for SACCOs and non-bank lenders"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
