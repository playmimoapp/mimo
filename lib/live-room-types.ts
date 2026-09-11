export type LivePlayer = {
  id: string;
  nickname: string;
  profileStyle: import('@/lib/mimo-profile').MimoProfileStyle;
  teamId: 'signal' | 'spark';
  score: number;
  answerLocked: boolean;
  walletVerified: boolean;
  payoutAddressRegistered: boolean;
  rewardEligible: boolean;
};

export type LiveReaction = {
  id: string;
  emoji: '👏' | '🔥' | '🤯' | '💙';
  nickname: string;
  teamId: 'signal' | 'spark';
  createdAt: number;
};

export type LiveRoomSignal =
  import('@/lib/living-room-engine').LivingRoomSignal;

export type LiveRoomState = {
  code: string;
  title: string;
  community: string;
  communitySlug: string;
  status: 'lobby' | 'live' | 'verifying' | 'complete' | 'cancelled';
  rewardMode: 'free' | 'nim';
  rewardAmount: string;
  rewardRule: 'skill' | 'community_unlock';
  rewardState:
    | 'none'
    | 'proposed'
    | 'funding_required'
    | 'awaiting_wallet_confirmation'
    | 'funding_submitted'
    | 'funding_confirmed'
    | 'funded'
    | 'event_live'
    | 'results_under_verification'
    | 'creator_approval_required'
    | 'payout_submitted'
    | 'payout_confirmed'
    | 'partially_paid'
    | 'payment_failed'
    | 'cancelled';
  rewardCustody: 'host_wallet' | 'mimo_vault';
  fundingTxHash: string | null;
  vaultAddress: string | null;
  vaultNetwork: 'MainAlbatross' | 'TestAlbatross' | null;
  payoutTxHash: string | null;
  refundState: 'prepared' | 'submitted' | 'confirmed' | null;
  refundTxHash: string | null;
  accessMode: 'public' | 'private';
  autoHostEnabled: boolean;
  serverNow: number;
  deadline: number | null;
  activeRoundId: string;
  roundIndex: number;
  roundCount: number;
  roundType: 'pulse' | 'multiple_choice' | 'finale';
  scored: boolean;
  scoringMode: 'accuracy' | 'speed';
  hasNextRound: boolean;
  prompt: string | null;
  choices: string[];
  choiceCounts: number[];
  correctChoice: number | null;
  collectiveTargetPercent: number;
  finalePassed: boolean | null;
  roomSignal: LiveRoomSignal | null;
  players: LivePlayer[];
  reactions: LiveReaction[];
};

export type MimoHostCue = {
  line: string;
  mood: 'happy' | 'thinking' | 'calm';
  source: 'ai' | 'fallback';
};
