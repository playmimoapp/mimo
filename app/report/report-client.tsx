'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, CheckCircle2, LockKeyhole, RefreshCw } from 'lucide-react';

type Report = {
  generatedAt: number;
  usage: {
    realEvents: number; qaEvents: number; uniqueVerifiedParticipants: number;
    completedRooms: number; returningPlayers: number; uniqueHosts: number;
    returningHosts: number;
  };
  funnel: {
    uniqueRoomVisits: number; joinAttempts: number; successfulJoins: number;
    completedParticipants: number; visitToJoinRate: number;
    joinFailureRate: number; participantCompletionRate: number;
    roomCompletionRate: number; failureReasons: Array<{ reason: string; count: number }>;
  };
  settlement: {
    successfulFunding: number; fundedNim: string; successfulPayouts: number;
    paidNim: string; successfulRefunds: number; refundedNim: string;
  };
  recentEvents: Array<{
    title: string; roomCode: string; status: string; createdAt: number;
    completedAt: number | null; participants: number; verifiedParticipants: number;
  }>;
  transactionProof: Array<{
    kind: 'funding' | 'payout' | 'refund'; title: string; roomCode: string;
    txHash: string; happenedAt: number;
  }>;
  definitions: Record<string, string>;
};

const metricLabels: Array<[keyof Report['usage'], string]> = [
  ['uniqueVerifiedParticipants', 'Verified participants'],
  ['completedRooms', 'Completed rooms'],
  ['returningPlayers', 'Returning players'],
  ['returningHosts', 'Returning hosts'],
];

function date(value: number) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

