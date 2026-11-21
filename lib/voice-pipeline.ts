import { GoogleGenAI } from '@google/genai';
import { getSupabaseServerClient } from './supabase';

export type SupportedVoiceLanguage = 'kn-IN' | 'hi-IN' | 'en-IN';

export interface RiderFinancialContext {
  id: string;
  name: string;
  balance: number;
  vault_balance: number; // Stored in DB column vault_balance as the protected Bill Shield amount
  daily_earnings: number;
  target_payout: number;
  safety_reserve?: number;
  monthly_fixed_bills?: number;
  bill_due_day?: number;
  daily_fuel_spend?: number;
}

export interface VoiceIntentResult {
  intent: 'LOG_EXPENSE' | 'LOG_INCOME' | 'CHECK_BILLS_SHIELD' | 'CHECK_VAULT' | 'SIMULATE_PAYOUT';
  category: 'fuel' | 'food' | 'rent' | 'maintenance' | 'income' | null;
  amount: number | null;
  replyText: string;
}

export interface VoicePipelineResponse {
  transcript: string;
  replyText: string;
  audioBase64: string | null;
  languageCode: SupportedVoiceLanguage;
  action: {
    intent: 'LOG_EXPENSE' | 'LOG_INCOME' | 'CHECK_BILLS_SHIELD' | 'CHECK_VAULT' | 'SIMULATE_PAYOUT';
    category: 'fuel' | 'food' | 'rent' | 'maintenance' | 'income' | null;
    amount: number | null;
    previousBalance: number;
    updatedBalance: number;
    billShieldBalance: number;
    vaultBalance: number; // Compatibility alias
    transactionId?: string;
  };
}

export interface OnboardingVoiceResult {
  transcript: string;
  extractedValue: number | null;
  confirmationText: string;
  audioBase64: string | null;
  languageCode: SupportedVoiceLanguage;
}

const DEFAULT_RIDER: RiderFinancialContext = {
  id: 'rider_blr_01',
  name: 'Ravi Kumar',
  balance: 6650.0,
  vault_balance: 5200.0,
  daily_earnings: 1850.0,
  target_payout: 6000.0,
  safety_reserve: 250.0,
  monthly_fixed_bills: 12000.0,
  bill_due_day: 5,
  daily_fuel_spend: 250.0,
};

export function normalizeLanguageCode(raw?: string | null): SupportedVoiceLanguage {
  if (raw === 'hi-IN' || raw === 'en-IN' || raw === 'kn-IN') {
    return raw;
  }
  return 'kn-IN';
}

function formatSupabaseError(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as Record<string, unknown>;
  return JSON.stringify({
    code: e.code ?? null,
    message: e.message ?? String(err),
    details: e.details ?? null,
    hint: e.hint ?? null,
  });
}

/**
 * Fetch current rider's financial context from Supabase or fallback
 */
export async function getRiderFinancialContext(
  userId: string
): Promise<RiderFinancialContext> {
  const supabase = getSupabaseServerClient();
  const fallback: RiderFinancialContext = {
    ...DEFAULT_RIDER,
    id: userId || DEFAULT_RIDER.id,
  };

  if (!supabase) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('riders')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn(
        `[SteadyGig Voice] Supabase rider lookup failed: ${formatSupabaseError(error)}`
      );
      return fallback;
    }

    if (!data) {
      return fallback;
    }

    return {
      id: data.id || userId,
      name: data.name || fallback.name,
      balance: Number(data.balance ?? fallback.balance),
      vault_balance: Number(data.vault_balance ?? fallback.vault_balance),
      daily_earnings: Number(data.daily_earnings ?? fallback.daily_earnings),
      target_payout: Number(data.target_payout ?? fallback.target_payout),
      safety_reserve: Number(data.safety_reserve ?? fallback.safety_reserve),
      monthly_fixed_bills: Number(
        data.monthly_fixed_bills ??
          (data.weekly_obligations ? Number(data.weekly_obligations) * 4 : fallback.monthly_fixed_bills)
      ),
      bill_due_day: Number(data.bill_due_day ?? fallback.bill_due_day),
      daily_fuel_spend: Number(
        data.daily_fuel_spend ?? data.safety_reserve ?? fallback.daily_fuel_spend
      ),
    };
  } catch (err) {
    console.warn('[SteadyGig Voice] Supabase query failed, using seeded rider data:', err);
    return fallback;
  }
}

/**
 * Step A: Send audio to Sarvam AI Speech-To-Text (saaras:v4)
 * with Automatic Multimodal Gemini Audio Fallback
 */
