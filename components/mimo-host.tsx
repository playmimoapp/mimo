'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

type Mood = 'calm' | 'happy' | 'thinking';

const motionClass: Record<Mood, string> = {
  calm: 'mimo-breathe',
  happy: 'mimo-happy',
  thinking: 'mimo-think',
};

export function MimoCharacter({
  mood = 'calm',
  className,
  priority = false,
}: {
  mood?: Mood;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/mimo-host.png"
      alt="Mimo, the smiling blue ribbon host"
      width={1254}
      height={1254}
      priority={priority}
      className={cn('select-none object-contain', motionClass[mood], className)}
    />
  );
}

export function MimoCue({
  message,
  mood = 'calm',
  tone = 'light',
  className,
}: {
  message: string;
  mood?: Mood;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <div className={cn('mimo-cue', `mimo-cue-${tone}`, className)}>
      <motion.div
        className="mimo-cue-character"
        initial={{ scale: 0.84, rotate: -5 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 22 }}
      >
        <MimoCharacter mood={mood} className="h-full w-full" />
      </motion.div>
      <motion.p
        key={message}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="mimo-cue-message"
      >
        {message}
      </motion.p>
    </div>
  );
}
