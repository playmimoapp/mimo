'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Camera,
  Clock3,
  Copy,
  ExternalLink,
  LogOut,
  Plus,
  Repeat2,
  Search,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MimoCharacter } from '@/components/mimo-host';
import { MimoNimiq } from '@/lib/nimiq';
import { MimoProfileAvatar } from '@/components/mimo-host';
import { MIMO_PROFILES, type MimoProfileStyle } from '@/lib/mimo-profile';

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
  role?: 'owner' | 'admin' | 'host';
  xUrl?: string | null;
  discordUrl?: string | null;
  telegramUrl?: string | null;
  followerCount?: number;
  following?: boolean;
};

type PersonalProfile = {
  displayName: string;
  handle: string | null;
  bio: string;
  profileStyle: MimoProfileStyle;
};

type MimoNotification = {
  id: string;
  title: string;
  body: string;
  href: string;
  readAt: number | null;
  createdAt: number;
};

type CommunityEventSummary = {
  id: string;
  title: string;
  status: string;
  startsAt: number | null;
  roomCode: string | null;
  createdAt: number;
  playerCount: number;
  publicVisible: boolean;
  rewardState: string | null;
  rewardAmount: number | null;
  scores: Array<{ nickname: string; score: number }>;
};

const ACCENTS = ['#2577de', '#d45f4a', '#19805b', '#8b5dc7', '#b47a05'];

