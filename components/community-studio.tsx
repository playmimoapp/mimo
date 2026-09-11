'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Camera,
  Check,
  Clock3,
  Copy,
  Repeat2,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MimoCharacter } from '@/components/mimo-host';
import { MimoNimiq } from '@/lib/nimiq';

type Community = {
  slug: string;
  name: string;
  description: string;
  accentColor: string;
  hasAvatar: boolean;
  createdAt: number;
  recurrence: 'none' | 'weekly' | 'fortnightly' | 'monthly';
  nextEventAt: number | null;
  seasonName: string;
  seasonStartedAt: number;
};

const ACCENTS = ['#2577de', '#d45f4a', '#19805b', '#8b5dc7', '#b47a05'];

export function CommunityStudio({
  createEvent,
}: {
  createEvent: (community: {
    name: string;
    slug: string;
    recurrence: Community['recurrence'];
    nextEventAt: number | null;
  }) => void;
}) {
  const nimiq = useRef(new MimoNimiq());
  const [session, setSession] = useState('');
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState(ACCENTS[0]);
  const [avatar, setAvatar] = useState<File | null>(null);

  async function loadCommunities(token: string) {
    const response = await fetch('/api/communities', {
      headers: { 'x-mimo-account': token },
      cache: 'no-store',
    });
    if (!response.ok) {
      if (response.status === 401) {
        window.localStorage.removeItem('mimo:studio:session');
        setSession('');
      }
      throw new Error(
        response.status === 401
          ? 'Sign in to open your communities.'
          : 'Studio could not load.',
      );
    }
    const body = (await response.json()) as { communities: Community[] };
    setCommunities(body.communities);
  }

  useEffect(() => {
    const token = window.localStorage.getItem('mimo:studio:session') ?? '';
    void Promise.resolve().then(async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      setSession(token);
      await loadCommunities(token).catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : 'Studio could not load.',
        ),
      );
      setLoading(false);
    });
  }, []);

  async function signIn() {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      const connected = await nimiq.current.connect();
      if (connected.status !== 'ready')
        throw new Error(
          connected.status === 'cancelled'
            ? 'You cancelled sign-in. Nothing changed.'
            : 'Open Mimo inside Nimiq Pay to sign in.',
        );
      const challengeResponse = await fetch('/api/account/challenge', {
        method: 'POST',
      });
      const challenge = (await challengeResponse.json()) as {
        challengeId?: string;
        message?: string;
        error?: string;
      };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.message)
        throw new Error(challenge.error || 'Mimo could not start sign-in.');
      const signed = await nimiq.current.signChallenge(challenge.message);
      if ('status' in signed)
        throw new Error(
          signed.status === 'cancelled'
            ? 'You cancelled sign-in. Nothing changed.'
            : 'The signature was not completed.',
        );
      const verifyResponse = await fetch('/api/account/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          account: connected.account,
          publicKey: signed.publicKey,
          signature: signed.signature,
        }),
      });
      const verified = (await verifyResponse.json()) as {
        sessionToken?: string;
        error?: string;
      };
      if (!verifyResponse.ok || !verified.sessionToken)
        throw new Error(verified.error || 'Mimo could not verify the wallet.');
      window.localStorage.setItem('mimo:studio:session', verified.sessionToken);
      setSession(verified.sessionToken);
      await loadCommunities(verified.sessionToken);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Sign-in did not finish.',
      );
    } finally {
      setLoading(false);
      setWorking(false);
    }
  }

  async function createCommunity() {
    if (!session || working) return;
    setWorking(true);
    setError('');
    try {
      const response = await fetch('/api/communities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mimo-account': session,
        },
        body: JSON.stringify({ name, slug, description, accentColor }),
      });
      const body = (await response.json()) as {
        community?: Community;
        error?: string;
      };
      if (!response.ok || !body.community)
        throw new Error(body.error || 'The community could not be created.');
      if (avatar) {
        const form = new FormData();
        form.set('avatar', avatar);
        const upload = await fetch(
          `/api/communities/${body.community.slug}/avatar`,
          {
            method: 'POST',
            headers: { 'x-mimo-account': session },
            body: form,
          },
        );
        const uploaded = (await upload.json()) as { error?: string };
        if (!upload.ok)
          throw new Error(
            `${body.community.name} was created, but its picture was not saved: ${uploaded.error || 'try again.'}`,
          );
      }
      setName('');
      setSlug('');
      setDescription('');
      setAvatar(null);
      await loadCommunities(session);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The community could not be created.',
      );
    } finally {
      setWorking(false);
    }
  }

  if (loading)
    return (
      <StudioShell>
        <p className="text-center font-bold text-[#557086]">
          Opening your Studio…
        </p>
      </StudioShell>
    );
  if (!session) {
    return (
      <StudioShell>
        <div className="grid items-stretch overflow-hidden rounded-[34px] border border-[#d5dde3] bg-white shadow-[0_28px_90px_rgba(28,55,82,.1)] lg:grid-cols-[minmax(380px,.95fr)_minmax(0,1.05fr)]">
          <div className="relative flex min-h-[360px] items-end justify-center overflow-hidden bg-[#dceeff] px-8 pt-10 lg:min-h-[560px]">
            <div className="absolute left-7 top-7 rounded-full bg-white px-3 py-2 text-xs font-black uppercase tracking-[.12em] text-[#2577de]">
              Creator home
            </div>
            <div className="absolute right-[-54px] top-20 h-48 w-48 rounded-full border-[34px] border-white/35" />
            <div className="absolute bottom-8 left-7 z-20 hidden w-[210px] rounded-[20px] bg-white/95 p-4 shadow-[0_16px_45px_rgba(32,55,82,.14)] sm:block">
              <p className="text-xs font-black uppercase tracking-[.12em] text-[#c94f3b]">
                Next up
              </p>
              <p className="mt-2 font-display text-lg font-extrabold">
                Friday Game Night
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs font-bold text-[#607486]">
                <Clock3 size={14} /> Weekly · 7:00 PM
              </p>
            </div>
            <motion.div
              animate={{ y: [0, -8, 0], rotate: [-1, 1, -1] }}
              transition={{ duration: 2.4, repeat: Infinity }}
              className="relative z-10 w-[260px] sm:w-[310px]"
            >
              <MimoCharacter mood="happy" />
            </motion.div>
          </div>
          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
            <span className="text-xs font-black uppercase tracking-[.15em] text-[#c94f3b]">
              Your permanent home
            </span>
            <h1 className="font-display mt-3 max-w-[560px] text-4xl font-extrabold leading-[.98] tracking-[-.055em] sm:text-5xl lg:text-[3.65rem]">
              One home for every Mimo you host.
            </h1>
            <p className="mt-5 max-w-[560px] text-lg leading-8 text-[#53687c]">
              Schedule the next room, share one permanent community link and
              keep every event together.
            </p>
            <div className="mt-6 flex items-start gap-3 border-y border-[#d9e3eb] py-4 text-sm text-[#405b72]">
              <ShieldCheck
                className="mt-0.5 shrink-0 text-[#19805b]"
                size={20}
              />
              <span>
                Nimiq Pay confirms this Studio belongs to you. Signing in cannot
                move NIM.
              </span>
            </div>
            <Button
              onClick={() => void signIn()}
              disabled={working}
              className="mt-6 h-14 w-full rounded-[18px] bg-[#172f49] text-base font-extrabold text-white sm:w-fit sm:px-8"
            >
              {working ? 'Waiting for Nimiq Pay…' : 'Sign in with Nimiq Pay'}{' '}
              <ArrowRight />
            </Button>
            {error && (
              <p role="alert" className="mt-3 text-sm font-bold text-[#b53636]">
                {error}
              </p>
            )}
          </div>
        </div>
      </StudioShell>
    );
  }

  return (
    <StudioShell>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-black uppercase tracking-[.15em] text-[#c94f3b]">
            Community Studio
          </span>
          <h1 className="font-display mt-1 text-4xl font-extrabold tracking-[-.045em]">
            Your rooms start here.
          </h1>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-bold text-[#19805b]">
          <Check size={16} /> Wallet verified
        </span>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
        <section className="space-y-4">
          {communities.length ? (
            communities.map((community) => (
              <CommunityCard
                key={community.slug}
                community={community}
                createEvent={createEvent}
                session={session}
                onSaved={() => void loadCommunities(session)}
              />
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#bdcbd7] bg-[#f0f6fb] p-6">
              <Users className="text-[#2577de]" />
              <h2 className="mt-3 text-xl font-extrabold">
                Create your first community home
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#5a7084]">
                Its name, picture and public link stay the same across every
                event.
              </p>
            </div>
          )}
        </section>
        <section className="rounded-[26px] border border-[#d9dee3] bg-white p-5 shadow-[0_18px_50px_rgba(26,47,80,.07)] sm:p-6">
          <h2 className="text-xl font-extrabold">New community</h2>
          <p className="mt-5 block text-sm font-extrabold">Profile picture</p>
          <label className="mt-2 flex cursor-pointer items-center gap-4 rounded-2xl border border-[#d6dee5] p-3 hover:bg-[#f7fafc]">
            <span
              className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl text-white"
              style={{ background: accentColor }}
            >
              {avatar ? (
                <Image
                  src={URL.createObjectURL(avatar)}
                  alt="Selected community"
                  width={56}
                  height={56}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <Camera size={22} />
              )}
            </span>
            <span>
              <b className="block">Choose image</b>
              <small className="text-[#718295]">
                PNG, JPEG or WebP · 2 MB max
              </small>
            </span>
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
            />
          </label>
          <Field
            label="Community name"
            value={name}
            setValue={(value) => {
              setName(value);
              if (!slug)
                setSlug(
                  value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, ''),
                );
            }}
            placeholder="Nimiq Africa"
          />
          <Field
            label="Public handle"
            value={slug}
            setValue={(value) =>
              setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
            }
            placeholder="nimiq-africa"
            prefix="playmimo.app/c/"
          />
          <label className="mt-4 block text-sm font-extrabold">
            Short description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={180}
              rows={3}
              placeholder="What brings this community together?"
              className="mt-2 w-full resize-none rounded-xl border border-[#cad4dd] bg-[#fbfcfd] px-4 py-3 font-medium outline-none focus:border-[#2577de]"
            />
          </label>
          <div className="mt-4">
            <span className="text-sm font-extrabold">Accent</span>
            <div className="mt-2 flex gap-2">
              {ACCENTS.map((color) => (
                <button
                  key={color}
                  onClick={() => setAccentColor(color)}
                  aria-label={`Use ${color}`}
                  className={`h-9 w-9 rounded-full border-4 ${accentColor === color ? 'border-[#172f49]' : 'border-white'}`}
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>
          <Button
            onClick={() => void createCommunity()}
            disabled={working || name.trim().length < 2 || slug.length < 2}
            className="mt-6 h-12 w-full rounded-xl bg-[#2577de] text-base font-extrabold text-white"
          >
            {working ? 'Creating…' : 'Create community'} <ArrowRight />
          </Button>
          {error && (
            <p role="alert" className="mt-3 text-sm font-bold text-[#b53636]">
              {error}
            </p>
          )}
        </section>
      </div>
    </StudioShell>
  );
}

function StudioShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="app-frame min-h-[calc(100dvh-72px)] pb-16 pt-8 sm:pt-12">
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  setValue,
  placeholder,
  prefix,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
  prefix?: string;
}) {
  return (
    <label className="mt-4 block text-sm font-extrabold">
      {label}
      <div className="mt-2 flex overflow-hidden rounded-xl border border-[#cad4dd] bg-[#fbfcfd] focus-within:border-[#2577de]">
        {prefix && (
          <span className="hidden items-center bg-[#eef3f7] px-3 text-xs text-[#718295] sm:flex">
            {prefix}
          </span>
        )}
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={48}
          placeholder={placeholder}
          className="h-12 min-w-0 flex-1 bg-transparent px-4 font-medium outline-none"
        />
      </div>
    </label>
  );
}

function CommunityCard({
  community,
  createEvent,
  session,
  onSaved,
}: {
  community: Community;
  createEvent: (community: {
    name: string;
    slug: string;
    recurrence: Community['recurrence'];
    nextEventAt: number | null;
  }) => void;
  session: string;
  onSaved: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [editingSeason, setEditingSeason] = useState(false);
  const [seasonName, setSeasonName] = useState(community.seasonName);
  const [recurrence, setRecurrence] = useState<Community['recurrence']>(
    community.recurrence,
  );
  const [nextEvent, setNextEvent] = useState(() => {
    const defaultTime = new Date();
    defaultTime.setDate(defaultTime.getDate() + 1);
    defaultTime.setHours(19, 0, 0, 0);
    return toLocalDateTime(community.nextEventAt ?? defaultTime.getTime());
  });
  const path = `/?community=${community.slug}`;
  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  async function saveSchedule() {
    setSavingSchedule(true);
    setScheduleError('');
    try {
      const response = await fetch(`/api/communities/${community.slug}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-mimo-account': session,
        },
        body: JSON.stringify({
          recurrence,
          nextEventAt:
            recurrence === 'none' ? null : new Date(nextEvent).getTime(),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'The schedule could not be saved.');
      setEditingSchedule(false);
      onSaved();
    } catch (cause) {
      setScheduleError(
        cause instanceof Error
          ? cause.message
          : 'The schedule could not be saved.',
      );
    } finally {
      setSavingSchedule(false);
    }
  }
  async function startSeason() {
    setSavingSchedule(true);
    setScheduleError('');
    try {
      const response = await fetch(`/api/communities/${community.slug}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-mimo-account': session,
        },
        body: JSON.stringify({ action: 'new_season', seasonName }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'The season could not be started.');
      setEditingSeason(false);
      onSaved();
    } catch (cause) {
      setScheduleError(
        cause instanceof Error
          ? cause.message
          : 'The season could not be started.',
      );
    } finally {
      setSavingSchedule(false);
    }
  }
  return (
    <motion.article
      layout
      className="overflow-hidden rounded-[26px] border border-[#d9dee3] bg-white shadow-[0_18px_50px_rgba(26,47,80,.07)]"
    >
      <div className="h-2" style={{ background: community.accentColor }} />
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <CommunityAvatar community={community} />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-extrabold">
              {community.name}
            </h2>
            <p className="text-sm font-bold text-[#718295]">
              @{community.slug}
            </p>
          </div>
        </div>
        <p className="mt-4 min-h-12 text-sm leading-6 text-[#53687c]">
          {community.description || 'A live home for this community.'}
        </p>
        <div className="mt-4 flex items-center justify-between gap-4 border-y border-[#e0e5e8] py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-extrabold">
              <Repeat2 size={16} className="text-[#2577de]" />
              {community.recurrence === 'none'
                ? 'No recurring schedule yet'
                : `${recurrenceLabel(community.recurrence)} Mimo`}
            </p>
            {community.nextEventAt && (
              <p className="mt-1 text-xs font-bold text-[#718295]">
                Next · {new Date(community.nextEventAt).toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={() => setEditingSchedule((value) => !value)}
            className="shrink-0 text-sm font-extrabold text-[#2577de]"
          >
            {editingSchedule ? 'Close' : 'Set schedule'}
          </button>
        </div>
        {editingSchedule && (
          <div className="mt-3 rounded-[18px] bg-[#f3f7fa] p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-extrabold text-[#53687c]">
                Repeats
                <select
                  value={recurrence}
                  onChange={(event) =>
                    setRecurrence(event.target.value as Community['recurrence'])
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#cbd5dc] bg-white px-3 font-bold text-[#203752]"
                >
                  <option value="none">Does not repeat</option>
                  <option value="weekly">Every week</option>
                  <option value="fortnightly">Every two weeks</option>
                  <option value="monthly">Every month</option>
                </select>
              </label>
              <label className="text-xs font-extrabold text-[#53687c]">
                Next event
                <input
                  type="datetime-local"
                  value={nextEvent}
                  disabled={recurrence === 'none'}
                  onChange={(event) => setNextEvent(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-[#cbd5dc] bg-white px-3 font-bold text-[#203752] disabled:opacity-45"
                />
              </label>
            </div>
            <Button
              onClick={() => void saveSchedule()}
              disabled={savingSchedule || (recurrence !== 'none' && !nextEvent)}
              className="mt-3 h-11 rounded-xl bg-[#2577de] px-5 font-extrabold text-white"
            >
              {savingSchedule ? 'Saving…' : 'Save schedule'}
            </Button>
            {scheduleError && (
              <p className="mt-2 text-xs font-bold text-[#b53636]">
                {scheduleError}
              </p>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-4 rounded-[16px] bg-[#f8f5ea] px-4 py-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-extrabold">
              <Trophy size={15} className="text-[#a97800]" />{' '}
              {community.seasonName}
            </p>
            <p className="mt-1 text-xs font-bold text-[#718295]">
              Scores from completed events build this standing.
            </p>
          </div>
          <button
            onClick={() => setEditingSeason((value) => !value)}
            className="shrink-0 text-xs font-extrabold text-[#8a6700]"
          >
            New season
          </button>
        </div>
        {editingSeason && (
          <div className="mt-2 flex flex-col gap-2 rounded-[16px] border border-[#dfcf91] bg-[#fffaf0] p-3 sm:flex-row">
            <input
              value={seasonName}
              onChange={(event) => setSeasonName(event.target.value)}
              maxLength={40}
              aria-label="New season name"
              className="h-11 min-w-0 flex-1 rounded-xl border border-[#d7c57d] bg-white px-3 font-bold"
              placeholder="October League"
            />
            <Button
              onClick={() => void startSeason()}
              disabled={savingSchedule || seasonName.trim().length < 2}
              className="h-11 rounded-xl bg-[#203752] px-4 font-extrabold text-white"
            >
              Start fresh
            </Button>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={() =>
              createEvent({
                name: community.name,
                slug: community.slug,
                recurrence: community.recurrence,
                nextEventAt: community.nextEventAt,
              })
            }
            className="h-11 rounded-xl bg-[#172f49] px-4 font-extrabold text-white"
          >
            <CalendarDays /> Host next event
          </Button>
          <Button
            onClick={() => void copyLink()}
            variant="outline"
            className="h-11 rounded-xl px-4 font-extrabold"
          >
            <Copy /> {copied ? 'Copied' : 'Copy public link'}
          </Button>
          <a
            href={path}
            className="inline-flex h-11 items-center px-3 text-sm font-extrabold text-[#2577de]"
          >
            View page <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </motion.article>
  );
}

function toLocalDateTime(timestamp: number) {
  const date = new Date(
    timestamp - new Date(timestamp).getTimezoneOffset() * 60_000,
  );
  return date.toISOString().slice(0, 16);
}

function recurrenceLabel(recurrence: Community['recurrence']) {
  return recurrence === 'weekly'
    ? 'Weekly'
    : recurrence === 'fortnightly'
      ? 'Every-two-weeks'
      : recurrence === 'monthly'
        ? 'Monthly'
        : 'One-off';
}

export function CommunityAvatar({
  community,
  size = 'large',
}: {
  community: Pick<Community, 'slug' | 'name' | 'accentColor' | 'hasAvatar'>;
  size?: 'large' | 'hero';
}) {
  const dimensions =
    size === 'hero' ? 'h-24 w-24 rounded-[28px]' : 'h-16 w-16 rounded-[20px]';
  return (
    <span
      className={`${dimensions} grid shrink-0 place-items-center overflow-hidden text-2xl font-black text-white shadow-sm`}
      style={{ background: community.accentColor }}
    >
      {community.hasAvatar ? (
        <Image
          src={`/api/communities/${community.slug}/avatar`}
          alt={`${community.name} profile`}
          width={96}
          height={96}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        community.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

export function PublicCommunity({
  slug,
  host,
}: {
  slug: string;
  host: () => void;
}) {
  const [data, setData] = useState<{
    community: Community;
    events: Array<{
      title: string;
      status: string;
      startsAt: number | null;
      roomCode: string | null;
      createdAt: number;
      playerCount: number;
      rewardState: string | null;
      rewardAmount: number | null;
      scores: Array<{ nickname: string; score: number }>;
    }>;
    standings: Array<{
      nickname: string;
      points: number;
      eventsPlayed: number;
      wins: number;
    }>;
  } | null>(null);
  const [error, setError] = useState('');
  const [following, setFollowing] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  useEffect(() => {
    void fetch(`/api/communities/${slug}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json()) as {
          community?: Community;
          events?: Array<{
            title: string;
            status: string;
            startsAt: number | null;
            roomCode: string | null;
            createdAt: number;
            playerCount: number;
            rewardState: string | null;
            rewardAmount: number | null;
            scores: Array<{ nickname: string; score: number }>;
          }>;
          standings?: Array<{
            nickname: string;
            points: number;
            eventsPlayed: number;
            wins: number;
          }>;
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || 'Community could not load.');
        if (!body.community || !body.events || !body.standings)
          throw new Error('Community could not load.');
        setData({
          community: body.community,
          events: body.events,
          standings: body.standings,
        });
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : 'Community could not load.',
        ),
      );
  }, [slug]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      setFollowing(
        window.localStorage.getItem(`mimo:follow:${slug}`) === 'yes',
      ),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [slug]);
  if (!data)
    return (
      <StudioShell>
        {error ? (
          <p role="alert" className="font-bold text-[#b53636]">
            {error}
          </p>
        ) : (
          <p className="font-bold text-[#60758a]">Opening community…</p>
        )}
      </StudioShell>
    );
  const next = data.events.find((event) =>
    ['scheduled', 'lobby', 'live'].includes(event.status),
  );
  const nextTime = next?.startsAt ?? data.community.nextEventAt;
  const completed = data.events
    .filter((event) => event.status === 'complete')
    .sort((a, b) => b.createdAt - a.createdAt);
  const toggleFollow = () => {
    setFollowing((current) => {
      const nextValue = !current;
      window.localStorage.setItem(
        `mimo:follow:${slug}`,
        nextValue ? 'yes' : 'no',
      );
      return nextValue;
    });
  };
  const addToCalendar = () => {
    if (!nextTime) return;
    const start = new Date(nextTime);
    const end = new Date(nextTime + 60 * 60_000);
    const stamp = (date: Date) =>
      date
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');
    const calendar = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Mimo//Community Event//EN',
      'BEGIN:VEVENT',
      `UID:${slug}-${nextTime}@playmimo.app`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${(next?.title ?? `${data.community.name} Mimo`).replace(/[,;]/g, '')}`,
      `URL:${window.location.href}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(
      new Blob([calendar], { type: 'text/calendar' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}-next-mimo.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <StudioShell>
      <section className="overflow-hidden rounded-[32px] border border-[#d9dee3] bg-white shadow-[0_24px_70px_rgba(26,47,80,.09)]">
        <div
          className="h-3"
          style={{ background: data.community.accentColor }}
        />
        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.75fr)]">
          <div>
            <CommunityAvatar community={data.community} size="hero" />
            <p
              className="mt-5 text-sm font-black uppercase tracking-[.13em]"
              style={{ color: data.community.accentColor }}
            >
              @{data.community.slug}
            </p>
            <h1 className="font-display mt-1 text-5xl font-extrabold tracking-[-.055em]">
              {data.community.name}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-[#53687c]">
              {data.community.description ||
                'A community that plays together on Mimo.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                onClick={toggleFollow}
                variant="outline"
                className={`h-11 rounded-full px-4 font-extrabold ${following ? 'border-[#8fc9aa] bg-[#edf9f1] text-[#237044]' : 'bg-white'}`}
              >
                <Bell size={16} />{' '}
                {following ? 'Following' : 'Follow community'}
              </Button>
              {nextTime && (
                <Button
                  onClick={addToCalendar}
                  variant="outline"
                  className="h-11 rounded-full bg-white px-4 font-extrabold"
                >
                  <CalendarDays size={16} /> Add to calendar
                </Button>
              )}
            </div>
          </div>
          <div className="rounded-[24px] bg-[#f3f7fa] p-5">
            <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-[#c94f3b]">
              <span className="h-2 w-2 rounded-full bg-[#c94f3b]" /> Next live
              Mimo
            </span>
            {next ? (
              <>
                <h2 className="mt-4 text-2xl font-extrabold">{next.title}</h2>
                <p className="mt-2 text-sm text-[#60758a]">
                  {next.startsAt
                    ? new Date(next.startsAt).toLocaleString()
                    : next.status === 'live'
                      ? 'Live now'
                      : 'Room is open'}
                </p>
                {nextTime && <Countdown timestamp={nextTime} />}
                {next.roomCode && (
                  <a
                    href={`/?room=${next.roomCode}`}
                    className="mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-[#2577de] px-5 font-extrabold text-white"
                  >
                    Join the room <ArrowRight size={18} />
                  </a>
                )}
              </>
            ) : nextTime ? (
              <>
                <p className="mt-4 text-xs font-extrabold uppercase tracking-[.12em] text-[#2577de]">
                  {recurrenceLabel(data.community.recurrence)} series
                </p>
                <h2 className="mt-2 text-2xl font-extrabold">
                  The next Mimo is scheduled.
                </h2>
                <p className="mt-2 text-sm font-bold text-[#60758a]">
                  {new Date(nextTime).toLocaleString()}
                </p>
                <Countdown timestamp={nextTime} />
                <p className="mt-4 text-sm leading-6 text-[#60758a]">
                  The Join button will appear here when the host publishes the
                  room. This public community link stays the same.
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mt-5 w-28">
                  <MimoCharacter mood="thinking" />
                </div>
                <h2 className="mt-2 text-center text-xl font-extrabold">
                  The next room is being cooked.
                </h2>
                <p className="mt-2 text-center text-sm leading-6 text-[#60758a]">
                  Follow the community link and come back when Mimo calls the
                  room.
                </p>
              </>
            )}
          </div>
        </div>
      </section>
      {data.standings.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-[26px] border border-[#d7dfe4] bg-white">
          <div className="flex items-end justify-between gap-4 border-b border-[#e0e5e8] px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[.13em] text-[#a97800]">
                {data.community.seasonName}
              </p>
              <h2 className="font-display mt-1 text-2xl font-extrabold">
                Community standings
              </h2>
            </div>
            <span className="text-xs font-bold text-[#718295]">
              Verified by results
            </span>
          </div>
          <ol>
            {data.standings.slice(0, 10).map((standing, index) => (
              <li
                key={`${standing.nickname}-${index}`}
                className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#edf0f2] px-5 py-3 last:border-0 sm:px-6"
              >
                <span
                  className={`font-display text-lg font-extrabold ${index < 3 ? 'text-[#a97800]' : 'text-[#8b98a3]'}`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <strong className="block truncate">
                    {standing.nickname}
                  </strong>
                  <span className="text-xs font-bold text-[#718295]">
                    {standing.eventsPlayed}{' '}
                    {standing.eventsPlayed === 1 ? 'event' : 'events'} ·{' '}
                    {standing.wins} {standing.wins === 1 ? 'win' : 'wins'}
                  </span>
                </div>
                <strong className="font-display text-lg">
                  {standing.points.toLocaleString()}
                </strong>
              </li>
            ))}
          </ol>
        </section>
      )}
      {completed.length > 0 && (
        <section className="mt-6 border-t border-[#d7dde1] pt-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.13em] text-[#c94f3b]">
                Previous events
              </p>
              <h2 className="font-display mt-1 text-2xl font-extrabold">
                This community’s Mimo history
              </h2>
            </div>
            <span className="text-sm font-bold text-[#60758a]">
              {completed.length} completed
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(showAllHistory ? completed : completed.slice(0, 3)).map(
              (event) => (
                <article
                  key={`${event.title}-${event.startsAt ?? event.roomCode}`}
                  className="rounded-[20px] border border-[#d8dfe4] bg-white p-4"
                >
                  <span className="text-xs font-extrabold uppercase tracking-[.1em] text-[#19805b]">
                    Complete
                  </span>
                  <h3 className="mt-2 font-extrabold">{event.title}</h3>
                  <p className="mt-1 text-xs font-bold text-[#718295]">
                    {event.playerCount}{' '}
                    {event.playerCount === 1 ? 'player' : 'players'}
                    {event.rewardAmount ? ` · ${event.rewardAmount} NIM` : ''}
                  </p>
                  {event.scores.length > 0 && (
                    <ol className="mt-4 border-t border-[#e1e6e9] pt-2">
                      {event.scores.map((score, index) => (
                        <li
                          key={`${score.nickname}-${index}`}
                          className="flex items-center gap-3 py-1.5 text-sm"
                        >
                          <span className="w-4 font-display font-extrabold text-[#8a98a4]">
                            {index + 1}
                          </span>
                          <strong className="min-w-0 flex-1 truncate">
                            {score.nickname}
                          </strong>
                          <span className="font-display font-extrabold">
                            {score.score.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              ),
            )}
          </div>
          {completed.length > 3 && (
            <Button
              onClick={() => setShowAllHistory((value) => !value)}
              variant="outline"
              className="mt-4 h-11 rounded-full bg-white px-5 font-extrabold"
            >
              {showAllHistory
                ? 'Show less'
                : `See all ${completed.length} events`}
            </Button>
          )}
        </section>
      )}
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-[#dae2e8] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-[#53687c]">
          Own this community? Your Studio keeps every event together.
        </p>
        <Button
          onClick={host}
          variant="outline"
          className="rounded-xl font-extrabold"
        >
          Open Studio
        </Button>
      </div>
    </StudioShell>
  );
}

function Countdown({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, timestamp - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return (
    <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Event countdown">
      {[
        [days, 'days'],
        [hours, 'hours'],
        [minutes, 'mins'],
      ].map(([value, label]) => (
        <div key={label} className="rounded-xl bg-white px-2 py-3 text-center">
          <strong className="font-display block text-xl">{value}</strong>
          <span className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[#718295]">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
