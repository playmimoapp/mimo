import type { Metadata } from 'next';
import { Geist, Manrope } from 'next/font/google';
import './globals.css';

const interfaceFont = Geist({ variable: '--font-interface', subsets: ['latin'] });
const displayFont = Manrope({ variable: '--font-display', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Mimo — Play together. Reward what matters.',
  description: 'Live community games and interactive NIM drops, made for Nimiq Pay.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${interfaceFont.variable} ${displayFont.variable}`}>{children}</body></html>;
}
