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

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'rounds'],
  properties: {
    title: { type: 'string', minLength: 3, maxLength: 80 },
    rounds: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
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

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function clean(value: unknown, max: number) {
  return (typeof value === 'string' ? value : '').trim().slice(0, max);
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

function validDraft(value: unknown): value is GeneratedDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<GeneratedDraft>;
  return Boolean(
    typeof draft.title === 'string' &&
    draft.title.trim().length >= 3 &&
    Array.isArray(draft.rounds) &&
    draft.rounds.length >= 3 &&
    draft.rounds.length <= 5 &&
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
      ? 'Create 3 to 5 neutral pulse polls. They have no correct answer and use null for correctChoice. Present choices fairly without steering voters.'
      : eventKind === 'product_launch'
        ? 'Create a launch show: begin with an audience pulse, use objective questions grounded in the supplied product information, and finish with one shared challenge.'
        : eventKind === 'onboarding'
          ? 'Create a newcomer-friendly learning show: begin with a welcoming pulse, use clear objective knowledge checks, and finish with one shared challenge.'
          : eventKind === 'custom'
            ? 'Follow the host brief closely. Use unscored pulse polls for opinions and objectively scored questions only when one answer is clearly correct.'
            : 'Create a game night: start with one unscored pulse poll, follow with objectively scored skill questions, and end with one shared final challenge.';

  const instructions = `You are Mimo, a careful live community-event editor.
Create a short live show with 3 to 5 moments for an event host to review.
${formatInstruction}
Every moment has two to four distinct choices. Pulse polls use null for correctChoice;
scored moments must have exactly one correct answer.
Never invent a claim from supplied source text. If no source is supplied, use only stable,
widely established facts. Avoid trick wording, subjective judgment, politics, medical advice,
financial advice, gambling, random reward rules and promotional claims. Keep the language
warm, concise and suitable for a fast mobile game. Return only the requested JSON.`;

  const continuityInstruction =
    hostingMode === 'community'
      ? `This belongs to the recurring ${recurrence} series ${community}. It may acknowledge returning members, but this event must still make sense to a newcomer.`
      : 'This is a one-time room. Keep it completely self-contained: do not mention seasons, recurring meetings, previous events or a next event.';

  const input = `Format: ${eventKind}\nHosting mode: ${hostingMode}\n${continuityInstruction}\nAudience: ${audience}\nDifficulty: ${difficulty}\nBrief: ${topic}\n${
    source ? `Approved source text:\n${source}` : 'No source text was supplied.'
  }`;

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
            schema: responseSchema,
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
    if (!validDraft(draft)) throw new Error('invalid_draft');

    return json({
      draft: {
        eventKind,
        title: draft.title.trim().slice(0, 80),
        community,
        accessMode: 'public',
        rewardMode: 'free',
        custodyMode: 'host_wallet',
        rewardAmount: '',
        rewardRule: 'skill',
        adaptiveMoments: true,
        rounds: draft.rounds.map((round) => ({
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
