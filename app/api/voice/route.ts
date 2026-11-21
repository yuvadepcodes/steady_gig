import { NextResponse } from 'next/server';
import {
  executeOnboardingStepVoice,
  executeVoicePipeline,
  getGeminiApiKey,
  getSarvamApiKey,
  normalizeAudioMimeType,
  normalizeLanguageCode,
  readBillShieldStatusAloud,
} from '@/lib/voice-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      runtime: 'nextjs-app-router',
      sarvamKeyConfigured: Boolean(getSarvamApiKey()),
      geminiKeyConfigured: Boolean(getGeminiApiKey()),
    },
    { status: 200, headers: CORS_HEADERS }
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      const userId =
        (typeof body.userId === 'string' && body.userId) ||
        (typeof body.riderId === 'string' && body.riderId) ||
        request.headers.get('x-user-id') ||
        'rider_blr_01';
      const languageCode = normalizeLanguageCode(
        typeof body.languageCode === 'string' ? body.languageCode : undefined
      );

      if (body.action === 'read_bill_shield' || body.action === 'read_vault') {
        const result = await readBillShieldStatusAloud(userId, languageCode);
        return Response.json(result, { status: 200, headers: CORS_HEADERS });
      }

      return Response.json(
        { error: 'Unsupported JSON action. Expected "read_bill_shield".' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!contentType.includes('multipart/form-data')) {
      return Response.json(
        {
          error:
            'Invalid Content-Type. Expected multipart/form-data with audio "file", or application/json with action "read_bill_shield".',
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const formData = await request.formData();
    const rawFile = formData.get('file') || formData.get('audio');
    const userId =
      (formData.get('userId') as string) ||
      (formData.get('riderId') as string) ||
      request.headers.get('x-user-id') ||
      'rider_blr_01';
    const languageCode = normalizeLanguageCode(
      formData.get('languageCode') as string | null
    );
    const mode = (formData.get('mode') as string) || 'assistant';

    if (!rawFile || typeof rawFile === 'string') {
      return Response.json(
        { error: 'Missing required audio file in form-data field "file".' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const arrayBuf = await rawFile.arrayBuffer();
    if (arrayBuf.byteLength === 0) {
      return Response.json(
        { error: 'Uploaded audio file is empty (0 bytes).' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cleanMime = normalizeAudioMimeType(rawFile.type);
    const cleanAudioBlob = new Blob([new Uint8Array(arrayBuf)], { type: cleanMime });

    if (mode === 'onboarding_step') {
      const stepRaw = Number(formData.get('step') || 1);
      const step = (
        stepRaw === 2 || stepRaw === 3 || stepRaw === 4 ? stepRaw : 1
      ) as 1 | 2 | 3 | 4;

      const onboardingResult = await executeOnboardingStepVoice({
        audioBlob: cleanAudioBlob,
        step,
        languageCode,
      });

      return Response.json(onboardingResult, {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    const result = await executeVoicePipeline(cleanAudioBlob, userId, languageCode);

    return Response.json(result, {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err: unknown) {
    console.error('[SteadyGig Voice App Route Error]:', err);
    return Response.json(
      {
        error: getErrorMessage(err, 'Voice assistant pipeline processing failed.'),
      },
      {
        status: 500,
        headers: CORS_HEADERS,
      }
    );
  }
}
