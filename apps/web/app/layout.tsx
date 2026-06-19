import "./globals.css";
import { Inter, Cairo } from "next/font/google";
import { Providers } from "./providers";
import { Shell } from "../components/Shell";

const inter = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-arabic", display: "swap" });

export const metadata = {
  title: "CHECK · Inspection Platform",
  description: "Multi-discipline property inspection management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${cairo.variable}`}>
      <body suppressHydrationWarning>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
