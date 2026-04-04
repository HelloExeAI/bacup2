import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { defaultMetadataBase } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: defaultMetadataBase(),
  title: {
    default: "Bacup",
    template: "%s · Bacup",
  },
  description: "Personal operating system for life and work — tasks, calendar, scratchpad, and Ask Bacup.",
  applicationName: "Bacup",
};

/** Default light; boot script + ThemeProvider align with `bacup-theme` and update meta. */
export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth font-sans antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-background font-sans text-foreground"
        suppressHydrationWarning
      >
        <Script id="bacup-theme-boot" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("bacup-theme");var d=t==="dark";document.documentElement.classList.toggle("dark",d);var m=document.querySelector('meta[name="color-scheme"]');if(m)m.setAttribute("content",d?"dark":"light");}catch(e){}})();`}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