export async function runSarvamSTT(
  audioBlob: Blob,
  sarvamApiKey: string,
  languageCode?: SupportedVoiceLanguage
): Promise<string> {
  const rawMime = (audioBlob.type || 'audio/webm').toLowerCase();
  const cleanMime = rawMime.split(';')[0].trim() || 'audio/webm';
  const ext = cleanMime.includes('mp4')
    ? 'mp4'
    : cleanMime.includes('wav')
    ? 'wav'
    : cleanMime.includes('ogg')
    ? 'ogg'
    : cleanMime.includes('mpeg') || cleanMime.includes('mp3')
    ? 'mp3'
    : 'webm';
  const arrayBuf = await audioBlob.arrayBuffer();

  // 1. First priority: Sarvam AI STT if API key is provided
  if (sarvamApiKey && sarvamApiKey.trim().length > 0) {
    try {
      const formData = new FormData();
      const cleanBlob = new Blob([arrayBuf], { type: cleanMime });
      formData.append('file', cleanBlob, `rider_voice.${ext}`);
      formData.append('model', 'saaras:v4');
      formData.append('mode', 'codemix');
      formData.append('language_code', languageCode || 'unknown');

      const response = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: {
          'api-subscription-key': sarvamApiKey.trim(),
        },
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        if (result?.transcript && typeof result.transcript === 'string') {
          const text = result.transcript.trim();
          if (text.length > 0) return text;
        }
      } else {
        const errorText = await response.text().catch(() => '');
        console.warn(`[SteadyGig] Sarvam STT returned ${response.status}: ${errorText}. Activating Gemini audio fallback.`);
      }
    } catch (sarvamErr) {
      console.warn('[SteadyGig] Sarvam STT request error, activating Gemini audio fallback:', sarvamErr);
    }
  }

  // 2. Second priority: Gemini Multimodal Audio Transcription
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (geminiApiKey) {
    try {
      const base64Audio = Buffer.from(arrayBuf).toString('base64');
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const langContext =
        languageCode === 'hi-IN'
          ? 'Hindi (or Hinglish)'
          : languageCode === 'en-IN'
          ? 'Indian English'
          : 'Kannada (or Kanglish)';

      const res = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are an accurate Speech-to-Text transcription model for Bengaluru gig delivery riders (Swiggy, Zomato, Domino's, Porter).
Transcribe the speech from this audio clip in ${langContext}.
Strict instructions:
- Return ONLY the exact transcribed words or numbers spoken.
- Do NOT add quotes, markdown formatting, explanations, or prefixes like "Transcript:".
- If the rider spoke digits or numbers (like "6000", "six thousand", "ಆರು ಸಾವಿರ", "छह हजार"), transcribe it accurately.`,
              },
              {
                inlineData: {
                  mimeType: cleanMime.startsWith('audio/') ? cleanMime : 'audio/webm',
                  data: base64Audio,
                },
              },
            ],
          },
        ],
      });

      const transcript = res.text?.trim() || '';
      if (transcript.length > 0) {
        return transcript;
      }
    } catch (geminiErr) {
      console.warn('[SteadyGig] Gemini multimodal audio transcription error:', geminiErr);
    }
  }

  return '';
}

/**
 * Sarvam AI Text-to-Speech (bulbul:v4-flash) for Kannada, Hindi, and English
 */
export async function runSarvamTTS(
  text: string,
  sarvamApiKey: string,
  languageCode: SupportedVoiceLanguage = 'kn-IN'
): Promise<string | null> {
  if (!sarvamApiKey || !text) {
    return null;
  }

  try {
    const response = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': sarvamApiKey.trim(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        target_language_code: languageCode,
        model: 'bulbul:v4-flash',
        speaker: 'shubh_enhi_ads',
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[SteadyGig Voice] Sarvam TTS error [${response.status}]: ${errText}`);
      return null;
    }

    const data = await response.json();
    if (Array.isArray(data.audios) && data.audios.length > 0) {
      return data.audios[0];
    }
  } catch (err) {
    console.warn('[SteadyGig Voice] Sarvam TTS request failed:', err);
  }

  return null;
}

/**
 * Deterministic multilingual number parser fallback (digits + common spoken words)
 */
