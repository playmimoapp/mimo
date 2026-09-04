'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, LockKeyhole, ShieldCheck, Sparkles, Trophy, Users, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Screen = 'invite' | 'join' | 'lobby' | 'pulse' | 'support' | 'skill' | 'finale' | 'results';
type Side = 'help' | 'show';

const roomPeople = [
  ['Ama', '#d96b58'], ['Kofi', '#2374cf'], ['Zara', '#6d5bc5'], ['Theo', '#2c866c'],
  ['Maya', '#c9871d'], ['Jun', '#495f80'], ['Liv', '#b85f85'], ['Dayo', '#2f7b9c'],
  ['Noah', '#766a58'], ['Ife', '#657e3f'], ['Rae', '#a85545'], ['Sam', '#42658f'],
] as const;

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
  return <div className="font-display flex items-center text-[1.55rem] font-extrabold tracking-[-.075em] text-[#203752]">mimo<span className="mb-5 ml-1 h-2.5 w-2.5 rounded-full bg-[#f6c431]" /></div>;
}

function Mascot({ mood = 'calm', className = '' }: { mood?: 'calm' | 'happy' | 'thinking'; className?: string }) {
  return <Image src="/mimo-host.png" alt="Mimo, the smiling blue ribbon host" width={1254} height={1254} priority className={`select-none object-contain ${mood === 'thinking' ? 'mimo-think' : mood === 'happy' ? 'mimo-happy' : 'mimo-breathe'} ${className}`} />;
}

function Header({ back, step }: { back?: () => void; step?: string }) {
  return (
    <header className="mx-auto flex h-[72px] max-w-[1120px] items-center justify-between px-5 sm:px-8">
      <div className="flex items-center gap-2">{back && <button onClick={back} aria-label="Go back" className="-ml-2 grid h-10 w-10 place-items-center rounded-full hover:bg-white"><ArrowLeft size={19} /></button>}<Logo /></div>
      {step ? <span className="rounded-full border border-[#d5d7d7] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.12em] text-[#5d7082]">{step}</span> : <span className="flex items-center gap-2 text-sm font-bold text-[#53697c]"><span className="pulse-dot h-2 w-2 rounded-full bg-[#36a66f]" /> Demo room</span>}
    </header>
  );
}

export function MimoApp() {
  const [screen, setScreen] = useState<Screen>('invite');
  const [name, setName] = useState('');
  const [side, setSide] = useState<Side | null>(null);
  const [response, setResponse] = useState('');
  const [sentResponse, setSentResponse] = useState('');
  const [backed, setBacked] = useState<number | null>(null);
  const [order, setOrder] = useState(['Play', 'Invite', 'Drop', 'Gather']);
  const [skillScore, setSkillScore] = useState(0);

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

  const back = () => setScreen(screen === 'join' ? 'invite' : 'lobby');
  return (
    <main className="min-h-dvh overflow-hidden bg-[#f6f4ef] text-[#16283d]">
      <Header back={screen !== 'invite' ? back : undefined} step={screen === 'invite' ? undefined : `${['join','lobby','pulse','support','skill','finale','results'].indexOf(screen) + 1} / 7`} />
      {screen === 'invite' && <Invite next={() => setScreen('join')} />}
      {screen === 'join' && <Join name={name} setName={setName} next={() => name.trim() && setScreen('lobby')} />}
      {screen === 'lobby' && <Lobby name={name || 'You'} next={() => setScreen('pulse')} />}
      {screen === 'pulse' && <Pulse side={side} setSide={setSide} next={() => setScreen('support')} />}
      {screen === 'support' && <Support response={response} setResponse={setResponse} sent={sentResponse} send={() => setSentResponse(response.trim())} backed={backed} setBacked={setBacked} next={() => setScreen('skill')} />}
      {screen === 'skill' && <Skill order={order} setOrder={setOrder} lock={(score) => { setSkillScore(score); setScreen('finale'); }} />}
      {screen === 'finale' && <Finale next={() => setScreen('results')} />}
      {screen === 'results' && <Results name={name || 'You'} skillScore={skillScore} restart={() => { setScreen('invite'); setSide(null); setResponse(''); setSentResponse(''); setBacked(null); setOrder(['Play','Invite','Drop','Gather']); }} />}
    </main>
  );
}

