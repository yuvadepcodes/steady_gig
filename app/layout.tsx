import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import SarvamVoiceAssistant from '@/src/components/SarvamVoiceAssistant';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
});

export const viewport: Viewport = {
  themeColor: '#f8fafc',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'SteadyGig — Rider Cash-Flow Smoothing',
  description:
    'Voice-first, vision-powered financial co-pilot for Bengaluru gig delivery riders.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-[#F8FAFC] text-[#0F172A] antialiased">
        {children}
        <SarvamVoiceAssistant />
      </body>
    </html>
  );
}
