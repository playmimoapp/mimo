'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, Coins, Gamepad2, Gift, LockKeyhole, Plus, Radio, ShieldCheck, Sparkles, Trophy, Users, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Screen = 'invite' | 'create' | 'join' | 'lobby' | 'pulse' | 'support' | 'skill' | 'finale' | 'results';
type Side = 'help' | 'show';
type RewardMode = 'free' | 'nim';

type EventDraft = {
  title: string;
  community: string;
  rewardMode: RewardMode;
  rewardAmount: string;
};

const roomPeople = [
  ['Ama', '#d96b58'], ['Kofi', '#2374cf'], ['Zara', '#6d5bc5'], ['Theo', '#2c866c'],
  ['Maya', '#c9871d'], ['Jun', '#495f80'], ['Liv', '#b85f85'], ['Dayo', '#2f7b9c'],
  ['Noah', '#766a58'], ['Ife', '#657e3f'], ['Rae', '#a85545'], ['Sam', '#42658f'],
] as const;

const hostLines = ['Ama just joined Team Blue', 'The room is warming up', 'Mimo is ready when you are'];

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

function Logo() {
  return <Image src="/mimo-logo.svg" alt="Mimo" width={180} height={64} priority className="h-8 w-auto sm:h-10" />;
}

function Mascot({ mood = 'calm', className = '' }: { mood?: 'calm' | 'happy' | 'thinking'; className?: string }) {
  return <Image src="/mimo-host.png" alt="Mimo, the smiling blue ribbon host" width={1254} height={1254} priority className={`select-none object-contain ${mood === 'thinking' ? 'mimo-think' : mood === 'happy' ? 'mimo-happy' : 'mimo-breathe'} ${className}`} />;
}

function Header({ back, step, host }: { back?: () => void; step?: string; host?: () => void }) {
  return (
    <header className="mx-auto flex h-[72px] max-w-[1120px] items-center justify-between px-5 sm:px-8">
      <div className="flex items-center gap-2">{back && <button onClick={back} aria-label="Go back" className="-ml-2 grid h-10 w-10 place-items-center rounded-full hover:bg-white"><ArrowLeft size={19} /></button>}<Logo /></div>
      {step ? <span className="rounded-full border border-[#d5d7d7] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.12em] text-[#5d7082]">{step}</span> : host ? <button onClick={host} className="flex h-10 items-center gap-2 rounded-full border border-[#cbd4dc] bg-white px-4 text-sm font-extrabold text-[#29445f] transition hover:-translate-y-0.5 hover:border-[#8ba9c3]"><Plus size={16}/> Host a Mimo</button> : null}
    </header>
  );
}

