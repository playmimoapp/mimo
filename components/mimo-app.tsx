'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ChevronRight,
  CircleDot,
  FileText,
  Gamepad2,
  Gift,
  Globe2,
  LockKeyhole,
  PenLine,
  Plus,
  Radio,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiveRoom } from '@/components/live-room';
import {
  MimoCharacter,
  MimoCue,
  MimoProfileAvatar,
} from '@/components/mimo-host';
import { MIMO_PROFILES, type MimoProfileStyle } from '@/lib/mimo-profile';

type Screen =
  | 'home'
  | 'create_choice'
  | 'create_assisted'
  | 'create'
  | 'preview'
  | 'join'
  | 'live_host'
  | 'live_player';
type RewardMode = 'free' | 'nim';
type RoundType = 'pulse' | 'multiple_choice' | 'finale';

const CHOICE_TONES = [
  {
    base: 'border-[#78aee5] bg-[#edf6ff]',
    active: 'border-[#1f72d2] bg-[#dcecff] ring-2 ring-[#1f72d2]/20',
  },
  {
    base: 'border-[#e89989] bg-[#fff1ed]',
    active: 'border-[#c85743] bg-[#ffe1da] ring-2 ring-[#c85743]/20',
  },
  {
    base: 'border-[#d7b13f] bg-[#fff8dc]',
    active: 'border-[#a97c00] bg-[#ffedaa] ring-2 ring-[#a97c00]/20',
  },
  {
    base: 'border-[#72b88f] bg-[#eef9f2]',
    active: 'border-[#2d8a55] bg-[#d9f2e2] ring-2 ring-[#2d8a55]/20',
  },
] as const;

const HOME_LINES = [
  'You bring the people. I’ll run the room.',
  'I’ll balance the teams and keep the pace.',
  'Answers locked? I handle the reveal.',
  'Rivals now. One team in the finale.',
] as const;

type RoundDraft = {
  id: string;
  type: RoundType;
  question: string;
  choices: string[];
  correctChoice: number | null;
  durationSeconds: number;
  scoringMode: 'accuracy' | 'speed';
};

type AssistantBrief = {
  community: string;
  topic: string;
  audience: 'newcomers' | 'community' | 'experts';
  difficulty: 'easy' | 'balanced' | 'hard';
  source: string;
};

type EventDraft = {
  title: string;
  community: string;
  accessMode: 'public' | 'private';
  rewardMode: RewardMode;
  rewardAmount: string;
  rounds: RoundDraft[];
};

function blankRound(type: RoundType = 'multiple_choice'): RoundDraft {
  return {
    id: crypto.randomUUID(),
    type,
    question: '',
    choices: ['', ''],
    correctChoice: type === 'pulse' ? null : 0,
    durationSeconds: type === 'finale' ? 30 : 20,
    scoringMode: type === 'multiple_choice' ? 'speed' : 'accuracy',
  };
}

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: () => unknown;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

function Logo() {
  return (
    <Image
      src="/mimo-logo.svg"
      alt="Mimo"
      width={180}
      height={64}
      priority
      className="h-8 w-auto sm:h-10"
    />
  );
}

function Header({ back, host }: { back?: () => void; host?: () => void }) {
  return (
    <header className="mx-auto flex h-[60px] max-w-[1120px] items-center justify-between px-[18px] sm:h-[72px] sm:px-8">
      <div className="flex items-center gap-2">
        {back && (
          <button
            onClick={back}
            aria-label="Go back"
            className="-ml-2 grid h-11 w-11 place-items-center rounded-full hover:bg-white"
          >
            <ArrowLeft size={19} />
          </button>
        )}
        <Logo />
      </div>
      {host && (
        <button
          onClick={host}
          className="flex h-10 items-center gap-2 rounded-full border border-[#cbd4dc] bg-white px-4 text-sm font-extrabold text-[#29445f] transition hover:-translate-y-0.5 hover:border-[#8ba9c3]"
        >
          <Plus size={16} />
          <span className="sm:hidden">Host</span>
          <span className="hidden sm:inline">Host a Mimo</span>
        </button>
      )}
    </header>
  );
}

