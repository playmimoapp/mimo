export type LivePlayer = {
  id: string;
  nickname: string;
  teamId: 'signal' | 'spark';
  score: number;
  answerLocked: boolean;
};

export type LiveRoomState = {
  code: string;
  title: string;
  community: string;
  status: 'lobby' | 'live' | 'verifying' | 'complete' | 'cancelled';
  rewardMode: 'free' | 'nim';
  rewardAmount: string;
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
  players: LivePlayer[];
};
