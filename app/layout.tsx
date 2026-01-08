import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/context";
import Sidebar from "@/components/Sidebar";
import MainContent from "@/components/MainContent";
import FloatingTimer from "@/components/FloatingTimer";
import ErrorBoundary from "@/components/ErrorBoundary";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vayne Study Command Center",
  description: "Академичен command center за медицински студент",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bg">
      <body className={`${geistMono.variable} antialiased`}>
        <AppProvider>
          <ErrorBoundary>
            <div className="flex min-h-screen">
              <Sidebar />
              <MainContent>{children}</MainContent>
            </div>
            <FloatingTimer />
          </ErrorBoundary>
        </AppProvider>
      </body>
    </html>
  );
}