export function MimoApp() {
  const reduceMotion = useReducedMotion();
  const [screen, setScreen] = useState<Screen>('home');
  const [name, setName] = useState('');
  const [profileStyle, setProfileStyle] = useState<MimoProfileStyle>('hype');
  const [joinCode, setJoinCode] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [hostKey, setHostKey] = useState('');
  const [participantToken, setParticipantToken] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [working, setWorking] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [assistantBrief, setAssistantBrief] = useState<AssistantBrief>({
    community: '',
    topic: '',
    audience: 'community',
    difficulty: 'balanced',
    source: '',
  });
  const [event, setEvent] = useState<EventDraft>({
    title: '',
    community: '',
    accessMode: 'public',
    rewardMode: 'free',
    rewardAmount: '',
    rounds: [blankRound()],
  });

  useEffect(() => {
    const initial = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const code =
        query
          .get('room')
          ?.toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 8) ?? '';
      if (!code) return;
      setRoomCode(code);
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const linkedInvite = fragment.get('invite') ?? '';
      const savedInvite =
        window.sessionStorage.getItem(`mimo:${code}:invite`) ?? '';
      const resolvedInvite = linkedInvite || savedInvite;
      if (resolvedInvite) {
        setInviteToken(resolvedInvite);
        window.sessionStorage.setItem(`mimo:${code}:invite`, resolvedInvite);
      }
      if (linkedInvite) {
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${window.location.search}`,
        );
      }
      if (query.get('host') === '1') {
        const savedHostKey =
          window.sessionStorage.getItem(`mimo:${code}:host`) ?? '';
        if (savedHostKey) {
          setHostKey(savedHostKey);
          setScreen('live_host');
          return;
        }
      }
      const savedToken =
        window.sessionStorage.getItem(`mimo:${code}:token`) ?? '';
      const savedName =
        window.sessionStorage.getItem(`mimo:${code}:name`) ?? '';
      const savedProfile = window.sessionStorage.getItem(
        `mimo:${code}:profile`,
      ) as MimoProfileStyle | null;
      if (savedProfile && MIMO_PROFILES.some(({ id }) => id === savedProfile)) {
        setProfileStyle(savedProfile);
      }
      if (savedToken && savedName) {
        setParticipantToken(savedToken);
        setName(savedName);
        setScreen('live_player');
      } else {
        setScreen('join');
      }
    }, 0);
    return () => window.clearTimeout(initial);
  }, []);

  useEffect(() => {
    if (!document.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      document.modelContext.registerTool(
        {
          name: 'host_mimo',
          title: 'Host a live Mimo room',
          description: 'Open the real Mimo room creator.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: () => {
            setScreen('create_choice');
            return { status: 'creator_opened' };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const goHome = () => {
    window.history.replaceState({}, '', window.location.pathname);
    setScreen('home');
    setRoomCode('');
    setHostKey('');
    setParticipantToken('');
    setInviteToken('');
    setRoomError('');
  };

  const goBack = () => {
    setRoomError('');
    if (screen === 'create' || screen === 'preview') {
      setScreen('create_choice');
      return;
    }
    if (screen === 'create_assisted') {
      setScreen('create_choice');
      return;
    }
    goHome();
  };

  const makeDraftWithMimo = async () => {
    if (working) return;
    setWorking(true);
    setRoomError('');
    try {
      const response = await fetch('/api/assistant/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assistantBrief),
      });
      const body = (await response.json()) as {
        draft?: EventDraft;
        error?: string;
      };
      if (!response.ok || !body.draft) {
        throw new Error(body.error || 'Mimo could not make the draft.');
      }
      setEvent(body.draft);
      setScreen('create');
    } catch (cause) {
      setRoomError(
        cause instanceof Error
          ? cause.message
          : 'Mimo could not make the draft.',
      );
    } finally {
      setWorking(false);
    }
  };

  const launchLiveRoom = async () => {
    if (working) return;
    setWorking(true);
    setRoomError('');
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      const body = (await response.json()) as {
        code?: string;
        hostKey?: string;
        inviteToken?: string;
        error?: string;
      };
      if (!response.ok || !body.code || !body.hostKey)
        throw new Error(body.error || 'The room could not be opened.');
      setRoomCode(body.code);
      setHostKey(body.hostKey);
      setInviteToken(body.inviteToken ?? '');
      window.sessionStorage.setItem(`mimo:${body.code}:host`, body.hostKey);
      if (body.inviteToken) {
        window.sessionStorage.setItem(
          `mimo:${body.code}:invite`,
          body.inviteToken,
        );
      }
      window.history.replaceState({}, '', `/?room=${body.code}&host=1`);
      setScreen('live_host');
    } catch (cause) {
      setRoomError(
        cause instanceof Error
          ? cause.message
          : 'The room could not be opened.',
      );
    } finally {
      setWorking(false);
    }
  };

  const joinLiveRoom = async () => {
    if (!roomCode || !name.trim() || working) return;
    setWorking(true);
    setRoomError('');
    try {
      const response = await fetch(`/api/rooms/${roomCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: name, profileStyle, inviteToken }),
      });
      const body = (await response.json()) as {
        participantToken?: string;
        error?: string;
      };
      if (!response.ok || !body.participantToken)
        throw new Error(body.error || 'You could not join.');
      setParticipantToken(body.participantToken);
      window.sessionStorage.setItem(
        `mimo:${roomCode}:token`,
        body.participantToken,
      );
      window.sessionStorage.setItem(`mimo:${roomCode}:name`, name.trim());
      window.sessionStorage.setItem(`mimo:${roomCode}:profile`, profileStyle);
      setScreen('live_player');
    } catch (cause) {
      setRoomError(
        cause instanceof Error ? cause.message : 'You could not join.',
      );
    } finally {
      setWorking(false);
    }
  };

  const openRoomCode = () => {
    const code = joinCode
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8);
    if (code.length < 4) {
      setRoomError('Enter the room code from your invitation.');
      return;
    }
    setRoomError('');
    setRoomCode(code);
    setInviteToken(window.sessionStorage.getItem(`mimo:${code}:invite`) ?? '');
    window.history.replaceState({}, '', `/?room=${code}`);
    setScreen('join');
  };

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#f6f4ef] text-[#16283d]">
      <Header
        back={
          screen === 'create_choice' ||
          screen === 'create_assisted' ||
          screen === 'create' ||
          screen === 'preview' ||
          screen === 'join'
            ? goBack
            : undefined
        }
        host={screen === 'home' ? () => setScreen('create_choice') : undefined}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={screen}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : -7 }}
          transition={{
            duration: reduceMotion ? 0 : 0.22,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {screen === 'home' && (
            <ProductHome
              code={joinCode}
              setCode={setJoinCode}
              join={openRoomCode}
              host={() => setScreen('create_choice')}
              error={roomError}
            />
          )}
          {screen === 'create_choice' && (
            <CreateChoice
              assisted={() => setScreen('create_assisted')}
              manual={() => setScreen('create')}
            />
          )}
          {screen === 'create_assisted' && (
            <AssistedCreate
              brief={assistantBrief}
              setBrief={setAssistantBrief}
              makeDraft={() => void makeDraftWithMimo()}
              manual={() => setScreen('create')}
              working={working}
              error={roomError}
            />
          )}
          {screen === 'create' && (
            <CreateEvent
              event={event}
              setEvent={setEvent}
              launch={() => void launchLiveRoom()}
              preview={() => setScreen('preview')}
              working={working}
              error={roomError}
            />
          )}
          {screen === 'preview' && (
            <CreatorRehearsal
              event={event}
              back={() => setScreen('create')}
              launch={() => void launchLiveRoom()}
              working={working}
            />
          )}
          {screen === 'join' && (
            <Join
              name={name}
              setName={setName}
              profileStyle={profileStyle}
              setProfileStyle={setProfileStyle}
              next={() => void joinLiveRoom()}
              roomCode={roomCode}
              working={working}
              error={roomError}
              privateInvite={Boolean(inviteToken)}
            />
          )}
          {screen === 'live_host' && roomCode && (
            <LiveRoom
              code={roomCode}
              mode="host"
              hostKey={hostKey}
              inviteToken={inviteToken}
              onExit={goHome}
            />
          )}
          {screen === 'live_player' && roomCode && (
            <LiveRoom
              code={roomCode}
              mode="player"
              participantToken={participantToken}
              inviteToken={inviteToken}
              nickname={name}
              onExit={goHome}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

function ProductHome({
  code,
  setCode,
  join,
  host,
  error,
}: {
  code: string;
  setCode: (code: string) => void;
  join: () => void;
  host: () => void;
  error: string;
}) {
  const reduceMotion = useReducedMotion();
  const [homeLineIndex, setHomeLineIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setHomeLineIndex((value) => (value + 1) % HOME_LINES.length),
      4800,
    );
    return () => window.clearInterval(timer);
  }, []);
  return (
    <section className="mobile-page mx-auto grid min-h-[calc(100dvh-60px)] max-w-[1080px] gap-6 px-5 pb-10 pt-2 sm:min-h-[calc(100dvh-72px)] sm:px-8 lg:grid-cols-[.92fr_1.08fr] lg:items-center">
      <div className="order-2 pb-3 lg:order-1">
        <p className="text-sm font-extrabold uppercase tracking-[.14em] text-[#c94f3b]">
          Inside Nimiq Pay
        </p>
        <h1 className="mobile-flow-title font-display mt-3 max-w-2xl text-[clamp(3rem,8vw,6.5rem)] font-extrabold leading-[.88] tracking-[-.072em]">
          Live games for your community.
        </h1>
        <p className="mt-4 max-w-xl text-base font-medium leading-7 text-[#53697c] sm:text-lg">
          Open a room, bring everyone in and play together. Add NIM rewards when
          the moment calls for it.
        </p>
        <div className="mt-6 grid gap-3 sm:flex sm:items-center">
          <Button
            onClick={host}
            className="mobile-primary h-14 rounded-full bg-[#1f72d2] px-7 text-base font-extrabold"
          >
            Host a game <ArrowRight />
          </Button>
          <div className="flex h-14 overflow-hidden rounded-[18px] border border-[#bdc9d1] bg-white sm:rounded-full">
            <input
              aria-label="Room code"
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 8),
                )
              }
              onKeyDown={(event) => event.key === 'Enter' && join()}
              placeholder="ROOM CODE"
              className="min-w-0 flex-1 bg-transparent px-4 text-center font-display text-base font-extrabold tracking-[.12em] outline-none placeholder:text-[#8a98a4] sm:w-40"
            />
            <button
              onClick={join}
              className="grid w-14 place-items-center bg-[#203752] text-white"
              aria-label="Join room"
            >
              <ChevronRight />
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm font-bold text-[#a33f30]">
            {error}
          </p>
        )}
        <p className="mt-5 flex items-center gap-2 text-sm font-bold leading-5 text-[#627687]">
          <ShieldCheck className="shrink-0" size={17} /> Free rooms need no
          wallet. Funded rewards require clear wallet confirmation.
        </p>
      </div>
      <div className="mimo-stage relative order-1 mx-auto h-[250px] w-full max-w-[520px] overflow-hidden rounded-[28px] bg-[#e8f3ff] sm:h-[440px] sm:rounded-[36px] lg:order-2 lg:h-[520px]">
        <div className="absolute left-4 top-4 z-20 rounded-full bg-white px-3 py-2 text-xs font-extrabold text-[#31506b] shadow-[0_6px_20px_rgba(39,77,111,.1)] sm:left-6 sm:top-6">
          MIMO IS READY
        </div>
        <motion.div
          className="absolute -bottom-7 left-1/2 z-10 w-[230px] -translate-x-1/2 sm:-bottom-10 sm:w-[370px]"
          animate={
            reduceMotion
              ? undefined
              : homeLineIndex % HOME_LINES.length === 3
                ? {
                    x: [0, -12, 12, 0],
                    y: [0, -18, -4, 0],
                    rotate: [0, -8, 360],
                  }
                : {
                    x: [0, homeLineIndex % 2 ? 13 : -13, 0],
                    y: [0, -7, 0],
                    rotate: [0, homeLineIndex % 2 ? 3 : -3, 0],
                  }
          }
          transition={{
            duration: homeLineIndex % HOME_LINES.length === 3 ? 1.05 : 0.8,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <MimoCharacter mood="happy" priority className="w-full" />
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.div
            key={homeLineIndex}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5 }}
            className="host-line absolute right-4 top-[74px] z-30 max-w-[165px] bg-[#203752] px-3 py-2 text-xs font-bold leading-4 text-white sm:right-6 sm:top-24 sm:max-w-[220px] sm:px-4 sm:py-3 sm:text-sm sm:leading-5"
          >
            {HOME_LINES[homeLineIndex]}
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(180deg,transparent,#cfe6fb)]" />
      </div>
    </section>
  );
}

