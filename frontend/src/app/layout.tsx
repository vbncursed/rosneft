import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Toaster from "@/shared/presentation/toast/toaster";
import ConfirmModal from "@/shared/presentation/confirm/confirm-modal";
import { getCurrentUser } from "@/auth/application/current-user";
import { CurrentUserProvider } from "@/auth/presentation/current-user-context";
import UserMenu from "@/auth/presentation/user-menu";
import SwRegister from "./sw-register";
import "./globals.css";

// IBM Plex Sans ships a variable axis — load without an explicit weight list.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "cyrillic"],
});

// IBM Plex Mono has no variable axis — the used weights are declared explicitly.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Andrey 3D Viewer",
  description: "Interactive viewer for OBJ models",
};

export const viewport: Viewport = {
  // Совпадает с --background в globals.css, чтобы статус-бар не спорил с фоном.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  // Планшеты с вырезом: контент под вырез, отступы берутся из safe-area.
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const principal = await getCurrentUser();
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CurrentUserProvider value={principal}>
          {principal ? <UserMenu /> : null}
          {children}
        </CurrentUserProvider>
        <Toaster />
        <ConfirmModal />
        <SwRegister />
      </body>
    </html>
  );
}