function Invite({ next }: { next: () => void }) {
  const [faces, setFaces] = useState(4);
  useEffect(() => { const timer = window.setInterval(() => setFaces(value => Math.min(value + 1, roomPeople.length)), 850); return () => window.clearInterval(timer); }, []);
  return (
    <section className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1120px] gap-8 px-5 pb-12 pt-5 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
      <div className="enter z-10">
        <p className="text-sm font-extrabold uppercase tracking-[.16em] text-[#cf624e]">Nimiq Africa presents</p>
        <h1 className="font-display mt-4 max-w-[670px] text-[clamp(3.4rem,8vw,7rem)] font-extrabold leading-[.86] tracking-[-.078em]">Friday night belongs to the room.</h1>
        <p className="mt-7 max-w-[580px] text-lg leading-8 text-[#586d80]">Pick a side. Speak for your team. Solve one final challenge together. Nobody watches from the sidelines.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button onClick={next} className="h-14 rounded-full bg-[#1f72d2] px-7 text-base font-extrabold hover:bg-[#185fac]">Join the room <ArrowRight /></Button>
          <span className="flex items-center gap-2 text-sm font-bold text-[#566d80]"><Users size={17} /> {faces + 12} people warming up</span>
        </div>
        <div className="mt-10 grid max-w-[650px] grid-cols-3 border-y border-[#d3d5d3] py-5 text-sm">
          <div><span className="text-[#788895]">Starts</span><strong className="mt-1 block">Tonight · 19:00</strong></div>
          <div><span className="text-[#788895]">Plays in</span><strong className="mt-1 block">18 minutes</strong></div>
          <div><span className="text-[#8a6b08]">Reward</span><strong className="mt-1 block text-[#6e5709]">250 NIM funded</strong></div>
        </div>
      </div>
      <div className="relative mx-auto h-[500px] w-full max-w-[470px]">
        <div className="absolute left-1/2 top-1/2 h-[390px] w-[390px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#cad9e6] before:absolute before:inset-10 before:rounded-full before:border before:border-[#d7e1e9]" />
        <Mascot mood="happy" className="absolute bottom-1 left-1/2 z-10 w-[395px] -translate-x-1/2" />
        {roomPeople.slice(0, faces).map(([person, color], index) => <span key={person} style={{ background: color, animationDelay: `${index * 80}ms` }} className={`arrival absolute z-20 grid h-11 w-11 place-items-center rounded-full border-[3px] border-[#f6f4ef] text-xs font-extrabold text-white person-${index}`}>{person[0]}</span>)}
        <div className="absolute bottom-2 right-0 z-30 max-w-[205px] bg-[#203752] px-4 py-3 text-sm font-bold leading-5 text-white shadow-[0_12px_30px_rgba(32,55,82,.18)]">“Bring your opinion. I’ll bring the timer.”</div>
      </div>
    </section>
  );
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

function Results({ name,skillScore,restart }: { name:string;skillScore:number;restart:()=>void }) {
  const [score,setScore]=useState(0); const finalScore=skillScore+1840;
  useEffect(()=>{const timer=window.setInterval(()=>setScore(value=>Math.min(finalScore,value+Math.ceil(finalScore/28))),38);return()=>window.clearInterval(timer)},[finalScore]);
  return <section className="mx-auto max-w-[1040px] px-5 pb-16 pt-5"><div className="grid gap-10 lg:grid-cols-[1fr_330px]"><div><div className="flex items-center gap-3 text-[#c58d00]"><Trophy size={26}/><span className="text-sm font-extrabold uppercase tracking-[.15em]">The room won</span></div><h1 className="font-display mt-4 text-[clamp(3.5rem,8vw,6.8rem)] font-extrabold leading-[.86] tracking-[-.075em]">Nobody sat this one out.</h1><div className="mt-8 grid grid-cols-3 border-y border-[#d0d3d2] py-5"><div><span className="text-sm text-[#697b89]">{name}</span><strong className="score-flip mt-1 block font-display text-3xl">{score.toLocaleString()}</strong></div><div><span className="text-sm text-[#697b89]">Your place</span><strong className="mt-1 block font-display text-3xl">#4</strong></div><div><span className="text-sm text-[#697b89]">Room streak</span><strong className="mt-1 block font-display text-3xl">3</strong></div></div><div className="mt-7 flex flex-wrap gap-3"><Button onClick={restart} className="rounded-full bg-[#203752] px-6 font-bold">Play it again</Button><Button variant="outline" className="rounded-full bg-transparent px-6 font-bold">Save next Friday</Button></div></div><aside className="border-l border-[#d1d4d3] pl-7"><span className="inline-flex items-center gap-2 rounded-full bg-[#fff2c2] px-3 py-1.5 text-sm font-extrabold text-[#6e5505]">250 NIM confirmed</span><p className="mt-6 text-sm font-extrabold text-[#667988]">YOUR RECOGNITION</p><p className="font-display mt-2 text-5xl font-extrabold">15 NIM</p><div className="mt-5 border-y border-[#d1d4d3] py-5"><p className="flex items-center gap-2 font-extrabold text-[#765f12]"><WalletCards size={19}/>Waiting for the host</p><p className="mt-2 text-sm leading-6 text-[#637688]">No money has moved. The host must verify the result and approve your payment.</p></div><p className="mt-5 flex items-center gap-2 text-sm text-[#637688]"><Check size={17}/>Rules locked before play</p><p className="mt-3 flex items-center gap-2 text-sm text-[#637688]"><ShieldCheck size={17}/>Wallet asked only when needed</p></aside></div></section>;
}
