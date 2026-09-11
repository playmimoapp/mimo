'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  Copy,
  ShieldCheck,
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
};

const ACCENTS = ['#2577de', '#d45f4a', '#19805b', '#8b5dc7', '#b47a05'];

export function CommunityStudio({
  createEvent,
}: {
  createEvent: (community: { name: string; slug: string }) => void;
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
        <div className="mx-auto grid max-w-[760px] items-center gap-7 lg:grid-cols-[.8fr_1.2fr]">
          <div className="mx-auto w-44">
            <MimoCharacter mood="happy" />
          </div>
          <div>
            <span className="text-xs font-black uppercase tracking-[.15em] text-[#c94f3b]">
              Your permanent home
            </span>
            <h1 className="font-display mt-2 text-4xl font-extrabold tracking-[-.05em] sm:text-5xl">
              Come back. Your community remembers.
            </h1>
            <p className="mt-4 leading-7 text-[#53687c]">
              Sign once with Nimiq Pay to create communities, schedule rooms and
              keep seasons together.
            </p>
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#d9e3eb] bg-white p-4 text-sm text-[#405b72]">
              <ShieldCheck
                className="mt-0.5 shrink-0 text-[#19805b]"
                size={20}
              />
              <span>
                The signature proves ownership. It cannot move NIM and no full
                wallet address is stored.
              </span>
            </div>
            <Button
              onClick={() => void signIn()}
              disabled={working}
              className="mt-5 h-12 w-full rounded-xl bg-[#172f49] text-base font-extrabold text-white sm:w-auto sm:px-7"
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
}: {
  community: Community;
  createEvent: (community: { name: string; slug: string }) => void;
}) {
  const [copied, setCopied] = useState(false);
  const path = `/?community=${community.slug}`;
  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={() =>
              createEvent({ name: community.name, slug: community.slug })
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
    }>;
  } | null>(null);
  const [error, setError] = useState('');
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
          }>;
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || 'Community could not load.');
        if (!body.community || !body.events)
          throw new Error('Community could not load.');
        setData({ community: body.community, events: body.events });
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : 'Community could not load.',
        ),
      );
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
                {next.roomCode && (
                  <a
                    href={`/?room=${next.roomCode}`}
                    className="mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-[#2577de] px-5 font-extrabold text-white"
                  >
                    Join the room <ArrowRight size={18} />
                  </a>
                )}
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