export function CompetitionReport() {
  const [key, setKey] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      setKey(window.sessionStorage.getItem('mimo:operations:key') ?? '');
    }, 0);
    return () => window.clearTimeout(initial);
  }, []);

  const load = async () => {
    if (!key.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/operations/competition-report', {
        cache: 'no-store',
        headers: { 'x-mimo-operations-key': key.trim() },
      });
      const body = (await response.json()) as Report & { error?: string };
      if (!response.ok) throw new Error(body.error || 'The report could not be opened.');
      window.sessionStorage.setItem('mimo:operations:key', key.trim());
      setReport(body);
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : 'The report could not be opened.');
    } finally {
      setLoading(false);
    }
  };

  if (!report) {
    return (
      <main className="min-h-dvh bg-[#f8f7f3] px-5 py-10 sm:grid sm:place-items-center">
        <section className="mx-auto max-w-md pt-[12vh] sm:pt-0">
          <Image src="/mimo-logo.svg" alt="Mimo" width={132} height={48} priority />
          <div className="mt-12 flex items-center gap-2 text-sm font-extrabold uppercase tracking-[.14em] text-[#537087]">
            <LockKeyhole size={18} /> Private evidence room
          </div>
          <h1 className="font-display mt-4 text-5xl font-extrabold leading-[.94] tracking-[-.055em] text-[#16283d]">
            Real usage.<br />Clean proof.
          </h1>
          <p className="mt-5 text-lg leading-8 text-[#587085]">
            This report excludes automated QA rooms and never displays wallet addresses.
          </p>
          <label className="mt-8 block text-sm font-extrabold text-[#29445f]" htmlFor="report-key">
            Operations key
          </label>
          <div className="mt-2 flex overflow-hidden rounded-2xl border border-[#cbd5dc] bg-white focus-within:ring-2 focus-within:ring-[#2577de]/30">
            <input
              id="report-key" type="password" value={key}
              onChange={(event) => setKey(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void load(); }}
              className="min-w-0 flex-1 bg-transparent px-4 py-4 outline-none"
              placeholder="Enter private key"
              autoComplete="off"
            />
            <button onClick={() => void load()} disabled={!key.trim() || loading}
              className="m-1 rounded-xl bg-[#1d72d2] px-5 font-extrabold text-white disabled:opacity-50">
              {loading ? 'Opening…' : 'Open'}
            </button>
          </div>
          {error && <p className="mt-3 font-bold text-[#b13a35]" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#f8f7f3] text-[#16283d]">
      <header className="border-b border-[#d8dddf] bg-[#fffdf9]">
        <div className="app-frame flex items-center justify-between py-5">
          <Image src="/mimo-logo.svg" alt="Mimo" width={120} height={44} priority />
          <button onClick={() => void load()} disabled={loading}
            className="flex h-11 items-center gap-2 rounded-full border border-[#cbd5dc] bg-white px-4 text-sm font-extrabold">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>
      <div className="app-frame py-10 sm:py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-extrabold uppercase tracking-[.16em] text-[#20835d]">Competition evidence</p>
          <h1 className="font-display mt-3 text-5xl font-extrabold leading-[.94] tracking-[-.055em] sm:text-7xl">What happened in Mimo.</h1>
          <p className="mt-5 text-[#617386]">Updated {date(report.generatedAt)} · Real activity is separated from {report.usage.qaEvents} QA event{report.usage.qaEvents === 1 ? '' : 's'}.</p>
        </div>

        <section className="mt-12 grid grid-cols-2 border-y border-[#cfd6d9] sm:grid-cols-4">
          {metricLabels.map(([keyName, label], index) => (
            <div key={keyName} className={`py-6 ${index % 2 ? 'pl-5' : 'pr-5'} sm:border-r sm:px-6 sm:first:pl-0 sm:last:border-r-0`}>
              <strong className="font-display block text-4xl font-extrabold tracking-[-.04em] sm:text-5xl">{report.usage[keyName]}</strong>
              <span className="mt-2 block text-sm font-bold text-[#607486]">{label}</span>
            </div>
          ))}
        </section>

        <div className="mt-14 grid gap-12 lg:grid-cols-[1.15fr_.85fr]">
          <section>
            <h2 className="font-display text-3xl font-extrabold">Participation funnel</h2>
            <div className="mt-6 space-y-5">
              {[
                ['Unique room visits', report.funnel.uniqueRoomVisits, '100%'],
                ['Joined', report.funnel.successfulJoins, `${report.funnel.visitToJoinRate}%`],
                ['Completed', report.funnel.completedParticipants, `${report.funnel.participantCompletionRate}%`],
              ].map(([label, value, rate]) => (
                <div key={String(label)} className="flex items-end justify-between border-b border-[#d8dddf] pb-4">
                  <div><span className="block font-bold text-[#607486]">{label}</span><strong className="font-display text-4xl">{value}</strong></div>
                  <span className="font-extrabold text-[#237653]">{rate}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-6 text-[#687b8d]">Join failure rate: {report.funnel.joinFailureRate}%. Room completion rate: {report.funnel.roomCompletionRate}%.</p>
          </section>

          <section className="border-l-4 border-[#f2c62f] bg-[#fff9df] p-6 sm:p-8">
            <p className="text-sm font-extrabold uppercase tracking-[.14em] text-[#856400]">NIM settlement</p>
            <div className="mt-6 space-y-6">
              {[
                ['Funding confirmed', report.settlement.successfulFunding, report.settlement.fundedNim],
                ['Payouts confirmed', report.settlement.successfulPayouts, report.settlement.paidNim],
                ['Refunds confirmed', report.settlement.successfulRefunds, report.settlement.refundedNim],
              ].map(([label, value, nim]) => (
                <div key={String(label)} className="flex justify-between gap-4 border-b border-[#e6dcae] pb-4 last:border-0">
                  <div><strong className="block text-lg">{label}</strong><span className="text-sm text-[#6e6a53]">{value} transaction{value === 1 ? '' : 's'}</span></div>
                  <strong className="font-display text-xl">{nim} NIM</strong>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-16">
          <h2 className="font-display text-3xl font-extrabold">Recent real events</h2>
          <div className="mt-5 overflow-x-auto border-y border-[#cfd6d9]">
            <table className="w-full min-w-[650px] text-left">
              <thead className="text-xs uppercase tracking-[.12em] text-[#687b8d]"><tr><th className="py-4">Event</th><th>Status</th><th>Players</th><th>Verified</th><th>Created</th></tr></thead>
              <tbody>{report.recentEvents.map((event) => (
                <tr key={`${event.roomCode}-${event.createdAt}`} className="border-t border-[#dde1e2]">
                  <td className="py-4 pr-5"><strong className="block">{event.title}</strong><span className="text-xs text-[#728293]">{event.roomCode}</span></td>
                  <td className="capitalize">{event.status}</td><td>{event.participants}</td><td>{event.verifiedParticipants}</td><td>{date(event.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-3xl font-extrabold">Transaction proof</h2>
          <p className="mt-2 text-[#617386]">Every link opens the public TestAlbatross explorer evidence.</p>
          <div className="mt-5 divide-y divide-[#d8dddf] border-y border-[#cfd6d9]">
            {report.transactionProof.length ? report.transactionProof.map((proof) => (
              <a key={`${proof.kind}-${proof.txHash}`} href={`https://test.nimiq.watch/#${proof.txHash}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-4 py-4 hover:text-[#1d72d2]">
                <CheckCircle2 size={20} className="text-[#24855e]" />
                <div className="min-w-0 flex-1"><strong className="block capitalize">{proof.kind} · {proof.title}</strong><span className="block truncate font-mono text-xs text-[#718192]">{proof.txHash}</span></div>
                <ArrowUpRight size={18} />
              </a>
            )) : <p className="py-6 text-[#617386]">No real-event transaction proof recorded yet.</p>}
          </div>
        </section>

        <footer className="mt-16 border-t border-[#d8dddf] pt-7 text-sm leading-6 text-[#66798a]">
          <strong className="text-[#29445f]">Privacy-safe by design.</strong> {report.definitions.privacy} Automated rooms require a private QA credential and are excluded from real-usage totals.
        </footer>
      </div>
    </main>
  );
}
