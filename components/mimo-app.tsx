'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Crown,
  QrCode,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type Screen =
  | 'home'
  | 'join'
  | 'lobby'
  | 'pulse'
  | 'support'
  | 'skill'
  | 'finale'
  | 'results'
  | 'studio';

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: {
        name: string;
        title: string;
        description: string;
        inputSchema: object;
        annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
        execute: (input: unknown) => unknown;
      }, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

const people = [
  ['Ama', '#de765f'],
  ['Kofi', '#2878d4'],
  ['Zara', '#735fc9'],
  ['Theo', '#348b71'],
  ['Maya', '#ce8d22'],
  ['Jun', '#4d6385'],
  ['Liv', '#bc668b'],
  ['Dayo', '#327fa0'],
] as const;

function Logo() {
  return (
    <div className="font-display flex items-center text-[1.6rem] font-extrabold tracking-[-0.075em] text-[#203752]">
      mimo<span className="mb-5 ml-1 h-2.5 w-2.5 rounded-full bg-[#f6c431]" />
    </div>
  );
}

function Shell({ children, back, action }: { children: React.ReactNode; back?: () => void; action?: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#f6f4ef] text-[#16283d]">
      <header className="mx-auto flex h-[76px] max-w-[1180px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          {back && (
            <button onClick={back} aria-label="Go back" className="-ml-2 grid h-10 w-10 place-items-center rounded-full hover:bg-white">
              <ArrowLeft size={20} />
            </button>
          )}
          <Logo />
        </div>
        {action}
      </header>
      {children}
    </main>
  );
}

function MimoHost({ className = '' }: { className?: string }) {
  return (
    <Image
      src="/mimo-host.png"
      alt="Mimo, the smiling blue ribbon host"
      width={1254}
      height={1254}
      priority
      className={`select-none object-contain ${className}`}
    />
  );
}

function Funded() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[#fff4c9] px-3 py-1.5 text-sm font-bold text-[#6c5200]">
      <span className="h-2 w-2 rounded-full bg-[#efb900]" /> 250 NIM confirmed
    </span>
  );
}

