import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import ServiceWorkerRegistration from "@/pwa/ServiceWorkerRegistration";
import { strings } from "@/ui/strings";
import { DARK_THEME_COLOR, THEME_COLOR } from "./manifest";

export const metadata: Metadata = {
  title: strings.appTitle,
  description: strings.appDescription,
  // Installed on an iPhone's home screen, it opens like an app (#56).
  appleWebApp: { capable: true, title: strings.appTitle },
};

export const viewport: Viewport = {
  // The manifest can hold one theme colour only; the meta tags follow the system's theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR },
    { media: "(prefers-color-scheme: dark)", color: DARK_THEME_COLOR },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
