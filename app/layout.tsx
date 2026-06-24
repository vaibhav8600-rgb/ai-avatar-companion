import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "Mira — AI Avatar Companion",
  description: "A browser-based AI companion you can call or chat with.",
  manifest: "/manifest.webmanifest",
  applicationName: "Mira",
  authors: [{ name: "Vaibhav Rajput" }],
  creator: "Vaibhav Rajput",
  publisher: "Vaibhav Rajput",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mira",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Let content extend into the notch / home-indicator areas so we can pad for
  // them explicitly with env(safe-area-inset-*).
  viewportFit: "cover",
  // Shrink the layout when the on-screen keyboard opens (Android/Chromium).
  interactiveWidget: "resizes-content",
  themeColor: "#0E0F13",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