async function signInWithNimiqPay(nimiq: MimoNimiq) {
  const connected = await nimiq.connect();
  if (connected.status !== 'ready') {
    throw new Error(
      connected.status === 'cancelled'
        ? 'You cancelled sign-in. Nothing changed.'
        : 'Open Mimo inside Nimiq Pay to sign in.',
    );
  }
  const challengeResponse = await fetch('/api/account/challenge', {
    method: 'POST',
  });
  const challenge = (await challengeResponse.json()) as {
    challengeId?: string;
    message?: string;
    error?: string;
  };
  if (!challengeResponse.ok || !challenge.challengeId || !challenge.message) {
    throw new Error(challenge.error || 'Mimo could not start sign-in.');
  }
  const signed = await nimiq.signChallenge(challenge.message);
  if ('status' in signed) {
    throw new Error(
      signed.status === 'cancelled'
        ? 'You cancelled sign-in. Nothing changed.'
        : 'The signature was not completed.',
    );
  }
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
  if (!verifyResponse.ok || !verified.sessionToken) {
    throw new Error(verified.error || 'Mimo could not verify the wallet.');
  }
  return verified.sessionToken;
}

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
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [notifications, setNotifications] = useState<MimoNotification[]>([]);
  const [followed, setFollowed] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState(ACCENTS[0]);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');

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
          ? 'Sign again to continue. Your profile and communities are safe.'
          : 'Studio could not load.',
      );
    }
    const body = (await response.json()) as { communities: Community[] };
    setCommunities(body.communities);
  }

  async function loadProfile(token: string) {
    const response = await fetch('/api/account/profile', {
      headers: { 'x-mimo-account': token },
      cache: 'no-store',
    });
    const body = (await response.json()) as {
      profile?: PersonalProfile;
      notifications?: MimoNotification[];
      followed?: Community[];
      error?: string;
    };
    if (!response.ok || !body.profile) {
      if (response.status === 401) {
        window.localStorage.removeItem('mimo:studio:session');
        setSession('');
      }
      throw new Error(
        response.status === 401
          ? 'Sign again to continue. Your profile and communities are safe.'
          : body.error || 'Your profile could not load.',
      );
    }
    setProfile(body.profile);
    setNotifications(body.notifications ?? []);
    setFollowed(body.followed ?? []);
  }

  async function loadDashboard(token: string) {
    await Promise.all([loadCommunities(token), loadProfile(token)]);
  }

  useEffect(() => {
    const token = window.localStorage.getItem('mimo:studio:session') ?? '';
    void Promise.resolve().then(async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      setSession(token);
      await loadDashboard(token).catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : 'Studio could not load.',
        ),
      );
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    const token = new URLSearchParams(window.location.search).get(
      'communityInvite',
    );
    if (!token) return;
    window.history.replaceState({}, '', window.location.pathname);
    void fetch(`/api/community-invites/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      headers: { 'x-mimo-account': session },
    }).then(async (response) => {
      const body = (await response.json()) as {
        community?: { name: string };
        role?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(
          body.error || 'The community invitation could not be accepted.',
        );
        return;
      }
      setInviteMessage(
        `You joined ${body.community?.name ?? 'the community'} as ${body.role}.`,
      );
      await loadCommunities(session);
    });
  }, [session]);

  async function signIn() {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      const sessionToken = await signInWithNimiqPay(nimiq.current);
      window.localStorage.setItem('mimo:studio:session', sessionToken);
      setSession(sessionToken);
      await loadDashboard(sessionToken);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Sign-in did not finish.',
      );
    } finally {
      setLoading(false);
      setWorking(false);
    }
  }

  async function signOut() {
    const token = session;
    window.localStorage.removeItem('mimo:studio:session');
    setSession('');
    setProfile(null);
    setCommunities([]);
    setNotifications([]);
    if (!token) return;
    await fetch('/api/account/session', {
      method: 'DELETE',
      headers: { 'x-mimo-account': token },
    }).catch(() => undefined);
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
      setShowCreate(false);
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

  if (profile && !profile.displayName) {
    return (
      <StudioShell>
        <div className="mx-auto max-w-2xl py-2 sm:py-8">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-black uppercase tracking-[.15em] text-[#c94f3b]">
              Your Mimo identity
            </span>
            <button
              onClick={() => void signOut()}
              className="inline-flex min-h-10 items-center gap-1.5 text-sm font-extrabold text-[#607486] transition hover:text-[#b24434]"
            >
              <LogOut size={15} /> Use another wallet
            </button>
          </div>
          <h1 className="font-display mt-2 text-4xl font-extrabold leading-[.96] tracking-[-.05em] sm:text-5xl">
            Pick how the room knows you.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#607486]">
            One quick profile works across your communities and events.
          </p>
          <ProfileEditor
            profile={profile}
            session={session}
            standalone
            onboarding
            onSaved={(saved) => setProfile(saved)}
          />
        </div>
      </StudioShell>
    );
  }

  return (
    <StudioShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-black uppercase tracking-[.15em] text-[#c94f3b]">
            Community Studio
          </span>
          <h1 className="font-display mt-1 text-4xl font-extrabold tracking-[-.045em]">
            Your rooms start here.
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNotifications((value) => !value)}
            className="relative grid h-11 w-11 place-items-center rounded-full border border-[#cbd6de] bg-white"
            aria-label="Open notifications"
          >
            <Bell size={18} />
            {notifications.some((item) => !item.readAt) && (
              <span className="absolute right-0 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-[#d45f4a] px-1 text-[10px] font-black text-white">
                {notifications.filter((item) => !item.readAt).length}
              </span>
            )}
          </button>
          <Button
            onClick={() => setShowCreate(true)}
            className="h-11 rounded-full bg-[#2577de] px-5 font-extrabold text-white"
          >
            <Plus size={17} /> New community
          </Button>
        </div>
      </div>
      {profile && (
        <section className="mt-7 flex items-center gap-4 border-y border-[#d9e1e6] py-5">
          <MimoProfileAvatar
            profile={profile.profileStyle}
            nickname={profile.displayName || 'Your Mimo'}
            className="h-14 w-14"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold">
              {profile.displayName || 'Create your Mimo profile'}
            </p>
            <p className="truncate text-sm font-bold text-[#718295]">
              {profile.handle
                ? `@${profile.handle}`
                : 'Your identity across Mimo'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
            <button
              onClick={() => setShowProfile((value) => !value)}
              className="text-sm font-extrabold text-[#2577de]"
            >
              {showProfile ? 'Done' : 'Edit profile'}
            </button>
            <button
              onClick={() => void signOut()}
              className="inline-flex h-10 items-center gap-1.5 px-2 text-sm font-extrabold text-[#607486] transition hover:text-[#b24434]"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </section>
      )}
      {inviteMessage && (
        <p className="mt-4 border-l-4 border-[#19805b] py-2 pl-4 text-sm font-extrabold text-[#19805b]">
          {inviteMessage}
        </p>
      )}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-[26px] bg-[#f8f6f1] p-6 sm:max-w-2xl sm:p-8">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl font-extrabold tracking-[-.04em]">
              Edit your profile
            </DialogTitle>
            <DialogDescription>
              This identity follows you across Mimo.
            </DialogDescription>
          </DialogHeader>
          {profile && (
            <ProfileEditor
              profile={profile}
              session={session}
              standalone
              onSaved={(saved) => {
                setProfile(saved);
                setShowProfile(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {showNotifications && (
        <NotificationInbox
          items={notifications}
          session={session}
          onRead={() =>
            setNotifications((items) =>
              items.map((item) => ({
                ...item,
                readAt: item.readAt ?? Date.now(),
              })),
            )
          }
        />
      )}
      <div className="mt-8">
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
        {followed.length > 0 && (
          <section className="mt-10 border-t border-[#d9e1e6] pt-7">
            <p className="text-xs font-black uppercase tracking-[.13em] text-[#19805b]">
              Following
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {followed.map((community) => (
                <a
                  key={community.slug}
                  href={`/?community=${community.slug}`}
                  className="inline-flex items-center gap-3 rounded-full border border-[#d5dfe6] bg-white py-2 pl-2 pr-4 font-extrabold"
                >
                  <CommunityAvatar community={community} size="small" />
                  {community.name}
                </a>
              ))}
            </div>
          </section>
        )}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-[26px] bg-[#f8f6f1] p-6 sm:max-w-2xl sm:p-8">
            <DialogHeader>
              <DialogTitle className="font-display text-3xl font-extrabold tracking-[-.04em]">
                Create a community
              </DialogTitle>
              <DialogDescription>
                A permanent home for events, followers and seasons.
              </DialogDescription>
            </DialogHeader>
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
          </DialogContent>
        </Dialog>
      </div>
    </StudioShell>
  );
}

function StudioShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="app-frame pb-12 pt-8 sm:pb-16 sm:pt-12">
      {children}
    </section>
  );
}

function ProfileEditor({
  profile,
  session,
  onSaved,
  standalone = false,
  onboarding = false,
}: {
  profile: PersonalProfile;
  session: string;
  onSaved: (profile: PersonalProfile) => void;
  standalone?: boolean;
  onboarding?: boolean;
}) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-mimo-account': session,
        },
        body: JSON.stringify(draft),
      });
      const body = (await response.json()) as {
        profile?: PersonalProfile;
        error?: string;
      };
      if (!response.ok || !body.profile)
        throw new Error(body.error || 'Your profile could not be saved.');
      onSaved(body.profile);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Your profile could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className={standalone ? 'pt-5' : 'border-b border-[#d9e1e6] py-6'}>
      <div className={onboarding ? '' : 'grid gap-4 sm:grid-cols-2'}>
        <Field
          label="Display name"
          value={draft.displayName}
          setValue={(displayName) => setDraft({ ...draft, displayName })}
          placeholder="Your name"
        />
        {!onboarding && (
          <Field
            label="Mimo handle"
            value={draft.handle ?? ''}
            setValue={(handle) =>
              setDraft({
                ...draft,
                handle: handle.toLowerCase().replace(/[^a-z0-9_]/g, ''),
              })
            }
            placeholder="mimo_player"
            prefix="@"
          />
        )}
      </div>
      {!onboarding && (
        <label className="mt-4 block text-sm font-extrabold">
          Short bio
          <input
            value={draft.bio}
            onChange={(event) =>
              setDraft({ ...draft, bio: event.target.value })
            }
            maxLength={120}
            placeholder="What are you here to play?"
            className="mt-2 h-12 w-full rounded-xl border border-[#cad4dd] bg-white px-4 font-medium outline-none focus:border-[#2577de]"
          />
        </label>
      )}
      <div className="mt-5">
        <p className="text-sm font-extrabold">Choose your Mimo</p>
        <div
          className={
            onboarding
              ? 'mt-3 grid grid-cols-4 gap-2'
              : 'mt-3 flex flex-wrap gap-3'
          }
        >
          {MIMO_PROFILES.map((choice) => (
            <button
              key={choice.id}
              onClick={() => setDraft({ ...draft, profileStyle: choice.id })}
              className={`${onboarding ? 'flex min-w-0 flex-col justify-center rounded-2xl px-1 py-3 text-xs' : 'flex items-center gap-2 rounded-full px-3 py-2 text-sm'} border font-extrabold ${draft.profileStyle === choice.id ? 'border-[#2577de] bg-[#edf6ff] text-[#1f72d2]' : 'border-[#d3dde4] bg-white'}`}
            >
              <MimoProfileAvatar
                profile={choice.id}
                nickname={choice.label}
                className={onboarding ? 'mb-1 h-12 w-12' : undefined}
              />
              {choice.label}
            </button>
          ))}
        </div>
      </div>
      <Button
        onClick={() => void save()}
        disabled={saving || draft.displayName.trim().length < 2}
        className="mt-5 h-11 rounded-full bg-[#172f49] px-6 font-extrabold text-white"
      >
        {saving ? 'Saving…' : onboarding ? 'Enter Studio' : 'Save profile'}
      </Button>
      {error && (
        <p className="mt-2 text-sm font-bold text-[#b53636]">{error}</p>
      )}
    </section>
  );
}

function NotificationInbox({
  items,
  session,
  onRead,
}: {
  items: MimoNotification[];
  session: string;
  onRead: () => void;
}) {
  useEffect(() => {
    if (!items.some((item) => !item.readAt)) return;
    const timer = window.setTimeout(() => {
      void fetch('/api/account/notifications', {
        method: 'PATCH',
        headers: { 'x-mimo-account': session },
      }).then((response) => response.ok && onRead());
    }, 800);
    return () => window.clearTimeout(timer);
  }, [items, onRead, session]);
  return (
    <section className="border-b border-[#d9e1e6] py-6">
      <h2 className="text-xl font-extrabold">Notifications</h2>
      {items.length ? (
        <div className="mt-3 divide-y divide-[#e1e7eb]">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              aria-label={`${item.title}: ${item.body}`}
              className="flex gap-3 py-4"
            >
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.readAt ? 'bg-[#c4cdd4]' : 'bg-[#2577de]'}`}
              />
              <span>
                <strong className="block">{item.title}</strong>
                <span className="mt-1 block text-sm text-[#60758a]">
                  {item.body}
                </span>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm font-bold text-[#718295]">
          Quiet for now. Follow a community and Mimo will keep this useful.
        </p>
      )}
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
  const [managing, setManaging] = useState(false);
  const [xUrl, setXUrl] = useState(community.xUrl ?? '');
  const [discordUrl, setDiscordUrl] = useState(community.discordUrl ?? '');
  const [telegramUrl, setTelegramUrl] = useState(community.telegramUrl ?? '');
  const [inviteRole, setInviteRole] = useState<'owner' | 'admin' | 'host'>(
    'host',
  );
  const [managerLink, setManagerLink] = useState('');
  const [managedEvents, setManagedEvents] = useState<CommunityEventSummary[]>(
    [],
  );
  const [historyLoaded, setHistoryLoaded] = useState(false);
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
  async function saveSocials() {
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
          action: 'socials',
          xUrl,
          discordUrl,
          telegramUrl,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'Social links could not be saved.');
      onSaved();
    } catch (cause) {
      setScheduleError(
        cause instanceof Error
          ? cause.message
          : 'Social links could not be saved.',
      );
    } finally {
      setSavingSchedule(false);
    }
  }
  async function makeRoleInvite() {
    setSavingSchedule(true);
    setScheduleError('');
    try {
      const response = await fetch(`/api/communities/${community.slug}/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mimo-account': session,
        },
        body: JSON.stringify({ role: inviteRole }),
      });
      const body = (await response.json()) as {
        inviteToken?: string;
        error?: string;
      };
      if (!response.ok || !body.inviteToken)
        throw new Error(body.error || 'The invitation could not be created.');
      setManagerLink(
        `${window.location.origin}/?communityInvite=${body.inviteToken}`,
      );
    } catch (cause) {
      setScheduleError(
        cause instanceof Error
          ? cause.message
          : 'The invitation could not be created.',
      );
    } finally {
      setSavingSchedule(false);
    }
  }
  async function openSettings() {
    const nextManaging = !managing;
    setManaging(nextManaging);
    if (!nextManaging || historyLoaded || community.role === 'host') return;
    setSavingSchedule(true);
    setScheduleError('');
    try {
      const response = await fetch(
        `/api/communities/${community.slug}?manage=1`,
        { headers: { 'x-mimo-account': session }, cache: 'no-store' },
      );
      const body = (await response.json()) as {
        events?: CommunityEventSummary[];
        error?: string;
      };
      if (!response.ok || !body.events)
        throw new Error(body.error || 'Event history could not load.');
      setManagedEvents(
        body.events.filter((event) => event.status === 'complete'),
      );
      setHistoryLoaded(true);
    } catch (cause) {
      setScheduleError(
        cause instanceof Error
          ? cause.message
          : 'Event history could not load.',
      );
    } finally {
      setSavingSchedule(false);
    }
  }
  async function changeEventVisibility(eventId: string, visible: boolean) {
    setSavingSchedule(true);
    setScheduleError('');
    try {
      const response = await fetch(
        `/api/communities/${community.slug}/events/${eventId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-mimo-account': session,
          },
          body: JSON.stringify({ visible }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'Event visibility could not be changed.');
      setManagedEvents((events) =>
        events.map((event) =>
          event.id === eventId ? { ...event, publicVisible: visible } : event,
        ),
      );
    } catch (cause) {
      setScheduleError(
        cause instanceof Error
          ? cause.message
          : 'Event visibility could not be changed.',
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
          <button
            onClick={() => void openSettings()}
            className="inline-flex h-11 items-center px-3 text-sm font-extrabold text-[#53687c]"
          >
            {managing ? 'Close settings' : 'Community settings'}
          </button>
        </div>
        {managing && (
          <div className="mt-5 border-t border-[#dfe5e9] pt-5">
            <p className="text-xs font-black uppercase tracking-[.12em] text-[#718295]">
              Public social links
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <input
                value={xUrl}
                onChange={(event) => setXUrl(event.target.value)}
                placeholder="https://x.com/…"
                className="h-11 rounded-xl border border-[#cbd5dc] bg-white px-3 text-sm"
              />
              <input
                value={discordUrl}
                onChange={(event) => setDiscordUrl(event.target.value)}
                placeholder="https://discord.gg/…"
                className="h-11 rounded-xl border border-[#cbd5dc] bg-white px-3 text-sm"
              />
              <input
                value={telegramUrl}
                onChange={(event) => setTelegramUrl(event.target.value)}
                placeholder="https://t.me/…"
                className="h-11 rounded-xl border border-[#cbd5dc] bg-white px-3 text-sm"
              />
            </div>
            <Button
              onClick={() => void saveSocials()}
              disabled={savingSchedule}
              variant="outline"
              className="mt-3 h-10 rounded-full px-4 font-extrabold"
            >
              Save links
            </Button>
            {community.role !== 'host' && historyLoaded && (
              <div className="mt-5 border-t border-[#e3e7ea] pt-5">
                <p className="text-sm font-extrabold">Public event history</p>
                <p className="mt-1 text-xs leading-5 text-[#718295]">
                  Hide an event from the community page without deleting its
                  results or payment record.
                </p>
                {managedEvents.length > 0 ? (
                  <div className="mt-3 border-y border-[#dfe5e9]">
                    {managedEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between gap-4 border-b border-[#edf0f2] py-3 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold">
                            {event.title}
                          </p>
                          <p className="mt-0.5 text-xs font-bold text-[#718295]">
                            {event.publicVisible
                              ? 'Visible on community page'
                              : 'Hidden from community page'}
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            void changeEventVisibility(
                              event.id,
                              !event.publicVisible,
                            )
                          }
                          disabled={savingSchedule}
                          className="shrink-0 text-xs font-extrabold text-[#2577de] disabled:opacity-50"
                        >
                          {event.publicVisible ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs font-bold text-[#718295]">
                    Completed events will appear here.
                  </p>
                )}
              </div>
            )}
            {community.role === 'owner' && (
              <div className="mt-5 border-t border-[#e3e7ea] pt-5">
                <p className="text-sm font-extrabold">
                  Invite a community manager
                </p>
                <p className="mt-1 text-xs leading-5 text-[#718295]">
                  The invited person must sign in with their own wallet.
                  Ownership transfer only finishes after they accept.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <select
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(
                        event.target.value as 'owner' | 'admin' | 'host',
                      )
                    }
                    className="h-11 rounded-xl border border-[#cbd5dc] bg-white px-3 font-bold"
                  >
                    <option value="host">Host events</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Transfer ownership</option>
                  </select>
                  <Button
                    onClick={() => void makeRoleInvite()}
                    disabled={savingSchedule}
                    className="h-11 rounded-xl bg-[#203752] px-4 font-extrabold text-white"
                  >
                    Create secure invite
                  </Button>
                </div>
                {managerLink && (
                  <button
                    onClick={() =>
                      void navigator.clipboard.writeText(managerLink)
                    }
                    className="mt-3 w-full truncate rounded-xl bg-[#edf5fb] px-3 py-3 text-left text-xs font-bold text-[#2577de]"
                  >
                    {managerLink} · tap to copy
                  </button>
                )}
              </div>
            )}
            {scheduleError && (
              <p className="mt-3 text-xs font-bold text-[#b53636]">
                {scheduleError}
              </p>
            )}
          </div>
        )}
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
  size?: 'small' | 'large' | 'hero';
}) {
  const dimensions =
    size === 'hero'
      ? 'h-24 w-24 rounded-[28px]'
      : size === 'small'
        ? 'h-9 w-9 rounded-full text-sm'
        : 'h-16 w-16 rounded-[20px]';
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
  const nimiq = useRef(new MimoNimiq());
  const [data, setData] = useState<{
    community: Community;
    events: CommunityEventSummary[];
    standings: Array<{
      nickname: string;
      points: number;
      eventsPlayed: number;
      wins: number;
    }>;
    team: Array<{
      displayName: string;
      handle: string | null;
      profileStyle: MimoProfileStyle;
      role: 'owner' | 'admin' | 'host';
    }>;
  } | null>(null);
  const [error, setError] = useState('');
  const [following, setFollowing] = useState(false);
  const [accountSession, setAccountSession] = useState('');
  const [followWorking, setFollowWorking] = useState(false);
  const [followError, setFollowError] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  useEffect(() => {
    const session = window.localStorage.getItem('mimo:studio:session') ?? '';
    void fetch(`/api/communities/${slug}`, {
      cache: 'no-store',
      headers: session ? { 'x-mimo-account': session } : undefined,
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          community?: Community;
          events?: CommunityEventSummary[];
          standings?: Array<{
            nickname: string;
            points: number;
            eventsPlayed: number;
            wins: number;
          }>;
          team?: Array<{
            displayName: string;
            handle: string | null;
            profileStyle: MimoProfileStyle;
            role: 'owner' | 'admin' | 'host';
          }>;
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || 'Community could not load.');
        if (!body.community || !body.events || !body.standings || !body.team)
          throw new Error('Community could not load.');
        setData({
          community: body.community,
          events: body.events,
          standings: body.standings,
          team: body.team,
        });
        setAccountSession(session);
        setFollowing(Boolean(body.community.following));
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
  const nextTime = next?.startsAt ?? data.community.nextEventAt;
  const completed = data.events
    .filter((event) => event.status === 'complete')
    .sort((a, b) => b.createdAt - a.createdAt);
  const toggleFollow = async () => {
    if (followWorking) return;
    setFollowWorking(true);
    setFollowError('');
    const nextValue = !following;
    try {
      let session = accountSession;
      if (!session) {
        session = await signInWithNimiqPay(nimiq.current);
        window.localStorage.setItem('mimo:studio:session', session);
        setAccountSession(session);
      }
      const sendFollow = (token: string) =>
        fetch(`/api/communities/${slug}/follow`, {
          method: nextValue ? 'POST' : 'DELETE',
          headers: { 'x-mimo-account': token },
        });
      let response = await sendFollow(session);
      if (response.status === 401) {
        window.localStorage.removeItem('mimo:studio:session');
        session = await signInWithNimiqPay(nimiq.current);
        window.localStorage.setItem('mimo:studio:session', session);
        setAccountSession(session);
        response = await sendFollow(session);
      }
      const body = (await response.json()) as {
        following?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || 'Follow could not be updated.');
      }
      setFollowing(nextValue);
      setData((current) =>
        current
          ? {
              ...current,
              community: {
                ...current.community,
                following: nextValue,
                followerCount: Math.max(
                  0,
                  (current.community.followerCount ?? 0) + (nextValue ? 1 : -1),
                ),
              },
            }
          : current,
      );
    } catch (cause) {
      setFollowError(
        cause instanceof Error ? cause.message : 'Follow could not be updated.',
      );
    } finally {
      setFollowWorking(false);
    }
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
      <section className="border-b border-[#d7dfe4] pb-8">
        <div
          className="h-1 w-24 rounded-full"
          style={{ background: data.community.accentColor }}
        />
        <div className="grid gap-8 pt-6 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.75fr)]">
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
                onClick={() => void toggleFollow()}
                disabled={followWorking}
                aria-label={
                  following
                    ? `Unfollow ${data.community.name}`
                    : `Follow ${data.community.name}`
                }
                title={following ? 'Tap to unfollow' : undefined}
                variant="outline"
                className={`h-11 rounded-full px-4 font-extrabold ${following ? 'border-[#8fc9aa] bg-[#edf9f1] text-[#237044]' : 'bg-white'}`}
              >
                <Bell size={16} />{' '}
                {followWorking
                  ? 'Updating…'
                  : following
                    ? 'Following'
                    : 'Follow community'}
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
              {[
                ['X', data.community.xUrl],
                ['Discord', data.community.discordUrl],
                ['Telegram', data.community.telegramUrl],
              ].map(([label, url]) =>
                url ? (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d1dbe2] bg-white px-4 text-sm font-extrabold"
                  >
                    {label} <ExternalLink size={14} />
                  </a>
                ) : null,
              )}
            </div>
            <p className="mt-3 text-xs font-bold text-[#718295]">
              {data.community.followerCount ?? 0}{' '}
              {(data.community.followerCount ?? 0) === 1
                ? 'follower'
                : 'followers'}
            </p>
            {followError && (
              <p role="alert" className="mt-2 text-xs font-bold text-[#b53636]">
                {followError}
              </p>
            )}
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
      {data.team.length > 0 && (
        <section className="border-b border-[#d7dfe4] py-7">
          <p className="text-xs font-black uppercase tracking-[.13em] text-[#2577de]">
            Community team
          </p>
          <div className="mt-4 flex flex-wrap gap-x-7 gap-y-4">
            {data.team.map((member, index) => (
              <div
                key={`${member.handle ?? member.displayName}-${index}`}
                className="flex items-center gap-3"
              >
                <MimoProfileAvatar
                  profile={member.profileStyle}
                  nickname={member.displayName || member.role}
                />
                <div>
                  <strong className="block text-sm">
                    {member.displayName || 'Mimo host'}
                  </strong>
                  <span className="text-xs font-bold capitalize text-[#718295]">
                    {member.role}
                    {member.handle ? ` · @${member.handle}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {data.standings.length > 0 && (
        <section className="border-b border-[#d7dfe4] py-7">
          <div className="flex items-end justify-between gap-4 pb-4">
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
                className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[#e3e8eb] py-3"
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
        <section className="border-b border-[#d7dde1] py-7">
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
          <div className="mt-4 grid gap-x-7 sm:grid-cols-2 lg:grid-cols-3">
            {(showAllHistory ? completed : completed.slice(0, 3)).map(
              (event) => (
                <article
                  key={`${event.title}-${event.startsAt ?? event.roomCode}`}
                  className="border-t border-[#d8dfe4] py-4"
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
      <div className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
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

export function CommunityDirectory({
  openCommunity,
}: {
  openCommunity: (slug: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        void fetch(`/api/communities/discover?q=${encodeURIComponent(query)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
          .then(async (response) => {
            const body = (await response.json()) as {
              communities?: Community[];
            };
            if (response.ok) setCommunities(body.communities ?? []);
          })
          .finally(() => setLoading(false));
      },
      query ? 220 : 0,
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);
  return (
    <StudioShell>
      <p className="text-xs font-black uppercase tracking-[.15em] text-[#c94f3b]">
        Find your people
      </p>
      <div className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display max-w-2xl text-4xl font-extrabold tracking-[-.045em] sm:text-5xl">
          Communities that play here.
        </h1>
        <label className="flex h-12 w-full items-center gap-3 border-b-2 border-[#9eb0be] sm:max-w-sm">
          <Search size={19} className="text-[#60758a]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search communities"
            className="min-w-0 flex-1 bg-transparent font-bold outline-none"
          />
        </label>
      </div>
      <div className="mt-8 space-y-1">
        {communities.map((community) => (
          <button
            key={community.slug}
            onClick={() => openCommunity(community.slug)}
            className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-[22px] px-1 py-4 text-left transition hover:bg-white sm:gap-6 sm:px-3"
          >
            <CommunityAvatar community={community} />
            <span className="min-w-0">
              <strong className="block truncate text-lg">
                {community.name}
              </strong>
              <span className="mt-1 line-clamp-2 block text-sm text-[#60758a]">
                {community.description || `@${community.slug}`}
              </span>
              <span className="mt-2 block text-xs font-extrabold text-[#718295]">
                {community.followerCount ?? 0}{' '}
                {(community.followerCount ?? 0) === 1
                  ? 'follower'
                  : 'followers'}{' '}
                ·{' '}
                {community.recurrence === 'none'
                  ? 'Live events'
                  : `${recurrenceLabel(community.recurrence)} series`}
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm font-extrabold text-[#2577de]">
              <span className="hidden sm:inline">View</span>{' '}
              <ArrowRight size={18} />
            </span>
          </button>
        ))}
      </div>
      {!loading && communities.length === 0 && (
        <div className="py-16 text-center">
          <div className="mx-auto w-28">
            <MimoCharacter mood="thinking" />
          </div>
          <h2 className="mt-3 text-xl font-extrabold">
            No community found yet.
          </h2>
          <p className="mt-1 text-sm text-[#60758a]">
            Try another name or start the first one.
          </p>
        </div>
      )}
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
