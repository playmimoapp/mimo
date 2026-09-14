'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, Smartphone } from 'lucide-react';

function storeUrl() {
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    return 'https://apps.apple.com/app/nimiq-pay/id6471844738';
  }
  if (/android/i.test(navigator.userAgent)) {
    return 'https://play.google.com/store/apps/details?id=com.nimiq.pay';
  }
  return 'https://www.nimiq.com/nimiq-pay/';
}

export function OpenInNimiqPay({ code }: { code: string }) {
  const [invite] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.hash.slice(1)).get('invite') ??
        ''),
  );
  const [origin] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.origin,
  );
  const fallbackTimer = useRef<number | null>(null);
  const roomUrl = `${origin}/r/${encodeURIComponent(code)}${invite ? `#invite=${encodeURIComponent(invite)}` : ''}`;

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const directInvite = fragment.get('invite') ?? '';
    const directRoomUrl = `${window.location.origin}/r/${encodeURIComponent(code)}${directInvite ? `#invite=${encodeURIComponent(directInvite)}` : ''}`;
    if (window.nimiq) window.location.replace(directRoomUrl);
  }, [code]);

  useEffect(() => {
    const stopFallback = () => {
      if (document.hidden && fallbackTimer.current) {
        window.clearTimeout(fallbackTimer.current);
        fallbackTimer.current = null;
      }
    };
    document.addEventListener('visibilitychange', stopFallback);
    return () => document.removeEventListener('visibilitychange', stopFallback);
  }, []);

  const openApp = () => {
    window.location.href = `nimiqpay://miniapp?url=${encodeURIComponent(roomUrl)}`;
    fallbackTimer.current = window.setTimeout(() => {
      if (!document.hidden) window.location.href = storeUrl();
    }, 1400);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-10 text-[#172f49]">
      <p className="text-xs font-black uppercase tracking-[.15em] text-[#c94f3b]">
        Room {code}
      </p>
      <h1 className="font-display mt-3 text-5xl font-extrabold leading-[.93] tracking-[-.055em]">
        Open Mimo in Nimiq Pay.
      </h1>
      <p className="mt-5 text-lg leading-7 text-[#607486]">
        The room needs a verified wallet. Nimiq Pay keeps the signature and any
        NIM approval inside the wallet app.
      </p>
      <button
        type="button"
        onClick={openApp}
        className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#2577de] px-6 font-extrabold text-white"
      >
        <Smartphone size={19} /> Open in Nimiq Pay <ArrowRight size={18} />
      </button>
      <a
        href={roomUrl}
        className="mt-3 inline-flex h-12 items-center justify-center text-sm font-extrabold text-[#526a7e]"
      >
        Continue in browser
      </a>
      <a
        href="https://www.nimiq.com/nimiq-pay/"
        target="_blank"
        rel="noreferrer"
        className="mt-8 inline-flex items-center gap-2 border-t border-[#d6dde2] pt-5 text-sm font-extrabold text-[#1f72d2]"
      >
        <Download size={17} /> Get Nimiq Pay
      </a>
    </main>
  );
}
