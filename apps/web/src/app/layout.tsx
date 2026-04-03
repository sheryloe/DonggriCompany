import type { Metadata } from "next";
import "./globals.css";
import { VT323 } from "next/font/google";
import { cn } from "@/lib/utils";

const pixelFont = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "PRN Orchestra Dashboard",
  description: "AI Agent Office & Tactical Board",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-pixel", pixelFont.variable)}>
      <body className="antialiased min-h-screen bg-[url('/bg-tile.png')] bg-repeat">
        <div className="absolute inset-0 pointer-events-none bg-black/5" style={{ backgroundImage: "linear-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.05) 1px, transparent 1px)", backgroundSize: "32px 32px" }}></div>
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
