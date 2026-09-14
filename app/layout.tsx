import type { Metadata } from 'next';
import { Geist, Manrope } from 'next/font/google';
import './globals.css';

const interfaceFont = Geist({
  variable: '--font-interface',
  subsets: ['latin'],
});
const displayFont = Manrope({ variable: '--font-display', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://playmimo.xyz'),
  title: 'Mimo — Live community play, powered by Nimiq',
  description:
    'Turn passive audiences into players with live games, community votes, skill challenges and trusted NIM rewards inside Nimiq Pay.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Mimo — Live community play, powered by Nimiq',
    description:
      'Turn passive audiences into players with live games, community votes, skill challenges and trusted NIM rewards inside Nimiq Pay.',
    url: '/',
    siteName: 'Mimo',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${interfaceFont.variable} ${displayFont.variable}`}>
        {children}
      </body>
    </html>
  );
}
