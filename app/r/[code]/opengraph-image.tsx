import { ImageResponse } from 'next/og';
import { getRoom, getRoomConfig } from '@/lib/live-room';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function RoomCard({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const room = await getRoom(code);
  const config = getRoomConfig(room?.launchedConfigJson ?? null);
  const rewardLine =
    config.mode === 'nim'
      ? `${config.amount} NIM · ${config.rewardWinnerCount === 1 ? '1 winner' : `${config.rewardWinnerCount} winners · ${config.rewardSplit === 'ranked' ? 'ranked split' : 'equal split'}`}`
      : 'Free to join';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '70px 76px',
        color: '#16283d',
        background: '#f7f4ee',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 420,
          height: 420,
          borderRadius: 999,
          right: -110,
          top: -150,
          background: '#ddecff',
          border: '70px solid #56adf3',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div
          style={{
            display: 'flex',
            fontSize: 54,
            fontWeight: 900,
            letterSpacing: -5,
            color: '#2582df',
          }}
        >
          mimo
        </div>
        <div style={{ display: 'flex', fontSize: 22, fontWeight: 700 }}>
          LIVE COMMUNITY PLAY
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 900 }}>
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            fontWeight: 800,
            color: '#c74f3d',
          }}
        >
          ROOM {room?.roomCode ?? code.toUpperCase()}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 18,
            fontSize: 72,
            lineHeight: 0.98,
            letterSpacing: -4,
            fontWeight: 900,
          }}
        >
          {room?.title ?? 'Join this Mimo'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div
          style={{
            display: 'flex',
            padding: '16px 24px',
            borderRadius: 999,
            background: config.mode === 'nim' ? '#f7c933' : '#ddecff',
            fontSize: 26,
            fontWeight: 850,
          }}
        >
          {rewardLine}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            fontWeight: 700,
            color: '#526a7c',
          }}
        >
          Open the link to join
        </div>
      </div>
    </div>,
    size,
  );
}