function parseSpokenNumericValue(transcript: string): number | null {
  if (!transcript) return null;

  // Normalize comma-separated Indian numerals like 12,000
  const normalized = transcript.replace(/,/g, '');
  const digitMatches = normalized.match(/\d+(\.\d+)?/g);
  if (digitMatches && digitMatches.length > 0) {
    const val = parseFloat(digitMatches[0]);
    if (Number.isFinite(val)) return Math.round(val);
  }

  const lower = normalized.toLowerCase();
  const wordPairs: [RegExp, number][] = [
    [/\b(eighteen thousand|ಹದಿನೆಂಟು ಸಾವಿರ|अठारह हजार)\b/i, 18000],
    [/\b(fifteen thousand|ಹದಿನೈದು ಸಾವಿರ|पंद्रह हजार)\b/i, 15000],
    [/\b(twelve thousand|ಹನ್ನೆರಡು ಸಾವಿರ|बारह हजार)\b/i, 12000],
    [/\b(ten thousand|ಹತ್ತು ಸಾವಿರ|दस हजार)\b/i, 10000],
    [/\b(nine thousand|ಒಂಬತ್ತು ಸಾವಿರ|नौ हजार)\b/i, 9000],
    [/\b(eight thousand|ಎಂಟು ಸಾವಿರ|आठ हजार)\b/i, 8000],
    [/\b(seven thousand|ಏಳು ಸಾವಿರ|सात हजार)\b/i, 7000],
    [/\b(six thousand|ಆರು ಸಾವಿರ|छह हजार)\b/i, 6000],
    [/\b(five thousand|ಐದು ಸಾವಿರ|पांच हजार)\b/i, 5000],
    [/\b(four thousand|ನಾಲ್ಕು ಸಾವಿರ|चार हजार)\b/i, 4000],
    [/\b(three thousand|ಮೂರು ಸಾವಿರ|तीन हजार)\b/i, 3000],
    [/\b(two thousand|ಎರಡು ಸಾವಿರ|दो हजार)\b/i, 2000],
    [/\b(one thousand|ಒಂದು ಸಾವಿರ|एक हजार)\b/i, 1000],
    [/\b(five hundred|ಐನೂರು|पांच सौ)\b/i, 500],
    [/\b(four hundred|ನಾನ್ನೂರು|चार सौ)\b/i, 400],
    [/\b(three hundred|ಮೂನ್ನೂರು|तीन सौ)\b/i, 300],
    [/\b(two fifty|two hundred fifty|ಇನ್ನೂರ ಐವತ್ತು|ढाई सौ|दो सौ पचास)\b/i, 250],
    [/\b(two hundred|ಇನ್ನೂರು|दो सौ)\b/i, 200],
    [/\b(one fifty|one hundred fifty|ನೂರ ಐವತ್ತು|डेढ़ सौ|एक सौ पचास)\b/i, 150],
    [/\b(one hundred|ನೂರು|एक सौ)\b/i, 100],
  ];

  for (const [pattern, num] of wordPairs) {
    if (pattern.test(lower)) return num;
  }
  return null;
}

/**
 * Onboarding Step Voice Parser + Spoken Read-Back Confirmation
 */
