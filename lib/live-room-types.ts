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
  serverNow: number;
  deadline: number | null;
  prompt: string | null;
  choices: string[];
  correctChoice: number | null;
  players: LivePlayer[];
};
