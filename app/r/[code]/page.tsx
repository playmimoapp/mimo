import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getRoom, getRoomConfig } from '@/lib/live-room';

const publicOrigin = 'https://playmimo.xyz';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const room = await getRoom(code);
  if (!room) return { title: 'Join Mimo' };
  const config = getRoomConfig(room.launchedConfigJson);
  const reward =
    config.mode === 'nim'
      ? `${config.amount} NIM for ${config.rewardWinnerCount === 1 ? 'the winner' : `the top ${config.rewardWinnerCount}`}`
      : 'Free to join';
  const description = `${room.title}. ${reward}. Join room ${room.roomCode} and play live on Mimo.`;
  const canonical = `${publicOrigin}/r/${room.roomCode}`;

  return {
    title: `${room.title} on Mimo`,
    description,
    alternates: { canonical },
    openGraph: {
      title: room.title,
      description,
      url: canonical,
      type: 'website',
      images: [
        { url: `${canonical}/opengraph-image`, width: 1200, height: 630 },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: room.title,
      description,
      images: [`${canonical}/opengraph-image`],
    },
  };
}

export default async function RoomInvite({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  redirect(`/?room=${encodeURIComponent(code)}`);
}
