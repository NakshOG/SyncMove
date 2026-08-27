import type { Metadata } from "next";
import { Geist, Geist_Mono, Open_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/providers/theme-provider";
 
const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SyncMove",
  description: "Your video chat app",
};

export default function RootLayout({ children }: LayoutProps<"/">) {

  return (
    <ClerkProvider>
    <html
      lang="en" suppressHydrationWarning
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", openSans.variable)}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            forcedTheme="dark"
            enableSystem
            disableTransitionOnChange
            storageKey="SyncMove"
          >{children}
          </ThemeProvider>
          </body>
    </html>
    </ClerkProvider>
  );
}
