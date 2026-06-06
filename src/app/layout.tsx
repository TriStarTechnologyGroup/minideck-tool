import type { Metadata } from "next";
import "./globals.css";
import AppHeader from "@/components/app-header";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "Minideck Tool — TriStar",
  description: "Generate trackable per-prospect links to TriStar minidecks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <ToastProvider>
          <AppHeader />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
