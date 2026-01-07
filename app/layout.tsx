import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/context";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import FloatingTimer from "@/components/FloatingTimer";

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
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex-1 ml-[280px]">
              <Header />
              <main className="p-6">
                {children}
              </main>
            </div>
          </div>
          <FloatingTimer />
        </AppProvider>
      </body>
    </html>
  );
}
