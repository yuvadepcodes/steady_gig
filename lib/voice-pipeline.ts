import { GoogleGenAI } from '@google/genai';
import { getSupabaseServerClient } from './supabase';

export interface RiderFinancialContext {
  id: string;
  name: string;
  balance: number;
  vault_balance: number;
  daily_earnings: number;
  target_payout: number;
  safety_reserve?: number;
}

export interface VoiceIntentResult {
  intent: 'LOG_EXPENSE' | 'CHECK_VAULT' | 'SIMULATE_PAYOUT';
  category: 'fuel' | 'food' | 'rent' | null;
  amount: number | null;
  replyText: string;
}

export interface VoicePipelineResponse {
  transcript: string;
  replyText: string;
  audioBase64: string | null;
  action: {
    intent: 'LOG_EXPENSE' | 'CHECK_VAULT' | 'SIMULATE_PAYOUT';
    category: 'fuel' | 'food' | 'rent' | null;
    amount: number | null;
    previousBalance: number;
    updatedBalance: number;
    vaultBalance: number;
    transactionId?: string;
  };
}

const DEFAULT_RIDER: RiderFinancialContext = {
  id: 'rider_blr_01',
  name: 'Ravi Kumar',
  balance: 1450.0,
  vault_balance: 5200.0,
  daily_earnings: 1850.0,
  target_payout: 6000.0,
  safety_reserve: 2000.0,
};

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
  sarvamApiKey: string
): Promise<string> {
  if (!sarvamApiKey) {
    throw new Error('SARVAM_API_KEY is missing from environment variables.');
  }

  const formData = new FormData();
  const filename = (audioBlob as File).name || 'audio.webm';
  formData.append('file', audioBlob, filename);
  formData.append('model', 'saaras:v4');
  formData.append('mode', 'codemix');
  formData.append('language_code', 'unknown');

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
 * Step B: Intent & Action Extraction using Gemini 2.5 Flash
 */
export async function extractIntentAndReply(
  transcript: string,
  rider: RiderFinancialContext,
  geminiApiKey: string
): Promise<VoiceIntentResult> {
  if (!transcript || transcript.trim().length === 0) {
    return {
      intent: 'CHECK_VAULT',
      category: null,
      amount: null,
      replyText: `ನಿಮ್ಮ ಧ್ವನಿ ಕೇಳಿಸಲಿಲ್ಲ. ನಿಮ್ಮ ವಾಲ್ಟ್‌ನಲ್ಲಿ ರೂ. ${rider.vault_balance} ಸುರಕ್ಷಿತವಾಗಿದೆ.`,
    };
  }

  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      const prompt = `User Spoken Transcript:
"${transcript}"

Rider Financial Context:
- Rider ID: ${rider.id}
- Rider Name: ${rider.name}
- Current Liquid Balance: ₹${rider.balance}
- SteadyVault Savings Balance: ₹${rider.vault_balance}
- Today's Earnings: ₹${rider.daily_earnings}
- Weekly Payout Target: ₹${rider.target_payout}

Task:
You are SteadyGig's voice co-pilot for Bengaluru gig delivery riders (Swiggy/Zomato/Porter/Dunzo).
Analyze the user's transcript and current financial numbers. Return a single JSON object with:
1. "intent": One of "LOG_EXPENSE", "CHECK_VAULT", or "SIMULATE_PAYOUT".
2. "category": If intent is "LOG_EXPENSE", must be "fuel", "food", or "rent" (map petrol/diesel/repair to "fuel", lunch/food/tea to "food", rent/room to "rent"). Otherwise null.
3. "amount": The numerical amount mentioned in the transcript (e.g. 150), or null if not applicable.
4. "replyText": A concise 1-2 sentence response spoken in natural Bengaluru Kannada (MUST BE IN KANNADA SCRIPT: ಕನ್ನಡ ಲಿಪಿ).
   - If LOG_EXPENSE: confirm the expense of ₹{amount} logged, and state their remaining balance or vault balance. (e.g. "ರೂ. {amount} ಪೆಟ್ರೋಲ್ ಖರ್ಚು ಸೇರಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ವಾಲ್ಟ್‌ನಲ್ಲಿ ರೂ. {vault_balance} ಸುರಕ್ಷಿತವಾಗಿದೆ.")
   - If CHECK_VAULT: clearly state their exact vault balance and today's earnings in Kannada. (e.g. "ನಿಮ್ಮ ವಾಲ್ಟ್ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. {vault_balance} ಇದೆ ಮತ್ತು ಇಂದಿನ ಗಳಿಕೆ ರೂ. {daily_earnings} ಆಗಿದೆ.")
   - If SIMULATE_PAYOUT: explain the payout simulation or safe available payout limit. (e.g. "ನೀವು ರೂ. {balance} ವರೆಗೆ ತಕ್ಷಣದ ಪೇಔಟ್ ಪಡೆಯಬಹುದು. ವಾಲ್ಟ್ ನಿಮ್ಮ ಹಣವನ್ನು ರಕ್ಷಿಸುತ್ತದೆ.")

Required JSON Schema:
{
  "intent": "LOG_EXPENSE" | "CHECK_VAULT" | "SIMULATE_PAYOUT",
  "category": "fuel" | "food" | "rent" | null,
  "amount": number | null,
  "replyText": string
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
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

  return fallbackIntentExtractor(transcript, rider);
}

function fallbackIntentExtractor(
  transcript: string,
  rider: RiderFinancialContext
): VoiceIntentResult {
  const lower = transcript.toLowerCase();
  const numMatch = transcript.match(/\d+(\.\d+)?/);
  const parsedAmount = numMatch ? parseFloat(numMatch[0]) : null;

  if (
    lower.includes('petrol') ||
    lower.includes('fuel') ||
    lower.includes('ಪೆಟ್ರೋಲ್') ||
    lower.includes('ಡೀಸೆಲ್')
  ) {
    const amt = parsedAmount || 150;
    const remaining = Math.max(0, rider.balance - amt);
    return {
      intent: 'LOG_EXPENSE',
      category: 'fuel',
      amount: amt,
      replyText: `ರೂ. ${amt} ಪೆಟ್ರೋಲ್ ಖರ್ಚು ದಾಖಲಾಗಿದೆ. ನಿಮ್ಮ ಉಳಿದ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${remaining} ಮತ್ತು ವಾಲ್ಟ್ ರೂ. ${rider.vault_balance} ಆಗಿದೆ.`,
    };
  }

  if (
    lower.includes('food') ||
    lower.includes('oota') ||
    lower.includes('ಊಟ') ||
    lower.includes('ತಿಂಡಿ') ||
    lower.includes('tea') ||
    lower.includes('coffee')
  ) {
    const amt = parsedAmount || 100;
    const remaining = Math.max(0, rider.balance - amt);
    return {
      intent: 'LOG_EXPENSE',
      category: 'food',
      amount: amt,
      replyText: `ರೂ. ${amt} ಊಟದ ಖರ್ಚು ಸೇರಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ವಾಲ್ಟ್‌ನಲ್ಲಿ ರೂ. ${rider.vault_balance} ಸುರಕ್ಷಿತವಾಗಿದೆ.`,
    };
  }

  if (lower.includes('rent') || lower.includes('ಬಾಡಿಗೆ')) {
    const amt = parsedAmount || 1000;
    const remaining = Math.max(0, rider.balance - amt);
    return {
      intent: 'LOG_EXPENSE',
      category: 'rent',
      amount: amt,
      replyText: `ರೂ. ${amt} ಬಾಡಿಗೆ ಖರ್ಚು ದಾಖಲಾಗಿದೆ. ಉಳಿದ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${remaining} ಆಗಿದೆ.`,
    };
  }

  if (
    lower.includes('payout') ||
    lower.includes('withdraw') ||
    lower.includes('ಪೇಔಟ್') ||
    lower.includes('ಹಣ ತೆಗೆಯ')
  ) {
    return {
      intent: 'SIMULATE_PAYOUT',
      category: null,
      amount: rider.balance,
      replyText: `ನೀವು ರೂ. ${rider.balance} ವರೆಗೆ ತಕ್ಷಣದ ಪೇಔಟ್ ಪಡೆಯಬಹುದು. ನಿಮ್ಮ ವಾಲ್ಟ್‌ನಲ್ಲಿ ರೂ. ${rider.vault_balance} ಸುರಕ್ಷಿತವಾಗಿದೆ.`,
    };
  }

  return {
    intent: 'CHECK_VAULT',
    category: null,
    amount: null,
    replyText: `ನಿಮ್ಮ ವಾಲ್ಟ್ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${rider.vault_balance} ಇದೆ ಮತ್ತು ಇಂದಿನ ಗಳಿಕೆ ರೂ. ${rider.daily_earnings} ಆಗಿದೆ.`,
  };
}

/**
 * Step C: Supabase Mutation
 */
export async function mutateRiderExpense(
  rider: RiderFinancialContext,
  category: 'fuel' | 'food' | 'rent' | null,
  amount: number
): Promise<{ updatedBalance: number; transactionId?: string }> {
  const updatedBalance = Math.max(0, rider.balance - amount);
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { updatedBalance };
  }

  try {
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert({
        rider_id: rider.id,
        category: category || 'fuel',
        amount,
        type: 'expense',
        description: `Voice logged: ${category || 'expense'} (₹${amount})`,
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
 * Step D: Sarvam AI Text-to-Speech (bulbul:v4-flash)
 */
export async function runSarvamTTS(
  text: string,
  sarvamApiKey: string
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
        target_language_code: 'kn-IN',
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
 * Hackathon Judge Demo: Read Vault Status & Lean-Week Coverage Aloud
 */
export async function readVaultStatusAloud(userId: string): Promise<VoicePipelineResponse> {
  const sarvamApiKey = process.env.SARVAM_API_KEY || '';
  const rider = await getRiderFinancialContext(userId);

  // Calculate lean-week rainy day coverage based on daily average expenditure (~₹400/day)
  const daysCoverage = Math.max(1, Math.round(rider.vault_balance / 450));
  const replyText = `ನಿಮ್ಮ ವಾಲ್ಟ್‌ನಲ್ಲಿ ರೂ. ${rider.vault_balance} ಸುರಕ್ಷಿತವಾಗಿದೆ. ಈ ವಾರದ ಮಳೆ ಮತ್ತು ಕಡಿಮೆ ಗಳಿಕೆಯ ದಿನಗಳಿಗೆ ${daysCoverage} ದಿನಗಳ ತುರ್ತು ರಕ್ಷಣೆ ಲಭ್ಯವಿದೆ.`;

  const audioBase64 = await runSarvamTTS(replyText, sarvamApiKey);

  return {
    transcript: 'ವಾಲ್ಟ್ ಸ್ಥಿತಿ ಮತ್ತು ಕಷ್ಟದ ದಿನಗಳ ರಕ್ಷಣೆ (Vault Status & Lean-Week Coverage)',
    replyText,
    audioBase64,
    action: {
      intent: 'CHECK_VAULT',
      category: null,
      amount: null,
      previousBalance: rider.balance,
      updatedBalance: rider.balance,
      vaultBalance: rider.vault_balance,
    },
  };
}

/**
 * Complete End-to-End Voice Assistant Pipeline
 */
export async function executeVoicePipeline(
  audioBlob: Blob,
  userId: string
): Promise<VoicePipelineResponse> {
  const sarvamApiKey = process.env.SARVAM_API_KEY || '';
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

  const riderContext = await getRiderFinancialContext(userId);
  const transcript = await runSarvamSTT(audioBlob, sarvamApiKey);
  const extraction = await extractIntentAndReply(transcript, riderContext, geminiApiKey);

  let updatedBalance = riderContext.balance;
  let transactionId: string | undefined;

  if (
    extraction.intent === 'LOG_EXPENSE' &&
    typeof extraction.amount === 'number' &&
    extraction.amount > 0
  ) {
    const mutation = await mutateRiderExpense(
      riderContext,
      extraction.category,
      extraction.amount
    );
    updatedBalance = mutation.updatedBalance;
    transactionId = mutation.transactionId;
  }

  const audioBase64 = await runSarvamTTS(extraction.replyText, sarvamApiKey);

  return {
    transcript,
    replyText: extraction.replyText,
    audioBase64,
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
