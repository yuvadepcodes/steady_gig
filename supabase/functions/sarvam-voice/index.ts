import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-id',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const sarvamApiKey = Deno.env.get('SARVAM_API_KEY') || '';
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';

    const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

    const formData = await req.formData();
    const file = formData.get('file') || formData.get('audio');
    const userId = (formData.get('userId') as string) || (formData.get('riderId') as string) || 'rider_blr_01';

    if (!file || !(file instanceof Blob)) {
      return new Response(
        JSON.stringify({ error: 'Missing required audio file in form-data field "file".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 0: Fetch current rider vault/balance from Supabase
    let rider = {
      id: userId,
      name: 'Ravi Kumar',
      balance: 1450.0,
      vault_balance: 5200.0,
      daily_earnings: 1850.0,
      target_payout: 6000.0,
    };

    if (supabase) {
      try {
        const { data: dbRider } = await supabase
          .from('riders')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (dbRider) {
          rider = {
            ...rider,
            ...dbRider,
            balance: Number(dbRider.balance ?? rider.balance),
            vault_balance: Number(dbRider.vault_balance ?? rider.vault_balance),
            daily_earnings: Number(dbRider.daily_earnings ?? rider.daily_earnings),
            target_payout: Number(dbRider.target_payout ?? rider.target_payout),
          };
        }
      } catch (err) {
        console.warn('Supabase rider lookup error:', err);
      }
    }

    // Step A: Sarvam STT
    const sttFormData = new FormData();
    sttFormData.append('file', file, (file as File).name || 'audio.webm');
    sttFormData.append('model', 'saaras:v4');
    sttFormData.append('mode', 'codemix');
    sttFormData.append('language_code', 'unknown');

    const sttRes = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': sarvamApiKey,
      },
      body: sttFormData,
    });

    if (!sttRes.ok) {
      const errText = await sttRes.text();
      throw new Error(`Sarvam STT failed: [${sttRes.status}] ${errText}`);
    }

    const sttData = await sttRes.json();
    const transcript = sttData.transcript || '';

    // Step B: Intent & Action Extraction via Gemini 2.5 Flash
    let intentResult = {
      intent: 'CHECK_VAULT',
      category: null as 'fuel' | 'food' | 'rent' | null,
      amount: null as number | null,
      replyText: `ನಿಮ್ಮ ವಾಲ್ಟ್ ಬ್ಯಾಲೆನ್ಸ್ ರೂ. ${rider.vault_balance} ಇದೆ ಮತ್ತು ಇಂದಿನ ಗಳಿಕೆ ರೂ. ${rider.daily_earnings} ಆಗಿದೆ.`,
    };

    if (geminiApiKey) {
      const prompt = `User Spoken Transcript: "${transcript}"

Rider Financial Context:
- Rider ID: ${rider.id}
- Rider Name: ${rider.name}
- Liquid Cash Balance: ₹${rider.balance}
- SteadyVault Savings Balance: ₹${rider.vault_balance}
- Today's Earnings: ₹${rider.daily_earnings}
- Weekly Payout Target: ₹${rider.target_payout}

Task:
You are SteadyGig's voice co-pilot for Bengaluru delivery riders.
Extract intent ("LOG_EXPENSE" | "CHECK_VAULT" | "SIMULATE_PAYOUT"), category ("fuel" | "food" | "rent" | null), amount (number | null), and replyText (concise 1-2 sentences in natural spoken Kannada script: ಕನ್ನಡ ಲಿಪಿ).
Format as JSON:
{
  "intent": "LOG_EXPENSE" | "CHECK_VAULT" | "SIMULATE_PAYOUT",
  "category": "fuel" | "food" | "rent" | null,
  "amount": number | null,
  "replyText": string
}`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          intentResult = {
            intent: parsed.intent || 'CHECK_VAULT',
            category: parsed.category || null,
            amount: typeof parsed.amount === 'number' ? parsed.amount : null,
            replyText: parsed.replyText || intentResult.replyText,
          };
        }
      }
    }

    // Step C: Supabase Mutation
    let updatedBalance = rider.balance;
    let txId: string | undefined;

    if (
      intentResult.intent === 'LOG_EXPENSE' &&
      typeof intentResult.amount === 'number' &&
      intentResult.amount > 0
    ) {
      updatedBalance = Math.max(0, rider.balance - intentResult.amount);

      if (supabase) {
        try {
          const { data: tx } = await supabase
            .from('transactions')
            .insert({
              rider_id: rider.id,
              category: intentResult.category || 'fuel',
              amount: intentResult.amount,
              type: 'expense',
              description: `Voice logged: ${intentResult.category || 'expense'} (₹${intentResult.amount})`,
              created_at: new Date().toISOString(),
            })
            .select('id')
            .maybeSingle();

          txId = tx?.id;

          await supabase
            .from('riders')
            .update({
              balance: updatedBalance,
              updated_at: new Date().toISOString(),
            })
            .eq('id', rider.id);
        } catch (dbErr) {
          console.warn('Supabase mutation error in edge function:', dbErr);
        }
      }
    }

    // Step D: Sarvam TTS
    let audioBase64: string | null = null;
    if (sarvamApiKey && intentResult.replyText) {
      try {
        const ttsRes = await fetch('https://api.sarvam.ai/text-to-speech', {
          method: 'POST',
          headers: {
            'api-subscription-key': sarvamApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: intentResult.replyText,
            target_language_code: 'kn-IN',
            model: 'bulbul:v4-flash',
            speaker: 'shubh_enhi_ads',
          }),
        });

        if (ttsRes.ok) {
          const ttsData = await ttsRes.json();
          audioBase64 = ttsData.audios?.[0] || null;
        }
      } catch (ttsErr) {
        console.warn('Sarvam TTS error:', ttsErr);
      }
    }

    return new Response(
      JSON.stringify({
        transcript,
        replyText: intentResult.replyText,
        audioBase64,
        action: {
          intent: intentResult.intent,
          category: intentResult.category,
          amount: intentResult.amount,
          previousBalance: rider.balance,
          updatedBalance,
          vaultBalance: rider.vault_balance,
          transactionId: txId,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
