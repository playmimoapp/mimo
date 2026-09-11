'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import QRCode from 'qrcode';
import {
  ArrowRight,
  Check,
  Clock3,
  Link2,
  LockKeyhole,
  PauseCircle,
  PlayCircle,
  QrCode,
  Radio,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  WalletCards,
  TimerReset,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MimoCharacter,
  MimoCue,
  MimoProfileAvatar,
} from '@/components/mimo-host';
import type { LiveRoomState, MimoHostCue } from '@/lib/live-room-types';
import { MimoNimiq } from '@/lib/nimiq';
import { useMimoSound } from '@/lib/use-mimo-sound';

type LiveRoomProps = {
  code: string;
  mode: 'host' | 'player';
  hostKey?: string;
  participantToken?: string;
  inviteToken?: string;
  nickname?: string;
  onExit: () => void;
  onOpenCommunity?: (slug: string) => void;
};

type WalletProofUi = {
  status:
    | 'idle'
    | 'connecting'
    | 'signing'
    | 'verified'
    | 'cancelled'
    | 'unavailable'
    | 'failed';
  detail?: string;
};

type HostAction =
  | 'start'
  | 'reveal'
  | 'next'
  | 'finish'
  | 'reset'
  | 'extend'
  | 'cancel'
  | 'pause_auto'
  | 'resume_auto';