function CreateChoice({
  assisted,
  manual,
}: {
  assisted: () => void;
  manual: () => void;
}) {
  return (
    <section className="mobile-page create-choice-page mx-auto max-w-[1040px] px-5 pb-16 pt-3 sm:px-8 sm:pt-8">
      <div className="create-choice-hero grid items-end gap-6 border-b border-[#ccd3d7] pb-7 md:grid-cols-[1fr_260px]">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[.14em] text-[#cf624e]">
            Start a new Mimo
          </p>
          <h1 className="mobile-flow-title font-display mt-3 max-w-[720px] text-[clamp(3rem,7vw,5.6rem)] font-extrabold leading-[.9] tracking-[-.065em]">
            What are we making tonight?
          </h1>
        </div>
        <MimoCue
          className="md:justify-self-end"
          mood="thinking"
          message="Give me the spark and I’ll build the first draft. You approve every word."
        />
      </div>

      <div className="create-choice-grid mt-7 grid gap-4 md:grid-cols-[1.08fr_.92fr]">
        <motion.button
          whileTap={{ scale: 0.99 }}
          onClick={assisted}
          className="create-choice-card create-choice-card-ai group relative min-h-[270px] overflow-hidden rounded-[28px] bg-[#1f72d2] p-6 text-left text-white transition hover:-translate-y-1 sm:p-8"
        >
          <div className="absolute right-[-34px] top-[-42px] h-40 w-40 rounded-full border-[24px] border-white/10" />
          <span className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-extrabold text-[#175da8]">
            <Sparkles size={17} /> Mimo-assisted
          </span>
          <div className="mt-12 flex items-end justify-between gap-5">
            <div>
              <h2 className="font-display text-[clamp(2rem,5vw,3.35rem)] font-extrabold leading-none tracking-[-.045em]">
                Let Mimo draft it
              </h2>
              <p className="mt-3 max-w-md text-base font-semibold leading-6 text-[#dceeff]">
                Tell Mimo the topic. Get a complete editable show in seconds.
              </p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[#1f72d2] transition group-hover:translate-x-1">
              <ArrowRight />
            </span>
          </div>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.99 }}
          onClick={manual}
          className="create-choice-card group min-h-[270px] rounded-[28px] border-2 border-[#c9d1d6] bg-white p-6 text-left transition hover:-translate-y-1 hover:border-[#86a5be] sm:p-8"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#edf2f5] text-[#203752]">
            <PenLine size={19} />
          </span>
          <div className="mt-12 flex items-end justify-between gap-5">
            <div>
              <h2 className="font-display text-[clamp(2rem,5vw,3.35rem)] font-extrabold leading-none tracking-[-.045em]">
                Start from blank
              </h2>
              <p className="mt-3 max-w-md text-base font-medium leading-6 text-[#5e7283]">
                You already know the room. Shape every moment yourself.
              </p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#203752] text-white transition group-hover:translate-x-1">
              <ArrowRight />
            </span>
          </div>
        </motion.button>
      </div>
      <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#607486]">
        <ShieldCheck size={17} /> Nothing goes live until you review it.
      </p>
    </section>
  );
}

function AssistedCreate({
  brief,
  setBrief,
  makeDraft,
  manual,
  working,
  error,
}: {
  brief: AssistantBrief;
  setBrief: (brief: AssistantBrief) => void;
  makeDraft: () => void;
  manual: () => void;
  working: boolean;
  error: string;
}) {
  const update = <K extends keyof AssistantBrief>(
    key: K,
    value: AssistantBrief[K],
  ) => setBrief({ ...brief, [key]: value });
  const ready =
    brief.community.trim().length > 1 && brief.topic.trim().length > 5;

  return (
    <section className="mobile-page creator-form-page mx-auto grid max-w-[1000px] gap-8 px-5 pb-16 pt-3 sm:px-8 sm:pt-6 lg:grid-cols-[1fr_320px]">
      <div>
        <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[.14em] text-[#1f72d2]">
          <Bot size={17} /> Make it with Mimo
        </p>
        <h1 className="mobile-flow-title font-display mt-3 max-w-[680px] text-[clamp(2.8rem,7vw,5.2rem)] font-extrabold leading-[.92] tracking-[-.065em]">
          Give Mimo the spark.
        </h1>
        <p className="mt-4 max-w-xl text-base font-medium leading-7 text-[#5d7182]">
          A short brief is enough. Add source text when accuracy matters.
        </p>

        <MimoCue
          className="mobile-only mt-5"
          mood="thinking"
          message="Topic, crowd, vibe. That’s enough for me to start."
        />

        <div className="creator-form-shell mt-8 grid gap-7">
          <label className="grid gap-2 text-sm font-extrabold">
            Community
            <input
              value={brief.community}
              onChange={(event) => update('community', event.target.value)}
              maxLength={60}
              placeholder="e.g. Nimiq Lagos"
              className="h-14 border-0 border-b-2 border-[#b7c0c7] bg-transparent text-xl font-bold outline-none focus:border-[#1f72d2]"
            />
          </label>
          <label className="grid gap-2 text-sm font-extrabold">
            Topic or idea
            <textarea
              value={brief.topic}
              onChange={(event) => update('topic', event.target.value)}
              maxLength={500}
              placeholder="A fast game night about Nimiq basics for new community members"
              className="min-h-28 resize-none border-2 border-[#cbd3d8] bg-white p-4 text-lg font-bold leading-7 outline-none focus:border-[#1f72d2]"
            />
          </label>

          <div className="creator-segments grid gap-6 sm:grid-cols-2">
            <fieldset>
              <legend className="text-sm font-extrabold">Audience</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['newcomers', 'community', 'experts'] as const).map(
                  (item) => (
                    <button
                      type="button"
                      key={item}
                      onClick={() => update('audience', item)}
                      className={`min-h-11 rounded-full border px-4 text-sm font-extrabold capitalize ${brief.audience === item ? 'border-[#1f72d2] bg-[#eaf4ff] text-[#175da8]' : 'border-[#cbd3d8] bg-white text-[#53697b]'}`}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-extrabold">Difficulty</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['easy', 'balanced', 'hard'] as const).map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => update('difficulty', item)}
                    className={`min-h-11 rounded-full border px-4 text-sm font-extrabold capitalize ${brief.difficulty === item ? 'border-[#1f72d2] bg-[#eaf4ff] text-[#175da8]' : 'border-[#cbd3d8] bg-white text-[#53697b]'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <details className="creator-source rounded-[20px] border border-[#cbd3d8] bg-white p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-extrabold">
              <span className="flex items-center gap-2">
                <FileText size={17} /> Add source material
              </span>
              <span className="font-medium text-[#758592]">Optional</span>
            </summary>
            <textarea
              aria-label="Source material"
              value={brief.source}
              onChange={(event) => update('source', event.target.value)}
              maxLength={8000}
              placeholder="Paste notes, an announcement or facts Mimo should use"
              className="mt-4 min-h-32 w-full resize-y border-0 border-t border-[#d7dcdf] bg-white pt-4 font-medium leading-6 outline-none"
            />
          </details>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 bg-[#fff0ec] px-4 py-4 text-sm font-bold leading-6 text-[#9f3f2f]"
          >
            {error}
            <button
              onClick={manual}
              className="ml-2 underline underline-offset-4"
            >
              Build it myself instead
            </button>
          </div>
        )}

        <div className="mobile-action-bar mt-8">
          <Button
            onClick={makeDraft}
            disabled={!ready || working}
            className="mobile-primary h-14 rounded-full bg-[#1f72d2] px-7 font-extrabold"
          >
            {working ? 'Mimo is building…' : 'Build my first draft'}{' '}
            <Sparkles />
          </Button>
        </div>
      </div>

      <aside className="desktop-only self-start rounded-[28px] bg-[#dceeff] p-6 lg:sticky lg:top-6">
        <MimoCharacter mood="thinking" className="mx-auto w-[180px]" />
        <p className="font-display mt-2 text-2xl font-extrabold">
          Mimo drafts. You decide.
        </p>
        <p className="mt-3 text-sm font-medium leading-6 text-[#526a7c]">
          Every answer stays editable. Mimo cannot publish the room, judge
          subjective answers or approve a payment.
        </p>
      </aside>
    </section>
  );
}

function CreateEvent({
  event,
  setEvent,
  launch,
  preview,
  working,
  error,
}: {
  event: EventDraft;
  setEvent: (event: EventDraft) => void;
  launch: () => void;
  preview: () => void;
  working: boolean;
  error: string;
}) {
  const update = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) =>
    setEvent({ ...event, [key]: value });
  const updateRound = (roundIndex: number, patch: Partial<RoundDraft>) => {
    const rounds = event.rounds.map((round, index) =>
      index === roundIndex ? { ...round, ...patch } : round,
    );
    update('rounds', rounds);
  };
  const updateChoice = (
    roundIndex: number,
    choiceIndex: number,
    value: string,
  ) => {
    const choices = [...event.rounds[roundIndex].choices];
    choices[choiceIndex] = value;
    updateRound(roundIndex, { choices });
  };
  const addChoice = (roundIndex: number) => {
    const round = event.rounds[roundIndex];
    if (round.choices.length >= 4) return;
    updateRound(roundIndex, { choices: [...round.choices, ''] });
  };
  const removeChoice = (roundIndex: number, choiceIndex: number) => {
    const round = event.rounds[roundIndex];
    if (round.choices.length <= 2) return;
    const choices = round.choices.filter((_, index) => index !== choiceIndex);
    const correctChoice =
      round.type === 'pulse'
        ? null
        : round.correctChoice === choiceIndex
          ? 0
          : round.correctChoice !== null && round.correctChoice > choiceIndex
            ? round.correctChoice - 1
            : round.correctChoice;
    updateRound(roundIndex, { choices, correctChoice });
  };
  const addRound = (type: RoundType) => {
    if (event.rounds.length >= 8) return;
    update('rounds', [...event.rounds, blankRound(type)]);
  };
  const removeRound = (roundIndex: number) => {
    if (event.rounds.length === 1) return;
    update(
      'rounds',
      event.rounds.filter((_, index) => index !== roundIndex),
    );
  };
  const ready = Boolean(
    event.title.trim() &&
    event.community.trim() &&
    event.rounds.length > 0 &&
    event.rounds.every(
      (round) =>
        round.question.trim().length >= 8 &&
        round.choices.length >= 2 &&
        round.choices.length <= 4 &&
        round.choices.every((choice) => choice.trim()) &&
        (round.type === 'pulse' ||
          (round.correctChoice !== null &&
            round.correctChoice >= 0 &&
            round.correctChoice < round.choices.length)),
    ) &&
    (event.rewardMode === 'free' || Number(event.rewardAmount) > 0),
  );
  return (
    <section className="mobile-page creator-form-page mx-auto grid max-w-[1000px] gap-8 px-5 pb-16 pt-3 sm:pt-6 lg:grid-cols-[1fr_340px]">
      <div>
        <p className="text-sm font-extrabold uppercase tracking-[.14em] text-[#cf624e]">
          Create a live event
        </p>
        <h1 className="mobile-flow-title font-display mt-3 max-w-[680px] text-[clamp(2.8rem,7vw,5.2rem)] font-extrabold leading-[.92] tracking-[-.065em]">
          Shape the whole show.
        </h1>
        <MimoCue
          className="mobile-only mt-5"
          message={`${event.rounds.length} ${event.rounds.length === 1 ? 'moment' : 'moments'} in your show. I’ll keep the room moving.`}
        />
        <div className="creator-form-shell mt-8 grid gap-7">
          <label className="grid gap-2 text-sm font-extrabold">
            Community
            <input
              value={event.community}
              onChange={(e) => update('community', e.target.value)}
              maxLength={60}
              placeholder="e.g. Nimiq Lagos"
              className="h-14 border-0 border-b-2 border-[#b7c0c7] bg-transparent text-xl font-bold outline-none focus:border-[#1f72d2]"
            />
          </label>
          <label className="grid gap-2 text-sm font-extrabold">
            Event name
            <input
              value={event.title}
              onChange={(e) => update('title', e.target.value)}
              maxLength={80}
              placeholder="e.g. Friday Game Night"
              className="h-14 border-0 border-b-2 border-[#b7c0c7] bg-transparent text-xl font-bold outline-none focus:border-[#1f72d2]"
            />
          </label>
          <div className="border-y border-[#cfd5d8] py-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-extrabold">Show moments</p>
                <p className="mt-1 text-sm font-medium text-[#6a7b89]">
                  Each moment is one poll or question, played in this order.
                </p>
              </div>
              <span className="font-display text-2xl font-extrabold text-[#84919b]">
                {event.rounds.length}/8
              </span>
            </div>

            <div className="mt-5 grid gap-4">
              {event.rounds.map((round, roundIndex) => (
                <fieldset
                  key={round.id}
                  className="creator-round rounded-[24px] border-2 border-[#d1d7da] bg-white p-4 sm:p-5"
                >
                  <legend className="px-2 font-display text-sm font-extrabold uppercase tracking-[.12em] text-[#617486]">
                    Moment {roundIndex + 1}
                  </legend>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ['pulse', 'Pulse poll', CircleDot],
                          ['multiple_choice', 'Skill question', Gamepad2],
                          ['finale', 'Final challenge', Trophy],
                        ] as const
                      ).map(([type, label, Icon]) => (
                        <button
                          type="button"
                          key={type}
                          onClick={() =>
                            updateRound(roundIndex, {
                              type,
                              correctChoice:
                                type === 'pulse'
                                  ? null
                                  : (round.correctChoice ?? 0),
                              durationSeconds:
                                type === 'finale'
                                  ? Math.max(30, round.durationSeconds)
                                  : round.durationSeconds,
                              scoringMode:
                                type === 'multiple_choice'
                                  ? round.scoringMode
                                  : 'accuracy',
                            })
                          }
                          className={`flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-extrabold ${round.type === type ? 'bg-[#203752] text-white' : 'bg-[#edf1f3] text-[#526a7c]'}`}
                        >
                          <Icon size={15} /> {label}
                        </button>
                      ))}
                    </div>
                    {event.rounds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRound(roundIndex)}
                        aria-label={`Remove moment ${roundIndex + 1}`}
                        className="grid h-10 w-10 place-items-center rounded-full text-[#9f4a3c] hover:bg-[#fff0ec]"
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                  <div className="mt-4 grid gap-4 border-y border-[#e0e4e6] py-4 sm:grid-cols-2">
                    <fieldset>
                      <legend className="text-xs font-extrabold uppercase tracking-[.11em] text-[#617486]">
                        Answer time
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[10, 20, 30, 45, 60].map((duration) => (
                          <button
                            key={duration}
                            type="button"
                            aria-pressed={round.durationSeconds === duration}
                            onClick={() =>
                              updateRound(roundIndex, {
                                durationSeconds: duration,
                              })
                            }
                            className={`min-h-9 rounded-full px-3 text-sm font-extrabold ${
                              round.durationSeconds === duration
                                ? 'bg-[#203752] text-white'
                                : 'bg-[#edf1f3] text-[#526a7c]'
                            }`}
                          >
                            {duration}s
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    {round.type !== 'pulse' && (
                      <fieldset>
                        <legend className="text-xs font-extrabold uppercase tracking-[.11em] text-[#617486]">
                          Scoring
                        </legend>
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          {(
                            [
                              ['accuracy', 'Accuracy only'],
                              ['speed', 'Accuracy + speed'],
                            ] as const
                          ).map(([mode, label]) => (
                            <button
                              key={mode}
                              type="button"
                              aria-pressed={round.scoringMode === mode}
                              onClick={() =>
                                updateRound(roundIndex, { scoringMode: mode })
                              }
                              className={`min-h-9 rounded-full px-3 text-sm font-extrabold ${
                                round.scoringMode === mode
                                  ? 'bg-[#1f72d2] text-white'
                                  : 'bg-[#edf1f3] text-[#526a7c]'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </div>
                  <textarea
                    value={round.question}
                    onChange={(e) =>
                      updateRound(roundIndex, { question: e.target.value })
                    }
                    maxLength={180}
                    placeholder={
                      round.type === 'pulse'
                        ? 'Ask what the room thinks—there is no wrong side'
                        : round.type === 'finale'
                          ? 'Write the final challenge everyone will answer'
                          : 'Write one clear, objectively scored question'
                    }
                    className="mt-4 min-h-20 w-full resize-none border-b-2 border-[#c5cdd2] bg-transparent text-lg font-bold leading-7 outline-none placeholder:text-[#97a2ab] focus:border-[#1f72d2]"
                  />
                  <p className="mt-5 text-sm font-extrabold text-[#5a6e80]">
                    {round.type === 'pulse'
                      ? 'Poll choices · add between two and four'
                      : round.type === 'finale'
                        ? 'Everyone plays · 60% correct beats Mimo'
                        : 'Answer choices · select the correct one'}
                  </p>
                  <div className="mt-2 grid gap-2">
                    {round.choices.map((choice, choiceIndex) => (
                      <div
                        key={choiceIndex}
                        className={`flex min-h-14 items-center gap-3 border px-3 transition ${round.correctChoice === choiceIndex ? 'border-[#1f72d2] bg-[#eaf4ff]' : choiceIndex === 0 ? 'border-[#a9caeb] bg-[#f4f9ff]' : choiceIndex === 1 ? 'border-[#efb2a7] bg-[#fff7f4]' : choiceIndex === 2 ? 'border-[#e5cf79] bg-[#fffbee]' : 'border-[#a9d3ba] bg-[#f3fbf6]'}`}
                      >
                        {round.type !== 'pulse' ? (
                          <input
                            type="radio"
                            name={`correct-choice-${round.id}`}
                            checked={round.correctChoice === choiceIndex}
                            onChange={() =>
                              updateRound(roundIndex, {
                                correctChoice: choiceIndex,
                              })
                            }
                            className="h-5 w-5 accent-[#1f72d2]"
                          />
                        ) : (
                          <span className="h-5 w-5 rounded-full border-2 border-[#9daab4]" />
                        )}
                        <span className="text-sm font-extrabold text-[#6b7d8b]">
                          {String.fromCharCode(65 + choiceIndex)}
                        </span>
                        <input
                          value={choice}
                          onChange={(e) =>
                            updateChoice(
                              roundIndex,
                              choiceIndex,
                              e.target.value,
                            )
                          }
                          maxLength={80}
                          aria-label={`Moment ${roundIndex + 1}, choice ${String.fromCharCode(65 + choiceIndex)}`}
                          placeholder={
                            round.type === 'pulse'
                              ? `Side ${String.fromCharCode(65 + choiceIndex)}`
                              : `Answer ${String.fromCharCode(65 + choiceIndex)}`
                          }
                          className="min-w-0 flex-1 bg-transparent py-3 font-bold outline-none"
                        />
                        {round.choices.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              removeChoice(roundIndex, choiceIndex)
                            }
                            aria-label={`Remove choice ${String.fromCharCode(65 + choiceIndex)}`}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#8d5b53] hover:bg-white/70"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {round.choices.length < 4 && (
                    <button
                      type="button"
                      onClick={() => addChoice(roundIndex)}
                      className="mt-3 flex min-h-10 items-center gap-2 text-sm font-extrabold text-[#1f72d2]"
                    >
                      <Plus size={16} /> Add another choice
                    </button>
                  )}
                </fieldset>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                disabled={event.rounds.length >= 8}
                onClick={() => addRound('multiple_choice')}
                className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#aebbc4] bg-white px-4 text-sm font-extrabold disabled:opacity-40"
              >
                <Plus size={16} /> Skill question
              </button>
              <button
                type="button"
                disabled={event.rounds.length >= 8}
                onClick={() => addRound('pulse')}
                className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#aebbc4] bg-white px-4 text-sm font-extrabold disabled:opacity-40"
              >
                <Plus size={16} /> Pulse poll
              </button>
              <button
                type="button"
                disabled={event.rounds.length >= 8}
                onClick={() => addRound('finale')}
                className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#aebbc4] bg-white px-4 text-sm font-extrabold disabled:opacity-40"
              >
                <Plus size={16} /> Final challenge
              </button>
            </div>
            <p className="mt-3 text-sm font-bold text-[#617486]">
              One moment is enough. Mix formats only when your event needs them.
            </p>
          </div>
          <fieldset>
            <legend className="text-sm font-extrabold">Who can join?</legend>
            <div className="creator-option-grid mt-3 grid gap-3 sm:grid-cols-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.985 }}
                onClick={() => update('accessMode', 'public')}
                className={`min-h-28 border-2 p-5 text-left transition ${event.accessMode === 'public' ? 'border-[#1f72d2] bg-[#edf6ff]' : 'border-[#d5dade] bg-white'}`}
              >
                <Globe2 className="text-[#1f72d2]" />
                <strong className="mt-3 block text-lg">Public room</strong>
                <span className="mt-1 block text-sm text-[#617486]">
                  Anyone with the room code can join.
                </span>
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.985 }}
                onClick={() => update('accessMode', 'private')}
                className={`min-h-28 border-2 p-5 text-left transition ${event.accessMode === 'private' ? 'border-[#203752] bg-[#edf1f3]' : 'border-[#d5dade] bg-white'}`}
              >
                <LockKeyhole className="text-[#203752]" />
                <strong className="mt-3 block text-lg">Private invite</strong>
                <span className="mt-1 block text-sm text-[#617486]">
                  Only people with the secure link can enter.
                </span>
              </motion.button>
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-extrabold">Reward setup</legend>
            <div className="creator-option-grid mt-3 grid gap-3 sm:grid-cols-2">
              <motion.button
                whileTap={{ scale: 0.985 }}
                onClick={() => update('rewardMode', 'free')}
                className={`min-h-28 border-2 p-5 text-left transition ${event.rewardMode === 'free' ? 'border-[#1f72d2] bg-[#edf6ff]' : 'border-[#d5dade] bg-white'}`}
              >
                <Gamepad2 className="text-[#1f72d2]" />
                <strong className="mt-3 block text-lg">Free game</strong>
                <span className="mt-1 block text-sm text-[#617486]">
                  No wallet required.
                </span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.985 }}
                onClick={() => update('rewardMode', 'nim')}
                className={`min-h-28 border-2 p-5 text-left transition ${event.rewardMode === 'nim' ? 'border-[#d09a00] bg-[#fff7d9]' : 'border-[#d5dade] bg-white'}`}
              >
                <Gift className="text-[#a87600]" />
                <strong className="mt-3 block text-lg">NIM reward</strong>
                <span className="mt-1 block text-sm text-[#617486]">
                  Propose a skill reward.
                </span>
              </motion.button>
            </div>
          </fieldset>
          {event.rewardMode === 'nim' && (
            <label className="grid gap-2 text-sm font-extrabold">
              Total proposed reward
              <input
                inputMode="numeric"
                maxLength={8}
                value={event.rewardAmount}
                onChange={(e) =>
                  update('rewardAmount', e.target.value.replace(/[^0-9]/g, ''))
                }
                className="h-14 max-w-[260px] border-0 border-b-2 border-[#d0a62d] bg-transparent text-2xl font-extrabold outline-none"
              />
              <span className="text-sm font-medium text-[#6f7e8b]">
                NIM · shown as proposed until wallet funding is confirmed
              </span>
            </label>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="mt-6 bg-[#fff0ec] px-4 py-3 text-sm font-bold text-[#9f3f2f]"
          >
            {error}
          </p>
        )}
        <div className="mobile-action-bar creator-actions mt-8 flex gap-2">
          <Button
            onClick={preview}
            disabled={!ready}
            variant="outline"
            className="h-14 rounded-full border-[#9cadb9] bg-white px-6 font-extrabold"
          >
            Preview & rehearse
          </Button>
          <Button
            onClick={launch}
            disabled={working || !ready}
            className="mobile-primary h-14 rounded-full bg-[#1f72d2] px-7 font-extrabold"
          >
            {working ? 'Opening room…' : 'Open live room'} <Radio />
          </Button>
        </div>
      </div>
      <aside className="desktop-only self-start bg-[#203752] p-6 text-white lg:sticky lg:top-6">
        <MimoCharacter className="mx-auto w-[170px]" />
        <p className="font-display mt-2 text-2xl font-extrabold">
          Mimo takes it live.
        </p>
        <p className="mt-3 text-sm leading-6 text-[#c9d8e5]">
          Every moment, correct answer and reward rule is saved with the room.
          Mimo moves everyone through the same server-controlled show.
        </p>
      </aside>
    </section>
  );
}

function CreatorRehearsal({
  event,
  back,
  launch,
  working,
}: {
  event: EventDraft;
  back: () => void;
  launch: () => void;
  working: boolean;
}) {
  const [roundIndex, setRoundIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const round = event.rounds[roundIndex];
  const last = roundIndex === event.rounds.length - 1;
  const next = () => {
    if (!revealed) {
      setRevealed(true);
      return;
    }
    if (!last) {
      setRoundIndex((value) => value + 1);
      setSelected(null);
      setRevealed(false);
    }
  };
  return (
    <section className="mobile-page mx-auto grid max-w-[1060px] gap-8 px-5 pb-16 pt-3 lg:grid-cols-[1fr_390px]">
      <div>
        <p className="text-sm font-extrabold uppercase tracking-[.14em] text-[#c65340]">
          Private rehearsal · nothing is live
        </p>
        <h1 className="mobile-flow-title font-display mt-3 text-[clamp(2.7rem,7vw,5rem)] font-extrabold leading-[.92] tracking-[-.06em]">
          Feel the show before your guests do.
        </h1>
        <MimoCue
          className="mt-5"
          mood={revealed ? 'happy' : 'thinking'}
          message={
            revealed
              ? round.type === 'pulse'
                ? 'Nice. The room will see every side move together.'
                : selected === round.correctChoice
                  ? 'That reveal lands. Keep the pace.'
                  : 'Good catch—this is why we rehearse.'
              : `Moment ${roundIndex + 1}. Read it aloud, then tap an answer like a guest.`
          }
        />
        <div className="mt-7 flex flex-wrap gap-2">
          {event.rounds.map((item, index) => (
            <button
              key={item.id}
              onClick={() => {
                setRoundIndex(index);
                setSelected(null);
                setRevealed(false);
              }}
              className={`h-10 rounded-full px-4 text-sm font-extrabold ${index === roundIndex ? 'bg-[#203752] text-white' : 'border border-[#c9d1d6] bg-white text-[#607486]'}`}
            >
              {index + 1} ·{' '}
              {item.type === 'pulse'
                ? 'Poll'
                : item.type === 'finale'
                  ? 'Final challenge'
                  : 'Skill'}
            </button>
          ))}
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button
            onClick={back}
            variant="outline"
            className="h-12 rounded-full bg-white px-6 font-extrabold"
          >
            Edit show
          </Button>
          <Button
            onClick={launch}
            disabled={working}
            className="h-12 rounded-full bg-[#1f72d2] px-6 font-extrabold"
          >
            {working ? 'Opening…' : 'Open live room'} <Radio />
          </Button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[390px] self-start rounded-[38px] border-[8px] border-[#203752] bg-[#f8f7f3] p-4 shadow-[0_30px_80px_rgba(25,49,76,.18)] lg:sticky lg:top-5">
        <div className="mx-auto mb-5 h-1.5 w-20 rounded-full bg-[#203752]/20" />
        <p className="text-xs font-extrabold uppercase tracking-[.13em] text-[#c65340]">
          Moment {roundIndex + 1} of {event.rounds.length}
        </p>
        <h2 className="font-display mt-3 text-3xl font-extrabold leading-[1.02] tracking-[-.04em]">
          {round.question}
        </h2>
        <div className="mt-5 grid gap-2">
          {round.choices.map((choice, index) => {
            const correct = revealed && round.correctChoice === index;
            return (
              <motion.button
                key={`${round.id}-${index}`}
                whileTap={{ scale: 0.98 }}
                onClick={() => !revealed && setSelected(index)}
                className={`min-h-16 rounded-[18px] border-2 p-4 text-left font-extrabold transition ${correct ? 'border-[#2d8a55] bg-[#d9f2e2] ring-2 ring-[#2d8a55]/20' : selected === index ? CHOICE_TONES[index].active : CHOICE_TONES[index].base}`}
              >
                <span className="mr-2 text-xs text-[#718291]">
                  {String.fromCharCode(65 + index)}
                </span>
                {choice}
              </motion.button>
            );
          })}
        </div>
        <Button
          onClick={next}
          disabled={selected === null && !revealed}
          className="mt-5 h-12 w-full rounded-[16px] bg-[#203752] font-extrabold"
        >
          {!revealed
            ? 'Rehearse reveal'
            : last
              ? 'Rehearsal complete'
              : 'Next moment'}
        </Button>
        <p className="mt-3 text-center text-xs font-bold text-[#74838e]">
          Participant-sized preview · safe rehearsal
        </p>
      </div>
    </section>
  );
}

function Join({
  name,
  setName,
  profileStyle,
  setProfileStyle,
  next,
  roomCode,
  working,
  error,
  privateInvite,
}: {
  name: string;
  setName: (value: string) => void;
  profileStyle: MimoProfileStyle;
  setProfileStyle: (value: MimoProfileStyle) => void;
  next: () => void;
  roomCode: string;
  working: boolean;
  error: string;
  privateInvite: boolean;
}) {
  return (
    <section className="mobile-page mx-auto grid max-w-[920px] items-center gap-5 px-5 pb-12 pt-3 sm:pt-10 md:grid-cols-[290px_1fr]">
      <MimoCharacter className="mx-auto hidden w-[260px] md:block" />
      <div>
        <MimoCue
          className="mobile-only mb-6"
          message="Pick a name. You’ll be in the room in seconds."
        />
        <p className="text-sm font-extrabold uppercase tracking-[.15em] text-[#cf624e]">
          {privateInvite ? 'Private invite' : 'Join room'} {roomCode}
        </p>
        <h1 className="mobile-flow-title font-display mt-3 text-[clamp(2.7rem,7vw,5rem)] font-extrabold leading-[.95] tracking-[-.065em]">
          What should everyone call you?
        </h1>
        <p className="mt-4 text-base leading-7 text-[#5b7082] sm:text-lg">
          No account. No password. Your wallet waits until a funded reward needs
          it.
        </p>
        <label htmlFor="nickname" className="mt-8 block text-sm font-extrabold">
          Your room name
        </label>
        <input
          id="nickname"
          value={name}
          maxLength={18}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && next()}
          placeholder="e.g. River"
          className="mt-2 h-16 w-full border-0 border-b-2 border-[#a9b4bd] bg-transparent text-2xl font-bold outline-none placeholder:text-[#a8afb6] focus:border-[#1f72d2]"
        />
        <fieldset className="mt-7">
          <legend className="text-sm font-extrabold">
            Pick your Mimo vibe
          </legend>
          <p className="mt-1 text-sm text-[#647789]">
            This is how the room recognises you.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MIMO_PROFILES.map((profile) => {
              const active = profileStyle === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setProfileStyle(profile.id)}
                  className={`flex min-h-16 items-center gap-3 border px-3 text-left transition ${
                    active
                      ? 'border-[#1f72d2] bg-[#e7f2ff] ring-2 ring-[#1f72d2]/15'
                      : 'border-[#cbd3d9] bg-white hover:border-[#8fa5b7]'
                  }`}
                >
                  <MimoProfileAvatar
                    profile={profile.id}
                    nickname={name.trim() || 'You'}
                    className="h-10 w-10"
                  />
                  <span className="font-extrabold">{profile.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        {error && (
          <p
            role="alert"
            className="mt-4 bg-[#fff0ec] px-4 py-3 text-sm font-bold text-[#9f3f2f]"
          >
            {error}
          </p>
        )}
        <div className="mobile-action-bar mt-8 flex flex-col-reverse items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 text-sm text-[#637688]">
            <ShieldCheck size={17} />
            Your wallet stays private
          </span>
          <Button
            onClick={next}
            disabled={!name.trim() || working}
            className="mobile-primary h-12 rounded-full bg-[#1f72d2] px-6 font-bold"
          >
            {working ? 'Joining…' : 'Join the room'} <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
