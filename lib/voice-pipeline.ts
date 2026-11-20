import { GoogleGenAI } from '@google/genai';
import { getSupabaseServerClient } from './supabase';

export type SupportedVoiceLanguage = 'kn-IN' | 'hi-IN' | 'en-IN';

export interface RiderFinancialContext {
  id: string;
  name: string;
  balance: number;
  vault_balance: number;
  daily_earnings: number;
  target_payout: number;
  safety_reserve?: number;
  monthly_fixed_bills?: number;
  bill_due_day?: number;
  daily_fuel_spend?: number;
}

export interface VoiceIntentResult {
  intent: 'LOG_EXPENSE' | 'LOG_INCOME' | 'CHECK_VAULT' | 'SIMULATE_PAYOUT';
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
    intent: 'LOG_EXPENSE' | 'LOG_INCOME' | 'CHECK_VAULT' | 'SIMULATE_PAYOUT';
    category: 'fuel' | 'food' | 'rent' | 'maintenance' | 'income' | null;
    amount: number | null;
    previousBalance: number;
    updatedBalance: number;
    vaultBalance: number;
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

    if (error || !data) {
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
 */
export async function runSarvamSTT(
  audioBlob: Blob,
  sarvamApiKey: string,
  languageCode?: SupportedVoiceLanguage
): Promise<string> {
  if (!sarvamApiKey) {
    throw new Error('SARVAM_API_KEY is missing from server environment variables.');
  }

  const formData = new FormData();
  const filename = (audioBlob as File).name || 'audio.webm';
  formData.append('file', audioBlob, filename);
  formData.append('model', 'saaras:v4');
  formData.append('mode', 'codemix');
  formData.append('language_code', languageCode || 'unknown');

  const response = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST',
    headers: {
      'api-subscription-key': sarvamApiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam STT failed [${response.status}]: ${errorText}`);
  }

  const result = await response.json();
  return result.transcript || '';
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
        'api-subscription-key': sarvamApiKey,
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
      const errText = await response.text();
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
  // Normalize comma-separated Indian numerals like 12,000
  const normalized = transcript.replace(/,/g, '');
  const digitMatches = normalized.match(/\d+(\.\d+)?/g);
  if (digitMatches && digitMatches.length > 0) {
    const val = parseFloat(digitMatches[0]);
    if (Number.isFinite(val)) return Math.round(val);
  }

  const lower = normalized.toLowerCase();
  // Quick word lookup for common onboarding values
  const wordPairs: [RegExp, number][] = [
    [/\b(fifteen thousand|ಹದಿನೈದು ಸಾವಿರ|पंद्रह हजार)\b/i, 15000],
    [/\b(twelve thousand|ಹನ್ನೆರಡು ಸಾವಿರ|बारह हजार)\b/i, 12000],
    [/\b(ten thousand|ಹತ್ತು ಸಾವಿರ|दस हजार)\b/i, 10000],
    [/\b(eight thousand|ಎಂಟು ಸಾವಿರ|आठ हजार)\b/i, 8000],
    [/\b(five thousand|ಐದು ಸಾವಿರ|पांच हजार)\b/i, 5000],
    [/\b(three thousand|ಮೂರು ಸಾವಿರ|तीन हजार)\b/i, 3000],
    [/\b(two thousand|ಎರಡು ಸಾವಿರ|दो हजार)\b/i, 2000],
    [/\b(three hundred|ಮೂನ್ನೂರು|तीन सौ)\b/i, 300],
    [/\b(two fifty|two hundred fifty|ಇನ್ನೂರ ಐವತ್ತು|ढाई सौ)\b/i, 250],
    [/\b(two hundred|ಇನ್ನೂರು|दो सौ)\b/i, 200],
    [/\b(one fifty|ನೂರ ಐವತ್ತು|डेढ़ सौ)\b/i, 150],
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
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
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

  if (extractedValue !== null) {
    if (params.step === 2) {
      extractedValue = Math.min(31, Math.max(1, extractedValue));
    } else {
      extractedValue = Math.max(0, extractedValue);
    }
  }

  const confirmationText = buildOnboardingConfirmationText(
    params.step,
    extractedValue,
    params.languageCode
  );

  const audioBase64 = await runSarvamTTS(
    confirmationText,
    sarvamApiKey,
    params.languageCode
  );

  return {
    transcript,
    extractedValue,
    confirmationText,
    audioBase64,
    languageCode: params.languageCode,
  };
}

function buildOnboardingConfirmationText(
  step: 1 | 2 | 3 | 4,
  value: number | null,
  lang: SupportedVoiceLanguage
): string {
  if (value === null) {
    if (lang === 'kn-IN') {
      return 'ಸಂಖ್ಯೆ ಸ್ಪಷ್ಟವಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಹೇಳಿ ಅಥವಾ ಕೆಳಗೆ ಟ್ಯಾಪ್ ಮಾಡಿ.';
    }
    if (lang === 'hi-IN') {
      return 'संख्या साफ़ सुनाई नहीं दी। कृपया फिर से बोलें या नीचे टैप करें।';
    }
    return 'I could not catch the number clearly. Please speak again or tap an amount below.';
  }

  if (step === 2) {
    if (lang === 'kn-IN') {
      return `ಸರಿ, ನಿಮ್ಮ ಮುಂದಿನ ಬಿಲ್ ದಿನಾಂಕ ತಿಂಗಳ ${value} ನೇ ತಾರೀಖು ಎಂದು ನಮೂದಿಸಲಾಗಿದೆ.`;
    }
    if (lang === 'hi-IN') {
      return `ठीक है, आपके अगले बिल की तारीख महीने की ${value} तारीख दर्ज की गई है।`;
    }
    return `Got it, your next major bill due date is day ${value} of the month.`;
  }

  const labels: Record<1 | 3 | 4, Record<SupportedVoiceLanguage, string>> = {
    1: {
      'kn-IN': `ಸರಿ, ತಿಂಗಳ ಬಾಡಿಗೆ ಮತ್ತು ಇಎಂಐ ರೂ. ${value} ಎಂದು ದಾಖಲಿಸಲಾಗಿದೆ.`,
      'hi-IN': `ठीक है, आपका मासिक किराया और ईएमआई ₹${value} दर्ज किया गया है।`,
      'en-IN': `Got it, ₹${value.toLocaleString('en-IN')} saved for your monthly rent and EMI bills.`,
    },
    3: {
      'kn-IN': `ಸರಿ, ಪ್ರತಿದಿನದ ಬೈಕ್ ಪೆಟ್ರೋಲ್ ಖರ್ಚು ರೂ. ${value} ಎಂದು ದಾಖಲಿಸಲಾಗಿದೆ.`,
      'hi-IN': `ठीक है, रोज़ का बाइक पेट्रोल खर्च ₹${value} दर्ज किया गया है।`,
      'en-IN': `Got it, ₹${value.toLocaleString('en-IN')} set for your daily bike fuel reserve.`,
    },
    4: {
      'kn-IN': `ಸರಿ, ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${value} ಎಂದು ದಾಖಲಿಸಲಾಗಿದೆ.`,
      'hi-IN': `ठीक है, आपका वर्तमान बैलेंस ₹${value} दर्ज किया गया है।`,
      'en-IN': `Got it, ₹${value.toLocaleString('en-IN')} recorded as your current cash and bank balance.`,
    },
  };

  return labels[step][lang];
}

/**
 * Step B: Multilingual Intent & Action Extraction using Gemini 4 Hydrogen
 */
export async function extractIntentAndReply(
  transcript: string,
  rider: RiderFinancialContext,
  geminiApiKey: string,
  languageCode: SupportedVoiceLanguage = 'kn-IN'
): Promise<VoiceIntentResult> {
  const langInstruction =
    languageCode === 'hi-IN'
      ? 'Respond in natural conversational Hindi (Devanagari script: हिन्दी).'
      : languageCode === 'en-IN'
      ? 'Respond in clear, simple Indian English.'
      : 'Respond in natural conversational Bengaluru Kannada (Kannada script: ಕನ್ನಡ ಲಿಪಿ).';

  if (!transcript || transcript.trim().length === 0) {
    const emptyMsg =
      languageCode === 'hi-IN'
        ? `आवाज़ साफ़ नहीं आई। आपका कुल बैलेंस ₹${rider.balance} है और मासिक बिल लक्ष्य ₹${rider.monthly_fixed_bills || 12000} है।`
        : languageCode === 'en-IN'
        ? `I didn't hear anything clearly. Your current balance is ₹${rider.balance} and your monthly bill target is ₹${rider.monthly_fixed_bills || 12000}.`
        : `ನಿಮ್ಮ ಧ್ವನಿ ಕೇಳಿಸಲಿಲ್ಲ. ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${rider.balance} ಇದೆ.`;

    return {
      intent: 'CHECK_VAULT',
      category: null,
      amount: null,
      replyText: emptyMsg,
    };
  }

  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      const prompt = `User Spoken Transcript:
"${transcript}"

Rider Financial Context:
- Rider Name: ${rider.name}
- Current Cash/Bank Balance: ₹${rider.balance}
- Monthly Fixed Bills (Rent + EMI): ₹${rider.monthly_fixed_bills || 12000} (Due on day ${rider.bill_due_day || 5})
- Daily Bike Fuel Spend: ₹${rider.daily_fuel_spend || 250}
- Bill Shield Protected: ₹${rider.vault_balance}

Task:
You are SteadyGig's voice financial co-pilot for gig delivery riders.
Analyze the transcript and return a single JSON object:
1. "intent": "LOG_EXPENSE", "LOG_INCOME", "CHECK_VAULT", or "SIMULATE_PAYOUT".
2. "category": If LOG_EXPENSE -> "fuel", "food", "rent", or "maintenance". If LOG_INCOME -> "income". Else null.
3. "amount": Numeric ₹ amount mentioned, or null.
4. "replyText": A concise 1–2 sentence reply. ${langInstruction}
   - If LOG_EXPENSE: confirm expense of ₹amount logged and state updated balance.
   - If LOG_INCOME: confirm ₹amount earnings added and state updated balance.
   - If CHECK_VAULT / SIMULATE_PAYOUT: state how much is protected for Rent/EMI Bills & Bike Fuel vs remaining balance.

Required JSON Schema:
{
  "intent": "LOG_EXPENSE" | "LOG_INCOME" | "CHECK_VAULT" | "SIMULATE_PAYOUT",
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
            intent: parsed.intent,
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

  if (
    lower.includes('petrol') ||
    lower.includes('fuel') ||
    lower.includes('diesel') ||
    lower.includes('ಪೆಟ್ರೋಲ್') ||
    lower.includes('पेट्रोल')
  ) {
    const amt = parsedAmount || rider.daily_fuel_spend || 200;
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
    lower.includes('dinner') ||
    lower.includes('tea') ||
    lower.includes('oota') ||
    lower.includes('ಊಟ') ||
    lower.includes('ತಿಂಡಿ') ||
    lower.includes('खाना') ||
    lower.includes('चाय')
  ) {
    const amt = parsedAmount || 100;
    const remaining = Math.max(0, rider.balance - amt);
    return {
      intent: 'LOG_EXPENSE',
      category: 'food',
      amount: amt,
      replyText:
        lang === 'hi-IN'
          ? `₹${amt} खाने का खर्च दर्ज हो गया। बचा हुआ बैलेंस ₹${remaining} है।`
          : lang === 'en-IN'
          ? `Logged ₹${amt} food expense. Remaining balance is ₹${remaining}.`
          : `ರೂ. ${amt} ಊಟದ ಖರ್ಚು ಸೇರಿಸಲಾಗಿದೆ. ಉಳಿದ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${remaining} ಆಗಿದೆ.`,
    };
  }

  if (
    lower.includes('rent') ||
    lower.includes('emi') ||
    lower.includes('bill') ||
    lower.includes('ಬಾಡಿಗೆ') ||
    lower.includes('किराया')
  ) {
    const amt = parsedAmount || 1000;
    const remaining = Math.max(0, rider.balance - amt);
    return {
      intent: 'LOG_EXPENSE',
      category: 'rent',
      amount: amt,
      replyText:
        lang === 'hi-IN'
          ? `₹${amt} किराया या बिल खर्च दर्ज किया गया। शेष बैलेंस ₹${remaining} है।`
          : lang === 'en-IN'
          ? `Logged ₹${amt} rent or bill payment. Remaining balance is ₹${remaining}.`
          : `ರೂ. ${amt} ಬಾಡಿಗೆ ಖರ್ಚು ದಾಖಲಾಗಿದೆ. ಉಳಿದ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${remaining} ಆಗಿದೆ.`,
    };
  }

  if (
    lower.includes('earned') ||
    lower.includes('income') ||
    lower.includes('payout') ||
    lower.includes('ಗಳಿಕೆ') ||
    lower.includes('कमाई')
  ) {
    const amt = parsedAmount || 500;
    const updated = rider.balance + amt;
    return {
      intent: 'LOG_INCOME',
      category: 'income',
      amount: amt,
      replyText:
        lang === 'hi-IN'
          ? `₹${amt} की कमाई जोड़ दी गई है। आपका नया बैलेंस ₹${updated} है।`
          : lang === 'en-IN'
          ? `Added ₹${amt} earnings. Your updated balance is ₹${updated}.`
          : `ರೂ. ${amt} ಗಳಿಕೆ ಸೇರಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ಹೊಸ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${updated} ಆಗಿದೆ.`,
    };
  }

  return {
    intent: 'CHECK_VAULT',
    category: null,
    amount: null,
    replyText:
      lang === 'hi-IN'
        ? `आपका कुल बैलेंस ₹${rider.balance} है। मासिक बिल लक्ष्य ₹${rider.monthly_fixed_bills || 12000} और रोज़ पेट्रोल ₹${rider.daily_fuel_spend || 250} है।`
        : lang === 'en-IN'
        ? `Your total balance is ₹${rider.balance}. Monthly bills target is ₹${rider.monthly_fixed_bills || 12000} with ₹${rider.daily_fuel_spend || 250} daily bike fuel.`
        : `ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${rider.balance} ಇದೆ. ತಿಂಗಳ ಬಿಲ್ ಗುರಿ ರೂ. ${rider.monthly_fixed_bills || 12000} ಮತ್ತು ದಿನದ ಪೆಟ್ರೋಲ್ ರೂ. ${rider.daily_fuel_spend || 250}.`,
  };
}

/**
 * Step C: Supabase Mutation (Expense or Income)
 */
export async function mutateRiderTransaction(
  rider: RiderFinancialContext,
  intent: 'LOG_EXPENSE' | 'LOG_INCOME',
  category: 'fuel' | 'food' | 'rent' | 'maintenance' | 'income' | null,
  amount: number
): Promise<{ updatedBalance: number; transactionId?: string }> {
  const updatedBalance =
    intent === 'LOG_INCOME'
      ? rider.balance + amount
      : Math.max(0, rider.balance - amount);

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { updatedBalance };
  }

  try {
    const txType = intent === 'LOG_INCOME' ? 'income' : 'expense';
    const txCat = intent === 'LOG_INCOME' ? 'income' : category || 'fuel';

    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert({
        rider_id: rider.id,
        category: txCat,
        amount,
        type: txType,
        description: `Voice logged: ${txCat} (₹${amount})`,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (txError) {
      console.warn('[SteadyGig Voice] Supabase transaction insert failed:', txError);
    }

    const { error: riderError } = await supabase
      .from('riders')
      .update({
        balance: updatedBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rider.id);

    if (riderError) {
      console.warn('[SteadyGig Voice] Supabase rider balance update failed:', riderError);
    }

    return {
      updatedBalance,
      transactionId: tx?.id,
    };
  } catch (err) {
    console.warn('[SteadyGig Voice] Supabase mutation error:', err);
    return { updatedBalance };
  }
}

/**
 * Speak Current Bill Shield + Fuel Reserve Status Aloud
 */
export async function readVaultStatusAloud(
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
      : `ನಿಮ್ಮ ರೂ. ${rider.balance} ರಲ್ಲಿ ರೂ. ${fuelProtected} ಬೈಕ್ ಪೆಟ್ರೋಲ್‌ಗಾಗಿ ಮತ್ತು ರೂ. ${billProtected} ತಿಂಗಳ ಬಿಲ್ ಶೀಲ್ಡ್‌ನಲ್ಲಿ ಸುರಕ್ಷಿತವಾಗಿದೆ. ಖರ್ಚಿಗೆ ರೂ. ${spendable} ಲಭ್ಯವಿದೆ.`;

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
      intent: 'CHECK_VAULT',
      category: null,
      amount: null,
      previousBalance: rider.balance,
      updatedBalance: rider.balance,
      vaultBalance: billProtected,
    },
  };
}

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

  return {
    transcript,
    replyText: extraction.replyText,
    audioBase64,
    languageCode,
    action: {
      intent: extraction.intent,
      category: extraction.category,
      amount: extraction.amount,
      previousBalance: riderContext.balance,
      updatedBalance,
      vaultBalance: riderContext.vault_balance,
      transactionId,
    },
  };
}