export async function executeOnboardingStepVoice(params: {
  audioBlob: Blob;
  step: 1 | 2 | 3 | 4;
  languageCode: SupportedVoiceLanguage;
}): Promise<OnboardingVoiceResult> {
  const sarvamApiKey = process.env.SARVAM_API_KEY || '';
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

  const transcript = await runSarvamSTT(
    params.audioBlob,
    sarvamApiKey,
    params.languageCode
  );

  let extractedValue = parseSpokenNumericValue(transcript);

  if (geminiApiKey && transcript.trim().length > 0) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const stepDesc =
        params.step === 1
          ? 'Monthly fixed bills (Rent + Bike/Phone EMI in INR)'
          : params.step === 2
          ? 'Next major bill due day of the month (integer 1 to 31)'
          : params.step === 3
          ? 'Daily bike fuel spend on working days (in INR)'
          : 'Current total cash or bank balance (in INR)';

      const prompt = `Extract a single integer number from the gig rider's spoken answer in Kannada, Hindi, or English.
Question context: ${stepDesc}
Spoken transcript: "${transcript}"
Return JSON only: { "extractedValue": number | null }`;

      const res = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      const text = res.text?.trim() || '';
      if (text) {
        const parsed = JSON.parse(text) as { extractedValue?: unknown };
        if (
          typeof parsed.extractedValue === 'number' &&
          Number.isFinite(parsed.extractedValue)
        ) {
          extractedValue = Math.round(parsed.extractedValue);
        }
      }
    } catch (err) {
      console.warn('[SteadyGig Onboarding Voice] Gemini extract fallback:', err);
    }
  }

  // Compose Spoken Read-Back Confirmation
  let confirmationText = '';
  if (extractedValue !== null) {
    if (params.step === 1) {
      confirmationText =
        params.languageCode === 'hi-IN'
          ? `मासिक किराया और ईएमआई बिल शील्ड के लिए ₹${extractedValue} दर्ज किया गया।`
          : params.languageCode === 'en-IN'
          ? `Recorded ₹${extractedValue} for your monthly Rent & EMI Bill Shield.`
          : `ತಿಂಗಳ ಬಾಡಿಗೆ ಮತ್ತು ಇಎಂಐ ಬಿಲ್ ಶೀಲ್ಡ್‌ಗೆ ರೂ. ${extractedValue} ದಾಖಲಿಸಲಾಗಿದೆ.`;
    } else if (params.step === 2) {
      confirmationText =
        params.languageCode === 'hi-IN'
          ? `महीने की ${extractedValue} तारीख को बिल देय तिथि के रूप में सेट किया गया।`
          : params.languageCode === 'en-IN'
          ? `Set the ${extractedValue}th of each month as your bill due date.`
          : `ತಿಂಗಳ ${extractedValue} ನೇ ತಾರೀಖನ್ನು ಬಿಲ್ ಕೊನೆಯ ದಿನಾಂಕವಾಗಿ ನಿಗದಿಪಡಿಸಲಾಗಿದೆ.`;
    } else if (params.step === 3) {
      confirmationText =
        params.languageCode === 'hi-IN'
          ? `दैनिक बाइक पेट्रोल रिजर्व के लिए ₹${extractedValue} सेट किया गया।`
          : params.languageCode === 'en-IN'
          ? `Set ₹${extractedValue} for your daily bike fuel reserve.`
          : `ದೈನಂದಿನ ಬೈಕ್ ಪೆಟ್ರೋಲ್ ರಕ್ಷಣೆಗೆ ರೂ. ${extractedValue} ನಿಗದಿಪಡಿಸಲಾಗಿದೆ.`;
    } else {
      confirmationText =
        params.languageCode === 'hi-IN'
          ? `आपका वर्तमान बैलेंस ₹${extractedValue} अपडेट किया गया।`
          : params.languageCode === 'en-IN'
          ? `Updated your current cash balance to ₹${extractedValue}.`
          : `ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${extractedValue} ನವೀಕರಿಸಲಾಗಿದೆ.`;
    }
  } else {
    confirmationText =
      params.languageCode === 'hi-IN'
        ? 'आवाज स्पष्ट नहीं सुनाई दी, कृपया नीचे दिए गए विकल्पों में से चुनें या लिखें।'
        : params.languageCode === 'en-IN'
        ? 'Could not catch the number clearly, please tap a quick option below or type.'
        : 'ಧ್ವನಿ ಸ್ಪಷ್ಟವಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ, ದಯವಿಟ್ಟು ಕೆಳಗಿನ ಬಟನ್ ಒತ್ತಿ ಅಥವಾ ಟೈಪ್ ಮಾಡಿ.';
  }

  const audioBase64 = confirmationText
    ? await runSarvamTTS(confirmationText, sarvamApiKey, params.languageCode)
    : null;

  return {
    transcript: transcript || '(No speech detected)',
    extractedValue,
    confirmationText,
    audioBase64,
    languageCode: params.languageCode,
  };
}

/**
 * Step B: Intent & Action Extraction using Gemini Flash
 */
