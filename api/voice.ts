import { executeVoicePipeline, readVaultStatusAloud } from '../lib/voice-pipeline';

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
 * Web Standard POST Handler (Next.js App Router / Vercel Edge & Serverless Functions)
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Check for JSON request (e.g. read_vault demo action)
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const userId = body.userId || body.riderId || request.headers.get('x-user-id') || 'rider_blr_01';

      if (body.action === 'read_vault') {
        const result = await readVaultStatusAloud(userId);
        return Response.json(result, { status: 200, headers: CORS_HEADERS });
      }
    }

    if (!contentType.includes('multipart/form-data')) {
      return Response.json(
        {
          error:
            'Invalid Content-Type. Expected multipart/form-data with audio "file" and optional "userId", or application/json with action "read_vault".',
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

    if (!file) {
      return Response.json(
        { error: 'Missing required audio file in form-data field "file".' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const result = await executeVoicePipeline(file, userId);

    return Response.json(result, {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error: any) {
    console.error('[SteadyGig Voice API Error]:', error);
    return Response.json(
      {
        error: error.message || 'Voice assistant pipeline processing failed.',
      },
      {
        status: 500,
        headers: CORS_HEADERS,
      }
    );
  }
}

/**
 * Node HTTP Handler fallback for legacy Vercel Serverless Function invocations
 */
export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    if (typeof req.formData === 'function') {
      const response = await POST(req);
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    return res.status(400).json({
      error: 'Please use multipart/form-data POST to /api/voice.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
