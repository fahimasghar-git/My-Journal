import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./desktop.css";
import "./mobile.css";

const assetRecoveryScript = `
(function () {
  var recoveryKey = "plant-journal-asset-recovery";
  var recovering = false;
  function recover(source) {
    if (recovering) return;
    var recoveredSources = [];
    try { recoveredSources = JSON.parse(sessionStorage.getItem(recoveryKey) || "[]"); } catch (_) {}
    var recoverySource = String(source || "unknown").slice(0, 500);
    if (recoveredSources.indexOf(recoverySource) !== -1) return;
    recovering = true;
    recoveredSources.push(recoverySource);
    try { sessionStorage.setItem(recoveryKey, JSON.stringify(recoveredSources.slice(-10))); } catch (_) {}
    var next = new URL(location.href);
    next.searchParams.set("refresh", String(Date.now()));
    var reload = function () { location.replace(next.toString()); };
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then(function (registration) {
        return registration ? registration.update() : undefined;
      }).catch(function () {}).finally(function () { setTimeout(reload, 100); });
    } else {
      setTimeout(reload, 100);
    }
  }
  addEventListener("error", function (event) {
    var target = event.target;
    var source = target && (target.src || target.href);
    if (source && source.indexOf("/_next/static/") !== -1) recover(source);
  }, true);
  addEventListener("unhandledrejection", function (event) {
    var message = String(event.reason && (event.reason.message || event.reason) || "");
    if (/ChunkLoadError|dynamically imported module|module script/i.test(message)) recover(message);
  });
})();`;

const mobileDisplayBootstrapScript = `
(function () {
  try {
    var saved = localStorage.getItem("journal-mobile-display-mode");
    var mode = saved === "day" || saved === "night" || saved === "auto" ? saved : "auto";
    var hour = new Date().getHours();
    var evening = hour >= 18 || hour < 6;
    var systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = mode === "night" || (mode === "auto" && (systemDark || evening));
    document.documentElement.classList.toggle("journal-mobile-dark-preload", dark);
  } catch (_) {}
})();`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#4b4944",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const image = new URL("/og.png", base).toString();
  const description = "A personal plant operations journal connecting departmental pages, tasks, meetings and assignee responsibility.";

  return {
    metadataBase: base,
    title: "Plant Operations Journal",
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
      apple: "/favicon.svg",
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Plant Journal",
    },
    openGraph: {
      title: "Plant Operations Journal",
      description,
      type: "website",
      images: [{ url: image, width: 1734, height: 907, alt: "Plant Operations Journal interface" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Plant Operations Journal",
      description,
      images: [image],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: mobileDisplayBootstrapScript }} />
        <script dangerouslySetInnerHTML={{ __html: assetRecoveryScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