export async function extractIntentAndReply(
  transcript: string,
  rider: RiderFinancialContext,
  geminiApiKey: string,
  languageCode: SupportedVoiceLanguage = 'kn-IN'
): Promise<VoiceIntentResult> {
  const fuelDaily = rider.daily_fuel_spend || 250;
  const fuelProtected = Math.min(rider.balance, fuelDaily * 2);
  const afterFuel = Math.max(0, rider.balance - fuelProtected);
  const monthlyBills = rider.monthly_fixed_bills || 12000;
  const billProtected = Math.min(monthlyBills, afterFuel);
  const spendable = Math.max(0, rider.balance - fuelProtected - billProtected);

  if (!transcript || transcript.trim().length === 0) {
    const defaultReply =
      languageCode === 'hi-IN'
        ? `आपकी आवाज सुनाई नहीं दी। आपके ₹${billProtected} बिल शील्ड में और ₹${fuelProtected} पेट्रोल के लिए सुरक्षित हैं।`
        : languageCode === 'en-IN'
        ? `Could not hear your voice clearly. ₹${billProtected} is protected in your Bill Shield and ₹${fuelProtected} for fuel.`
        : `ನಿಮ್ಮ ಧ್ವನಿ ಕೇಳಿಸಲಿಲ್ಲ. ನಿಮ್ಮ ರೂ. ${billProtected} ಬಿಲ್ ಶೀಲ್ಡ್‌ನಲ್ಲಿ ಮತ್ತು ರೂ. ${fuelProtected} ಪೆಟ್ರೋಲ್‌ಗೆ ಸುರಕ್ಷಿತವಾಗಿದೆ.`;

    return {
      intent: 'CHECK_BILLS_SHIELD',
      category: null,
      amount: null,
      replyText: defaultReply,
    };
  }

  const langInstruction =
    languageCode === 'hi-IN'
      ? 'Speak natural conversational Hindi in Devanagari script (हिन्दी).'
      : languageCode === 'en-IN'
      ? 'Speak natural Indian English.'
      : 'Speak natural Bengaluru conversational Kannada in Kannada script (ಕನ್ನಡ ಲಿಪಿ).';

  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const prompt = `User Spoken Transcript:
"${transcript}"

Rider Financial Context:
- Rider Name: ${rider.name}
- Total Available Cash: ₹${rider.balance}
- Monthly Fixed Bills (Rent + EMI): ₹${monthlyBills} (Due on day ${rider.bill_due_day || 5})
- Bike Fuel Reserve Protected: ₹${fuelProtected} (2 working shifts covered)
- Upcoming Bills Shield Protected: ₹${billProtected}
- True Spendable Cash (Safe Guilt-Free): ₹${spendable}

Task:
You are SteadyGig's voice financial co-pilot for Bengaluru gig delivery riders.
Analyze the transcript and return a single JSON object:
1. "intent": "LOG_EXPENSE", "LOG_INCOME", "CHECK_BILLS_SHIELD", or "SIMULATE_PAYOUT".
2. "category": If LOG_EXPENSE -> "fuel", "food", "rent", or "maintenance". If LOG_INCOME -> "income". Else null.
3. "amount": Numeric ₹ amount mentioned, or null.
4. "replyText": A concise 1–2 sentence spoken reply. ${langInstruction}
   - If LOG_EXPENSE: confirm expense of ₹amount logged and state updated remaining spendable cash.
   - If LOG_INCOME: confirm ₹amount earnings added and mention how it strengthens their Bill Shield and spendable balance.
   - If CHECK_BILLS_SHIELD / SIMULATE_PAYOUT: state how much is protected in their Upcoming Bills Shield (Rent + EMI) & Fuel Reserve vs remaining spendable cash.

Required JSON Schema:
{
  "intent": "LOG_EXPENSE" | "LOG_INCOME" | "CHECK_BILLS_SHIELD" | "SIMULATE_PAYOUT",
  "category": "fuel" | "food" | "rent" | "maintenance" | "income" | null,
  "amount": number | null,
  "replyText": string
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const responseText = response.text?.trim() || '';
      if (responseText) {
        const parsed = JSON.parse(responseText);
        if (parsed && parsed.intent && parsed.replyText) {
          return {
            intent: parsed.intent === 'CHECK_VAULT' ? 'CHECK_BILLS_SHIELD' : parsed.intent,
            category: parsed.category || null,
            amount: typeof parsed.amount === 'number' ? parsed.amount : null,
            replyText: parsed.replyText,
          };
        }
      }
    } catch (err) {
      console.warn('[SteadyGig Voice] Gemini API error, falling back to rule-based extractor:', err);
    }
  }

  return fallbackIntentExtractor(transcript, rider, languageCode);
}

function fallbackIntentExtractor(
  transcript: string,
  rider: RiderFinancialContext,
  lang: SupportedVoiceLanguage
): VoiceIntentResult {
  const lower = transcript.toLowerCase();
  const parsedAmount = parseSpokenNumericValue(transcript);

  const fuelDaily = rider.daily_fuel_spend || 250;
  const fuelProtected = Math.min(rider.balance, fuelDaily * 2);
  const afterFuel = Math.max(0, rider.balance - fuelProtected);
  const monthlyBills = rider.monthly_fixed_bills || 12000;
  const billProtected = Math.min(monthlyBills, afterFuel);
  const spendable = Math.max(0, rider.balance - fuelProtected - billProtected);

  if (
    lower.includes('petrol') ||
    lower.includes('fuel') ||
    lower.includes('diesel') ||
    lower.includes('ಪೆಟ್ರೋಲ್') ||
    lower.includes('पेट्रोल')
  ) {
    const amt = parsedAmount || fuelDaily || 200;
    const remaining = Math.max(0, rider.balance - amt);
    return {
      intent: 'LOG_EXPENSE',
      category: 'fuel',
      amount: amt,
      replyText:
        lang === 'hi-IN'
          ? `₹${amt} पेट्रोल खर्च दर्ज हो गया। अब आपका बैलेंस ₹${remaining} है।`
          : lang === 'en-IN'
          ? `Logged ₹${amt} bike fuel expense. Remaining balance is ₹${remaining}.`
          : `ರೂ. ${amt} ಪೆಟ್ರೋಲ್ ಖರ್ಚು ದಾಖಲಾಗಿದೆ. ಉಳಿದ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${remaining} ಆಗಿದೆ.`,
    };
  }

  if (
    lower.includes('food') ||
    lower.includes('lunch') ||
    lower.includes('tiffin') ||
    lower.includes('oota') ||
    lower.includes('tea') ||
    lower.includes('coffee') ||
    lower.includes('ಊಟ') ||
    lower.includes('ತಿಂಡಿ') ||
    lower.includes('खाना') ||
    lower.includes('चाय')
  ) {
    const amt = parsedAmount || 90;
    const remaining = Math.max(0, rider.balance - amt);
    return {
      intent: 'LOG_EXPENSE',
      category: 'food',
      amount: amt,
      replyText:
        lang === 'hi-IN'
          ? `₹${amt} भोजन और चाय का खर्च दर्ज किया गया।`
          : lang === 'en-IN'
          ? `Logged ₹${amt} food & refreshment expense.`
          : `ರೂ. ${amt} ಊಟ ಮತ್ತು ತಿಂಡಿ ಖರ್ಚು ಸೇರಿಸಲಾಗಿದೆ.`,
    };
  }

  if (
    lower.includes('service') ||
    lower.includes('puncture') ||
    lower.includes('oil') ||
    lower.includes('repair') ||
    lower.includes('ರಿಪೇರಿ') ||
    lower.includes('ಮೈಂಟೆನೆನ್ಸ್') ||
    lower.includes('पंचर')
  ) {
    const amt = parsedAmount || 250;
    const remaining = Math.max(0, rider.balance - amt);
    return {
      intent: 'LOG_EXPENSE',
      category: 'maintenance',
      amount: amt,
      replyText:
        lang === 'hi-IN'
          ? `₹${amt} बाइक रखरखाव व मरम्मत दर्ज की गई। शेष राशि ₹${remaining} है।`
          : lang === 'en-IN'
          ? `Logged ₹${amt} bike maintenance expense. Remaining balance is ₹${remaining}.`
          : `ರೂ. ${amt} ಬೈಕ್ ರಿಪೇರಿ ಖರ್ಚು ದಾಖಲಾಗಿದೆ. ಉಳಿದ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${remaining} ಆಗಿದೆ.`,
    };
  }

  if (
    lower.includes('payout') ||
    lower.includes('earning') ||
    lower.includes('income') ||
    lower.includes('tip') ||
    lower.includes('orders') ||
    lower.includes('ಗಳಿಕೆ') ||
    lower.includes('ಕಮಾಯಿ') ||
    lower.includes('कमाई')
  ) {
    const amt = parsedAmount || 850;
    const updated = rider.balance + amt;
    return {
      intent: 'LOG_INCOME',
      category: 'income',
      amount: amt,
      replyText:
        lang === 'hi-IN'
          ? `₹${amt} की नई डिलीवरी कमाई जोड़ दी गई! आपका नया बैलेंस ₹${updated} है।`
          : lang === 'en-IN'
          ? `Added ₹${amt} delivery earnings! Your new balance is ₹${updated}.`
          : `ರೂ. ${amt} ಡೆಲಿವರಿ ಗಳಿಕೆ ಸೇರಿಸಲಾಗಿದೆ! ನಿಮ್ಮ ಹೊಸ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${updated} ಆಗಿದೆ.`,
    };
  }

  // Default: Check Upcoming Bills Shield Status
  return {
    intent: 'CHECK_BILLS_SHIELD',
    category: null,
    amount: null,
    replyText:
      lang === 'hi-IN'
        ? `आपके ₹${rider.balance} बैलेंस में से ₹${fuelProtected} बाइक पेट्रोल के लिए और ₹${billProtected} किराया व ईएमआई बिल शील्ड में सुरक्षित हैं। खर्च के लिए ₹${spendable} उपलब्ध हैं।`
        : lang === 'en-IN'
        ? `Out of ₹${rider.balance}, ₹${fuelProtected} is reserved for fuel and ₹${billProtected} is shielded for your rent and EMI bills, leaving ₹${spendable} spendable.`
        : `ನಿಮ್ಮ ರೂ. ${rider.balance} ರಲ್ಲಿ ರೂ. ${fuelProtected} ಬೈಕ್ ಪೆಟ್ರೋಲ್‌ಗಾಗಿ ಮತ್ತು ರೂ. ${billProtected} ಬಾಡಿಗೆ-ಇಎಂಐ ಬಿಲ್ ಶೀಲ್ಡ್‌ನಲ್ಲಿ ಸುರಕ್ಷಿತವಾಗಿದೆ. ಖರ್ಚಿಗೆ ರೂ. ${spendable} ಲಭ್ಯವಿದೆ.`,
  };
}

/**
 * Step C: Supabase Mutation
 */
export async function mutateRiderTransaction(
  rider: RiderFinancialContext,
  intent: 'LOG_EXPENSE' | 'LOG_INCOME' | 'CHECK_BILLS_SHIELD' | 'CHECK_VAULT' | 'SIMULATE_PAYOUT',
  category: 'fuel' | 'food' | 'rent' | 'maintenance' | 'income' | null,
  amount: number
): Promise<{ updatedBalance: number; transactionId?: string }> {
  const isIncome = intent === 'LOG_INCOME';
  const updatedBalance = isIncome
    ? rider.balance + amount
    : Math.max(0, rider.balance - amount);

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { updatedBalance };
  }

  try {
    const txCategory =
      category || (isIncome ? 'income' : 'fuel');
    const txType = isIncome ? 'income' : 'expense';
    const txPayload = {
      rider_id: rider.id,
      category: txCategory,
      amount,
      type: txType,
      description: `Voice logged: ${txCategory} (₹${amount})`,
      created_at: new Date().toISOString(),
    };

    let { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert(txPayload)
      .select('id')
      .maybeSingle();

    // If rider row hasn't been seeded yet (FK violation 23503), create it and retry once
    if (txError?.code === '23503') {
      const { error: seedError } = await supabase.from('riders').upsert({
        id: rider.id,
        name: rider.name || 'Ravi Kumar',
        balance: rider.balance,
        vault_balance: rider.vault_balance,
        daily_earnings: rider.daily_earnings,
        target_payout: rider.target_payout,
        safety_reserve: rider.safety_reserve ?? 2000,
        monthly_fixed_bills: rider.monthly_fixed_bills ?? 12000,
        bill_due_day: rider.bill_due_day ?? 5,
        daily_fuel_spend: rider.daily_fuel_spend ?? 250,
      });
      if (!seedError) {
        const retry = await supabase
          .from('transactions')
          .insert(txPayload)
          .select('id')
          .maybeSingle();
        tx = retry.data;
        txError = retry.error;
      }
    }

    if (txError) {
      console.warn(
        `[SteadyGig Voice] Supabase transaction insert failed: ${formatSupabaseError(txError)}`
      );
    }

    const { error: riderError } = await supabase
      .from('riders')
      .update({
        balance: updatedBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rider.id);

    if (riderError) {
      console.warn(
        `[SteadyGig Voice] Supabase rider balance update failed: ${formatSupabaseError(riderError)}`
      );
    }

    return {
      updatedBalance,
      transactionId: tx?.id,
    };
  } catch (err) {
    console.warn(
      `[SteadyGig Voice] Supabase mutation error: ${formatSupabaseError(err)}`
    );
    return { updatedBalance };
  }
}

/**
 * Speak Current Bill Shield & Fuel Reserve Status Aloud
 */
export async function readBillShieldStatusAloud(
  userId: string,
  languageCode: SupportedVoiceLanguage = 'kn-IN'
): Promise<VoicePipelineResponse> {
  const sarvamApiKey = process.env.SARVAM_API_KEY || '';
  const rider = await getRiderFinancialContext(userId);

  const fuelDaily = rider.daily_fuel_spend || 250;
  const fuelProtected = Math.min(rider.balance, fuelDaily * 2);
  const afterFuel = Math.max(0, rider.balance - fuelProtected);
  const monthlyBills = rider.monthly_fixed_bills || 12000;
  const billProtected = Math.min(monthlyBills, afterFuel);
  const spendable = Math.max(0, rider.balance - fuelProtected - billProtected);

  const replyText =
    languageCode === 'hi-IN'
      ? `आपके ₹${rider.balance} बैलेंस में से ₹${fuelProtected} बाइक पेट्रोल के लिए और ₹${billProtected} किराया व ईएमआई बिल शील्ड में सुरक्षित हैं। अभी ₹${spendable} बिना चिंता के खर्च करने के लिए बचे हैं।`
      : languageCode === 'en-IN'
      ? `Out of ₹${rider.balance}, ₹${fuelProtected} is protected for bike fuel and ₹${billProtected} is shielded for your upcoming rent and EMI bills. You have ₹${spendable} in spendable cash.`
      : `ನಿಮ್ಮ ರೂ. ${rider.balance} ರಲ್ಲಿ ರೂ. ${fuelProtected} ಬೈಕ್ ಪೆಟ್ರೋಲ್‌ಗಾಗಿ ಮತ್ತು ರೂ. ${billProtected} ತಿಂಗಳ ಬಾಡಿಗೆ ಮತ್ತು ಇಎಂಐ ಬಿಲ್ ಶೀಲ್ಡ್‌ನಲ್ಲಿ ಸುರಕ್ಷಿತವಾಗಿದೆ. ಖರ್ಚಿಗೆ ರೂ. ${spendable} ಲಭ್ಯವಿದೆ.`;

  const audioBase64 = await runSarvamTTS(replyText, sarvamApiKey, languageCode);

  return {
    transcript:
      languageCode === 'hi-IN'
        ? 'बिल शील्ड और ईंधन सुरक्षा स्थिति'
        : languageCode === 'en-IN'
        ? 'Bill Shield & Fuel Reserve Status'
        : 'ಬಿಲ್ ಶೀಲ್ಡ್ ಮತ್ತು ಪೆಟ್ರೋಲ್ ರಕ್ಷಣೆ ಸ್ಥಿತಿ',
    replyText,
    audioBase64,
    languageCode,
    action: {
      intent: 'CHECK_BILLS_SHIELD',
      category: null,
      amount: null,
      previousBalance: rider.balance,
      updatedBalance: rider.balance,
      billShieldBalance: billProtected,
      vaultBalance: billProtected, // Compatibility alias
    },
  };
}

// Backwards compatibility alias
export const readVaultStatusAloud = readBillShieldStatusAloud;

/**
 * Complete End-to-End Multilingual Voice Assistant Pipeline
 */
export async function executeVoicePipeline(
  audioBlob: Blob,
  userId: string,
  languageCode: SupportedVoiceLanguage = 'kn-IN'
): Promise<VoicePipelineResponse> {
  const sarvamApiKey = process.env.SARVAM_API_KEY || '';
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

  const riderContext = await getRiderFinancialContext(userId);
  const transcript = await runSarvamSTT(audioBlob, sarvamApiKey, languageCode);
  const extraction = await extractIntentAndReply(
    transcript,
    riderContext,
    geminiApiKey,
    languageCode
  );

  let updatedBalance = riderContext.balance;
  let transactionId: string | undefined;

  if (
    (extraction.intent === 'LOG_EXPENSE' || extraction.intent === 'LOG_INCOME') &&
    typeof extraction.amount === 'number' &&
    extraction.amount > 0
  ) {
    const mutation = await mutateRiderTransaction(
      riderContext,
      extraction.intent,
      extraction.category,
      extraction.amount
    );
    updatedBalance = mutation.updatedBalance;
    transactionId = mutation.transactionId;
  }

  const audioBase64 = await runSarvamTTS(
    extraction.replyText,
    sarvamApiKey,
    languageCode
  );

  const fuelDaily = riderContext.daily_fuel_spend || 250;
  const fuelProtected = Math.min(updatedBalance, fuelDaily * 2);
  const afterFuel = Math.max(0, updatedBalance - fuelProtected);
  const monthlyBills = riderContext.monthly_fixed_bills || 12000;
  const billProtected = Math.min(monthlyBills, afterFuel);

  return {
    transcript: transcript || '(No speech detected)',
    replyText: extraction.replyText,
    audioBase64,
    languageCode,
    action: {
      intent: extraction.intent,
      category: extraction.category,
      amount: extraction.amount,
      previousBalance: riderContext.balance,
      updatedBalance,
      billShieldBalance: billProtected,
      vaultBalance: billProtected, // Compatibility alias
      transactionId,
    },
  };
}
