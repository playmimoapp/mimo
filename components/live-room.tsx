'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Clock3,
  Copy,
  Radio,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MimoCharacter, MimoCue } from '@/components/mimo-host';
import type { LiveRoomState } from '@/lib/live-room-types';

type LiveRoomProps = {
  code: string;
  mode: 'host' | 'player';
  hostKey?: string;
  participantToken?: string;
  nickname?: string;
  onExit: () => void;
};

async function getError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error || 'Something went wrong. Try again.';
}

export function LiveRoom({
  code,
  mode,
  hostKey,
  participantToken,
  nickname,
  onExit,
}: LiveRoomProps) {
  const [room, setRoom] = useState<LiveRoomState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${code}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await getError(response));
      const next = (await response.json()) as LiveRoomState;
      setRoom(next);
      setNow(next.serverNow);
      setError('');
      if (mode === 'player' && nickname) {
        const me = next.players.find(
          (player) => player.nickname.toLowerCase() === nickname.toLowerCase(),
        );
        if (me?.answerLocked) setLocked(true);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The room could not be reached.',
      );
    }
  }, [code, nickname, mode]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => void refresh(), 1200);
    const clock = window.setInterval(() => setNow((value) => value + 250), 250);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh]);

  const seconds = room?.deadline
    ? Math.max(0, Math.ceil((room.deadline - now) / 1000))
    : null;
  const me = useMemo(
    () =>
      room?.players.find(
        (player) => player.nickname.toLowerCase() === nickname?.toLowerCase(),
      ),
    [nickname, room],
  );

  const hostAction = async (
    action: 'start' | 'reveal' | 'finish' | 'reset',
  ) => {
    if (!hostKey || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/rooms/${code}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, hostKey }),
      });
      if (!response.ok) throw new Error(await getError(response));
      if (action === 'start' || action === 'reset') {
        setLocked(false);
        setSelected(null);
      }
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The room did not change.',
      );
    } finally {
      setBusy(false);
    }
  };

  const answer = async (choice: number) => {
    if (!participantToken || locked || busy) return;
    setSelected(choice);
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/rooms/${code}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice, participantToken }),
      });
      if (!response.ok) throw new Error(await getError(response));
      setLocked(true);
      await refresh();
    } catch (cause) {
      setSelected(null);
      setError(
        cause instanceof Error ? cause.message : 'Your answer was not saved.',
      );
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    const url = `${window.location.origin}/?room=${code}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (!room) {
    return (
      <section className="mx-auto grid min-h-[70dvh] max-w-lg place-items-center px-5 text-center">
        <div>
          <MimoCharacter className="mx-auto w-36 animate-pulse" />
          <p className="mt-4 font-display text-2xl font-extrabold">
            Opening room {code}…
          </p>
          {error && (
            <button
              onClick={() => void refresh()}
              className="mt-4 font-bold text-[#1f72d2]"
            >
              Try again
            </button>
          )}
        </div>
      </section>
    );
  }

  const answered = room.players.filter((player) => player.answerLocked).length;
  const leaderboard = [...room.players].sort(
    (a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname),
  );
  const rewardLabel =
    room.rewardMode === 'nim'
      ? `${room.rewardAmount} NIM proposed · not funded`
      : 'Free room · no wallet needed';

  return (
    <section className="mobile-page mx-auto max-w-[1080px] px-5 pb-16 pt-1 sm:px-8 sm:pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d1d5d5] pb-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[.14em] text-[#c94f3b]">
            <Radio size={15} /> Live room
          </span>
          <strong className="font-display text-xl tracking-[.12em]">
            {room.code}
          </strong>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void copyInvite()}
            className="flex h-10 items-center gap-2 rounded-full border border-[#bdc8cf] bg-white px-4 text-sm font-extrabold"
          >
            <Copy size={15} />
            {copied ? 'Copied' : 'Invite'}
          </button>
          <button
            onClick={onExit}
            className="h-10 px-2 text-sm font-bold text-[#607486]"
          >
            Leave
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-4 bg-[#fff0ec] px-4 py-3 text-sm font-bold text-[#9f3f2f]"
        >
          <span>{error}</span>
          <button onClick={() => void refresh()} aria-label="Retry">
            <RefreshCw size={17} />
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-7 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="text-sm font-extrabold text-[#5b7082]">
            {room.community}
          </p>
          <h1 className="mobile-flow-title font-display mt-2 text-[clamp(2.6rem,7vw,5.7rem)] font-extrabold leading-[.9] tracking-[-.065em]">
            {room.title}
          </h1>
          <p
            className={`mt-4 inline-flex rounded-full px-3 py-1.5 text-sm font-extrabold ${room.rewardMode === 'nim' ? 'bg-[#fff0b9] text-[#6c5200]' : 'bg-[#e8f3ff] text-[#185b97]'}`}
          >
            {rewardLabel}
          </p>
          <MimoCue
            className="mobile-only mt-5"
            mood={
              room.status === 'complete' || room.status === 'verifying'
                ? 'happy'
                : room.status === 'live'
                  ? 'thinking'
                  : 'calm'
            }
            message={
              room.status === 'lobby'
                ? `${room.players.length || 'No'} players here. I’ll keep everyone together.`
                : room.status === 'live'
                  ? `${answered} answers locked. I’m watching the clock.`
                  : 'Scores checked. The room result is ready.'
            }
          />

          {room.status === 'lobby' && (
            <LobbyState
              room={room}
              isHost={mode === 'host'}
              busy={busy}
              onStart={() => void hostAction('start')}
            />
          )}
          {room.status === 'live' && (
            <QuestionState
              room={room}
              seconds={seconds ?? 0}
              role={mode}
              selected={selected}
              locked={locked || Boolean(me?.answerLocked)}
              busy={busy}
              answered={answered}
              onAnswer={answer}
              onReveal={() => void hostAction('reveal')}
            />
          )}
          {(room.status === 'verifying' || room.status === 'complete') && (
            <ResultsState
              room={room}
              leaderboard={leaderboard}
              role={mode}
              busy={busy}
              onFinish={() => void hostAction('finish')}
              onReset={() => void hostAction('reset')}
            />
          )}
        </div>

        <aside className="desktop-only relative self-start overflow-hidden rounded-[30px] bg-[#203752] p-5 text-white lg:sticky lg:top-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-[#bed0df]">
              Mimo is hosting
            </span>
            <span className="flex items-center gap-1 text-xs font-bold text-[#8ed9ae]">
              <span className="h-2 w-2 rounded-full bg-[#49c782]" /> Synced
            </span>
          </div>
          <motion.div
            animate={{ y: [0, -6, 0], rotate: [-1, 1, -1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          >
            <MimoCharacter className="mx-auto mt-1 w-48" />
          </motion.div>
          <p className="font-display text-center text-xl font-extrabold">
            {room.status === 'lobby'
              ? `${room.players.length} ${room.players.length === 1 ? 'player' : 'players'} arrived`
              : room.status === 'live'
                ? `${answered} of ${room.players.length} locked`
                : 'Scores verified'}
          </p>
          <p className="mt-2 text-center text-sm leading-5 text-[#c5d4e0]">
            {mode === 'host'
              ? 'You control when the room moves.'
              : me
                ? `You are on Team ${me.teamId === 'signal' ? 'Signal' : 'Spark'}.`
                : 'Your place is saved in this room.'}
          </p>
        </aside>
      </div>
    </section>
  );
}

function LobbyState({
  room,
  isHost,
  busy,
  onStart,
}: {
  room: LiveRoomState;
  isHost: boolean;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <div className="mt-6 sm:mt-8">
      <div className="flex items-center justify-between gap-3 border-b border-[#d1d5d5] pb-3">
        <p className="flex items-center gap-2 font-extrabold">
          <Users size={19} /> Arriving now
        </p>
        <span className="text-sm font-bold text-[#607486]">
          {room.players.length}/80
        </span>
      </div>
      {room.players.length ? (
        <div className="flex min-h-36 flex-wrap content-start gap-3 py-5">
          {room.players.map((player, index) => (
            <motion.div
              initial={{ opacity: 0, scale: 0.7, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              key={player.id}
              className="flex h-12 items-center gap-2 rounded-full bg-white py-1 pl-1 pr-4"
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-full text-sm font-extrabold text-white ${player.teamId === 'signal' ? 'bg-[#1f72d2]' : 'bg-[#d56552]'}`}
              >
                {player.nickname[0]?.toUpperCase()}
              </span>
              <strong>{player.nickname}</strong>
              <span className="text-xs font-bold text-[#718291]">
                {index + 1}
              </span>
            </motion.div>
          ))}
        </div>
      ) : (
        <p className="py-9 text-[#617486]">
          Share the room link. The first player will appear here instantly.
        </p>
      )}
      {isHost ? (
        <Button
          onClick={onStart}
          disabled={busy || room.players.length === 0}
          className="mobile-primary h-13 rounded-full bg-[#1f72d2] px-7 font-extrabold"
        >
          Start first round
        </Button>
      ) : (
        <p className="flex items-center gap-2 border-t border-[#d1d5d5] pt-5 font-bold text-[#526a7e]">
          <Clock3 size={18} />
          Waiting for the host to begin
        </p>
      )}
    </div>
  );
}

