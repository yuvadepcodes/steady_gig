import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB in-memory cap

export interface ParsedScreenshotWeek {
  platformName: string;
  weekLabel: string;
  startDateISO: string;
  endDateISO: string;
  totalEarnings: number;
  orderPayout: number;
  incentives: number;
  totalOrders: number;
  singleRuns: number;
  multiRuns: number;
  cancelledOrdersCount: number;
  dailyEarnings: {
    Monday: number;
    Tuesday: number;
    Wednesday: number;
    Thursday: number;
    Friday: number;
    Saturday: number;
    Sunday: number;
  };
}

function sanitizeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.round(num);
}

function sanitizeString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  // Strip any accidental bank account / UPI / phone / email tokens
  const cleaned = value
    .replace(/\b\d{9,18}\b/g, '[redacted]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/g, '[redacted]')
    .trim();
  return cleaned.slice(0, 80) || fallback;
}

export async function POST(req: NextRequest) {
  let base64Image = '';

  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Upload a screenshot image using multipart/form-data.' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Please select a weekly payout screenshot image.' },
        { status: 400 }
      );
    }

    const mimeType = file.type.toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: 'Only PNG, JPG, or WebP payout screenshots are supported.' },
        { status: 400 }
      );
    }

    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: 'Screenshot file size must be between 1 KB and 8 MB.' },
        { status: 400 }
      );
    }

    const geminiApiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    if (!geminiApiKey) {
      return NextResponse.json(
        {
          error:
            'GEMINI_API_KEY is not configured on the server. Enter the payout figures manually in the form below.',
          code: 'MISSING_GEMINI_KEY',
        },
        { status: 422 }
      );
    }

    // Strict in-memory buffer read — never written to disk or persisted anywhere
    const arrayBuffer = await file.arrayBuffer();
    base64Image = Buffer.from(arrayBuffer).toString('base64');

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const prompt = `You are a gig-delivery earnings extractor for Bengaluru riders (Swiggy, Zomato, Domino's, Zepto, Blinkit, Porter).
Analyze this weekly or daily delivery partner earnings screenshot strictly for earnings metrics.

PRIVACY & PII RULES (CRITICAL):
- NEVER extract, repeat, or include bank account numbers, IFSC codes, UPI IDs, PAN, Aadhaar, phone numbers, email addresses, or customer details.
- Ignore any NEFT / bank transfer reference strings.

Extract ONLY these numeric & schedule fields in JSON:
{
  "platformName": string (e.g. "Swiggy", "Zomato", "Domino's", or "Delivery Platform"),
  "weekLabel": string (e.g. "Nov 16–22, 2026"),
  "startDateISO": string (Monday date in YYYY-MM-DD format; if year unclear use 2026),
  "endDateISO": string (Sunday date in YYYY-MM-DD format; if year unclear use 2026),
  "totalEarnings": number (total ₹ earned in screenshot),
  "orderPayout": number (base order payout ₹; if not shown separately use totalEarnings - incentives),
  "incentives": number (bonus/incentive ₹; 0 if not shown),
  "totalOrders": number (total completed orders),
  "singleRuns": number (single-order trips if shown, else totalOrders),
  "multiRuns": number (batched/multi-order trips if shown, else 0),
  "cancelledOrdersCount": number (excluded/cancelled orders if shown, else 0),
  "dailyEarnings": {
    "Monday": number,
    "Tuesday": number,
    "Wednesday": number,
    "Thursday": number,
    "Friday": number,
    "Saturday": number,
    "Sunday": number
  }
}

If daily breakdown bars are shown, extract exact numbers for Monday–Sunday so they sum close to totalEarnings. If only a single day or partial days are visible, populate visible days and 0 for invisible days.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    // Clear base64 payload from memory immediately after inference
    base64Image = '';

    const rawJson = response.text?.trim() || '';
    if (!rawJson) {
      return NextResponse.json(
        {
          error:
            'Could not read earnings numbers from this image. Please verify or enter the figures manually.',
        },
        { status: 422 }
      );
    }

    const raw = JSON.parse(rawJson) as Record<string, unknown>;
    const rawDaily = (raw.dailyEarnings || {}) as Record<string, unknown>;

    const dailyEarnings = {
      Monday: sanitizeNumber(rawDaily.Monday),
      Tuesday: sanitizeNumber(rawDaily.Tuesday),
      Wednesday: sanitizeNumber(rawDaily.Wednesday),
      Thursday: sanitizeNumber(rawDaily.Thursday),
      Friday: sanitizeNumber(rawDaily.Friday),
      Saturday: sanitizeNumber(rawDaily.Saturday),
      Sunday: sanitizeNumber(rawDaily.Sunday),
    };

    const dailySum = Object.values(dailyEarnings).reduce((a, b) => a + b, 0);
    const totalEarnings = sanitizeNumber(raw.totalEarnings, dailySum);
    const incentives = sanitizeNumber(raw.incentives, 0);
    const orderPayout = sanitizeNumber(
      raw.orderPayout,
      Math.max(0, totalEarnings - incentives)
    );
    const totalOrders = Math.max(1, sanitizeNumber(raw.totalOrders, 50));
    const singleRuns = sanitizeNumber(raw.singleRuns, totalOrders);
    const multiRuns = sanitizeNumber(
      raw.multiRuns,
      Math.max(0, totalOrders - singleRuns)
    );

    const startDateISO =
      typeof raw.startDateISO === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw.startDateISO)
        ? raw.startDateISO
        : '2026-11-16';
    const endDateISO =
      typeof raw.endDateISO === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw.endDateISO)
        ? raw.endDateISO
        : '2026-11-22';

    const parsed: ParsedScreenshotWeek = {
      platformName: sanitizeString(raw.platformName, 'Delivery Platform'),
      weekLabel: sanitizeString(
        raw.weekLabel,
        `${startDateISO} to ${endDateISO}`
      ),
      startDateISO,
      endDateISO,
      totalEarnings: totalEarnings > 0 ? totalEarnings : dailySum,
      orderPayout,
      incentives,
      totalOrders,
      singleRuns,
      multiRuns,
      cancelledOrdersCount: sanitizeNumber(raw.cancelledOrdersCount, 0),
      dailyEarnings,
    };

    return NextResponse.json({
      parsed,
      ephemeralProcessed: true,
    });
  } catch (err) {
    base64Image = '';
    console.warn('[SteadyGig Screenshot Parser] Error:', err);
    return NextResponse.json(
      {
        error:
          'Unable to parse screenshot automatically. Please check the image or enter values below.',
      },
      { status: 422 }
    );
  }
}
