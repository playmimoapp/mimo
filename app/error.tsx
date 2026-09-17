'use client';

import { useEffect } from 'react';
import Image from 'next/image';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('mimo_page_error', error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f5f0] px-6 text-[#13283f]">
      <section className="w-full max-w-md text-center">
        <Image
          src="/mimo-host.png"
          alt="Mimo"
          width={112}
          height={112}
          className="mx-auto h-28 w-28 object-contain"
        />
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[.16em] text-[#d35140]">
          Mimo lost the room for a moment
        </p>
        <h1 className="font-display mt-3 text-4xl font-extrabold tracking-[-.04em]">
          Let’s bring it back.
        </h1>
        <p className="mx-auto mt-3 max-w-sm leading-7 text-[#5c7082]">
          Your payment and room records are kept on the server. Try restoring
          this screen; Mimo will not repeat a confirmed transaction.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 h-12 rounded-full bg-[#1f72d2] px-7 font-extrabold text-white"
        >
          Restore Mimo
        </button>
      </section>
    </main>
  );
}
