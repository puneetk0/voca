import type { Metadata } from "next";
import { Lora, Outfit } from "next/font/google";
import { Toaster } from "sonner";
import { PostHogProvider } from "@/components/PostHogProvider";
import "./globals.css";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voca | Voice-First Form Builder",
  description: "Structured data collection disguised as a real human conversation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${lora.variable} ${outfit.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col font-sans tracking-tight">
        <PostHogProvider>
          {children}
        </PostHogProvider>
        {/* Global toast notifications — premium dark theme, bottom-center */}
        <Toaster
          position="bottom-center"
          theme="dark"
          toastOptions={{
            style: {
              background: 'hsl(220 15% 12%)',
              border: '1px solid hsl(220 10% 20%)',
              color: '#fcfaf5',
              borderRadius: '999px',
              fontSize: '14px',
            },
          }}
        />
      </body>
    </html>
  );
}
