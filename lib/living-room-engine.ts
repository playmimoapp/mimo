export type LivingRoomSignal =
  | { kind: 'split_room'; strength: number }
  | {
      kind: 'comeback_window';
      strength: number;
      trailingTeam: 'signal' | 'spark';
    }
  | { kind: 'collective_clear'; strength: number };

type SignalInput = {
  status: string;
  roundType: string;
  hasNextRound: boolean;
  choiceCounts: number[];
  finalePassed: boolean | null;
  signalScore: number;
  sparkScore: number;
  signalPlayers: number;
  sparkPlayers: number;
};

/**
 * Deterministic room sensing. This may influence presentation and select only
 * creator-approved branches; it never changes locked scoring or reward rules.
 */
export function detectLivingRoomSignal(
  input: SignalInput,
): LivingRoomSignal | null {
  if (!['verifying', 'complete'].includes(input.status)) return null;

  if (input.roundType === 'finale' && input.finalePassed) {
    return { kind: 'collective_clear', strength: 1 };
  }

  const totalAnswers = input.choiceCounts.reduce(
    (total, count) => total + count,
    0,
  );
  const rankedChoices = [...input.choiceCounts].sort((a, b) => b - a);
  const leadingGap = (rankedChoices[0] ?? 0) - (rankedChoices[1] ?? 0);
  if (
    input.roundType === 'pulse' &&
    totalAnswers >= 4 &&
    (rankedChoices[1] ?? 0) > 0 &&
    leadingGap <= Math.max(1, Math.floor(totalAnswers * 0.1))
  ) {
    return {
      kind: 'split_room',
      strength: Math.max(0, 1 - leadingGap / totalAnswers),
    };
  }

  const totalScore = input.signalScore + input.sparkScore;
  const scoreGap = Math.abs(input.signalScore - input.sparkScore);
  if (
    input.hasNextRound &&
    input.signalPlayers > 0 &&
    input.sparkPlayers > 0 &&
    totalScore > 0 &&
    scoreGap >= 1000 &&
    scoreGap / totalScore >= 0.25
  ) {
    return {
      kind: 'comeback_window',
      strength: Math.min(1, scoreGap / totalScore),
      trailingTeam: input.signalScore < input.sparkScore ? 'signal' : 'spark',
    };
  }

  return null;
}
