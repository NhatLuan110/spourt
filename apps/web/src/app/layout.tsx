import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro, Charis_SIL, Fraunces } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from '@/components/providers';
import { AuthProvider } from '@/components/auth-provider';
import { ThemeScript } from '@/components/theme-script';
import './globals.css';

// §3.3 — Vietnamese diacritics on the body font, full IPA coverage on the
// phonetics font, an organic serif for headings.
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  axes: ['SOFT', 'WONK', 'opsz'],
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-be-vietnam',
});

const charisSil = Charis_SIL({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-charis',
});

export const metadata: Metadata = {
  title: {
    default: 'Sprout — Học tiếng Anh như chăm một cái cây',
    template: '%s · Sprout',
  },
  description:
    'Web app tự học tiếng Anh cho người Việt: nghe, nói, đọc, viết, từ vựng và ngữ pháp, có gia sư AI và chấm phát âm tới từng âm vị.',
  applicationName: 'Sprout',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFAF5' },
    { media: '(prefers-color-scheme: dark)', color: '#101A15' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${fraunces.variable} ${beVietnamPro.variable} ${charisSil.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <AuthProvider>{children}</AuthProvider>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
