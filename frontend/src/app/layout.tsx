import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Toaster from "@/shared/presentation/toast/toaster";
import ConfirmModal from "@/shared/presentation/confirm/confirm-modal";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Andrey 3D Viewer",
  description: "Interactive viewer for OBJ models",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
        <ConfirmModal />
      </body>
    </html>
  );
}
