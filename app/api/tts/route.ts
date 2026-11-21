import { NextRequest, NextResponse } from 'next/server';
import {
  getSarvamApiKey,
  runSarvamTTS,
  SupportedVoiceLanguage,
} from '@/lib/voice-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ALLOWED_LANGUAGES = new Set<SupportedVoiceLanguage>([
  'kn-IN',
  'hi-IN',
  'en-IN',
]);

export async function GET() {
  return NextResponse.json({
    ok: true,
    sarvamKeyConfigured: Boolean(getSarvamApiKey()),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawText = typeof body?.text === 'string' ? body.text.trim() : '';
    const rawLang =
      typeof body?.languageCode === 'string' ? body.languageCode : 'kn-IN';

    if (!rawText) {
      return NextResponse.json(
        { error: 'Text is required for speech synthesis.' },
        { status: 400 }
      );
    }

    if (rawText.length > 600) {
      return NextResponse.json(
        { error: 'Text exceeds maximum 600 character limit.' },
        { status: 400 }
      );
    }

    const languageCode: SupportedVoiceLanguage = ALLOWED_LANGUAGES.has(
      rawLang as SupportedVoiceLanguage
    )
      ? (rawLang as SupportedVoiceLanguage)
      : 'kn-IN';

    const sarvamApiKey = getSarvamApiKey();
    const audioBase64 = await runSarvamTTS(rawText, sarvamApiKey, languageCode);

    return NextResponse.json({
      audioBase64,
      languageCode,
      sarvamKeyConfigured: Boolean(sarvamApiKey),
      provider: audioBase64 ? 'sarvam' : 'browser-fallback',
    });
  } catch (err) {
    console.warn('[SteadyGig TTS Route] Error:', err);
    return NextResponse.json(
      { audioBase64: null, provider: 'browser-fallback' },
      { status: 200 }
    );
  }
}
