import type { Metadata } from "next";
import { Lora, DM_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { PostHogProvider } from "@/components/PostHogProvider";
import "./globals.css";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://voca.app"),
  title: {
    default: "Voca — It's not a form. It's a conversation.",
    template: "%s — Voca",
  },
  description:
    "Voca interviews your respondents with a warm AI voice — in English or Hinglish — and turns messy speech into clean, structured data. Higher completion, richer answers.",
  keywords: [
    "voice form builder", "AI form", "conversational form", "Typeform alternative",
    "Google Forms alternative", "Tally alternative", "Hinglish form", "voice survey",
  ],
  openGraph: {
    title: "It's not a form. It's a conversation.",
    description:
      "Voca interviews your respondents with a warm AI voice and turns messy speech into clean, structured data.",
    type: "website",
    siteName: "Voca",
  },
  twitter: {
    card: "summary_large_image",
    title: "It's not a form. It's a conversation.",
    description:
      "Voca replaces cold forms with warm AI voice conversations. Higher completion, richer data.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${lora.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col font-sans tracking-tight bg-background text-foreground"
      >
        {/* SVG noise overlay — locked at 0.04 opacity per brutalist spec */}
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none select-none z-0"
          style={{
            backgroundImage: "url(/noise.svg)",
            backgroundRepeat: "repeat",
            backgroundSize: "256px 256px",
            opacity: 0.04,
          }}
        />
        <PostHogProvider>
          <div className="relative z-10 flex flex-col min-h-full">
            {children}
          </div>
        </PostHogProvider>
        <Toaster
          position="bottom-center"
          theme="dark"
          toastOptions={{
            style: {
              background: "#1a1a1a",
              border: "1px solid rgba(240,236,228,0.08)",
              color: "#f0ece4",
              borderRadius: "999px",
              fontSize: "13px",
              fontFamily: "Satoshi, sans-serif",
            },
          }}
        />
      </body>
    </html>
  );
}