export function MimoApp() {
  const reduceMotion = useReducedMotion();
  const [screen, setScreen] = useState<Screen>('invite');
  const [name, setName] = useState('');
  const [side, setSide] = useState<Side | null>(null);
  const [response, setResponse] = useState('');
  const [sentResponse, setSentResponse] = useState('');
  const [backed, setBacked] = useState<number | null>(null);
  const [order, setOrder] = useState(['Play', 'Invite', 'Drop', 'Gather']);
  const [skillScore, setSkillScore] = useState(0);
  const [event, setEvent] = useState<EventDraft>({ title: 'Nimiq Africa Friday Night', community: 'Nimiq Africa', rewardMode: 'nim', rewardAmount: '250' });

  useEffect(() => {
    if (!document.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(document.modelContext.registerTool({
      name: 'join_mimo_demo', title: 'Join the Mimo demo room',
      description: 'Open the playable Mimo event. Add a nickname to go straight to the room.',
      inputSchema: { type: 'object', properties: { nickname: { type: 'string', minLength: 1, maxLength: 18 } }, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: unknown) => {
        const candidate = typeof input === 'object' && input && 'nickname' in input ? String(input.nickname).trim() : '';
        if (candidate.length > 18) throw new Error('Use 18 characters or fewer.');
        if (candidate) { setName(candidate); setScreen('lobby'); return { status: 'joined', nickname: candidate }; }
        setScreen('join'); return { status: 'name_needed' };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const back = () => setScreen(screen === 'join' || screen === 'create' ? 'invite' : 'lobby');
  const playSteps: Screen[] = ['join','lobby','pulse','support','skill','finale','results'];
  return (
    <main className="min-h-dvh overflow-hidden bg-[#f6f4ef] text-[#16283d]">
      <Header back={screen !== 'invite' ? back : undefined} host={screen === 'invite' ? () => setScreen('create') : undefined} step={playSteps.includes(screen) ? `${playSteps.indexOf(screen) + 1} / 7` : undefined} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={screen} initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }} transition={{ duration: reduceMotion ? 0 : .24, ease: [0.22, 1, 0.36, 1] }}>
          {screen === 'invite' && <Invite event={event} next={() => setScreen('join')} create={() => setScreen('create')} />}
          {screen === 'create' && <CreateEvent event={event} setEvent={setEvent} preview={() => setScreen('invite')} />}
          {screen === 'join' && <Join name={name} setName={setName} next={() => name.trim() && setScreen('lobby')} />}
          {screen === 'lobby' && <Lobby name={name || 'You'} next={() => setScreen('pulse')} />}
          {screen === 'pulse' && <Pulse side={side} setSide={setSide} next={() => setScreen('support')} />}
          {screen === 'support' && <Support response={response} setResponse={setResponse} sent={sentResponse} send={() => setSentResponse(response.trim())} backed={backed} setBacked={setBacked} next={() => setScreen('skill')} />}
          {screen === 'skill' && <Skill order={order} setOrder={setOrder} lock={(score) => { setSkillScore(score); setScreen('finale'); }} />}
          {screen === 'finale' && <Finale next={() => setScreen('results')} />}
          {screen === 'results' && <Results event={event} name={name || 'You'} skillScore={skillScore} restart={() => { setScreen('invite'); setSide(null); setResponse(''); setSentResponse(''); setBacked(null); setOrder(['Play','Invite','Drop','Gather']); }} />}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

function Invite({ event, next, create }: { event: EventDraft; next: () => void; create: () => void }) {
  const [faces, setFaces] = useState(4);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const arrivals = window.setInterval(() => setFaces(value => Math.min(value + 1, roomPeople.length)), 850);
    const host = window.setInterval(() => setBeat(value => (value + 1) % hostLines.length), 2200);
    return () => { window.clearInterval(arrivals); window.clearInterval(host); };
  }, []);
  return (
    <section className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1120px] gap-7 px-5 pb-12 pt-4 sm:px-8 lg:grid-cols-[.96fr_1.04fr] lg:items-center">
      <div className="enter order-2 z-10 py-2 lg:order-1 lg:py-5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-[.14em] text-[#536d84]"><span className="flex items-center gap-1.5 text-[#c94f3b]"><Radio size={15}/> Demo event</span><span aria-hidden="true">·</span><span>{event.community}</span></div>
        <h1 className="font-display mt-3 max-w-[640px] text-[clamp(2.7rem,12vw,6.7rem)] font-extrabold leading-[.89] tracking-[-.072em] lg:mt-5">{event.title}</h1>
        <p className="mt-3 max-w-[570px] text-base font-medium leading-7 text-[#53697c] sm:text-lg sm:leading-8 lg:mt-6">Five fast rounds. Two teams. Everyone plays.</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-y border-[#d2d7d8] py-3 text-sm font-bold text-[#425a70] lg:mt-7 lg:gap-x-5 lg:gap-y-3 lg:py-4">
          <span className="flex items-center gap-2"><Users size={18} className="text-[#2175d5]"/> {faces + 12} joining</span>
          <span className="flex items-center gap-2"><CalendarDays size={18} className="text-[#2175d5]"/> Starts now</span>
          {event.rewardMode === 'nim' ? <span className="flex items-center gap-2 text-[#755700]"><Coins size={18}/> {event.rewardAmount || '0'} NIM skill rewards</span> : <span className="flex items-center gap-2"><Gamepad2 size={18}/> Free community game</span>}
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center lg:mt-7">
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: .97 }}><Button onClick={next} className="h-14 rounded-full bg-[#1f72d2] px-7 text-base font-extrabold hover:bg-[#185fac]">Join this room <ArrowRight /></Button></motion.div>
          <button onClick={create} className="h-14 px-5 text-sm font-extrabold text-[#28465f] underline decoration-[#9ab0c3] underline-offset-4 hover:text-[#1f72d2]">Create your own</button>
        </div>
        <p className="mt-3 max-w-[520px] text-xs leading-5 text-[#748492]">This is a playable demo. It never moves money. A live NIM event asks the host to approve every payment in Nimiq Pay.</p>
      </div>
      <div className="mimo-stage relative order-1 mx-auto h-[245px] w-full max-w-[520px] overflow-hidden rounded-[28px] bg-[#e8f3ff] sm:h-[420px] sm:rounded-[36px] lg:order-2 lg:h-[520px]">
        <div className="absolute inset-x-4 top-4 z-20 flex items-center justify-between sm:inset-x-6 sm:top-5"><span className="rounded-full bg-white px-3 py-2 text-xs font-extrabold text-[#31506b] shadow-[0_6px_20px_rgba(39,77,111,.1)]">LIVE ROOM</span><motion.span animate={{ y: [0,-10,0], rotate: [-7,8,-7], scale: [.95,1.14,.95] }} transition={{ duration: 1.9, repeat: Infinity }} className="text-2xl sm:text-3xl" aria-hidden="true">🙌</motion.span></div>
        <AnimatePresence mode="wait"><motion.div key={hostLines[beat]} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .26 }} className="host-line absolute left-4 top-16 z-30 max-w-[170px] bg-[#203752] px-3 py-2 text-xs font-bold leading-4 text-white shadow-[0_12px_28px_rgba(32,55,82,.18)] sm:left-5 sm:top-20 sm:max-w-[230px] sm:px-4 sm:py-3 sm:text-sm sm:leading-5">{hostLines[beat]}</motion.div></AnimatePresence>
        <div className="absolute -bottom-7 left-1/2 z-10 w-[225px] -translate-x-1/2 sm:-bottom-9 sm:w-[335px] lg:w-[390px]"><motion.div animate={{ y: [0,-9,0], rotate: [-1,1.4,-1] }} whileHover={{ scale: 1.025, rotate: -2 }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}><Mascot mood="calm" className="w-full" /></motion.div></div>
        <AnimatePresence>{roomPeople.slice(0, faces).map(([person, color], index) => <motion.span layout key={person} initial={{ opacity: 0, scale: .4, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} whileHover={{ y: -7, scale: 1.08, zIndex: 40 }} transition={{ type: 'spring', stiffness: 410, damping: 23, delay: index * .035 }} style={{ background: color }} className={`absolute z-20 grid h-11 w-11 place-items-center rounded-full border-[3px] border-[#e8f3ff] text-xs font-extrabold text-white person-${index}`}>{person[0]}</motion.span>)}</AnimatePresence>
        <div className="absolute bottom-0 inset-x-0 h-20 bg-[linear-gradient(180deg,transparent,#cfe6fb)]" />
      </div>
    </section>
  );
}

function CreateEvent({ event, setEvent, preview }: { event: EventDraft; setEvent: (event: EventDraft) => void; preview: () => void }) {
  const update = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => setEvent({ ...event, [key]: value });
  return <section className="mx-auto grid max-w-[1000px] gap-10 px-5 pb-16 pt-6 lg:grid-cols-[1fr_340px]">
    <div>
      <p className="text-sm font-extrabold uppercase tracking-[.14em] text-[#cf624e]">Create a live event</p>
      <h1 className="font-display mt-3 max-w-[680px] text-[clamp(2.8rem,7vw,5.2rem)] font-extrabold leading-[.92] tracking-[-.065em]">What do you want to host?</h1>
      <div className="mt-9 grid gap-7">
        <label className="grid gap-2 text-sm font-extrabold">Community<input value={event.community} onChange={e => update('community', e.target.value)} className="h-14 border-0 border-b-2 border-[#b7c0c7] bg-transparent text-xl font-bold outline-none focus:border-[#1f72d2]" /></label>
        <label className="grid gap-2 text-sm font-extrabold">Event name<input value={event.title} onChange={e => update('title', e.target.value)} className="h-14 border-0 border-b-2 border-[#b7c0c7] bg-transparent text-xl font-bold outline-none focus:border-[#1f72d2]" /></label>
        <fieldset><legend className="text-sm font-extrabold">How should this event run?</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">
          <motion.button whileHover={{ y: -4, rotate: -.35 }} whileTap={{ scale: .985 }} onClick={() => update('rewardMode','free')} className={`min-h-32 border-2 p-5 text-left transition ${event.rewardMode === 'free' ? 'border-[#1f72d2] bg-[#edf6ff]' : 'border-[#d5dade] bg-white'}`}><Gamepad2 className="text-[#1f72d2]"/><strong className="mt-4 block text-lg">Free game</strong><span className="mt-1 block text-sm text-[#617486]">Play together. No wallet needed.</span></motion.button>
          <motion.button whileHover={{ y: -4, rotate: .35 }} whileTap={{ scale: .985 }} onClick={() => update('rewardMode','nim')} className={`min-h-32 border-2 p-5 text-left transition ${event.rewardMode === 'nim' ? 'border-[#d09a00] bg-[#fff7d9]' : 'border-[#d5dade] bg-white'}`}><Gift className="text-[#a87600]"/><strong className="mt-4 block text-lg">NIM reward</strong><span className="mt-1 block text-sm text-[#617486]">Reward declared skill or participation.</span></motion.button>
        </div></fieldset>
        {event.rewardMode === 'nim' && <label className="grid gap-2 text-sm font-extrabold">Total reward<input inputMode="numeric" value={event.rewardAmount} onChange={e => update('rewardAmount', e.target.value.replace(/[^0-9]/g,''))} className="h-14 max-w-[260px] border-0 border-b-2 border-[#d0a62d] bg-transparent text-2xl font-extrabold outline-none"/><span className="text-xs font-medium text-[#6f7e8b]">NIM · funding comes later, after rules are locked</span></label>}
      </div>
      <Button onClick={preview} disabled={!event.title.trim() || !event.community.trim()} className="mt-9 h-13 rounded-full bg-[#203752] px-7 font-extrabold">Preview invitation <ArrowRight/></Button>
    </div>
    <aside className="self-start bg-[#203752] p-6 text-white lg:sticky lg:top-6"><Mascot className="mx-auto w-[170px]"/><p className="font-display mt-2 text-2xl font-extrabold">Start simple.</p><p className="mt-3 text-sm leading-6 text-[#c9d8e5]">Free rooms bring people together. NIM rooms add a clear reward to rules the host approves before play.</p><div className="mt-5 border-t border-white/15 pt-5 text-sm font-bold text-[#f6d66a]">Next: add rounds → rehearse → publish</div></aside>
  </section>;
}

function Join({ name, setName, next }: { name:string; setName:(value:string)=>void; next:()=>void }) {
  return <section className="mx-auto grid max-w-[920px] items-center gap-8 px-5 pb-12 pt-10 md:grid-cols-[290px_1fr]"><Mascot className="mx-auto hidden w-[260px] md:block"/><div><p className="text-sm font-extrabold uppercase tracking-[.15em] text-[#cf624e]">Mimo needs a name</p><h1 className="font-display mt-3 text-[clamp(2.7rem,7vw,5rem)] font-extrabold leading-[.95] tracking-[-.065em]">What should everyone call you?</h1><p className="mt-4 text-lg text-[#5b7082]">No account. No password. Your wallet waits until a reward is ready.</p><label htmlFor="nickname" className="mt-9 block text-sm font-extrabold">Your room name</label><input id="nickname" value={name} maxLength={18} onChange={event=>setName(event.target.value)} onKeyDown={event=>event.key==='Enter'&&next()} placeholder="e.g. River" className="mt-2 h-16 w-full border-0 border-b-2 border-[#a9b4bd] bg-transparent text-2xl font-bold outline-none placeholder:text-[#a8afb6] focus:border-[#1f72d2]"/><div className="mt-8 flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm text-[#637688]"><ShieldCheck size={17}/>Your wallet stays private</span><Button onClick={next} disabled={!name.trim()} className="h-12 rounded-full bg-[#1f72d2] px-6 font-bold">That’s me <ChevronRight/></Button></div></div></section>;
}

function Lobby({ name, next }: { name:string; next:()=>void }) {
  const [count, setCount] = useState(8);
  const [seconds, setSeconds] = useState(8);
  const [reaction, setReaction] = useState('');
  useEffect(() => { const arrivals=window.setInterval(()=>setCount(value=>Math.min(value+1,roomPeople.length)),600); const clock=window.setInterval(()=>setSeconds(value=>Math.max(0,value-1)),1000); return()=>{window.clearInterval(arrivals);window.clearInterval(clock)}; },[]);
  return <section className="mx-auto max-w-[1040px] px-5 pb-12 pt-5"><div className="grid gap-8 lg:grid-cols-[1fr_320px]"><div><p className="text-sm font-extrabold uppercase tracking-[.15em] text-[#cf624e]">You’re in · Team Signal</p><h1 className="font-display mt-3 text-[clamp(3rem,7vw,6rem)] font-extrabold leading-[.88] tracking-[-.07em]">Watch the room come alive.</h1><div className="mt-8 flex min-h-40 flex-wrap content-start gap-3 border-y border-[#d3d5d3] py-5">{roomPeople.slice(0,count).map(([person,color],index)=><div key={person} className="arrival flex h-11 items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3"><span style={{background:color}} className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white">{index===0?name[0]?.toUpperCase():person[0]}</span><strong className="text-sm">{index===0?name:person}</strong></div>)}</div><div className="mt-6 flex items-center gap-3"><span className="text-sm font-bold text-[#637688]">Say hello without a chat box</span>{['👋','🔥','💙','🙌'].map(emoji=><button onClick={()=>setReaction(emoji)} key={emoji} className="grid h-11 w-11 place-items-center rounded-full border border-[#cfd4d7] bg-white text-xl transition hover:-translate-y-1">{emoji}</button>)}{reaction&&<span className="reaction-pop text-2xl" aria-live="polite">{reaction}</span>}</div></div><aside className="relative overflow-hidden rounded-[30px] bg-[#203752] p-6 text-white"><p className="text-sm font-bold text-[#aec7df]">Mimo is starting in</p><p className="font-display mt-2 text-7xl font-extrabold">{seconds}</p><Mascot mood={seconds<4?'happy':'calm'} className="mx-auto mt-2 w-[180px]"/><p className="mt-1 text-center text-sm font-bold text-[#cad8e5]">{count+12} people are here</p><Button onClick={next} className="mt-5 h-12 w-full rounded-full bg-white font-extrabold text-[#203752] hover:bg-[#eef5fa]">{seconds===0?'Start now':'I’m ready'} <ArrowRight/></Button></aside></div></section>;
}

function RoundTop({ label, title, time }: { label:string; title:string; time:number }) {
  return <div className="flex items-start justify-between gap-5 border-b border-[#d1d4d3] pb-5"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#cf624e]">{label}</p><h1 className="font-display mt-3 max-w-[760px] text-[clamp(2.4rem,6.5vw,4.8rem)] font-extrabold leading-[.96] tracking-[-.06em]">{title}</h1></div><div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-[#e08b79] font-display text-xl font-extrabold text-[#b44e3c]">{time}</div></div>;
}

function Pulse({ side, setSide, next }: { side:Side|null; setSide:(side:Side)=>void; next:()=>void }) {
  const [time,setTime]=useState(15); const [votes,setVotes]=useState([9,8]);
  useEffect(()=>{const clock=window.setInterval(()=>setTime(value=>Math.max(0,value-1)),1000);const room=window.setInterval(()=>setVotes(([a,b])=>Math.random()>.46?[a+1,b]:[a,b+1]),720);return()=>{window.clearInterval(clock);window.clearInterval(room)}},[]);
  const total=votes[0]+votes[1];
  return <section className="mx-auto max-w-[960px] px-5 pb-20 pt-5"><RoundTop label="The pulse · no wrong answer" title="What should a community reward more?" time={time}/><div className="mt-8 grid gap-4 sm:grid-cols-2">{([['help','Helping others','The people who quietly move everyone forward.'],['show','Showing up','The people who make consistency visible.']] as const).map(([value,title,copy],index)=><button key={value} onClick={()=>setSide(value)} className={`relative min-h-52 overflow-hidden border-2 p-6 text-left transition ${side===value?(index?'border-[#d56652] bg-[#fff0eb]':'border-[#1f72d2] bg-[#edf5fd]'):'border-[#d1d5d6] bg-white hover:-translate-y-1'}`}><span className="text-xs font-extrabold text-[#70808e]">SIDE {index?'B':'A'}</span><p className="font-display mt-8 text-3xl font-extrabold">{title}</p><p className="mt-2 text-[#617486]">{copy}</p>{side&&<div className="absolute inset-x-0 bottom-0 h-2 bg-[#e2e7e9]"><div className={`h-full ${index?'bg-[#d56652]':'bg-[#1f72d2]'}`} style={{width:`${Math.round(votes[index]/total*100)}%`}}/></div>}</button>)}</div>{side&&<div className="enter mt-6 flex items-center justify-between gap-4"><p className="font-bold text-[#53697c]">The room is moving: {Math.round(votes[0]/total*100)}% help · {Math.round(votes[1]/total*100)}% show up</p><Button onClick={next} className="rounded-full bg-[#203752] px-6 font-bold">See your team <ArrowRight/></Button></div>}</section>;
}

function Support({ response,setResponse,sent,send,backed,setBacked,next }: { response:string;setResponse:(value:string)=>void;sent:string;send:()=>void;backed:number|null;setBacked:(value:number)=>void;next:()=>void }) {
  const answers = useMemo(()=>[sent || 'They make room for the quiet person.', 'They keep the small promises.', 'They help before anyone asks.'],[sent]);
  if(!sent)return <section className="mx-auto max-w-[820px] px-5 pb-20 pt-5"><RoundTop label="Your voice · Team Signal" title="What makes someone unforgettable in a community?" time={20}/><textarea value={response} onChange={event=>setResponse(event.target.value)} maxLength={120} placeholder="Write one honest sentence…" className="mt-9 min-h-44 w-full resize-none border-0 border-b-2 border-[#aeb8c0] bg-transparent text-2xl font-bold leading-9 outline-none placeholder:text-[#a1aab2] focus:border-[#1f72d2]"/><div className="mt-5 flex items-center justify-between"><span className="text-sm text-[#667989]">{response.length}/120 · Your team sees this</span><Button onClick={send} disabled={!response.trim()} className="rounded-full bg-[#1f72d2] px-6 font-bold">Send to my team <ArrowRight/></Button></div></section>;
  return <section className="mx-auto max-w-[900px] px-5 pb-20 pt-5"><RoundTop label="Your team answered" title="Back the thought that deserves the room." time={12}/><div className="mt-7 divide-y border-y border-[#ccd2d5]">{answers.map((answer,index)=><article key={answer} className={`flex flex-col gap-5 px-2 py-5 sm:flex-row sm:items-center ${backed===index?'text-[#145b9d]':''}`}><p className="font-display flex-1 text-xl font-extrabold">“{answer}”</p><button onClick={()=>setBacked(index)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${backed===index?'bg-[#1f72d2] text-white':'border border-[#bdc7ce]'}`}>{backed===index?'Backed ✓':'Back this'}</button></article>)}</div>{backed!==null&&<div className="mt-7 flex justify-end"><Button onClick={next} className="rounded-full bg-[#203752] px-6 font-bold">Next moment <ArrowRight/></Button></div>}</section>;
}

function Skill({ order,setOrder,lock }: { order:string[];setOrder:(value:string[])=>void;lock:(score:number)=>void }) {
  const [time,setTime]=useState(18); useEffect(()=>{const timer=window.setInterval(()=>setTime(value=>Math.max(0,value-1)),1000);return()=>window.clearInterval(timer)},[]);
  const correct=['Invite','Gather','Play','Drop'];
  const move=(index:number,direction:number)=>{const target=index+direction;if(target<0||target>=order.length)return;const copy=[...order];[copy[index],copy[target]]=[copy[target],copy[index]];setOrder(copy)};
  const score=order.reduce((sum,item,index)=>sum+(item===correct[index]?250:0),0)+time*10;
  return <section className="mx-auto max-w-[860px] px-5 pb-20 pt-5"><RoundTop label="Skill round · speed breaks the tie" title="Put the night in the right order." time={time}/><div className="mt-7 divide-y border-y border-[#cbd1d4]">{order.map((item,index)=><div key={item} className="flex items-center gap-4 bg-white px-4 py-4"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#eaf3fb] font-extrabold text-[#1f72d2]">{index+1}</span><strong className="font-display flex-1 text-xl">{item}</strong><button onClick={()=>move(index,-1)} aria-label={`Move ${item} up`} className="grid h-9 w-9 place-items-center rounded-full border">↑</button><button onClick={()=>move(index,1)} aria-label={`Move ${item} down`} className="grid h-9 w-9 place-items-center rounded-full border">↓</button></div>)}</div><div className="mt-7 flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-[#647788]"><LockKeyhole size={16}/>The server scores after you lock</span><Button onClick={()=>lock(score)} className="rounded-full bg-[#203752] px-6 font-bold">Lock my order <ArrowRight/></Button></div></section>;
}

function Finale({ next }: { next:()=>void }) {
  const [progress,setProgress]=useState(22); const [taps,setTaps]=useState(0);
  useEffect(()=>{const room=window.setInterval(()=>setProgress(value=>Math.min(100,value+(value<82?2:0))),850);return()=>window.clearInterval(room)},[]);
  const hit=()=>{setTaps(value=>value+1);setProgress(value=>Math.min(100,value+6))};
  return <section className="mx-auto max-w-[960px] px-5 pb-16 pt-5 text-center"><p className="text-sm font-extrabold uppercase tracking-[.16em] text-[#cf624e]">The finale · everyone vs Mimo</p><h1 className="font-display mx-auto mt-3 max-w-[820px] text-[clamp(3.2rem,8vw,6.4rem)] font-extrabold leading-[.88] tracking-[-.075em]">Can the whole room agree?</h1><p className="mx-auto mt-5 max-w-xl text-lg text-[#5c7183]">Push the room past 80%. Every tap is your voice. Everyone else is pushing too.</p><div className="relative mx-auto mt-8 h-8 max-w-2xl overflow-hidden rounded-full bg-[#dce2e5]"><div className={`h-full transition-all duration-500 ${progress>=80?'bg-[#36a66f]':'bg-[#1f72d2]'}`} style={{width:`${progress}%`}}/><span className="absolute inset-0 grid place-items-center text-xs font-extrabold text-white">{progress}%</span></div><div className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-4"><Mascot mood={progress>=80?'happy':'thinking'} className="w-[190px]"/><div className="text-left"><p className="font-display text-2xl font-extrabold">{progress>=80?'“You beat me together.”':'“I can still hold this line.”'}</p><p className="mt-2 text-sm text-[#607486]">Your pushes: {taps}</p></div></div>{progress<80?<button onClick={hit} className="finale-button mt-4 h-24 w-24 rounded-full bg-[#f3c52f] font-display text-lg font-extrabold text-[#4c3a00] shadow-[0_12px_0_#c79a0c] active:translate-y-2 active:shadow-[0_4px_0_#c79a0c]">PUSH</button>:<Button onClick={next} className="enter mt-5 h-13 rounded-full bg-[#1f72d2] px-7 font-bold">See what we made <Sparkles/></Button>}<p aria-live="polite" className="mt-5 text-sm font-bold text-[#627687]">{progress<80?`${Math.max(0,80-progress)}% left to unlock the room bonus`:'Room bonus unlocked · every active player counts'}</p></section>;
}

function Results({ event,name,skillScore,restart }: { event:EventDraft;name:string;skillScore:number;restart:()=>void }) {
  const [score,setScore]=useState(0); const finalScore=skillScore+1840;
  useEffect(()=>{const timer=window.setInterval(()=>setScore(value=>Math.min(finalScore,value+Math.ceil(finalScore/28))),38);return()=>window.clearInterval(timer)},[finalScore]);
  return <section className="mx-auto max-w-[1040px] px-5 pb-16 pt-5"><div className="grid gap-10 lg:grid-cols-[1fr_330px]"><div><div className="flex items-center gap-3 text-[#c58d00]"><Trophy size={26}/><span className="text-sm font-extrabold uppercase tracking-[.15em]">The room won</span></div><h1 className="font-display mt-4 text-[clamp(3.5rem,8vw,6.8rem)] font-extrabold leading-[.86] tracking-[-.075em]">Nobody sat this one out.</h1><div className="mt-8 grid grid-cols-3 border-y border-[#d0d3d2] py-5"><div><span className="text-sm text-[#697b89]">{name}</span><strong className="score-flip mt-1 block font-display text-3xl">{score.toLocaleString()}</strong></div><div><span className="text-sm text-[#697b89]">Your place</span><strong className="mt-1 block font-display text-3xl">#4</strong></div><div><span className="text-sm text-[#697b89]">Room streak</span><strong className="mt-1 block font-display text-3xl">3</strong></div></div><div className="mt-7 flex flex-wrap gap-3"><Button onClick={restart} className="rounded-full bg-[#203752] px-6 font-bold">Play it again</Button><Button variant="outline" className="rounded-full bg-transparent px-6 font-bold">Save next Friday</Button></div></div>{event.rewardMode === 'nim' ? <aside className="border-l border-[#d1d4d3] pl-7"><span className="inline-flex items-center gap-2 rounded-full bg-[#fff2c2] px-3 py-1.5 text-sm font-extrabold text-[#6e5505]">Demo reward · {event.rewardAmount || '0'} NIM</span><p className="mt-6 text-sm font-extrabold text-[#667988]">REWARD PREVIEW</p><p className="font-display mt-2 text-5xl font-extrabold">15 NIM</p><div className="mt-5 border-y border-[#d1d4d3] py-5"><p className="flex items-center gap-2 font-extrabold text-[#765f12]"><WalletCards size={19}/>Host approval would be next</p><p className="mt-2 text-sm leading-6 text-[#637688]">This demo never moves money. In a funded event, the host verifies results and confirms each payout in Nimiq Pay.</p></div><p className="mt-5 flex items-center gap-2 text-sm text-[#637688]"><Check size={17}/>Skill rules fixed before play</p><p className="mt-3 flex items-center gap-2 text-sm text-[#637688]"><ShieldCheck size={17}/>No automatic wallet payment</p></aside> : <aside className="border-l border-[#d1d4d3] pl-7"><span className="inline-flex items-center gap-2 rounded-full bg-[#e8f4ff] px-3 py-1.5 text-sm font-extrabold text-[#185b97]">Free community game</span><p className="mt-6 text-sm font-extrabold text-[#667988]">SEASON PROGRESS</p><p className="font-display mt-2 text-5xl font-extrabold">+40</p><p className="mt-2 text-sm text-[#637688]">Participation points</p><div className="mt-5 border-y border-[#d1d4d3] py-5"><p className="flex items-center gap-2 font-extrabold text-[#185b97]"><Users size={19}/>You showed up</p><p className="mt-2 text-sm leading-6 text-[#637688]">No wallet or payment is needed. Your place in the community season still counts.</p></div></aside>}</div></section>;
}
