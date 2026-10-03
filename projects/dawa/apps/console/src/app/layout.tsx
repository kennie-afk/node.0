import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dawa",
  description: "Pharmacy point of sale, stock and expiry, and dispensing records"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
