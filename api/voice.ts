import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import formidable, { File as FormidableFile } from 'formidable';
import {
  executeOnboardingStepVoice,
  executeVoicePipeline,
  normalizeAudioMimeType,
  normalizeLanguageCode,
  readBillShieldStatusAloud,
} from '../lib/voice-pipeline';

export const config = {
  maxDuration: 30,
  api: {
    bodyParser: false,
  },
};

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
};

interface VercelRequestLike extends IncomingMessage {
  body?: unknown;
  formData?: () => Promise<FormData>;
}

interface VercelResponseLike extends ServerResponse {
  status?: (code: number) => VercelResponseLike;
  json?: (body: unknown) => unknown;
  send?: (body: unknown) => unknown;
  end: (cb?: (() => void) | unknown) => this;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

function getSingleField(
  fields: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const val = fields[key];
  if (Array.isArray(val)) return val[0];
  return val;
}

function setCorsHeaders(res: VercelResponseLike) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
}

function sendJson(res: VercelResponseLike, statusCode: number, payload: unknown) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    const statusRes = res.status(statusCode);
    if (typeof statusRes.json === 'function') {
      return statusRes.json(payload);
    }
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBodyFromNodeRequest(
  req: VercelRequestLike
): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}') as Record<string, unknown>;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Web Standard POST Handler (Next.js App Router / Web Request Runtime)
 */
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
    console.error('[SteadyGig Voice API Error]:', err);
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

/**
 * Node.js HTTP Handler for Vercel Serverless Functions & Pages Router API
 */
export default async function handler(
  req: VercelRequestLike,
  res: VercelResponseLike
) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') {
      return res.status(204).end();
    }
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
  }

  try {
    // Support Web Request runtime if req.formData exists
    if (typeof req.formData === 'function') {
      const response = await POST(req as unknown as Request);
      const data = await response.json();
      return sendJson(res, response.status, data);
    }

    const contentType = String(req.headers['content-type'] || '');

    if (contentType.includes('application/json')) {
      const body = await readJsonBodyFromNodeRequest(req);
      const headerUserId = req.headers['x-user-id'];
      const userId =
        (typeof body.userId === 'string' && body.userId) ||
        (typeof body.riderId === 'string' && body.riderId) ||
        (Array.isArray(headerUserId) ? headerUserId[0] : headerUserId) ||
        'rider_blr_01';
      const languageCode = normalizeLanguageCode(
        typeof body.languageCode === 'string' ? body.languageCode : undefined
      );

      if (body.action === 'read_bill_shield' || body.action === 'read_vault') {
        const result = await readBillShieldStatusAloud(userId, languageCode);
        return sendJson(res, 200, result);
      }

      return sendJson(res, 400, {
        error: 'Unsupported JSON action. Expected "read_bill_shield".',
      });
    }

    if (!contentType.includes('multipart/form-data')) {
      return sendJson(res, 400, {
        error:
          'Invalid Content-Type. Expected multipart/form-data with audio "file", or application/json with action "read_bill_shield".',
      });
    }

    const form = formidable({
      uploadDir: os.tmpdir(),
      keepExtensions: true,
      multiples: false,
      maxFileSize: 25 * 1024 * 1024,
      allowEmptyFiles: false,
    });

    const [fields, files] = await form.parse(req);
    const rawFile = files.file ?? files.audio;
    const uploadedFile: FormidableFile | undefined = Array.isArray(rawFile)
      ? rawFile[0]
      : rawFile;

    if (!uploadedFile || !uploadedFile.filepath) {
      return sendJson(res, 400, {
        error: 'Missing required audio file in form-data field "file".',
      });
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(uploadedFile.filepath);
    } finally {
      await fs.unlink(uploadedFile.filepath).catch(() => {});
    }

    if (fileBuffer.byteLength === 0) {
      return sendJson(res, 400, {
        error: 'Uploaded audio file is empty (0 bytes).',
      });
    }

    const headerUserId = req.headers['x-user-id'];
    const userId =
      getSingleField(fields, 'userId') ||
      getSingleField(fields, 'riderId') ||
      (Array.isArray(headerUserId) ? headerUserId[0] : headerUserId) ||
      'rider_blr_01';
    const languageCode = normalizeLanguageCode(
      getSingleField(fields, 'languageCode')
    );
    const mode = getSingleField(fields, 'mode') || 'assistant';

    const cleanMime = normalizeAudioMimeType(uploadedFile.mimetype);
    const cleanAudioBlob = new Blob([new Uint8Array(fileBuffer)], {
      type: cleanMime,
    });

    if (mode === 'onboarding_step') {
      const stepRaw = Number(getSingleField(fields, 'step') || 1);
      const step = (
        stepRaw === 2 || stepRaw === 3 || stepRaw === 4 ? stepRaw : 1
      ) as 1 | 2 | 3 | 4;

      const onboardingResult = await executeOnboardingStepVoice({
        audioBlob: cleanAudioBlob,
        step,
        languageCode,
      });
      return sendJson(res, 200, onboardingResult);
    }

    const result = await executeVoicePipeline(
      cleanAudioBlob,
      userId,
      languageCode
    );
    return sendJson(res, 200, result);
  } catch (err: unknown) {
    console.error('[SteadyGig Voice Node Handler Error]:', err);
    return sendJson(res, 500, {
      error: getErrorMessage(err, 'Voice assistant pipeline processing failed.'),
    });
  }
}
