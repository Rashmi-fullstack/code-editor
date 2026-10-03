import './globals.css';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import { CreditProvider } from '@/components/credit-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import AnimatedBackground from '@/components/animated-background';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Codatron.ai — AI-Powered Development Platform',
  description:
    'AI-powered development platform that generates project structure, UI, and backend instantly from natural language descriptions.',
  openGraph: {
    title: 'Codatron.ai — AI-Powered Development Platform',
    description:
      'Build full-stack applications instantly with natural language prompts.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Codatron.ai — AI-Powered Development Platform',
    description:
      'Build full-stack applications instantly with natural language prompts.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-[var(--ide-bg-base)] text-white antialiased`}
      >
        <TooltipProvider delayDuration={200}>
          {/* Persistent hero video player: active and visible strictly on Home (/), hidden & paused everywhere else */}
          <AnimatedBackground />
          <AuthProvider>
            <CreditProvider>{children}</CreditProvider>
          </AuthProvider>
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
