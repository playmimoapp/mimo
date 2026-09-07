'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { MIMO_PROFILES, type MimoProfileStyle } from '@/lib/mimo-profile';

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
        key={message}
        className="mimo-cue-character"
        initial={{ scale: 0.84, rotate: -7, y: 5 }}
        animate={{ scale: [0.84, 1.06, 1], rotate: [-7, 3, 0], y: [5, -4, 0] }}
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

const profileTone: Record<MimoProfileStyle, string> = {
  hype: 'border-[#77ace0] bg-[#dceeff] text-[#175fa9]',
  cool: 'border-[#72869a] bg-[#e8edf1] text-[#203752]',
  clever: 'border-[#d3ad32] bg-[#fff2bd] text-[#806000]',
  bold: 'border-[#df8979] bg-[#ffe3dc] text-[#b64c39]',
};

const profilePose: Record<MimoProfileStyle, string> = {
  hype: 'scale-[1.45] translate-y-[8%] rotate-[-3deg]',
  cool: 'scale-[1.52] translate-y-[10%] rotate-[3deg]',
  clever: 'scale-[1.4] translate-y-[7%]',
  bold: 'scale-[1.55] translate-y-[11%] rotate-[-5deg]',
};

export function MimoProfileAvatar({
  profile,
  nickname,
  className,
}: {
  profile: MimoProfileStyle;
  nickname: string;
  className?: string;
}) {
  const definition =
    MIMO_PROFILES.find((item) => item.id === profile) ?? MIMO_PROFILES[0];
  return (
    <span
      className={cn(
        'relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border-2 font-display font-extrabold',
        profileTone[profile],
        className,
      )}
      title={`${nickname} · ${definition.label} Mimo`}
      aria-label={`${nickname}, ${definition.label} Mimo profile`}
    >
      <Image
        src="/mimo-host.png"
        alt=""
        fill
        sizes="44px"
        className={cn('object-contain', profilePose[profile])}
      />
      <span className="absolute bottom-0 right-0 grid h-4 min-w-4 place-items-center rounded-full bg-white px-0.5 text-[9px] font-black text-[#203752] shadow-sm">
        {definition.symbol}
      </span>
    </span>
  );
}
