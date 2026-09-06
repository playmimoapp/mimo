export type LivePlayer = {
  id: string;
  nickname: string;
  teamId: 'signal' | 'spark';
  score: number;
  answerLocked: boolean;
  walletVerified: boolean;
};

export type LiveReaction = {
  id: string;
  emoji: '👏' | '🔥' | '🤯' | '💙';
  nickname: string;
  teamId: 'signal' | 'spark';
  createdAt: number;
};

export type LiveRoomState = {
  code: string;
  title: string;
  community: string;
  status: 'lobby' | 'live' | 'verifying' | 'complete' | 'cancelled';
  rewardMode: 'free' | 'nim';
  rewardAmount: string;
  rewardState:
    | 'none'
    | 'proposed'
    | 'payout_submitted'
    | 'payout_confirmed'
    | 'payment_failed'
    | 'cancelled';
  payoutTxHash: string | null;
  accessMode: 'public' | 'private';
  serverNow: number;
  deadline: number | null;
  activeRoundId: string;
  roundIndex: number;
  roundCount: number;
  roundType: 'pulse' | 'multiple_choice' | 'finale';
  scored: boolean;
  hasNextRound: boolean;
  prompt: string | null;
  choices: string[];
  choiceCounts: number[];
  correctChoice: number | null;
  collectiveTargetPercent: number;
  finalePassed: boolean | null;
  players: LivePlayer[];
  reactions: LiveReaction[];
};
