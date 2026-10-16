import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BotIdProtect } from "@/components/botid-protect";
import { AppProviders } from "@/components/providers/app-providers";
import { SiteFooter } from "@/components/site-footer";
import { getPrivyAppId } from "@/lib/privy/config";
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
  title: "Dear Creative",
  description: "Creative Platform newsletter — internal preview",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const privyAppId = getPrivyAppId();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <BotIdProtect />
      </head>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <AppProviders privyAppId={privyAppId}>
          <div className="flex-1">{children}</div>
        </AppProviders>
        <SiteFooter />
      </body>
    </html>
  );
}
