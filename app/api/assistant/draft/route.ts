import { getRuntimeVariable } from '@/lib/runtime-env';

type DraftRequest = {
  eventKind?: unknown;
  hostingMode?: unknown;
  recurrence?: unknown;
  community?: unknown;
  topic?: unknown;
  audience?: unknown;
  difficulty?: unknown;
  source?: unknown;
  avoidQuestions?: unknown;
};

type GeneratedDraft = {
  title: string;
  rounds: Array<{
    type: 'pulse' | 'multiple_choice' | 'finale';
    question: string;
    choices: string[];
    correctChoice: number | null;
  }>;
};

function responseSchema(minItems: number, maxItems: number) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'rounds'],
    properties: {
      title: { type: 'string', minLength: 3, maxLength: 80 },
      rounds: {
        type: 'array',
        minItems,
        maxItems,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'question', 'choices', 'correctChoice'],
          properties: {
            type: {
              type: 'string',
              enum: ['pulse', 'multiple_choice', 'finale'],
            },
            question: { type: 'string', minLength: 8, maxLength: 180 },
            choices: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: { type: 'string', minLength: 1, maxLength: 80 },
            },
            correctChoice: {
              type: ['integer', 'null'],
              minimum: 0,
              maximum: 3,
            },
          },
        },
      },
    },
  } as const;
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function clean(value: unknown, max: number) {
  return (typeof value === 'string' ? value : '').trim().slice(0, max);
}

function questionWords(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

function questionsAreTooSimilar(left: string, right: string) {
  const a = questionWords(left);
  const b = questionWords(right);
  if (!a.size || !b.size)
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = new Set([...a, ...b]).size;
  const jaccard = shared / union;
  const containment = shared / Math.min(a.size, b.size);
  return jaccard >= 0.68 || containment >= 0.84;
}

function requestedMomentCount(brief: string) {
  const numeric = brief.match(
    /\b(\d{1,2})\s+(?:questions?|polls?|votes?|moments?|rounds?|challenges?)\b/i,
  );
  if (numeric) return Number(numeric[1]);
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const written = brief.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:questions?|polls?|votes?|moments?|rounds?|challenges?)\b/i,
  );
  return written ? words[written[1].toLowerCase()] : null;
}

function extractText(payload: {
  output_text?: unknown;
  steps?: Array<{
    type?: unknown;
    content?: Array<{ type?: unknown; text?: unknown }>;
  }>;
}) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const modelStep = [...(payload.steps ?? [])]
    .reverse()
    .find((step) => step.type === 'model_output');
  return (modelStep?.content ?? [])
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => String(item.text))
    .join('');
}

function validDraft(
  value: unknown,
  minimumMoments: number,
  maximumMoments: number,
): value is GeneratedDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<GeneratedDraft>;
  return Boolean(
    typeof draft.title === 'string' &&
    draft.title.trim().length >= 3 &&
    Array.isArray(draft.rounds) &&
    draft.rounds.length >= minimumMoments &&
    draft.rounds.length <= maximumMoments &&
    draft.rounds.every(
      (round) =>
        ['pulse', 'multiple_choice', 'finale'].includes(round.type) &&
        typeof round.question === 'string' &&
        round.question.trim().length >= 8 &&
        Array.isArray(round.choices) &&
        round.choices.length >= 2 &&
        round.choices.length <= 4 &&
        round.choices.every(
          (choice) => typeof choice === 'string' && choice.trim().length > 0,
        ) &&
        (round.type === 'pulse' ||
          (Number.isInteger(round.correctChoice) &&
            Number(round.correctChoice) >= 0 &&
            Number(round.correctChoice) < round.choices.length)),
    ),
  );
}