function QuestionState({
  room,
  seconds,
  role,
  selected,
  locked,
  busy,
  answered,
  onAnswer,
  onReveal,
}: {
  room: LiveRoomState;
  seconds: number;
  role: 'host' | 'player';
  selected: number | null;
  locked: boolean;
  busy: boolean;
  answered: number;
  onAnswer: (choice: number) => void;
  onReveal: () => void;
}) {
  return (
    <div className="mt-6 sm:mt-8">
      <div className="mobile-round-top flex items-start justify-between gap-4 border-b border-[#d1d5d5] pb-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.15em] text-[#c94f3b]">
            Round 1 · server timed
          </p>
          <h2 className="font-display mt-3 max-w-3xl text-[clamp(2rem,9vw,3.8rem)] font-extrabold leading-[.98] tracking-[-.05em]">
            {room.prompt}
          </h2>
        </div>
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-[#df8877] font-display text-xl font-extrabold text-[#b44939]">
          {seconds}
        </span>
      </div>
      {role === 'player' ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {room.choices.map((choice, index) => (
            <button
              key={choice}
              disabled={locked || busy || seconds === 0}
              onClick={() => onAnswer(index)}
              className={`mobile-answer min-h-28 border-2 p-5 text-left font-display text-xl font-extrabold transition ${selected === index ? 'border-[#1f72d2] bg-[#e9f4ff]' : 'border-[#cfd5d8] bg-white hover:-translate-y-1 hover:border-[#80a8cb]'} disabled:cursor-default disabled:hover:translate-y-0`}
            >
              <span className="mr-3 text-sm text-[#718291]">
                {String.fromCharCode(65 + index)}
              </span>
              {choice}
              {locked && selected === index && (
                <Check className="mt-3 text-[#1f72d2]" />
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-7">
          <p className="font-display text-4xl font-extrabold">
            {answered} / {room.players.length}
          </p>
          <p className="mt-1 text-[#617486]">answers locked on the server</p>
          <Button
            onClick={onReveal}
            disabled={busy}
            className="mobile-primary mt-6 h-12 rounded-full bg-[#203752] px-6 font-extrabold"
          >
            Reveal verified result
          </Button>
        </div>
      )}
      {role === 'player' && (
        <p
          aria-live="polite"
          className="mt-5 flex items-center gap-2 font-bold text-[#536b7e]"
        >
          {locked ? (
            <>
              <ShieldCheck size={18} />
              Answer saved. It cannot be changed.
            </>
          ) : seconds === 0 ? (
            'Time is up. Waiting for the reveal.'
          ) : (
            'Choose once. Mimo locks it on the server.'
          )}
        </p>
      )}
    </div>
  );
}

function ResultsState({
  room,
  leaderboard,
  role,
  busy,
  onFinish,
  onReset,
}: {
  room: LiveRoomState;
  leaderboard: LiveRoomState['players'];
  role: 'host' | 'player';
  busy: boolean;
  onFinish: () => void;
  onReset: () => void;
}) {
  return (
    <div className="mt-6 sm:mt-8">
      <div className="flex items-center gap-2 text-[#a97800]">
        <Trophy size={22} />
        <span className="text-sm font-extrabold uppercase tracking-[.14em]">
          Verified result
        </span>
      </div>
      <h2 className="mobile-flow-title font-display mt-3 text-[clamp(2.6rem,6vw,5rem)] font-extrabold leading-[.9] tracking-[-.06em]">
        The room has spoken.
      </h2>
      {room.correctChoice !== null && (
        <p className="mt-4 text-lg text-[#526a7e]">
          Correct:{' '}
          <strong className="text-[#16283d]">
            {room.choices[room.correctChoice]}
          </strong>
        </p>
      )}
      <div className="mt-7 border-y border-[#cdd3d5]">
        {leaderboard.map((player, index) => (
          <div
            key={player.id}
            className="flex items-center gap-4 border-b border-[#d9dddd] px-2 py-4 last:border-0"
          >
            <span className="font-display text-2xl font-extrabold text-[#7a8995]">
              {index + 1}
            </span>
            <span
              className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white ${player.teamId === 'signal' ? 'bg-[#1f72d2]' : 'bg-[#d56552]'}`}
            >
              {player.nickname[0]?.toUpperCase()}
            </span>
            <strong className="flex-1">{player.nickname}</strong>
            <span className="font-display text-xl font-extrabold">
              {player.score.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      {role === 'host' &&
        (room.status === 'verifying' ? (
          <Button
            onClick={onFinish}
            disabled={busy}
            className="mobile-primary mt-6 rounded-full bg-[#1f72d2] px-6 font-extrabold"
          >
            Finish event
          </Button>
        ) : (
          <Button
            onClick={onReset}
            disabled={busy}
            className="mobile-primary mt-6 rounded-full bg-[#203752] px-6 font-extrabold"
          >
            Open a rematch
          </Button>
        ))}
      {role === 'player' && (
        <p className="mt-5 font-bold text-[#536b7e]">
          {room.status === 'complete'
            ? 'Event complete. Your result is saved.'
            : 'The host is checking the room.'}
        </p>
      )}
    </div>
  );
}
