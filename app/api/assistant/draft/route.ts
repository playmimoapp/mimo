type DraftRequest = {
  community?: unknown;
  topic?: unknown;
  audience?: unknown;
  difficulty?: unknown;
  source?: unknown;
};

type GeneratedDraft = {
  title: string;
  question: string;
  choices: [string, string, string, string];
  correctChoice: number;
};

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'question', 'choices', 'correctChoice'],
  properties: {
    title: { type: 'string', minLength: 3, maxLength: 80 },
    question: { type: 'string', minLength: 8, maxLength: 180 },
    choices: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    correctChoice: { type: 'integer', minimum: 0, maximum: 3 },
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

function extractText(payload: { output_text?: unknown }) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  return '';
}

function validDraft(value: unknown): value is GeneratedDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<GeneratedDraft>;
  return Boolean(
    typeof draft.title === 'string' &&
    draft.title.trim().length >= 3 &&
    typeof draft.question === 'string' &&
    draft.question.trim().length >= 8 &&
    Array.isArray(draft.choices) &&
    draft.choices.length === 4 &&
    draft.choices.every(
      (choice) => typeof choice === 'string' && choice.trim().length > 0,
    ) &&
    Number.isInteger(draft.correctChoice) &&
    Number(draft.correctChoice) >= 0 &&
    Number(draft.correctChoice) <= 3,
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
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

  if (community.length < 2 || topic.length < 6) {
    return json({ error: 'Add a community and a clear topic.' }, 400);
  }

  const instructions = `You are Mimo, a careful live community-game editor.
Create exactly one multiple-choice starter round for an event host to review.
The question must have one objectively correct answer and exactly four distinct choices.
Never invent a claim from supplied source text. If no source is supplied, use only stable,
widely established facts. Avoid trick wording, subjective judgment, politics, medical advice,
financial advice, gambling, random reward rules and promotional claims. Keep the language
warm, concise and suitable for a fast mobile game. Return only the requested JSON.`;

  const input = `Community: ${community}\nAudience: ${audience}\nDifficulty: ${difficulty}\nBrief: ${topic}\n${
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
          model: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
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

    const payload = (await response.json()) as { output_text?: unknown };
    const draft = JSON.parse(extractText(payload)) as unknown;
    if (!validDraft(draft)) throw new Error('invalid_draft');

    return json({
      draft: {
        title: draft.title.trim().slice(0, 80),
        community,
        rewardMode: 'free',
        rewardAmount: '',
        question: draft.question.trim().slice(0, 180),
        choices: draft.choices.map((choice) => choice.trim().slice(0, 80)),
        correctChoice: draft.correctChoice,
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
