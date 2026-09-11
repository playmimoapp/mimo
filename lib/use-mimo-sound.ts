'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type MimoSound =
  | 'arrival'
  | 'tick'
  | 'lock'
  | 'start'
  | 'reveal'
  | 'complete'
  | 'reward';

const PATTERNS: Record<MimoSound, Array<[number, number, number]>> = {
  arrival: [
    [660, 0, 0.08],
    [880, 0.07, 0.1],
  ],
  tick: [[880, 0, 0.055]],
  lock: [
    [520, 0, 0.07],
    [780, 0.06, 0.09],
  ],
  start: [
    [440, 0, 0.09],
    [660, 0.08, 0.09],
    [880, 0.16, 0.12],
  ],
  reveal: [
    [330, 0, 0.08],
    [520, 0.07, 0.1],
    [740, 0.15, 0.14],
  ],
  complete: [
    [523, 0, 0.11],
    [659, 0.1, 0.11],
    [784, 0.2, 0.18],
  ],
  reward: [
    [740, 0, 0.08],
    [988, 0.08, 0.09],
    [1318, 0.17, 0.2],
  ],
};

export function useMimoSound() {
  const [enabled, setEnabled] = useState(false);
  const context = useRef<AudioContext | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      setEnabled(window.localStorage.getItem('mimo:sound') === 'on'),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      void context.current?.close();
    };
  }, []);

  const ensureContext = useCallback(() => {
    if (!context.current) context.current = new AudioContext();
    if (context.current.state === 'suspended') void context.current.resume();
    return context.current;
  }, []);

  const play = useCallback(
    (sound: MimoSound) => {
      if (!enabled) return;
      const audio = ensureContext();
      const start = audio.currentTime;
      for (const [frequency, delay, duration] of PATTERNS[sound]) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start + delay);
        gain.gain.setValueAtTime(0.0001, start + delay);
        gain.gain.exponentialRampToValueAtTime(0.055, start + delay + 0.012);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          start + delay + duration,
        );
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start + delay);
        oscillator.stop(start + delay + duration + 0.02);
      }
    },
    [enabled, ensureContext],
  );

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      window.localStorage.setItem('mimo:sound', next ? 'on' : 'off');
      if (next) {
        const audio = ensureContext();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = 660;
        gain.gain.setValueAtTime(0.035, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          audio.currentTime + 0.09,
        );
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.1);
      }
      return next;
    });
  }, [ensureContext]);

  return { enabled, play, toggle };
}
