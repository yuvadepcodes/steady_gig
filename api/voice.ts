import {
  executeOnboardingStepVoice,
  executeVoicePipeline,
  normalizeLanguageCode,
  readVaultStatusAloud,
} from '../lib/voice-pipeline';

export const config = {
  maxDuration: 30,
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Web Standard POST Handler (Next.js App Router)
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      const userId =
        body.userId ||
        body.riderId ||
        request.headers.get('x-user-id') ||
        'rider_blr_01';
      const languageCode = normalizeLanguageCode(body.languageCode);

      if (body.action === 'read_vault') {
        const result = await readVaultStatusAloud(userId, languageCode);
        return Response.json(result, { status: 200, headers: CORS_HEADERS });
      }
    }

    if (!contentType.includes('multipart/form-data')) {
      return Response.json(
        {
          error:
            'Invalid Content-Type. Expected multipart/form-data with audio "file", or application/json with action "read_vault".',
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const formData = await request.formData();
    const file = (formData.get('file') || formData.get('audio')) as Blob | null;
    const userId =
      (formData.get('userId') as string) ||
      (formData.get('riderId') as string) ||
      request.headers.get('x-user-id') ||
      'rider_blr_01';
    const languageCode = normalizeLanguageCode(
      formData.get('languageCode') as string | null
    );
    const mode = (formData.get('mode') as string) || 'assistant';

    if (!file) {
      return Response.json(
        { error: 'Missing required audio file in form-data field "file".' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (mode === 'onboarding_step') {
      const stepRaw = Number(formData.get('step') || 1);
      const step = (
        stepRaw === 2 || stepRaw === 3 || stepRaw === 4 ? stepRaw : 1
      ) as 1 | 2 | 3 | 4;

      const onboardingResult = await executeOnboardingStepVoice({
        audioBlob: file,
        step,
        languageCode,
      });

      return Response.json(onboardingResult, {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    const result = await executeVoicePipeline(file, userId, languageCode);

    return Response.json(result, {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error: unknown) {
    console.error('[SteadyGig Voice API Error]:', error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Voice assistant pipeline processing failed.',
      },
      {
        status: 500,
        headers: CORS_HEADERS,
      }
    );
  }
}