const CHOICE_TONES = [
  {
    surface: 'border-[#78aee5] bg-[#edf6ff]',
    selected: 'border-[#1f72d2] bg-[#dcecff] ring-2 ring-[#1f72d2]/20',
    badge: 'bg-[#1f72d2] text-white',
    bar: 'bg-[#bdddff]',
  },
  {
    surface: 'border-[#e89989] bg-[#fff1ed]',
    selected: 'border-[#c85743] bg-[#ffe1da] ring-2 ring-[#c85743]/20',
    badge: 'bg-[#d76551] text-white',
    bar: 'bg-[#ffc4b8]',
  },
  {
    surface: 'border-[#d7b13f] bg-[#fff8dc]',
    selected: 'border-[#a97c00] bg-[#ffedaa] ring-2 ring-[#a97c00]/20',
    badge: 'bg-[#c18c00] text-white',
    bar: 'bg-[#f8d65e]',
  },
  {
    surface: 'border-[#72b88f] bg-[#eef9f2]',
    selected: 'border-[#2d8a55] bg-[#d9f2e2] ring-2 ring-[#2d8a55]/20',
    badge: 'bg-[#3b9a62] text-white',
    bar: 'bg-[#ade0bf]',
  },
] as const;

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
  inviteToken,
  nickname,
  onExit,
  onOpenCommunity,
}: LiveRoomProps) {
  const [room, setRoom] = useState<LiveRoomState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteQr, setInviteQr] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [nimiq] = useState(() => new MimoNimiq());
  const [walletProof, setWalletProof] = useState<WalletProofUi>({
    status: 'idle',
  });
  const reduceMotion = useReducedMotion();
  const [reactionBusy, setReactionBusy] = useState(false);
  const [aiCue, setAiCue] = useState<MimoHostCue | null>(null);
  const {
    enabled: soundEnabled,
    play: playSound,
    toggle: toggleSound,
  } = useMimoSound();
  const previousRoom = useRef<{
    status: LiveRoomState['status'];
    players: number;
    rewardState: LiveRoomState['rewardState'];
  } | null>(null);
  const previousSecond = useRef<number | null>(null);

  const inviteUrl = useCallback(
    () =>
      `${window.location.origin}/?room=${code}${inviteToken ? `#invite=${inviteToken}` : ''}`,
    [code, inviteToken],
  );

  useEffect(() => {
    if (!inviteOpen) return;
    let active = true;
    void QRCode.toDataURL(inviteUrl(), {
      width: 720,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#203752', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (active) setInviteQr(dataUrl);
      })
      .catch(() => {
        if (active)
          setInviteError(
            'The QR code could not be made. Copy the link instead.',
          );
      });
    return () => {
      active = false;
    };
  }, [inviteOpen, inviteUrl]);

  const refresh = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (hostKey) headers['x-mimo-host'] = hostKey;
      else if (participantToken) headers['x-mimo-session'] = participantToken;
      else if (inviteToken) headers['x-mimo-invite'] = inviteToken;
      const response = await fetch(`/api/rooms/${code}`, {
        cache: 'no-store',
        headers,
      });
      if (!response.ok) throw new Error(await getError(response));
      const next = (await response.json()) as LiveRoomState;
      setRoom(next);
      setNow(next.serverNow);
      setError('');
      if (mode === 'player' && nickname) {
        const me = next.players.find(
          (player) => player.nickname.toLowerCase() === nickname.toLowerCase(),
        );
        const answerIsLocked = Boolean(me?.answerLocked);
        setLocked(answerIsLocked);
        if (!answerIsLocked) {
          setSelected(null);
        } else {
          const savedChoice = window.sessionStorage.getItem(
            `mimo:${code}:${next.activeRoundId}:choice`,
          );
          setSelected(
            (current) =>
              current ??
              (savedChoice !== null && Number.isInteger(Number(savedChoice))
                ? Number(savedChoice)
                : null),
          );
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The room could not be reached.',
      );
    }
  }, [code, hostKey, inviteToken, nickname, mode, participantToken]);

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

  useEffect(() => {
    if (!room) return;
    const previous = previousRoom.current;
    if (previous) {
      if (room.players.length > previous.players) playSound('arrival');
      if (previous.status === 'lobby' && room.status === 'live')
        playSound('start');
      if (previous.status === 'live' && room.status === 'verifying')
        playSound('reveal');
      if (previous.status !== 'complete' && room.status === 'complete')
        playSound('complete');
      if (
        previous.rewardState !== 'payout_confirmed' &&
        room.rewardState === 'payout_confirmed'
      )
        playSound('reward');
    }
    previousRoom.current = {
      status: room.status,
      players: room.players.length,
      rewardState: room.rewardState,
    };
  }, [playSound, room]);

  useEffect(() => {
    if (
      room?.status === 'live' &&
      seconds !== null &&
      seconds > 0 &&
      seconds <= 3 &&
      previousSecond.current !== seconds
    ) {
      playSound('tick');
    }
    previousSecond.current = seconds;
  }, [playSound, room?.status, seconds]);
  const answeredCount =
    room?.players.filter((player) => player.answerLocked).length ?? 0;
  const autoHost = room?.autoHostEnabled ?? true;
  const me = useMemo(
    () =>
      room?.players.find(
        (player) => player.nickname.toLowerCase() === nickname?.toLowerCase(),
      ),
    [nickname, room],
  );

  const hostAction = useCallback(
    async (action: HostAction) => {
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
    },
    [busy, code, hostKey, refresh],
  );

  const allAnswered = Boolean(
    room?.status === 'live' &&
    room.players.length > 0 &&
    answeredCount === room.players.length,
  );

  const cueProgress = room
    ? room.status === 'lobby'
      ? room.players.length <= 3
        ? room.players.length
        : room.players.length <= 7
          ? 5
          : room.players.length <= 15
            ? 10
            : 20
      : room.status === 'live' && room.players.length > 0
        ? answeredCount >= room.players.length
          ? 4
          : Math.min(3, Math.floor((answeredCount / room.players.length) * 4))
        : 0
    : 0;
  const cueMoment = room
    ? `${room.status}:${room.activeRoundId}:${cueProgress}:${seconds !== null && seconds <= 5 ? 'closing' : 'open'}`
    : '';

  useEffect(() => {
    if (!cueMoment) return;
    const controller = new AbortController();
    let retry: number | undefined;

    const loadCue = async () => {
      try {
        const headers: Record<string, string> = {};
        if (hostKey) headers['x-mimo-host'] = hostKey;
        else if (participantToken) headers['x-mimo-session'] = participantToken;
        else if (inviteToken) headers['x-mimo-invite'] = inviteToken;
        const response = await fetch(`/api/rooms/${code}/cue`, {
          method: 'POST',
          headers,
          signal: controller.signal,
        });
        if (!response.ok) return;
        const cue = (await response.json()) as MimoHostCue & {
          pending?: boolean;
        };
        if (!cue.pending) setAiCue(cue);
        else retry = window.setTimeout(() => void loadCue(), 1400);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          // Live commentary is optional; the factual fallback remains visible.
        }
      }
    };

    void loadCue();
    return () => {
      controller.abort();
      if (retry) window.clearTimeout(retry);
    };
  }, [code, cueMoment, hostKey, inviteToken, participantToken]);

  const react = async (emoji: '👏' | '🔥' | '🤯' | '💙') => {
    if (!participantToken || reactionBusy) return;
    setReactionBusy(true);
    try {
      const response = await fetch(`/api/rooms/${code}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantToken, emoji }),
      });
      if (!response.ok) throw new Error(await getError(response));
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'That reaction did not land.',
      );
    } finally {
      window.setTimeout(() => setReactionBusy(false), 450);
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
      playSound('lock');
      window.sessionStorage.setItem(
        `mimo:${code}:${room?.activeRoundId}:choice`,
        String(choice),
      );
      if ('vibrate' in navigator) navigator.vibrate(35);
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

  const verifyWallet = async () => {
    if (!participantToken || walletProof.status === 'connecting') return;
    setWalletProof({ status: 'connecting' });
    setError('');
    try {
      const connection = await nimiq.connect();
      if (connection.status !== 'ready') {
        setWalletProof({
          status:
            connection.status === 'cancelled'
              ? 'cancelled'
              : connection.status === 'unavailable'
                ? 'unavailable'
                : 'failed',
          detail:
            connection.status === 'cancelled'
              ? 'Nothing changed. Connect whenever you are ready.'
              : 'reason' in connection
                ? connection.reason
                : 'Nimiq Pay is not ready yet.',
        });
        return;
      }

      const challengeResponse = await fetch(
        `/api/rooms/${code}/wallet/challenge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantToken }),
        },
      );
      if (!challengeResponse.ok) {
        throw new Error(await getError(challengeResponse));
      }
      const challenge = (await challengeResponse.json()) as {
        challengeId: string;
        message: string;
      };

      setWalletProof({ status: 'signing', detail: connection.maskedAccount });
      const proof = await nimiq.signChallenge(challenge.message);
      if ('status' in proof) {
        setWalletProof({
          status:
            proof.status === 'cancelled'
              ? 'cancelled'
              : proof.status === 'unavailable'
                ? 'unavailable'
                : 'failed',
          detail:
            proof.status === 'cancelled'
              ? 'Signature cancelled. No wallet was linked.'
              : 'reason' in proof
                ? proof.reason
                : 'Nimiq Pay is not ready yet.',
        });
        return;
      }

      const verifyResponse = await fetch(`/api/rooms/${code}/wallet/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantToken,
          challengeId: challenge.challengeId,
          account: connection.account,
          publicKey: proof.publicKey,
          signature: proof.signature,
        }),
      });
      if (!verifyResponse.ok) throw new Error(await getError(verifyResponse));
      const verified = (await verifyResponse.json()) as {
        payoutAddressRegistered?: boolean;
        changedBeforeStart?: boolean;
      };
      setWalletProof({
        status: 'verified',
        detail: `${connection.maskedAccount}${
          verified.changedBeforeStart
            ? ' · changed safely before play'
            : verified.payoutAddressRegistered
              ? ' · ready for automatic rewards'
              : ''
        }`,
      });
      await refresh();
    } catch (cause) {
      setWalletProof({
        status: 'failed',
        detail:
          cause instanceof Error
            ? cause.message
            : 'The wallet could not be verified.',
      });
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setInviteError('Your browser blocked copy. Use Share instead.');
    }
  };

  const shareInvite = async () => {
    if (!room) return;
    if (!navigator.share) {
      await copyInvite();
      return;
    }
    try {
      await navigator.share({
        title: `${room.title} on Mimo`,
        text: `Join ${room.community} in room ${room.code}.`,
        url: inviteUrl(),
      });
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setInviteError('Sharing did not open. You can copy the link instead.');
    }
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

  const answered = answeredCount;
  const leaderboard = [...room.players].sort(
    (a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname),
  );
  const rewardLabel =
    room.rewardMode === 'nim'
      ? room.rewardCustody === 'host_wallet'
        ? `${room.rewardAmount} NIM · host promise`
        : ['funded', 'event_live', 'results_under_verification'].includes(
              room.rewardState,
            )
          ? `${room.rewardAmount} NIM · funded`
          : room.rewardState === 'funding_submitted'
            ? `${room.rewardAmount} NIM · funding confirmation pending`
            : `${room.rewardAmount} NIM · awaiting funding`
      : 'Free room · no wallet needed';
  const signalScore = room.players
    .filter((player) => player.teamId === 'signal')
    .reduce((sum, player) => sum + player.score, 0);
  const sparkScore = room.players
    .filter((player) => player.teamId === 'spark')
    .reduce((sum, player) => sum + player.score, 0);
  const signalPlayers = room.players.filter(
    (player) => player.teamId === 'signal',
  );
  const sparkPlayers = room.players.filter(
    (player) => player.teamId === 'spark',
  );
  const signalReactions = room.reactions.filter(
    (reaction) => reaction.teamId === 'signal',
  ).length;
  const sparkReactions = room.reactions.filter(
    (reaction) => reaction.teamId === 'spark',
  ).length;
  const liveEnergy = (team: LiveRoomState['players'], reactions: number) =>
    team.reduce((sum, player) => sum + player.score, 0) +
    team.filter((player) => player.answerLocked).length * 120 +
    reactions * 45 +
    team.length * 30;
  const scoredRoom = signalScore + sparkScore > 0;
  const signalEnergy =
    ['verifying', 'complete'].includes(room.status) && scoredRoom
      ? signalScore
      : liveEnergy(signalPlayers, signalReactions);
  const sparkEnergy =
    ['verifying', 'complete'].includes(room.status) && scoredRoom
      ? sparkScore
      : liveEnergy(sparkPlayers, sparkReactions);
  const fallbackMimoLine =
    room.status === 'lobby'
      ? room.players.length === 0
        ? 'The room is ready. Bring your people in.'
        : `${room.players.length} ${room.players.length === 1 ? 'player is' : 'players are'} here. I’m balancing the teams.`
      : room.status === 'live'
        ? allAnswered
          ? 'Everyone is locked in. Let’s reveal it.'
          : `${answered} of ${room.players.length} locked in. I’m watching the clock.`
        : room.status === 'verifying'
          ? room.hasNextRound
            ? 'Result checked. The next round is nearly here.'
            : 'Final result checked. Let’s bring this home.'
          : room.status === 'cancelled'
            ? 'The room was cancelled. No result or payout was created.'
            : 'That room had energy. Who wants the rematch?';
  const mimoLine = aiCue?.line ?? fallbackMimoLine;
  const mimoMood =
    aiCue?.mood ??
    (room.status === 'live'
      ? 'thinking'
      : room.status === 'cancelled'
        ? 'calm'
        : 'happy');

  return (
    <section className="mobile-page app-frame relative pb-24 pt-1 sm:pt-3">
      <ReactionSky reactions={room.reactions} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d1d5d5] pb-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[.14em] text-[#c94f3b]">
            {room.accessMode === 'private' ? (
              <LockKeyhole size={15} />
            ) : (
              <Radio size={15} />
            )}{' '}
            {room.accessMode === 'private' ? 'Private room' : 'Live room'}
          </span>
          <strong className="font-display text-xl tracking-[.12em]">
            {room.code}
          </strong>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            aria-label={
              soundEnabled ? 'Mute Mimo sounds' : 'Turn on Mimo sounds'
            }
            aria-pressed={soundEnabled}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#bdc8cf] bg-white text-[#29445f]"
          >
            {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          {mode === 'host' &&
            !['lobby', 'complete', 'cancelled'].includes(room.status) && (
              <button
                onClick={() =>
                  void hostAction(autoHost ? 'pause_auto' : 'resume_auto')
                }
                aria-pressed={autoHost}
                className={`flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-extrabold ${
                  autoHost
                    ? 'border-[#9bc9ae] bg-[#edf9f1] text-[#237044]'
                    : 'border-[#d7b56a] bg-[#fff8dd] text-[#775900]'
                }`}
              >
                {autoHost ? (
                  <PauseCircle size={16} />
                ) : (
                  <PlayCircle size={16} />
                )}
                <span className="hidden sm:inline">
                  Mimo auto {autoHost ? 'on' : 'paused'}
                </span>
                <span className="sm:hidden">Auto</span>
              </button>
            )}
          <button
            onClick={() => {
              setInviteError('');
              setInviteOpen(true);
            }}
            className="flex h-10 items-center gap-2 rounded-full border border-[#bdc8cf] bg-white px-4 text-sm font-extrabold"
          >
            <QrCode size={16} />
            Invite
          </button>
          <button
            onClick={onExit}
            className="h-10 px-2 text-sm font-bold text-[#607486]"
          >
            Leave
          </button>
        </div>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="invite-sheet overflow-y-auto rounded-[30px] bg-[#f8f7f3] p-0 max-sm:translate-x-0 max-sm:translate-y-0 sm:max-w-[430px]">
          <div className="relative shrink-0 overflow-hidden bg-[#dceeff] px-5 pb-4 pt-5">
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[22px] border-white/35" />
            <DialogHeader className="relative pr-9">
              <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#1f72d2]">
                Bring everyone in
              </p>
              <DialogTitle className="font-display text-3xl font-extrabold leading-[.95] tracking-[-.04em]">
                Scan. Join. Play.
              </DialogTitle>
              <DialogDescription className="max-w-[290px] font-medium leading-5 text-[#526a7c]">
                Point any phone camera at the code. No app lesson needed.
              </DialogDescription>
            </DialogHeader>
            <MimoCharacter
              mood="happy"
              className="absolute -bottom-8 -right-3 w-[104px] rotate-[-4deg]"
            />
          </div>

          <div className="grid justify-items-center px-5 pb-5 pt-4">
            <div className="invite-qr mx-auto w-full max-w-[280px] rounded-[22px] bg-white p-3 shadow-[0_10px_32px_rgba(37,63,87,.08)]">
              {inviteQr ? (
                <Image
                  src={inviteQr}
                  alt={`QR code to join room ${room.code}`}
                  width={720}
                  height={720}
                  unoptimized
                  className="aspect-square w-full rounded-[14px]"
                />
              ) : (
                <div className="grid aspect-square w-full place-items-center rounded-[14px] bg-[#edf2f5] text-[#607486]">
                  <RefreshCw className="animate-spin" />
                  <span className="sr-only">Creating QR code</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex w-full items-center justify-between gap-3 border-b border-[#d1d7da] pb-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold">{room.title}</p>
                <p className="mt-1 text-xs font-bold text-[#617486]">
                  {room.accessMode === 'private'
                    ? 'Private invite'
                    : 'Public room'}
                  {room.rewardMode === 'nim'
                    ? room.rewardCustody === 'host_wallet'
                      ? ` · ${room.rewardAmount} NIM host promise`
                      : [
                            'funded',
                            'event_live',
                            'results_under_verification',
                          ].includes(room.rewardState)
                        ? ` · ${room.rewardAmount} NIM funded`
                        : ` · ${room.rewardAmount} NIM awaiting funding`
                    : ' · Free to join'}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#203752] px-3 py-2 font-display text-sm font-extrabold tracking-[.14em] text-white">
                {room.code}
              </span>
            </div>

            {inviteError && (
              <p
                role="alert"
                className="mt-3 w-full text-sm font-bold text-[#a33f30]"
              >
                {inviteError}
              </p>
            )}

            <div className="mt-4 grid w-full grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => void copyInvite()}
                className="h-12 rounded-full border-[#afbdc7] bg-white font-extrabold"
              >
                {copied ? <Check /> : <Link2 />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
              <Button
                onClick={() => void shareInvite()}
                className="h-12 rounded-full bg-[#1f72d2] font-extrabold"
              >
                <Share2 /> Share invite
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      <TeamMomentum
        signal={signalEnergy}
        spark={sparkEnergy}
        live={room.status === 'live'}
        label={
          room.status === 'lobby'
            ? 'Team presence'
            : room.status === 'live'
              ? 'Live team energy'
              : 'Team result'
        }
      />

      <div className="mt-6 grid gap-7 lg:grid-cols-[1fr_340px]">
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
            mood={mimoMood}
            message={mimoLine}
          />

          {room.rewardMode === 'nim' && mode === 'player' && (
            <WalletProofCard
              verified={Boolean(me?.walletVerified)}
              automaticPayout={room.rewardCustody === 'mimo_vault'}
              payoutReady={Boolean(me?.payoutAddressRegistered)}
              canChange={room.status === 'lobby'}
              state={walletProof}
              onVerify={() => void verifyWallet()}
            />
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${room.activeRoundId}-${room.status}`}
              initial={{
                opacity: 0,
                scale: reduceMotion ? 1 : 0.97,
                y: reduceMotion ? 0 : 28,
              }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{
                opacity: 0,
                scale: reduceMotion ? 1 : 1.02,
                y: reduceMotion ? 0 : -18,
              }}
              transition={{
                duration: reduceMotion ? 0 : 0.42,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {room.status === 'lobby' && (
                <LobbyState
                  room={room}
                  isHost={mode === 'host'}
                  currentPlayer={me}
                  busy={busy}
                  hostKey={hostKey}
                  nimiq={nimiq}
                  onRefresh={refresh}
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
                  autoHost={autoHost}
                  onAnswer={answer}
                  onReveal={() => void hostAction('reveal')}
                  onExtend={() => void hostAction('extend')}
                />
              )}
              {(room.status === 'verifying' || room.status === 'complete') && (
                <ResultsState
                  room={room}
                  leaderboard={leaderboard}
                  role={mode}
                  busy={busy}
                  autoHost={autoHost}
                  onFinish={() => void hostAction('finish')}
                  onNext={() => void hostAction('next')}
                  onReset={() => void hostAction('reset')}
                  hostKey={hostKey}
                  nimiq={nimiq}
                  currentPlayerId={me?.id}
                  participantToken={participantToken}
                  onOpenCommunity={onOpenCommunity}
                />
              )}
              {room.status === 'cancelled' && <CancelledState room={room} />}
            </motion.div>
          </AnimatePresence>

          {mode === 'player' && room.status !== 'cancelled' && (
            <ReactionBar busy={reactionBusy} onReact={react} />
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
            <MimoCharacter mood={mimoMood} className="mx-auto mt-1 w-48" />
          </motion.div>
          <p className="font-display text-center text-xl font-extrabold">
            {room.status === 'lobby'
              ? `${room.players.length} ${room.players.length === 1 ? 'player' : 'players'} arrived`
              : room.status === 'live'
                ? `${answered} of ${room.players.length} locked`
                : room.status === 'verifying' && room.hasNextRound
                  ? `Round ${room.roundIndex + 1} revealed`
                  : 'Scores verified'}
          </p>
          <motion.div
            key={mimoLine}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mt-3 rounded-2xl bg-white/10 px-4 py-3"
          >
            <span className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 bg-[#364c65]" />
            <p className="relative text-center text-sm font-bold leading-5 text-white">
              {mimoLine}
            </p>
            {aiCue?.source === 'ai' && (
              <span className="relative mt-2 block text-center text-[10px] font-extrabold uppercase tracking-[.14em] text-[#8ed9ae]">
                Mimo AI · reacting live
              </span>
            )}
          </motion.div>
          <p className="mt-3 text-center text-xs leading-4 text-[#aebfce]">
            {mode === 'host'
              ? autoHost
                ? 'I reveal on time and move the show. You can step in anytime.'
                : 'Auto-host is paused. You control every move.'
              : me
                ? `You are on Team ${me.teamId === 'signal' ? 'Signal' : 'Spark'}.`
                : 'Your place is saved in this room.'}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/10 py-4 text-center">
            <div>
              <strong className="font-display block text-2xl">
                {room.players.length}
              </strong>
              <span className="text-xs text-[#aebfce]">players</span>
            </div>
            <div>
              <strong className="font-display block text-2xl">
                {answered}
              </strong>
              <span className="text-xs text-[#aebfce]">locked</span>
            </div>
            <div>
              <strong className="font-display block text-2xl">
                {room.players.filter((p) => p.walletVerified).length}
              </strong>
              <span className="text-xs text-[#aebfce]">confirmed</span>
            </div>
          </div>
          {mode === 'host' && room.status === 'live' && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => void hostAction('extend')}
                disabled={busy}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-extrabold hover:bg-white/15"
              >
                <TimerReset size={16} /> +10 sec
              </button>
              <button
                onClick={() => void hostAction('reveal')}
                disabled={busy}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#f7c933] text-sm font-extrabold text-[#25364b]"
              >
                <Zap size={16} /> Reveal
              </button>
            </div>
          )}
          {mode === 'host' && room.status === 'lobby' && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <button
                    disabled={busy}
                    aria-label="Cancel this room before it starts"
                    className="mx-auto mt-4 flex items-center gap-2 text-xs font-bold text-[#efaaa0] hover:text-white"
                  />
                }
              >
                <XCircle size={14} /> Cancel before start
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-[24px] border-0 bg-white p-5 shadow-2xl">
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-[#fff0ec] text-[#b74d3d]">
                    <XCircle />
                  </AlertDialogMedia>
                  <AlertDialogTitle className="font-display text-xl font-extrabold">
                    Cancel this room?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="leading-6">
                    The room has not started. Players will see that it was
                    cancelled. Any confirmed vault funding will be returned to
                    the wallet that funded it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep room</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void hostAction('cancel')}
                    disabled={busy}
                    className="bg-[#b84a3a] text-white hover:bg-[#9e3d30]"
                  >
                    Cancel and refund
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </aside>
      </div>
    </section>
  );
}

function TeamMomentum({
  signal,
  spark,
  live,
  label,
}: {
  signal: number;
  spark: number;
  live: boolean;
  label: string;
}) {
  const total = signal + spark;
  const signalWidth = total
    ? Math.max(12, Math.min(88, (signal / total) * 100))
    : 50;
  return (
    <div className="mt-4 overflow-hidden rounded-[22px] border border-[#ccd5dc] bg-white p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between text-xs font-extrabold uppercase tracking-[.1em]">
        <span className="text-[#1f72d2]">Signal</span>
        <span className={live ? 'text-[#c25340]' : 'text-[#73828e]'}>
          {label}
        </span>
        <span className="text-[#c75d4a]">Spark</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[#edf0f2]">
        <motion.div
          animate={{ width: `${signalWidth}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 22 }}
          className="bg-[#1f72d2]"
        />
        <motion.div
          animate={{ width: `${100 - signalWidth}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 22 }}
          className="bg-[#e06b56]"
        />
      </div>
    </div>
  );
}

function ReactionSky({ reactions }: { reactions: LiveRoomState['reactions'] }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto h-[55dvh] max-w-[1100px] overflow-hidden"
      aria-live="polite"
    >
      <AnimatePresence>
        {reactions.map((reaction, index) => (
          <motion.div
            key={reaction.id}
            initial={{ opacity: 0, y: 90, scale: 0.45, rotate: -12 }}
            animate={{
              opacity: [0, 1, 1, 0],
              y: -260 - (index % 3) * 38,
              scale: [0.45, 1.18, 1, 0.82],
              rotate: [-12, 8, -5],
            }}
            transition={{ duration: 3.8, ease: 'easeOut' }}
            className="absolute bottom-0 rounded-full border border-white/70 bg-white/90 px-3 py-2 shadow-lg"
            style={{ left: `${9 + ((index * 23) % 78)}%` }}
          >
            <span className="text-2xl">{reaction.emoji}</span>
            <span className="ml-1 text-xs font-extrabold text-[#526a7e]">
              {reaction.nickname}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ReactionBar({
  busy,
  onReact,
}: {
  busy: boolean;
  onReact: (emoji: '👏' | '🔥' | '🤯' | '💙') => void;
}) {
  return (
    <div className="sticky bottom-3 z-40 mx-auto mt-8 flex w-fit items-center gap-1 rounded-full border border-[#c9d4dc] bg-white/95 p-1.5 shadow-[0_14px_45px_rgba(26,47,80,.16)] backdrop-blur">
      <span className="pl-3 pr-1 text-xs font-extrabold text-[#607486]">
        React
      </span>
      {(['👏', '🔥', '🤯', '💙'] as const).map((emoji) => (
        <motion.button
          key={emoji}
          whileTap={{ scale: 1.35, rotate: 8 }}
          disabled={busy}
          onClick={() => onReact(emoji)}
          className="grid h-11 w-11 place-items-center rounded-full text-xl hover:bg-[#eef5fb] disabled:opacity-60"
          aria-label={`React ${emoji}`}
        >
          {emoji}
        </motion.button>
      ))}
    </div>
  );
}

function CancelledState({ room }: { room: LiveRoomState }) {
  const vaultHadFunding =
    room.rewardCustody === 'mimo_vault' &&
    room.rewardMode === 'nim' &&
    Boolean(room.fundingTxHash);
  return (
    <div className="mt-8 border-y border-[#d0d6da] py-10 text-center">
      <MimoCharacter mood="thinking" className="mx-auto w-32 grayscale-[.25]" />
      <h2 className="font-display mt-3 text-4xl font-extrabold">
        This room has ended.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[#607486]">
        {vaultHadFunding
          ? room.refundState === 'confirmed'
            ? 'The Nimiq network confirmed the automatic refund to the funding wallet.'
            : room.refundState === 'submitted'
              ? 'Mimo sent the refund back to the funding wallet. Network confirmation is pending.'
              : room.refundState === 'prepared'
                ? 'Mimo prepared the refund and will retry the same transaction safely.'
                : 'Mimo will return the funded NIM automatically after the network confirms the original funding payment.'
          : 'Mimo did not request or move any NIM. Any open wallet prompt can be safely closed.'}
      </p>
      {room.refundTxHash && (
        <a
          href={`https://test.nimiq.watch/#${room.refundTxHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs font-bold text-[#2577de] underline decoration-[#9dc3ec] underline-offset-4"
        >
          Refund proof {room.refundTxHash.slice(0, 14)}… <Link2 size={13} />
        </a>
      )}
    </div>
  );
}

function WalletProofCard({
  verified,
  automaticPayout,
  payoutReady,
  canChange,
  state,
  onVerify,
}: {
  verified: boolean;
  automaticPayout: boolean;
  payoutReady: boolean;
  canChange: boolean;
  state: WalletProofUi;
  onVerify: () => void;
}) {
  const working = state.status === 'connecting' || state.status === 'signing';
  const done = verified || state.status === 'verified';
  return (
    <div
      className={`mt-5 flex flex-col gap-4 border px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${done ? 'border-[#9cd6b2] bg-[#edf9f1]' : 'border-[#e2c564] bg-[#fff8dd]'}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${done ? 'bg-[#d7f1df] text-[#237044]' : 'bg-[#ffe99c] text-[#765700]'}`}
        >
          {done ? <ShieldCheck size={19} /> : <WalletCards size={19} />}
        </span>
        <div>
          <strong className="block">
            {done
              ? payoutReady
                ? 'Wallet confirmed for play and rewards'
                : 'Wallet ownership confirmed'
              : 'Confirm your wallet for NIM rewards'}
          </strong>
          <p className="mt-1 text-sm leading-5 text-[#5b7082]">
            {done
              ? `${state.detail ? `${state.detail} · ` : ''}${payoutReady ? 'Your payout address is encrypted and never shown in room data.' : 'Mimo stores a private fingerprint instead of showing your wallet address.'}`
              : state.detail ||
                (automaticPayout
                  ? 'Sign once to join with this wallet and receive any NIM you earn. This sends no money.'
                  : 'Nimiq Pay will ask you to connect and sign. This sends no money.')}
          </p>
        </div>
      </div>
      {!done && (
        <Button
          onClick={onVerify}
          disabled={working}
          className="h-11 shrink-0 rounded-full bg-[#203752] px-5 font-extrabold"
        >
          {state.status === 'connecting'
            ? 'Opening Nimiq Pay…'
            : state.status === 'signing'
              ? 'Awaiting signature…'
              : state.status === 'cancelled'
                ? 'Try again'
                : 'Confirm wallet'}
        </Button>
      )}
      {done && canChange && (
        <Button
          variant="outline"
          onClick={onVerify}
          disabled={working}
          className="h-11 shrink-0 rounded-full border-[#9ab5a5] bg-white px-5 font-extrabold text-[#29445f]"
        >
          {working ? 'Switching…' : 'Change wallet'}
        </Button>
      )}
    </div>
  );
}

function RewardFundingPanel({
  room,
  isHost,
  hostKey,
  nimiq,
  onRefresh,
}: {
  room: LiveRoomState;
  isHost: boolean;
  hostKey?: string;
  nimiq: MimoNimiq;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState('');
  const funded = [
    'funded',
    'event_live',
    'results_under_verification',
  ].includes(room.rewardState);

  const fundReward = async () => {
    if (!hostKey || busy) return;
    setBusy(true);
    setDetail('Preparing the exact vault payment…');
    try {
      const preparedResponse = await fetch(
        `/api/rooms/${room.code}/reward/funding/prepare`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostKey }),
        },
      );
      if (!preparedResponse.ok) {
        throw new Error(await getError(preparedResponse));
      }
      const prepared = (await preparedResponse.json()) as {
        amountLuna: string;
        recipient: string;
        memo: string;
        network: 'MainAlbatross' | 'TestAlbatross';
        testOnly: boolean;
      };
      if (prepared.testOnly) {
        setDetail(
          'The safe TestAlbatross vault is active. Mainnet wallet payments stay disabled during testing.',
        );
        return;
      }

      const connection = await nimiq.connect();
      if (connection.status !== 'ready') {
        setDetail(
          connection.status === 'cancelled'
            ? 'You cancelled. No NIM moved.'
            : 'Open this host room inside Nimiq Pay to fund it.',
        );
        return;
      }
      setDetail(
        `Nimiq Pay will ask you to approve exactly ${room.rewardAmount} NIM.`,
      );
      const payment = await nimiq.sendNim(
        prepared.recipient,
        Number(prepared.amountLuna),
        prepared.memo,
      );
      if (payment.status !== 'funding_submitted') {
        setDetail(
          payment.status === 'cancelled'
            ? 'You cancelled. No NIM moved.'
            : payment.status === 'failed'
              ? payment.reason
              : 'The funding payment was not submitted.',
        );
        return;
      }
      const submittedResponse = await fetch(
        `/api/rooms/${room.code}/reward/funding/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hostKey,
            transactionHash: payment.transactionHash,
          }),
        },
      );
      if (!submittedResponse.ok) {
        throw new Error(await getError(submittedResponse));
      }
      setDetail('Payment submitted. Waiting for the Nimiq network.');
      await onRefresh();
    } catch (cause) {
      setDetail(
        cause instanceof Error
          ? cause.message
          : 'The reward could not be funded.',
      );
    } finally {
      setBusy(false);
    }
  };

  const checkFunding = async () => {
    if (!hostKey || busy) return;
    setBusy(true);
    setDetail('Checking the Nimiq network…');
    try {
      const response = await fetch(
        `/api/rooms/${room.code}/reward/funding/status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostKey }),
        },
      );
      if (!response.ok) throw new Error(await getError(response));
      const status = (await response.json()) as {
        state: string;
        confirmations?: number;
      };
      setDetail(
        status.state === 'funded'
          ? `Funding confirmed${status.confirmations ? ` · ${status.confirmations} confirmation${status.confirmations === 1 ? '' : 's'}` : ''}.`
          : 'Still waiting for the transaction to enter a block.',
      );
      await onRefresh();
    } catch (cause) {
      setDetail(
        cause instanceof Error
          ? cause.message
          : 'The network check did not finish.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (room.rewardCustody === 'host_wallet') {
    return (
      <section className="mt-5 border-l-4 border-[#e1b928] bg-[#fff8d9] px-4 py-3">
        <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#806000]">
          Host promise
        </p>
        <p className="mt-1 text-sm font-bold text-[#675e3e]">
          {room.rewardAmount} NIM stays in the host’s wallet. Mimo verifies the
          result; the host approves payment in Nimiq Pay.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-5 overflow-hidden rounded-[24px] border border-[#e2c55c] bg-[#fff9dc] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${funded ? 'bg-[#d9f2e2] text-[#237044]' : 'bg-[#f7c933] text-[#6b5100]'}`}
          >
            {funded ? <ShieldCheck size={19} /> : <WalletCards size={19} />}
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#806000]">
              {funded ? 'Funded reward' : 'Fund this reward'}
            </p>
            <h3 className="font-display mt-1 text-xl font-extrabold">
              {room.rewardAmount} NIM {funded ? 'is ready' : 'for this room'}
            </h3>
            <p className="mt-1 text-sm leading-5 text-[#675e3e]">
              {funded
                ? 'The Nimiq network confirmed the vault payment. The reward rules are now fixed.'
                : `One payment funds the event before play. Mimo will not start on a promise.`}
            </p>
          </div>
        </div>
        {room.vaultNetwork && (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] text-[#6f6040]">
            {room.vaultNetwork === 'TestAlbatross' ? 'Testnet' : 'Mainnet'}
          </span>
        )}
      </div>

      {room.fundingTxHash && (
        <a
          href={`https://test.nimiq.watch/#${room.fundingTxHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs font-bold text-[#746334] underline decoration-[#c7a838] underline-offset-4"
        >
          Funding proof {room.fundingTxHash.slice(0, 12)}… <Link2 size={13} />
        </a>
      )}
      {isHost && !funded && (
        <div className="mt-4 flex flex-wrap gap-2">
          {room.rewardState === 'funding_submitted' ? (
            <Button
              onClick={() => void checkFunding()}
              disabled={busy}
              className="h-11 rounded-full bg-[#203752] px-5 font-extrabold"
            >
              {busy ? 'Checking…' : 'Check confirmation'}
            </Button>
          ) : (
            <Button
              onClick={() => void fundReward()}
              disabled={busy || !room.vaultAddress}
              className="h-11 rounded-full bg-[#203752] px-5 font-extrabold"
            >
              {busy ? 'Preparing…' : `Fund ${room.rewardAmount} NIM`}
            </Button>
          )}
        </div>
      )}
      {detail && (
        <output className="mt-3 block text-sm font-bold text-[#675e3e]">
          {detail}
        </output>
      )}
    </section>
  );
}

function LobbyState({
  room,
  isHost,
  currentPlayer,
  busy,
  hostKey,
  nimiq,
  onRefresh,
  onStart,
}: {
  room: LiveRoomState;
  isHost: boolean;
  currentPlayer?: LiveRoomState['players'][number];
  busy: boolean;
  hostKey?: string;
  nimiq: MimoNimiq;
  onRefresh: () => Promise<void>;
  onStart: () => void;
}) {
  const verifiedWallets = room.players.filter(
    (player) => player.walletVerified,
  ).length;
  const arrivalLabel =
    room.players.length === 0
      ? 'No one here yet'
      : room.players.length === 1
        ? '1 person joined'
        : `${room.players.length} people joined`;
  return (
    <div className="mt-6 sm:mt-8">
      <div className="live-lobby-stage mobile-only relative mb-5 min-h-[190px] overflow-hidden rounded-[28px] bg-[#dceeff] px-5 py-4">
        <span className="pulse-dot absolute left-5 top-5 h-3 w-3 rounded-full bg-[#f4bf1c]" />
        <span className="pulse-dot absolute right-7 top-9 h-2 w-2 rounded-full bg-[#e66c58] [animation-delay:260ms]" />
        <div className="relative z-10 max-w-[58%] self-center">
          <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#1f72d2]">
            Mimo is warming up
          </p>
          <p className="font-display mt-2 text-2xl font-extrabold leading-[1.02] tracking-[-.04em]">
            {room.players.length
              ? 'The room is coming alive.'
              : 'Share the invite. I’ll welcome everyone.'}
          </p>
          <span className="mt-3 inline-flex rounded-full bg-white/85 px-3 py-1.5 text-sm font-extrabold text-[#29445f]">
            {arrivalLabel}
          </span>
        </div>
        <MimoCharacter
          mood="happy"
          className="mimo-happy absolute -bottom-4 -right-4 w-[148px]"
        />
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-[#d1d5d5] pb-3">
        <p className="flex items-center gap-2 font-extrabold">
          <Users size={19} /> Arriving now
        </p>
        <div className="flex items-center gap-3 text-sm font-bold text-[#607486]">
          {room.rewardMode === 'nim' && (
            <span className="flex items-center gap-1 text-[#237044]">
              <ShieldCheck size={15} /> {verifiedWallets} verified
            </span>
          )}
          <span>{arrivalLabel}</span>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="border-l-4 border-[#1f72d2] bg-[#eaf4ff] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <strong className="font-display text-lg text-[#175fa9]">
              Team Signal
            </strong>
            <span className="text-sm font-extrabold text-[#175fa9]">
              {
                room.players.filter((player) => player.teamId === 'signal')
                  .length
              }
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-[#526a7e]">
            Correct answers and participation push the blue side.
          </p>
        </div>
        <div className="border-l-4 border-[#d56552] bg-[#fff0ec] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <strong className="font-display text-lg text-[#b64c39]">
              Team Spark
            </strong>
            <span className="text-sm font-extrabold text-[#b64c39]">
              {
                room.players.filter((player) => player.teamId === 'spark')
                  .length
              }
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-[#526a7e]">
            Correct answers and participation push the coral side.
          </p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm font-bold text-[#526a7e]">
        <Zap size={16} className="text-[#b17900]" /> Teams build separate
        scores. An optional Beat Mimo round gives the whole room one final
        target.
      </p>
      {room.rewardMode === 'nim' && (
        <RewardFundingPanel
          room={room}
          isHost={isHost}
          hostKey={hostKey}
          nimiq={nimiq}
          onRefresh={onRefresh}
        />
      )}
      <EventPromise room={room} />
      {!isHost && currentPlayer && (
        <div
          className={`mt-4 flex items-center gap-3 border px-4 py-3 ${
            currentPlayer.teamId === 'signal'
              ? 'border-[#8cb9e4] bg-[#eaf4ff] text-[#175fa9]'
              : 'border-[#e2a194] bg-[#fff0ec] text-[#a94837]'
          }`}
        >
          <MimoProfileAvatar
            profile={currentPlayer.profileStyle}
            nickname={currentPlayer.nickname}
          />
          <span>
            <strong className="block font-display text-lg">
              You’re Team{' '}
              {currentPlayer.teamId === 'signal' ? 'Signal' : 'Spark'}
            </strong>
            <span className="text-sm font-bold opacity-80">
              Your answers help move your whole team.
            </span>
          </span>
        </div>
      )}
      {room.players.length ? (
        <div className="flex min-h-36 flex-wrap content-start gap-3 py-5">
          {room.players.map((player, index) => (
            <motion.div
              initial={{ opacity: 0, scale: 0.7, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              key={player.id}
              className="flex h-12 items-center gap-2 rounded-full bg-white py-1 pl-1 pr-4"
            >
              <MimoProfileAvatar
                profile={player.profileStyle}
                nickname={player.nickname}
                className={`h-10 w-10 ${
                  player.teamId === 'signal'
                    ? 'ring-2 ring-[#1f72d2]/25'
                    : 'ring-2 ring-[#d56552]/25'
                }`}
              />
              <strong>{player.nickname}</strong>
              {player.walletVerified && (
                <ShieldCheck
                  size={15}
                  className="text-[#2d8a55]"
                  aria-label="Wallet ownership confirmed"
                />
              )}
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
          disabled={
            busy ||
            room.players.length === 0 ||
            (room.rewardCustody === 'mimo_vault' &&
              room.rewardState !== 'funded')
          }
          className="mobile-primary h-13 rounded-full bg-[#1f72d2] px-7 font-extrabold"
        >
          {room.rewardCustody === 'mimo_vault' && room.rewardState !== 'funded'
            ? 'Fund reward to start'
            : 'Start the show'}
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

function EventPromise({ room }: { room: LiveRoomState }) {
  const vaultFunded =
    room.rewardMode === 'nim' && room.rewardCustody === 'mimo_vault';
  return (
    <section className="mt-4 overflow-hidden rounded-[22px] border border-[#c9d5df] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#dbe2e7] px-4 py-3">
        <p className="flex items-center gap-2 font-display text-lg font-extrabold">
          <ShieldCheck size={19} className="text-[#237044]" /> The room promise
        </p>
        <span className="rounded-full bg-[#edf8f1] px-3 py-1 text-xs font-extrabold uppercase tracking-[.1em] text-[#237044]">
          Rules locked
        </span>
      </div>
      <div className="grid gap-px bg-[#dbe2e7] sm:grid-cols-3">
        <div className="bg-white px-4 py-3">
          <strong className="text-sm">Before play</strong>
          <p className="mt-1 text-sm leading-5 text-[#607486]">
            The host may cancel. Confirmed vault funding returns to its funding
            wallet.
          </p>
        </div>
        <div className="bg-white px-4 py-3">
          <strong className="text-sm">After start</strong>
          <p className="mt-1 text-sm leading-5 text-[#607486]">
            The host may pause, but cannot cancel, rewrite scoring or reduce the
            reward.
          </p>
        </div>
        <div className="bg-white px-4 py-3">
          <strong className="text-sm">After results</strong>
          <p className="mt-1 text-sm leading-5 text-[#607486]">
            {vaultFunded
              ? 'Locked eligibility triggers settlement. The host cannot replace the recipients.'
              : room.rewardMode === 'nim'
                ? 'This is a disclosed host promise, not vault-held NIM. The host still approves payment.'
                : 'Scores and participation remain recorded as the final result.'}
          </p>
        </div>
      </div>
    </section>
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
  autoHost,
  onAnswer,
  onReveal,
  onExtend,
}: {
  room: LiveRoomState;
  seconds: number;
  role: 'host' | 'player';
  selected: number | null;
  locked: boolean;
  busy: boolean;
  answered: number;
  autoHost: boolean;
  onAnswer: (choice: number) => void;
  onReveal: () => void;
  onExtend: () => void;
}) {
  return (
    <div className="mt-6 sm:mt-8">
      <div className="mobile-round-top flex items-start justify-between gap-4 border-b border-[#d1d5d5] pb-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.15em] text-[#c94f3b]">
            Round {room.roundIndex + 1} of {room.roundCount} ·{' '}
            {room.roundType === 'pulse'
              ? 'Live poll'
              : room.roundType === 'finale'
                ? 'Beat Mimo'
                : 'Scored question'}
            {room.roundType !== 'pulse' && (
              <>
                {' '}
                ·{' '}
                {room.scoringMode === 'speed'
                  ? 'Accuracy + speed'
                  : 'Accuracy only'}
              </>
            )}
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
          {room.choices.map((choice, index) => {
            const tone = CHOICE_TONES[index];
            return (
              <button
                key={choice}
                disabled={locked || busy || seconds === 0}
                onClick={() => onAnswer(index)}
                aria-pressed={selected === index}
                className={`mobile-answer relative min-h-28 border-2 p-5 text-left font-display text-xl font-extrabold transition ${selected === index ? tone.selected : `${tone.surface} hover:-translate-y-1`} ${locked && selected !== index ? 'opacity-45 saturate-50' : ''} disabled:cursor-default disabled:hover:translate-y-0`}
              >
                <span
                  className={`mr-3 inline-grid h-7 w-7 place-items-center rounded-full text-sm ${tone.badge}`}
                >
                  {String.fromCharCode(65 + index)}
                </span>
                {choice}
                {locked && selected === index && (
                  <span className="mt-4 flex w-fit items-center gap-1.5 rounded-full bg-[#203752] px-3 py-1.5 font-sans text-xs font-extrabold text-white">
                    <Check size={15} /> Locked in
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-7 overflow-hidden rounded-[26px] bg-[#203752] p-5 text-white sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#9fb5c8]">
                Host desk
              </p>
              <p className="font-display mt-1 text-4xl font-extrabold">
                {answered} / {room.players.length}
              </p>
              <p className="mt-1 text-sm text-[#c1d1de]">
                {autoHost
                  ? 'Mimo reveals when all are in or time ends'
                  : 'answers locked safely'}
              </p>
            </div>
            <div className="text-right">
              <strong className="font-display text-3xl">{seconds}s</strong>
              <p className="text-xs text-[#9fb5c8]">remaining</p>
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div
              animate={{
                width: `${room.players.length ? (answered / room.players.length) * 100 : 0}%`,
              }}
              className="h-full bg-[#54d78c]"
            />
          </div>
          <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
            <Button
              onClick={onExtend}
              disabled={busy}
              variant="outline"
              className="h-12 rounded-full border-white/20 bg-transparent px-4 text-white hover:bg-white/10"
            >
              <TimerReset /> +10s
            </Button>
            <Button
              onClick={onReveal}
              disabled={busy}
              className="h-12 rounded-full bg-[#f7c933] px-6 font-extrabold text-[#203752] hover:bg-[#ffda4e]"
            >
              <Zap />{' '}
              {room.roundType === 'pulse' ? 'Reveal poll now' : 'Reveal now'}
            </Button>
          </div>
        </div>
      )}
      {role === 'player' && (
        <AnimatePresence mode="wait">
          {locked ? (
            <motion.div
              key="locked"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              aria-live="polite"
              className="mt-5 flex items-center gap-3 border border-[#8fc9aa] bg-[#edf9f1] p-4 text-[#245f3c]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d5f0df]">
                <ShieldCheck size={20} />
              </span>
              <span>
                <strong className="block font-display text-lg">
                  Locked in
                </strong>
                <span className="text-sm font-bold">
                  {autoHost
                    ? 'Your choice is safe. Mimo will reveal it automatically.'
                    : 'Your choice is safe. The host will reveal it.'}
                </span>
              </span>
            </motion.div>
          ) : (
            <p
              key="choosing"
              aria-live="polite"
              className="mt-5 flex items-center gap-2 font-bold text-[#536b7e]"
            >
              {seconds === 0
                ? 'Time is up. Mimo is revealing the room.'
                : 'Choose once. Mimo saves it instantly.'}
            </p>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

function ResultsState({
  room,
  leaderboard,
  role,
  busy,
  autoHost,
  onNext,
  onFinish,
  onReset,
  hostKey,
  nimiq,
  currentPlayerId,
  participantToken,
  onOpenCommunity,
}: {
  room: LiveRoomState;
  leaderboard: LiveRoomState['players'];
  role: 'host' | 'player';
  busy: boolean;
  autoHost: boolean;
  onNext: () => void;
  onFinish: () => void;
  onReset: () => void;
  hostKey?: string;
  nimiq: MimoNimiq;
  currentPlayerId?: string;
  participantToken?: string;
  onOpenCommunity?: (slug: string) => void;
}) {
  const finaleCorrect =
    room.roundType === 'finale' && room.correctChoice !== null
      ? (room.choiceCounts[room.correctChoice] ?? 0)
      : 0;
  const finaleTarget = Math.ceil(
    room.players.length * (room.collectiveTargetPercent / 100),
  );
  const finaleProgress = room.players.length
    ? Math.min(100, (finaleCorrect / room.players.length) * 100)
    : 0;
  const signalTotal = room.players
    .filter((player) => player.teamId === 'signal')
    .reduce((sum, player) => sum + player.score, 0);
  const sparkTotal = room.players
    .filter((player) => player.teamId === 'spark')
    .reduce((sum, player) => sum + player.score, 0);
  const teamTotal = signalTotal + sparkTotal;
  const signalShare = teamTotal ? (signalTotal / teamTotal) * 100 : 50;
  return (
    <div className="relative mt-6 overflow-hidden sm:mt-8">
      {room.status === 'verifying' && (
        <div
          className="pointer-events-none absolute right-2 top-0 flex gap-2 text-2xl"
          aria-hidden="true"
        >
          <span className="reveal-orbit">✦</span>
          <span className="reveal-orbit [animation-delay:120ms]">●</span>
          <span className="reveal-orbit [animation-delay:220ms]">✦</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-[#a97800]">
        <Trophy size={22} />
        <span className="text-sm font-extrabold uppercase tracking-[.14em]">
          Verified result
        </span>
      </div>
      <h2 className="mobile-flow-title font-display mt-3 text-[clamp(2.6rem,6vw,5rem)] font-extrabold leading-[.9] tracking-[-.06em]">
        {room.status === 'complete'
          ? 'The room has spoken.'
          : room.roundType === 'pulse'
            ? 'The room chose.'
            : room.roundType === 'finale'
              ? room.finalePassed
                ? 'The room beat Mimo!'
                : 'Mimo takes this one.'
              : 'Round revealed.'}
      </h2>
      {room.roomSignal && (
        <LivingRoomMoment
          signal={room.roomSignal}
          role={role}
          autoHost={autoHost}
          adaptiveMode={room.adaptiveMode}
        />
      )}
      {room.correctChoice !== null && (
        <p className="mt-4 text-lg text-[#526a7e]">
          Correct:{' '}
          <strong className="text-[#16283d]">
            {room.choices[room.correctChoice]}
          </strong>
        </p>
      )}
      {room.roundType === 'pulse' && room.status === 'verifying' && (
        <div
          className="mt-7 grid gap-3"
          aria-label="Live poll result bar chart"
        >
          {room.choices.map((choice, index) => {
            const count = room.choiceCounts[index] ?? 0;
            const total = Math.max(
              1,
              room.choiceCounts.reduce((sum, value) => sum + value, 0),
            );
            const percentage = Math.round((count / total) * 100);
            return (
              <motion.div
                key={choice}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.09 }}
                className={`relative overflow-hidden rounded-[18px] border p-4 ${CHOICE_TONES[index].surface}`}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{
                    duration: 0.7,
                    delay: 0.12 + index * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={`absolute inset-y-0 left-0 ${CHOICE_TONES[index].bar}`}
                />
                <div className="relative flex items-center justify-between gap-4 font-bold">
                  <span>{choice}</span>
                  <span className="font-display text-lg font-extrabold">
                    {percentage}%
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      {room.roundType === 'finale' && room.status === 'verifying' && (
        <div
          className={`mt-7 overflow-hidden rounded-[24px] border-2 p-5 ${room.finalePassed ? 'border-[#58a978] bg-[#eef9f2]' : 'border-[#e0b752] bg-[#fff8dc]'}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#607486]">
                Beat Mimo target
              </p>
              <p className="font-display mt-2 text-3xl font-extrabold">
                {finaleCorrect} of {room.players.length} got it
              </p>
            </div>
            <motion.div
              className="w-20 shrink-0"
              initial={{ scale: 0.82 }}
              animate={
                room.finalePassed
                  ? { scale: [0.82, 1.12, 1], rotate: [0, -12, 360] }
                  : { scale: [0.82, 1.04, 1], rotate: [0, -4, 0] }
              }
              transition={{ duration: room.finalePassed ? 1.05 : 0.6 }}
            >
              <MimoCharacter
                mood={room.finalePassed ? 'happy' : 'thinking'}
                className="w-full"
              />
            </motion.div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${finaleProgress}%` }}
              className={`h-full ${room.finalePassed ? 'bg-[#3b9a62]' : 'bg-[#e0ad14]'}`}
            />
          </div>
          <p className="mt-3 text-sm font-bold text-[#526a7e]">
            The room needed {finaleTarget} correct answer
            {finaleTarget === 1 ? '' : 's'} to beat Mimo’s{' '}
            {room.collectiveTargetPercent}% target.
          </p>
        </div>
      )}
      {room.roundType !== 'pulse' && teamTotal > 0 && (
        <div
          className="mt-7 border border-[#ccd5dc] bg-white p-5"
          aria-label="Team score bar chart"
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#607486]">
                Team score
              </p>
              <strong className="font-display mt-1 block text-2xl text-[#1f72d2]">
                Signal · {signalTotal.toLocaleString()}
              </strong>
            </div>
            <strong className="font-display text-right text-2xl text-[#c75d4a]">
              {sparkTotal.toLocaleString()} · Spark
            </strong>
          </div>
          <div className="mt-4 flex h-5 overflow-hidden rounded-full bg-[#edf0f2]">
            <motion.div
              initial={{ width: '50%' }}
              animate={{ width: `${signalShare}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="bg-[#1f72d2]"
            />
            <motion.div
              initial={{ width: '50%' }}
              animate={{ width: `${100 - signalShare}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="bg-[#e06b56]"
            />
          </div>
          <p className="mt-3 text-sm font-bold text-[#526a7e]">
            Individual answers build the team total. Beat Mimo gives the whole
            room one final target.
          </p>
        </div>
      )}
      <div className="mt-7 border-y border-[#cdd3d5]">
        {leaderboard.map((player, index) => (
          <motion.div
            key={player.id}
            layout
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: Math.min(index * 0.07, 0.35),
              type: 'spring',
              stiffness: 240,
              damping: 23,
            }}
            className="flex items-center gap-4 border-b border-[#d9dddd] px-2 py-4 last:border-0"
          >
            <span className="font-display text-2xl font-extrabold text-[#7a8995]">
              {index + 1}
            </span>
            <MimoProfileAvatar
              profile={player.profileStyle}
              nickname={player.nickname}
              className="h-9 w-9"
            />
            <strong className="flex-1">{player.nickname}</strong>
            {room.rewardMode === 'nim' && (
              <span
                className={`text-xs font-extrabold ${player.walletVerified ? 'text-[#237044]' : 'text-[#9a6a00]'}`}
              >
                {player.walletVerified ? 'Wallet confirmed' : 'Wallet needed'}
              </span>
            )}
            <span className="font-display text-xl font-extrabold">
              {player.score.toLocaleString()}
            </span>
          </motion.div>
        ))}
      </div>
      {room.rewardMode === 'nim' &&
        room.status === 'complete' &&
        leaderboard[0] && (
          <RewardSettlement
            room={room}
            winner={leaderboard[0]}
            role={role}
            hostKey={hostKey}
            nimiq={nimiq}
            currentPlayerId={currentPlayerId}
            participantToken={participantToken}
          />
        )}
      {role === 'host' &&
        (room.status === 'verifying' && room.hasNextRound ? (
          <Button
            onClick={onNext}
            disabled={busy}
            className="mobile-primary mt-6 rounded-full bg-[#1f72d2] px-6 font-extrabold"
          >
            {autoHost ? 'Next now' : 'Next round'}
          </Button>
        ) : room.status === 'verifying' ? (
          <Button
            onClick={onFinish}
            disabled={busy}
            className="mobile-primary mt-6 rounded-full bg-[#1f72d2] px-6 font-extrabold"
          >
            {autoHost ? 'Finish now' : 'Finish event'}
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
            : room.hasNextRound
              ? autoHost
                ? 'Mimo is moving to the next round automatically.'
                : 'The host will start the next round.'
              : autoHost
                ? 'Mimo is checking the final result.'
                : 'The host will close the final result.'}
        </p>
      )}
      {room.status === 'complete' && onOpenCommunity && (
        <Button
          onClick={() => onOpenCommunity(room.communitySlug)}
          variant="outline"
          className="mt-4 h-12 rounded-full border-[#afbdc7] bg-white px-6 font-extrabold"
        >
          Back to {room.community} <ArrowRight size={17} />
        </Button>
      )}
    </div>
  );
}

function LivingRoomMoment({
  signal,
  role,
  autoHost,
  adaptiveMode,
}: {
  signal: NonNullable<LiveRoomState['roomSignal']>;
  role: 'host' | 'player';
  autoHost: boolean;
  adaptiveMode: LiveRoomState['adaptiveMode'];
}) {
  const content =
    signal.kind === 'split_room'
      ? {
          label: 'Mimo spotted a split',
          title: 'The room has two strong sides.',
          detail: 'Back your take with a reaction before the next moment.',
          action: 'Open a reaction break',
          tone: 'border-[#7aaee0] bg-[#eaf4ff] text-[#174f84]',
          icon: <Users size={21} />,
        }
      : signal.kind === 'comeback_window'
        ? {
            label: 'Comeback pressure',
            title: `Team ${signal.trailingTeam === 'signal' ? 'Signal' : 'Spark'} can still turn this.`,
            detail: 'The next scored answer can change the room.',
            action: 'Give them a rally moment',
            tone: 'border-[#e0b752] bg-[#fff7d8] text-[#735800]',
            icon: <Zap size={21} />,
          }
        : {
            label: 'Shared target cleared',
            title: 'The room did it together.',
            detail:
              'Mimo verified the collective result from every locked answer.',
            action: 'Hold the celebration',
            tone: 'border-[#65ad80] bg-[#edf9f1] text-[#246c41]',
            icon: <Trophy size={21} />,
          };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={`mt-5 border-2 p-4 ${content.tone}`}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{content.icon}</span>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.14em]">
            {content.label}
          </p>
          <p className="font-display mt-1 text-xl font-extrabold leading-6">
            {content.title}
          </p>
          <p className="mt-1 text-sm font-bold leading-5 opacity-80">
            {content.detail}
          </p>
          {adaptiveMode === 'auto' && (
            <p className="mt-3 flex items-center gap-2 text-xs font-extrabold">
              <Sparkles size={15} /> Autopilot opened this moment and will
              continue on time.
            </p>
          )}
          {adaptiveMode === 'ask' && role === 'host' && !autoHost && (
            <p className="mt-3 flex items-center gap-2 text-xs font-extrabold">
              <PauseCircle size={15} /> Mimo held the room. Continue when
              you&rsquo;re ready.
            </p>
          )}
          {adaptiveMode === 'ask' && role === 'player' && !autoHost && (
            <p className="mt-3 flex items-center gap-2 text-xs font-extrabold">
              <PauseCircle size={15} /> The host is choosing the next moment.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function RewardSettlement({
  room,
  winner,
  role,
  hostKey,
  nimiq,
  currentPlayerId,
  participantToken,
}: {
  room: LiveRoomState;
  winner: LiveRoomState['players'][number];
  role: 'host' | 'player';
  hostKey?: string;
  nimiq: MimoNimiq;
  currentPlayerId?: string;
  participantToken?: string;
}) {
  const [address, setAddress] = useState('');
  const [state, setState] = useState<
    | 'idle'
    | 'connecting'
    | 'checking'
    | 'approving'
    | 'submitted'
    | 'cancelled'
    | 'failed'
    | 'copied'
  >(room.rewardState === 'payout_submitted' ? 'submitted' : 'idle');
  const [detail, setDetail] = useState(
    room.rewardState === 'payout_submitted' && room.payoutTxHash
      ? `Submitted to Nimiq · proof ${room.payoutTxHash.slice(0, 10)}… Network confirmation pending.`
      : '',
  );
  const eligiblePlayers = room.players.filter(
    (player) => player.rewardEligible,
  );
  const currentPlayer = room.players.find(
    (player) => player.id === currentPlayerId,
  );
  const isEligible =
    role === 'player' && Boolean(currentPlayer?.rewardEligible);
  const isWinner =
    role === 'player' && currentPlayerId === winner.id && winner.walletVerified;

  useEffect(() => {
    if (
      room.rewardCustody !== 'mimo_vault' ||
      !['payout_submitted', 'results_under_verification'].includes(
        room.rewardState,
      )
    ) {
      return;
    }
    const check = async () => {
      try {
        const response = await fetch(
          `/api/rooms/${room.code}/reward/settlement`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          },
        );
        if (!response.ok) return;
        const result = (await response.json()) as {
          state?: string;
          txHash?: string;
          eligible?: number;
          confirmed?: number;
          submitted?: number;
          awaiting?: number;
        };
        if (result.state === 'confirmed') {
          setState('submitted');
          setDetail(
            room.rewardRule === 'community_unlock'
              ? `All ${result.confirmed ?? result.eligible ?? 0} Community Unlock payouts are confirmed on Nimiq.`
              : `Paid on Nimiq · proof ${result.txHash?.slice(0, 10) ?? ''}…`,
          );
        } else if (result.state === 'submitted') {
          setState('submitted');
          setDetail(
            room.rewardRule === 'community_unlock'
              ? `${result.submitted ?? 0} payout${result.submitted === 1 ? '' : 's'} sent. ${result.awaiting ?? 0} still need a payout wallet.`
              : `Payout sent · proof ${result.txHash?.slice(0, 10) ?? ''}… Waiting for the network.`,
          );
        } else if (result.state === 'partially_paid') {
          setState('checking');
          setDetail(
            `${result.confirmed ?? 0} of ${result.eligible ?? 0} payouts confirmed. Mimo is safely continuing the remaining payments.`,
          );
        } else if (result.state === 'retrying') {
          setState('checking');
          setDetail('The network is busy. Mimo is retrying the same payout.');
        }
      } catch {
        // The room poll keeps the visible state honest and retries later.
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    return () => window.clearInterval(timer);
  }, [room.code, room.rewardCustody, room.rewardRule, room.rewardState]);

  const registerPayoutWallet = async () => {
    if (!participantToken || !isEligible) return;
    setState('connecting');
    setDetail('Opening the same wallet you confirmed for this room…');
    try {
      const connection = await nimiq.connect();
      if (connection.status !== 'ready') {
        setState(connection.status === 'cancelled' ? 'cancelled' : 'failed');
        setDetail(
          connection.status === 'cancelled'
            ? 'Registration cancelled. No money moved.'
            : 'Open this room inside Nimiq Pay to register your payout wallet.',
        );
        return;
      }
      const challengeResponse = await fetch(
        `/api/rooms/${room.code}/payout/challenge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantToken }),
        },
      );
      if (!challengeResponse.ok) {
        throw new Error(await getError(challengeResponse));
      }
      const challenge = (await challengeResponse.json()) as {
        challengeId: string;
        message: string;
      };
      setState('approving');
      setDetail(
        'Approve the signature. It registers an address and moves no NIM.',
      );
      const signed = await nimiq.signChallenge(challenge.message);
      if ('status' in signed) {
        setState(signed.status === 'cancelled' ? 'cancelled' : 'failed');
        setDetail(
          signed.status === 'cancelled'
            ? 'Registration cancelled. No money moved.'
            : 'The payout wallet was not registered.',
        );
        return;
      }
      const enrollResponse = await fetch(
        `/api/rooms/${room.code}/payout/enroll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantToken,
            challengeId: challenge.challengeId,
            account: connection.account,
            publicKey: signed.publicKey,
            signature: signed.signature,
          }),
        },
      );
      if (!enrollResponse.ok) throw new Error(await getError(enrollResponse));
      const enrolled = (await enrollResponse.json()) as {
        settlement?: { state?: string; txHash?: string };
      };
      setState(
        enrolled.settlement?.state === 'submitted' ? 'submitted' : 'checking',
      );
      setDetail(
        enrolled.settlement?.state === 'submitted'
          ? `Payout sent · proof ${enrolled.settlement.txHash?.slice(0, 10) ?? ''}…`
          : 'Payout wallet secured. Mimo is preparing the testnet payment.',
      );
    } catch (cause) {
      setState('failed');
      setDetail(
        cause instanceof Error
          ? cause.message
          : 'The payout wallet could not be registered.',
      );
    }
  };

  if (room.rewardCustody === 'mimo_vault') {
    return (
      <section className="mt-7 overflow-hidden rounded-[26px] border border-[#e1c25d] bg-[#fff8d9] p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#d9f2e2] text-[#237044]">
            <ShieldCheck size={20} />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.13em] text-[#896600]">
              Funded NIM reward · held by Mimo
            </p>
            <h3 className="font-display mt-1 text-2xl font-extrabold">
              {room.rewardRule === 'community_unlock'
                ? `${room.rewardAmount} NIM shared by ${eligiblePlayers.length} verified ${eligiblePlayers.length === 1 ? 'finisher' : 'finishers'}`
                : `${room.rewardAmount} NIM for ${winner.nickname}`}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#675e3e]">
              {room.rewardRule === 'community_unlock'
                ? 'The room cleared its locked finale target. Mimo splits the pool equally and pays the wallets verified before play.'
                : 'The result rules were locked before play. Mimo pays the verified winner automatically to the wallet confirmed when they joined.'}
            </p>
          </div>
        </div>
        {room.fundingTxHash && (
          <a
            href={`https://test.nimiq.watch/#${room.fundingTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center gap-1.5 border-t border-[#dfcb83] pt-4 font-mono text-xs font-bold text-[#675e3e] underline decoration-[#c7a838] underline-offset-4"
          >
            Funding proof {room.fundingTxHash.slice(0, 14)}… <Link2 size={13} />
          </a>
        )}
        {isEligible && !currentPlayer?.payoutAddressRegistered ? (
          <Button
            onClick={() => void registerPayoutWallet()}
            disabled={['connecting', 'approving', 'checking'].includes(state)}
            className="mobile-primary mt-5 h-12 rounded-full bg-[#203752] px-6 font-extrabold"
          >
            {state === 'connecting'
              ? 'Opening Nimiq Pay…'
              : state === 'approving'
                ? 'Waiting for signature…'
                : 'Finish wallet setup'}
          </Button>
        ) : (
          <div className="mt-5 flex items-center gap-2 border-t border-[#dfcb83] pt-4 text-sm font-extrabold text-[#675e3e]">
            {room.rewardRule === 'community_unlock' ? (
              <>
                <Clock3 size={17} />{' '}
                {
                  eligiblePlayers.filter(
                    (player) => player.payoutAddressRegistered,
                  ).length
                }{' '}
                of {eligiblePlayers.length} verified payout wallets ready
              </>
            ) : winner.payoutAddressRegistered ? (
              <>
                <ShieldCheck size={17} /> Payout wallet registered privately
              </>
            ) : (
              <>
                <Clock3 size={17} /> Waiting for {winner.nickname} to register a
                payout wallet
              </>
            )}
          </div>
        )}
        {detail && (
          <output
            className={`mt-3 block text-sm font-bold ${state === 'failed' ? 'text-[#a13f31]' : 'text-[#675e3e]'}`}
          >
            {detail}
          </output>
        )}
        {room.payoutTxHash && (
          <a
            href={`https://test.nimiq.watch/#${room.payoutTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs font-bold text-[#675e3e] underline decoration-[#c7a838] underline-offset-4"
          >
            View payout proof <Link2 size={13} />
          </a>
        )}
      </section>
    );
  }

  const copyWinnerAddress = async () => {
    setState('connecting');
    const connection = await nimiq.connect();
    if (connection.status !== 'ready') {
      setState(connection.status === 'cancelled' ? 'cancelled' : 'failed');
      setDetail(
        connection.status === 'cancelled'
          ? 'You closed Nimiq Pay. Nothing changed.'
          : 'Open Mimo inside Nimiq Pay to get your address.',
      );
      return;
    }
    await navigator.clipboard.writeText(connection.account);
    setState('copied');
    setDetail(
      'Address copied. Send it privately to the host for the final wallet check.',
    );
  };

  const payWinner = async () => {
    if (!hostKey || !address.trim()) return;
    setState('checking');
    setDetail('Matching this address to the verified winner…');
    try {
      const preparedResponse = await fetch(
        `/api/rooms/${room.code}/reward/prepare`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hostKey,
            participantId: winner.id,
            payoutAddress: address,
          }),
        },
      );
      if (!preparedResponse.ok)
        throw new Error(await getError(preparedResponse));
      const prepared = (await preparedResponse.json()) as {
        amountLuna: string;
        memo: string;
      };
      const connection = await nimiq.connect();
      if (connection.status !== 'ready') {
        setState(connection.status === 'cancelled' ? 'cancelled' : 'failed');
        setDetail(
          connection.status === 'cancelled'
            ? 'You cancelled. No NIM moved.'
            : 'Open the host room inside Nimiq Pay to approve this payout.',
        );
        return;
      }
      setState('approving');
      setDetail(
        `Nimiq Pay will show ${room.rewardAmount} NIM to ${address.slice(0, 6)}…${address.slice(-4)}.`,
      );
      const payment = await nimiq.sendNim(
        address,
        Number(prepared.amountLuna),
        prepared.memo,
      );
      if (payment.status !== 'funding_submitted') {
        setState(payment.status === 'cancelled' ? 'cancelled' : 'failed');
        setDetail(
          payment.status === 'cancelled'
            ? 'Payment cancelled. No NIM moved.'
            : payment.status === 'failed'
              ? payment.reason
              : 'The payment was not submitted.',
        );
        return;
      }
      const submittedResponse = await fetch(
        `/api/rooms/${room.code}/reward/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hostKey,
            participantId: winner.id,
            transactionHash: payment.transactionHash,
          }),
        },
      );
      if (!submittedResponse.ok)
        throw new Error(await getError(submittedResponse));
      const submitted = (await submittedResponse.json()) as { txHash: string };
      setState('submitted');
      setDetail(
        `Submitted to Nimiq · proof ${submitted.txHash.slice(0, 10)}… Network confirmation pending.`,
      );
    } catch (cause) {
      setState('failed');
      setDetail(
        cause instanceof Error
          ? cause.message
          : 'The payout could not be prepared.',
      );
    }
  };

  return (
    <section className="mt-7 overflow-hidden rounded-[26px] border border-[#e1c25d] bg-[#fff8d9] p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f7c933] text-[#624a00]">
          <WalletCards size={20} />
        </span>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.13em] text-[#896600]">
            NIM reward · creator-held
          </p>
          <h3 className="font-display mt-1 text-2xl font-extrabold">
            {room.rewardAmount} NIM for {winner.nickname}
          </h3>
          <p className="mt-2 text-sm leading-6 text-[#675e3e]">
            Mimo never holds the money. The host checks the verified winner,
            then Nimiq Pay asks for explicit approval.
          </p>
        </div>
      </div>
      {role === 'host' ? (
        <div className="mt-5 border-t border-[#dfcb83] pt-5">
          <label htmlFor="winner-address" className="text-sm font-extrabold">
            Winner’s verified Nimiq address
          </label>
          <input
            id="winner-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="NQ…"
            className="mt-2 h-13 w-full rounded-xl border border-[#cfb95f] bg-white px-4 font-mono text-sm outline-none focus:border-[#987000]"
          />
          <Button
            onClick={() => void payWinner()}
            disabled={
              !address.trim() ||
              ['checking', 'approving', 'submitted'].includes(state)
            }
            className="mobile-primary mt-3 h-12 rounded-full bg-[#203752] px-6 font-extrabold"
          >
            {state === 'checking'
              ? 'Checking winner…'
              : state === 'approving'
                ? 'Waiting for Nimiq Pay…'
                : state === 'submitted'
                  ? 'Payout submitted'
                  : 'Verify and pay in Nimiq Pay'}
          </Button>
        </div>
      ) : isWinner ? (
        <Button
          onClick={() => void copyWinnerAddress()}
          disabled={state === 'connecting'}
          className="mobile-primary mt-5 h-12 rounded-full bg-[#203752] px-6 font-extrabold"
        >
          {state === 'connecting'
            ? 'Opening Nimiq Pay…'
            : state === 'copied'
              ? 'Address copied'
              : 'Copy my payout address'}
        </Button>
      ) : (
        <p className="mt-5 border-t border-[#dfcb83] pt-4 text-sm font-bold text-[#675e3e]">
          Only the verified winner can receive this declared skill reward.
        </p>
      )}
      {detail && (
        <output
          className={`mt-3 text-sm font-bold ${state === 'failed' ? 'text-[#a13f31]' : 'text-[#675e3e]'}`}
        >
          {detail}
        </output>
      )}
    </section>
  );
}