export function MimoApp() {
  const [screen, setScreen] = useState<Screen>('home');
  const [name, setName] = useState('');
  const [side, setSide] = useState<'help' | 'show' | null>(null);
  const [backed, setBacked] = useState(false);
  const [order, setOrder] = useState(['Gather', 'Play', 'Prove', 'Drop']);
  const team = useMemo(() => (name.trim().length % 2 ? 'Signal' : 'Spark'), [name]);

  useEffect(() => {
    if (!document.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(document.modelContext.registerTool({
      name: 'start_mimo_event',
      title: 'Enter the live Mimo room',
      description: 'Starts the visible participant journey. Provide a room nickname to join immediately, or omit it to open nickname setup.',
      inputSchema: {
        type: 'object',
        properties: { nickname: { type: 'string', minLength: 1, maxLength: 18 } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: unknown) => {
        const candidate = typeof input === 'object' && input !== null && 'nickname' in input ? String(input.nickname).trim() : '';
        if (candidate.length > 18) throw new Error('Nickname must be 18 characters or fewer.');
        if (candidate) { setName(candidate); setScreen('lobby'); return { status: 'joined', nickname: candidate }; }
        setScreen('join');
        return { status: 'nickname_required' };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  if (screen === 'studio') return <Studio close={() => setScreen('home')} />;
  if (screen === 'home') return <CommunityHome join={() => setScreen('join')} studio={() => setScreen('studio')} />;

  return (
    <Shell back={() => setScreen(screen === 'join' ? 'home' : 'lobby')} action={<RoomStatus />}>
      {screen === 'join' && <Join name={name} setName={setName} next={() => name.trim() && setScreen('lobby')} />}
      {screen === 'lobby' && <Lobby name={name || 'You'} team={team} start={() => setScreen('pulse')} />}
      {screen === 'pulse' && <Pulse side={side} choose={setSide} next={() => side && setScreen('support')} />}
      {screen === 'support' && <Support backed={backed} backResponse={() => setBacked(true)} next={() => setScreen('skill')} />}
      {screen === 'skill' && <Skill order={order} setOrder={setOrder} next={() => setScreen('finale')} />}
      {screen === 'finale' && <Finale next={() => setScreen('results')} />}
      {screen === 'results' && <Results returnHome={() => setScreen('home')} />}
    </Shell>
  );
}

function RoomStatus() {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-[#496176]">
      <span className="pulse-dot h-2 w-2 rounded-full bg-[#36a66f]" /> Live · 24 here
    </div>
  );
}

function CommunityHome({ join, studio }: { join: () => void; studio: () => void }) {
  return (
    <Shell
      action={
        <button onClick={studio} className="text-sm font-bold text-[#40566c] hover:text-[#172d44]">
          Host a Mimo <span aria-hidden>↗</span>
        </button>
      }
    >
      <section className="mx-auto grid max-w-[1180px] gap-12 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:pt-14">
        <div className="enter">
          <div className="mb-7 flex flex-wrap items-center gap-3">
            <span className="text-sm font-extrabold uppercase tracking-[.14em] text-[#d36551]">Nimiq Africa</span>
            <span className="h-1 w-1 rounded-full bg-[#a3adba]" />
            <span className="text-sm font-semibold text-[#536a7f]">Friday community night</span>
          </div>
          <h1 className="font-display max-w-[740px] text-[clamp(3.4rem,8.2vw,6.9rem)] font-extrabold leading-[.88] tracking-[-.075em]">
            The room decides.
          </h1>
          <p className="mt-7 max-w-[600px] text-[1.15rem] leading-8 text-[#53677a]">
            Pick a side. Back your team. Solve the final challenge together. Mimo turns Friday night into a live community show.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button onClick={join} className="h-14 rounded-full bg-[#1f72d2] px-7 text-base font-extrabold hover:bg-[#195fac]">
              Enter the room <ArrowRight />
            </Button>
            <div className="flex items-center gap-3 px-2 py-2 text-sm text-[#53677a]">
              <div className="flex -space-x-2">
                {people.slice(0, 4).map(([person, color]) => (
                  <span key={person} style={{ background: color }} className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#f6f4ef] text-[11px] font-bold text-white">
                    {person[0]}
                  </span>
                ))}
              </div>
              <strong className="text-[#263d53]">24 people waiting</strong>
            </div>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-[#d9d9d3] pt-5 text-sm text-[#586d80]">
            <span className="flex items-center gap-2"><CalendarDays size={17} /> Tonight · 19:00 WAT</span>
            <span className="flex items-center gap-2"><Zap size={17} /> 5 live moments · 18 min</span>
            <Funded />
          </div>
        </div>

        <div className="relative mx-auto min-h-[500px] w-full max-w-[480px]">
          <div className="stage-orbit absolute left-1/2 top-1/2 h-[390px] w-[390px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c9d8e7]" />
          <div className="absolute left-3 top-16 rounded-full border bg-white px-4 py-2 text-sm font-bold shadow-[0_8px_24px_rgba(32,55,82,.08)]">Choose a side</div>
          <div className="absolute right-0 top-4 rounded-full bg-[#ffebe5] px-4 py-2 text-sm font-bold text-[#a94d3d]">Back a teammate</div>
          <div className="absolute bottom-16 right-2 rounded-full bg-[#203752] px-4 py-2 text-sm font-bold text-white">Everyone vs Mimo</div>
          <MimoHost className="absolute bottom-3 left-1/2 z-10 w-[390px] -translate-x-1/2" />
          <div className="absolute bottom-0 left-8 z-20 border-l-4 border-[#f6c431] pl-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#6c7b89]">Mimo says</p>
            <p className="font-display mt-1 text-lg font-extrabold">“No spectators tonight.”</p>
          </div>
        </div>
      </section>
    </Shell>
  );
}

function Join({ name, setName, next }: { name: string; setName: (name: string) => void; next: () => void }) {
  return (
    <section className="mx-auto grid max-w-[960px] gap-10 px-5 pb-16 pt-10 md:grid-cols-[.85fr_1.15fr] md:items-center">
      <div className="hidden md:block"><MimoHost className="mx-auto w-[320px]" /></div>
      <div>
        <p className="text-sm font-extrabold uppercase tracking-[.14em] text-[#d36551]">One tiny thing</p>
        <h1 className="font-display mt-3 text-5xl font-extrabold tracking-[-.055em]">What should the room call you?</h1>
        <p className="mt-4 max-w-lg text-lg leading-7 text-[#607285]">No registration form. Your wallet only enters later if you earn a NIM reward.</p>
        <label htmlFor="game-name" className="mt-9 block text-sm font-bold">Room name</label>
        <input id="game-name" value={name} maxLength={18} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && next()} placeholder="e.g. River" className="mt-2 h-16 w-full max-w-xl border-0 border-b-2 border-[#aeb9c4] bg-transparent px-0 text-2xl font-bold outline-none placeholder:text-[#a6afb8] focus:border-[#1f72d2]" />
        <Button onClick={next} disabled={!name.trim()} className="mt-8 h-13 rounded-full bg-[#1f72d2] px-7 text-base font-bold">Join everyone <ChevronRight /></Button>
        <p className="mt-5 flex items-center gap-2 text-sm text-[#607285]"><ShieldCheck size={17} /> Your wallet address is never shown in the room.</p>
      </div>
    </section>
  );
}

function Lobby({ name, team, start }: { name: string; team: string; start: () => void }) {
  return (
    <section className="mx-auto max-w-[1080px] px-5 pb-16 pt-8">
      <div className="grid gap-10 lg:grid-cols-[1fr_310px] lg:items-start">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[.14em] text-[#d36551]">Room MIMO–28</p>
          <h1 className="font-display mt-3 text-[clamp(3rem,7vw,5.8rem)] font-extrabold leading-[.94] tracking-[-.065em]">No audience.<br />Everyone plays.</h1>
          <div className="mt-9 border-y border-[#d8d8d2] py-5">
            <div className="flex flex-wrap gap-3">
              {people.map(([person, color], index) => (
                <div key={person} className="flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3">
                  <span style={{ background: color }} className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white">{index === 0 ? name[0]?.toUpperCase() : person[0]}</span>
                  <span className="text-sm font-bold">{index === 0 ? name : person}</span>
                </div>
              ))}
              <span className="px-2 py-2 text-sm font-bold text-[#65778a]">+16 more</span>
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[['01','Pulse','Read the room'],['02','Rally','Back your team'],['03','Finale','Beat Mimo together']].map(([number,title,copy]) => (
              <div key={number} className="border-l-2 border-[#bec8d1] pl-4"><span className="text-xs font-bold text-[#8b98a4]">{number}</span><p className="mt-2 font-display text-xl font-extrabold">{title}</p><p className="mt-1 text-sm text-[#617487]">{copy}</p></div>
            ))}
          </div>
        </div>
        <aside className="relative overflow-hidden rounded-[28px] bg-[#203752] p-6 text-white">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border border-white/15" />
          <p className="text-sm font-semibold text-[#aecaeb]">You’re on</p>
          <p className="font-display mt-2 text-4xl font-extrabold tracking-tight">Team {team}</p>
          <p className="mt-3 text-sm leading-6 text-[#c7d6e5]">Mimo balances teams as people arrive. Nobody is picked last.</p>
          <div className="mt-8 flex items-end gap-3"><MimoHost className="w-28" /><p className="mb-3 border-l-2 border-[#f6c431] pl-3 text-sm font-bold">“Ready when you are.”</p></div>
          <Button onClick={start} className="mt-5 h-12 w-full rounded-full bg-white font-extrabold text-[#203752] hover:bg-[#edf4fa]">Enter the show <ArrowRight /></Button>
        </aside>
      </div>
    </section>
  );
}

function ShowHeader({ eyebrow, title, progress }: { eyebrow: string; title: string; progress: string }) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-[#d8d8d2] pb-5">
      <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#d36551]">{eyebrow}</p><h1 className="font-display mt-2 text-[clamp(2rem,6vw,4rem)] font-extrabold tracking-[-.055em]">{title}</h1></div>
      <span className="mt-1 shrink-0 text-sm font-bold text-[#65778a]">{progress}</span>
    </div>
  );
}

function Pulse({ side, choose, next }: { side: 'help'|'show'|null; choose: (side:'help'|'show')=>void; next:()=>void }) {
  return (
    <section className="mx-auto max-w-[920px] px-5 pb-28 pt-6">
      <ShowHeader eyebrow="Pulse · The room speaks first" title="What should communities reward more?" progress="1 / 4" />
      <div className="mt-9 grid gap-4 sm:grid-cols-2">
        <button onClick={() => choose('help')} className={`group min-h-52 border-2 p-7 text-left transition ${side === 'help' ? 'border-[#1f72d2] bg-[#eaf3fc]' : 'border-[#d5d7d7] bg-white hover:border-[#8a9daf]'}`}>
          <span className="text-sm font-bold text-[#1f72d2]">SIDE A</span><p className="font-display mt-7 text-3xl font-extrabold">Helping others</p><p className="mt-3 text-[#617487]">The people who quietly move everyone forward.</p>
        </button>
        <button onClick={() => choose('show')} className={`group min-h-52 border-2 p-7 text-left transition ${side === 'show' ? 'border-[#d36551] bg-[#fff0eb]' : 'border-[#d5d7d7] bg-white hover:border-[#8a9daf]'}`}>
          <span className="text-sm font-bold text-[#d36551]">SIDE B</span><p className="font-display mt-7 text-3xl font-extrabold">Showing up</p><p className="mt-3 text-[#617487]">The people who make consistency visible.</p>
        </button>
      </div>
      <div className="mt-7 flex items-center justify-between"><p className="text-sm text-[#65778a]">No correct answer. This shapes tonight’s room.</p><Button onClick={next} disabled={!side} className="rounded-full bg-[#203752] px-6 font-bold">Lock my side <ArrowRight /></Button></div>
    </section>
  );
}

function Support({ backed, backResponse, next }: { backed:boolean; backResponse:()=>void; next:()=>void }) {
  return (
    <section className="mx-auto max-w-[920px] px-5 pb-20 pt-6">
      <ShowHeader eyebrow="Rally · Team Signal" title="Back the thought that deserves the room." progress="2 / 4" />
      <p className="mt-5 text-[#607285]">Your teammates answered: “What makes somebody unforgettable in a community?”</p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <article className={`relative border-2 p-6 ${backed ? 'border-[#1f72d2] bg-[#eff6fd]' : 'border-[#d5d7d7] bg-white'}`}>
          <p className="font-display text-2xl font-bold leading-8">“They notice who hasn’t spoken yet—and make room for them.”</p>
          <div className="mt-7 flex items-center justify-between"><span className="text-sm font-bold text-[#607285]">Ama · Team Signal</span><button onClick={backResponse} className="rounded-full bg-[#203752] px-4 py-2 text-sm font-bold text-white">{backed ? 'Backed ✓' : 'Back this'}</button></div>
        </article>
        <article className="border-2 border-[#d5d7d7] bg-white p-6">
          <p className="font-display text-2xl font-bold leading-8">“They keep their promises, especially the small ones.”</p>
          <div className="mt-7 flex items-center justify-between"><span className="text-sm font-bold text-[#607285]">Theo · Team Signal</span><span className="text-sm font-bold text-[#8b98a4]">7 backs</span></div>
        </article>
      </div>
      <div className="mt-8 flex justify-end"><Button onClick={next} className="rounded-full bg-[#1f72d2] px-6 font-bold">See what your team built <ArrowRight /></Button></div>
    </section>
  );
}

function Skill({ order, setOrder, next }: { order:string[]; setOrder:(value:string[])=>void; next:()=>void }) {
  const move = (index:number, direction:number) => { const target=index+direction; if(target<0||target>=order.length)return; const copy=[...order]; [copy[index],copy[target]]=[copy[target],copy[index]]; setOrder(copy); };
  return (
    <section className="mx-auto max-w-[920px] px-5 pb-20 pt-6">
      <ShowHeader eyebrow="Skill round · 20 seconds" title="Put a great community night in order." progress="3 / 4" />
      <p className="mt-5 text-[#607285]">Move the moments. Speed breaks the tie; correctness wins the points.</p>
      <div className="mt-7 divide-y border-y border-[#ccd2d7]">
        {order.map((item,index)=><div key={item} className="flex items-center gap-4 bg-white px-4 py-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eaf3fc] font-bold text-[#1f72d2]">{index+1}</span><span className="font-display flex-1 text-xl font-extrabold">{item}</span><div className="flex gap-1"><button onClick={()=>move(index,-1)} aria-label={`Move ${item} up`} className="grid h-9 w-9 place-items-center rounded-full border">↑</button><button onClick={()=>move(index,1)} aria-label={`Move ${item} down`} className="grid h-9 w-9 place-items-center rounded-full border">↓</button></div></div>)}
      </div>
      <div className="mt-8 flex justify-end"><Button onClick={next} className="rounded-full bg-[#203752] px-6 font-bold">Lock sequence <ArrowRight /></Button></div>
    </section>
  );
}

function Finale({ next }: { next:()=>void }) {
  return (
    <section className="mx-auto max-w-[980px] px-5 pb-16 pt-6 text-center">
      <p className="text-sm font-extrabold uppercase tracking-[.16em] text-[#d36551]">Finale · Everyone vs Mimo</p>
      <h1 className="font-display mx-auto mt-3 max-w-3xl text-[clamp(3rem,8vw,6rem)] font-extrabold leading-[.9] tracking-[-.07em]">Can the whole room agree?</h1>
      <p className="mx-auto mt-5 max-w-xl text-lg leading-7 text-[#607285]">Reach 80% agreement before time runs out. If the room wins, every active player earns the finale bonus.</p>
      <div className="relative mx-auto mt-10 h-7 max-w-2xl overflow-hidden rounded-full bg-[#dfe4e7]"><div className="h-full w-[86%] rounded-full bg-[#1f72d2]"/><span className="absolute inset-0 grid place-items-center text-xs font-extrabold text-white">86% — ROOM WINS</span></div>
      <div className="mx-auto mt-8 flex max-w-lg items-center justify-center gap-4"><MimoHost className="w-32"/><div className="border-l-4 border-[#f6c431] pl-4 text-left"><p className="font-display text-2xl font-extrabold">“Okay, okay—you got me.”</p><p className="mt-1 text-sm text-[#607285]">Collective bonus unlocked · +300 each</p></div></div>
      <Button onClick={next} className="mt-8 h-13 rounded-full bg-[#1f72d2] px-7 font-bold">Reveal the night <Sparkles /></Button>
    </section>
  );
}

function Results({ returnHome }: { returnHome:()=>void }) {
  return (
    <section className="mx-auto max-w-[1040px] px-5 pb-16 pt-6">
      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[.16em] text-[#d36551]">Tonight belongs to the room</p>
          <h1 className="font-display mt-3 text-[clamp(3.5rem,8vw,6.5rem)] font-extrabold leading-[.88] tracking-[-.07em]">Team Signal<br />takes the night.</h1>
          <div className="mt-8 flex gap-8 border-y border-[#d7d7d1] py-5"><div><p className="text-sm text-[#6a7b8a]">Your place</p><p className="font-display mt-1 text-3xl font-extrabold">#4</p></div><div><p className="text-sm text-[#6a7b8a]">Contribution</p><p className="font-display mt-1 text-3xl font-extrabold">3,840</p></div><div><p className="text-sm text-[#6a7b8a]">Room streak</p><p className="font-display mt-1 text-3xl font-extrabold">3</p></div></div>
          <div className="mt-7 flex flex-wrap gap-3"><Button onClick={returnHome} className="rounded-full bg-[#203752] px-6 font-bold">Next Friday is booked <CalendarDays /></Button><Button variant="outline" className="rounded-full bg-transparent px-6 font-bold">Share the recap</Button></div>
        </div>
        <aside className="border-l border-[#d4d7d7] pl-7">
          <Funded />
          <p className="mt-6 text-sm font-bold text-[#637587]">YOUR RECOGNITION</p><p className="font-display mt-2 text-4xl font-extrabold">15 NIM</p>
          <div className="mt-5 border-y border-[#d4d7d7] py-4"><p className="flex items-center gap-2 font-bold text-[#765f12]"><WalletCards size={19}/> Creator approval required</p><p className="mt-2 text-sm leading-6 text-[#647588]">No payment has been sent. You’ll approve wallet connection only after the creator verifies results.</p></div>
          <p className="mt-6 flex items-center gap-2 text-sm text-[#607285]"><ShieldCheck size={17}/> Rules locked before play</p>
          <p className="mt-3 flex items-center gap-2 text-sm text-[#607285]"><Check size={17}/> Server-verified participation</p>
        </aside>
      </div>
    </section>
  );
}

function Studio({ close }: { close:()=>void }) {
  const [copied,setCopied]=useState(false);
  return (
    <Shell back={close} action={<button className="text-sm font-bold text-[#40566c]">Preview as player ↗</button>}>
      <section className="mx-auto max-w-[1140px] px-5 pb-16 pt-7 sm:px-8">
        <div className="flex flex-col justify-between gap-5 border-b border-[#d5d6d2] pb-8 sm:flex-row sm:items-end">
          <div><p className="text-sm font-extrabold uppercase tracking-[.14em] text-[#d36551]">Nimiq Africa · Studio</p><h1 className="font-display mt-3 text-5xl font-extrabold tracking-[-.055em]">What do you want to host?</h1></div>
          <Button className="h-12 rounded-full bg-[#1f72d2] px-6 font-bold"><Sparkles /> Draft with Mimo</Button>
        </div>
        <div className="grid gap-9 pt-8 lg:grid-cols-[1fr_310px]">
          <div>
            <p className="mb-4 text-sm font-bold text-[#647588]">START FROM A MOMENT</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[['Game night','Bring everyone into the room'],['Launch show','Let the crowd shape the reveal'],['Onboarding','Turn first steps into team play']].map(([title,copy],index)=><button key={title} className={`min-h-44 p-5 text-left ${index===0?'bg-[#203752] text-white':'border border-[#cdd2d6] bg-transparent'}`}><span className="text-xs font-bold opacity-60">0{index+1}</span><p className="font-display mt-9 text-2xl font-extrabold">{title}</p><p className={`mt-2 text-sm leading-5 ${index===0?'text-[#c9d8e7]':'text-[#647588]'}`}>{copy}</p></button>)}
            </div>
            <div className="mt-8 flex items-center justify-between border-y border-[#d5d6d2] py-5"><div><p className="font-display text-2xl font-extrabold">Friday Community Signal</p><p className="mt-1 text-sm text-[#647588]">5 moments · 18 minutes · recurring weekly</p></div><button className="text-sm font-bold text-[#1f72d2]">Edit show →</button></div>
          </div>
          <aside>
            <div className="flex items-center justify-between"><span className="text-sm font-bold text-[#647588]">FRIDAY · 19:00</span><span className="rounded-full bg-[#e7f4eb] px-3 py-1 text-xs font-bold text-[#2e7751]">READY</span></div>
            <h2 className="font-display mt-4 text-3xl font-extrabold">The room decides.</h2>
            <div className="mt-5 space-y-3 border-y border-[#d5d6d2] py-5 text-sm"><p className="flex justify-between"><span className="text-[#647588]">Registered</span><strong>24 people</strong></p><p className="flex justify-between"><span className="text-[#647588]">Reward</span><strong>250 NIM confirmed</strong></p><p className="flex justify-between"><span className="text-[#647588]">Payout</span><strong>Manual approval</strong></p></div>
            <div className="mt-5 grid grid-cols-2 gap-2"><Button variant="outline" className="rounded-full bg-transparent"><QrCode/> QR</Button><Button variant="outline" onClick={()=>{void navigator.clipboard?.writeText('https://mimo.game/nimiq-africa/friday');setCopied(true)}} className="rounded-full bg-transparent">{copied?<Check/>:<Copy/>}{copied?'Copied':'Invite'}</Button></div>
            <Button className="mt-3 h-12 w-full rounded-full bg-[#203752] font-bold"><Crown/> Open host room</Button>
          </aside>
        </div>
      </section>
    </Shell>
  );
}
