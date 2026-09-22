import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mimo — Live community play',
    short_name: 'Mimo',
    description:
      'Live games, community votes, skill challenges and trusted NIM rewards inside Nimiq Pay.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8f6f1',
    theme_color: '#f8f6f1',
    icons: [
      {
        src: '/mimo-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/mimo-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
