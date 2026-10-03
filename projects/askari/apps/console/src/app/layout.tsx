import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Askari",
  description: "Guard attendance, rosters, payroll against the minimum wage and client invoices for private security firms"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
