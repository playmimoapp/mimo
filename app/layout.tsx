import type { Metadata } from 'next';
import { Geist, Manrope } from 'next/font/google';
import './globals.css';

const interfaceFont = Geist({
  variable: '--font-interface',
  subsets: ['latin'],
});
const displayFont = Manrope({ variable: '--font-display', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Mimo — Live community play, powered by Nimiq',
  description:
    'Live games, polls and NIM-powered rewards for communities inside Nimiq Pay.',
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