export async function POST(request: Request) {
  const apiKey = getRuntimeVariable('GEMINI_API_KEY');
  if (!apiKey) {
    return json(
      {
        error:
          "Mimo's writing brain is not connected yet. No fake questions were generated.",
      },
      503,
    );
  }

  const body = (await request.json().catch(() => null)) as DraftRequest | null;
  const community = clean(body?.community, 60);
  const topic = clean(body?.topic, 500);
  const source = clean(body?.source, 8000);
  const avoidQuestions = Array.isArray(body?.avoidQuestions)
    ? body.avoidQuestions
        .flatMap((value) =>
          typeof value === 'string' ? [clean(value, 180)] : [],
        )
        .filter(Boolean)
        .slice(0, 20)
    : [];
  const audience = ['newcomers', 'community', 'experts'].includes(
    String(body?.audience),
  )
    ? String(body?.audience)
    : 'community';
  const difficulty = ['easy', 'balanced', 'hard'].includes(
    String(body?.difficulty),
  )
    ? String(body?.difficulty)
    : 'balanced';
  const eventKind = [
    'game_night',
    'community_vote',
    'product_launch',
    'onboarding',
    'custom',
  ].includes(String(body?.eventKind))
    ? String(body?.eventKind)
    : 'game_night';
  const requestedCount = requestedMomentCount(topic);
  if (requestedCount !== null && (requestedCount < 1 || requestedCount > 20)) {
    return json(
      { error: 'Choose between 1 and 20 questions or live moments.' },
      400,
    );
  }
  const defaultMomentRange =
    eventKind === 'community_vote'
      ? { minimum: 1, maximum: 1 }
      : eventKind === 'product_launch'
        ? { minimum: 2, maximum: 4 }
        : { minimum: 3, maximum: 5 };
  const momentRange = requestedCount
    ? { minimum: requestedCount, maximum: requestedCount }
    : defaultMomentRange;
  const hostingMode =
    body?.hostingMode === 'community' ? 'community' : 'one_time';
  const recurrence = ['weekly', 'fortnightly', 'monthly'].includes(
    String(body?.recurrence),
  )
    ? String(body?.recurrence)
    : 'none';

  if (
    topic.length < 6 ||
    (hostingMode === 'community' && community.length < 2)
  ) {
    return json(
      {
        error:
          hostingMode === 'community'
            ? 'Add a community and a clear topic.'
            : 'Describe the one-time event in a little more detail.',
      },
      400,
    );
  }

  const formatInstruction =
    eventKind === 'community_vote'
      ? 'Create neutral pulse polls. They have no correct answer and use null for correctChoice. Present choices fairly without steering voters.'
      : eventKind === 'product_launch'
        ? 'Create a product launch show using objective questions grounded in the supplied product information. Add a pulse poll only when the host explicitly asks for audience opinion. Add a shared finale only when the brief asks for one.'
        : eventKind === 'onboarding'
          ? 'Create a newcomer-friendly learning show using clear objective knowledge checks. Add a pulse poll or shared finale only when the host explicitly asks for one.'
          : eventKind === 'custom'
            ? 'Follow the host brief exactly. Use unscored pulse polls only when the brief asks for opinions or voting. Use scored questions only when one answer is clearly correct. Do not add a finale unless the brief asks for one.'
            : 'Create a game night using objectively scored skill questions. Do not begin with a pulse poll unless the host explicitly asks for a poll or audience opinion. Do not add a shared finale unless the brief asks for one.';

  const instructions = `You are Mimo, a careful live community-event editor.
Create a short live experience ${requestedCount ? `with exactly ${requestedCount} moments` : `with ${momentRange.minimum} to ${momentRange.maximum} moments`} for an event host to review.
${formatInstruction}
Every moment has two to four distinct choices. Pulse polls use null for correctChoice;
scored moments must have exactly one correct answer.
Never invent a claim from supplied source text. If no source is supplied, use only stable,
widely established facts. Avoid trick wording, subjective judgment, politics, medical advice,
financial advice, gambling, random reward rules and promotional claims. Keep the language
warm, concise and suitable for a fast mobile game.

For Nimiq topics, you are a Nimiq-native editor. Without supplied source text, you may rely
only on this maintained stable knowledge: NIM is the native coin of the Nimiq network;
Albatross is Nimiq's proof-of-stake consensus protocol; Nimiq Pay is a self-custodial mobile
payment app; Mini Apps run as web apps inside Nimiq Pay and can request account access,
message signatures and payments; sensitive wallet actions are confirmed by the user in
native Nimiq Pay dialogs. Do not generate questions about current prices, yields, fees,
network statistics, release status, competition standings or other changing facts unless
the host supplies approved source text. Never treat a wallet signature as a payment.
Return only the requested JSON.`;

  const continuityInstruction =
    hostingMode === 'community'
      ? `This belongs to the recurring ${recurrence} series ${community}. It may acknowledge returning members, but this event must still make sense to a newcomer.`
      : 'This is a one-time room. Keep it completely self-contained: do not mention seasons, recurring meetings, previous events or a next event.';

  const input = `Format: ${eventKind}\nHosting mode: ${hostingMode}\n${continuityInstruction}\nAudience: ${audience}\nDifficulty: ${difficulty}\nBrief: ${topic}\n${
    source ? `Approved source text:\n${source}` : 'No source text was supplied.'
  }${
    avoidQuestions.length
      ? `\nThis is a new edition. Do not repeat or closely paraphrase these previous questions:\n${avoidQuestions.map((question) => `- ${question}`).join('\n')}`
      : ''
  }`;
  const hostRequestedPoll =
    eventKind === 'community_vote' ||
    /\b(poll|vote|voting|opinion|choose a side|pulse)\b/i.test(topic);

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: getRuntimeVariable('GEMINI_MODEL') || 'gemini-3.7-flash',
          input: `${instructions}\n\n${input}`,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: responseSchema(momentRange.minimum, momentRange.maximum),
          },
        }),
      },
    );

    if (!response.ok) {
      console.error('mimo_assistant_failed', response.status);
      return json(
        {
          error: 'Mimo could not prepare a draft right now. Try again shortly.',
        },
        502,
      );
    }

    const payload = (await response.json()) as Parameters<
      typeof extractText
    >[0];
    const draft = JSON.parse(extractText(payload)) as unknown;
    if (!validDraft(draft, momentRange.minimum, momentRange.maximum)) {
      throw new Error('invalid_draft');
    }
    const generatedQuestions = draft.rounds.map((round) => round.question);
    const repeatsPrevious = generatedQuestions.some((question) =>
      avoidQuestions.some((previous) =>
        questionsAreTooSimilar(question, previous),
      ),
    );
    const repeatsItself = generatedQuestions.some((question, index) =>
      generatedQuestions
        .slice(0, index)
        .some((previous) => questionsAreTooSimilar(question, previous)),
    );
    if (repeatsPrevious || repeatsItself) {
      throw new Error('repeated_question');
    }

    const approvedRounds = draft.rounds.filter(
      (round) => round.type !== 'pulse' || hostRequestedPoll,
    );
    if (approvedRounds.length === 0) throw new Error('empty_draft');

    return json({
      draft: {
        eventKind,
        title: draft.title.trim().slice(0, 80),
        community,
        accessMode: 'public',
        playMode: eventKind === 'community_vote' ? 'individual' : 'hybrid',
        walletRequired: false,
        rewardMode: 'free',
        custodyMode: 'host_wallet',
        rewardAmount: '',
        rewardRule: 'skill',
        rewardWinnerCount: 1,
        adaptiveMoments: true,
        rounds: approvedRounds.map((round) => ({
          id: crypto.randomUUID(),
          type: round.type,
          question: round.question.trim().slice(0, 180),
          choices: round.choices.map((choice) => choice.trim().slice(0, 80)),
          correctChoice: round.type === 'pulse' ? null : round.correctChoice,
          durationSeconds:
            round.type === 'pulse' ? 15 : round.type === 'finale' ? 30 : 20,
          scoringMode: round.type === 'multiple_choice' ? 'speed' : 'accuracy',
          collectiveTargetPercent: 60,
        })),
      },
    });
  } catch (error) {
    console.error('mimo_assistant_invalid_response', error);
    return json(
      { error: 'Mimo could not prepare a safe draft. Nothing was published.' },
      502,
    );
  }
}
