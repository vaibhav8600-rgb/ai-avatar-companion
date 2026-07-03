import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import CosmicBackground from "@/components/ui/CosmicBackground";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
  // Allow pinch-zoom for accessibility (don't lock maximumScale to 1).
  maximumScale: 5,
  userScalable: true,
  // Let content extend into the notch / home-indicator areas so we can pad for
  // them explicitly with env(safe-area-inset-*).
  viewportFit: "cover",
  // Shrink the layout when the on-screen keyboard opens (Android/Chromium).
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5fb" },
    { media: "(prefers-color-scheme: dark)", color: "#05060f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {/* Apply the saved theme before first paint to avoid a flash of the
            wrong mode. Dark is the default brand look; we only switch to light
            when the user has explicitly chosen it (OS preference is ignored so
            the cosmic look is what everyone sees first).

            In dev, also self-heal a stale service worker left over from testing
            a production build (`npm start`): that worker keeps controlling
            localhost and can intercept dev chunks → ChunkLoadError / hydration
            failure. Running here (pre-hydration) — instead of only in a React
            effect that runs too late — nukes it and reloads once into a clean,
            SW-free page. Guarded by sessionStorage so it can't loop. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("mira-theme");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){document.documentElement.setAttribute("data-theme","dark")}${
              process.env.NODE_ENV !== "production"
                ? `try{if('serviceWorker' in navigator && navigator.serviceWorker.controller && !sessionStorage.getItem('mira-sw-heal')){sessionStorage.setItem('mira-sw-heal','1');navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister()}))}).then(function(){return window.caches?caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))}):null}).then(function(){location.reload()}).catch(function(){})}}catch(e){}`
                : ""
            }})();`,
          }}
        />
        <CosmicBackground />
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
