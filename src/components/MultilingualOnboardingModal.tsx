'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mic,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {
  persistRiderBillProfile,
  RiderBillProfile,
  SupportedLanguage,
} from '@/lib/cashflow-slicer';

interface MultilingualOnboardingModalProps {
  open: boolean;
  profile: RiderBillProfile;
  onClose: () => void;
  onSaved: (updated: RiderBillProfile) => void;
}

interface StepCopy {
  title: Record<SupportedLanguage, string>;
  question: Record<SupportedLanguage, string>;
  hint: Record<SupportedLanguage, string>;
  chips: number[];
  unit: 'inr' | 'day';
}

const LANGUAGE_LABELS: { code: SupportedLanguage; label: string }[] = [
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'en-IN', label: 'English' },
];

const UI_STRINGS: Record<
  SupportedLanguage,
  {
    headerTitle: string;
    stepOf: string;
    listenAgain: string;
    speakAnswer: string;
    stopRecording: string;
    heardPrefix: string;
    back: string;
    next: string;
    saveFinish: string;
    saving: string;
    skip: string;
    voiceTip: string;
  }
> = {
  'kn-IN': {
    headerTitle: 'ಬಿಲ್ ಮತ್ತು ಪೆಟ್ರೋಲ್ ಸೆಟಪ್',
    stepOf: 'ಹಂತ',
    listenAgain: 'ಮತ್ತೆ ಕೇಳಿ · Listen Again',
    speakAnswer: 'ಮಾತನಾಡಿ ಉತ್ತರಿಸಿ',
    stopRecording: 'ನಿಲ್ಲಿಸಿ',
    heardPrefix: 'ಕೇಳಿಸಿದ್ದು:',
    back: 'ಹಿಂದೆ',
    next: 'ಮುಂದೆ',
    saveFinish: 'ಉಳಿಸಿ ಮತ್ತು ಆರಂಭಿಸಿ',
    saving: 'ಉಳಿಸಲಾಗುತ್ತಿದೆ...',
    skip: 'ನಂತರ ಮಾಡಿ',
    voiceTip: 'ಮೈಕ್ ಒತ್ತಿ ಸಂಖ್ಯೆಯನ್ನು ಹೇಳಿ ಅಥವಾ ಕೆಳಗಿನ ಆಯ್ಕೆ ಟ್ಯಾಪ್ ಮಾಡಿ.',
  },
  'hi-IN': {
    headerTitle: 'बिल और पेट्रोल सेटअप',
    stepOf: 'चरण',
    listenAgain: 'फिर से सुनें · Listen Again',
    speakAnswer: 'बोलकर बताएं',
    stopRecording: 'रोकें',
    heardPrefix: 'सुना गया:',
    back: 'पीछे',
    next: 'आगे',
    saveFinish: 'सेव करें और शुरू करें',
    saving: 'सेव हो रहा है...',
    skip: 'बाद में करें',
    voiceTip: 'माइक दबाकर राशि बोलें या नीचे दिए विकल्प चुनें।',
  },
  'en-IN': {
    headerTitle: 'Setup Bills & Fuel',
    stepOf: 'Step',
    listenAgain: 'Listen Again',
    speakAnswer: 'Speak Answer',
    stopRecording: 'Stop',
    heardPrefix: 'Heard:',
    back: 'Back',
    next: 'Next',
    saveFinish: 'Save & Start Slicing',
    saving: 'Saving...',
    skip: 'Skip for now',
    voiceTip: 'Tap Speak Answer to answer by voice, or tap a quick option below.',
  },
};

const STEPS: StepCopy[] = [
  {
    title: {
      'kn-IN': '1. ತಿಂಗಳ ಬಾಡಿಗೆ ಮತ್ತು ಇಎಂಐ',
      'hi-IN': '1. मासिक किराया और ईएमआई',
      'en-IN': '1. Monthly Fixed Bills (Rent + EMI)',
    },
    question: {
      'kn-IN': 'ನಿಮ್ಮ ತಿಂಗಳ ಮನೆ ಬಾಡಿಗೆ ಮತ್ತು ಬೈಕ್ ಅಥವಾ ಫೋನ್ ಇಎಂಐ ಒಟ್ಟು ಎಷ್ಟು?',
      'hi-IN': 'आपका मासिक किराया और बाइक या फोन की ईएमआई कुल मिलाकर कितनी है?',
      'en-IN': 'What is your total monthly rent plus bike or phone EMI?',
    },
    hint: {
      'kn-IN': 'ಉದಾಹರಣೆ: ಬಾಡಿಗೆ + ಬೈಕ್ EMI = ₹12,000',
      'hi-IN': 'उदाहरण: किराया + बाइक EMI = ₹12,000',
      'en-IN': 'Include room rent, bike EMI, and phone EMI combined.',
    },
    chips: [6000, 9000, 12000, 15000, 18000],
    unit: 'inr',
  },
  {
    title: {
      'kn-IN': '2. ಮುಂದಿನ ದೊಡ್ಡ ಬಿಲ್ ದಿನಾಂಕ',
      'hi-IN': '2. अगले बड़े बिल की तारीख',
      'en-IN': '2. Next Major Bill Due Date (1st–31st)',
    },
    question: {
      'kn-IN': 'ನಿಮ್ಮ ಮುಂದಿನ ದೊಡ್ಡ ಬಿಲ್ ತಿಂಗಳ ಯಾವ ದಿನಾಂಕದಂದು ಕಟ್ಟಬೇಕು? ಒಂದರಿಂದ ಮೂವತ್ತೊಂದರ ಒಳಗೆ ಹೇಳಿ.',
      'hi-IN': 'आपका अगला बड़ा बिल महीने की किस तारीख को जमा करना है? एक से इकतीस के बीच बताएं।',
      'en-IN': 'On which day of the month, from 1 to 31, is your next major bill due?',
    },
    hint: {
      'kn-IN': 'ತಿಂಗಳ ದಿನಾಂಕ (1 ರಿಂದ 31)',
      'hi-IN': 'महीने की तारीख (1 से 31)',
      'en-IN': 'Pick the day of month your rent or biggest EMI is due.',
    },
    chips: [1, 5, 7, 10, 15, 28],
    unit: 'day',
  },
  {
    title: {
      'kn-IN': '3. ದಿನದ ಬೈಕ್ ಪೆಟ್ರೋಲ್ ಖರ್ಚು',
      'hi-IN': '3. रोज़ का बाइक पेट्रोल खर्च',
      'en-IN': '3. Daily Bike Fuel Spend (Working Days)',
    },
    question: {
      'kn-IN': 'ನೀವು ಕೆಲಸ ಮಾಡುವ ದಿನಗಳಲ್ಲಿ ಪ್ರತಿದಿನ ಬೈಕ್ ಪೆಟ್ರೋಲ್‌ಗೆ ಎಷ್ಟು ಖರ್ಚು ಮಾಡುತ್ತೀರಿ?',
      'hi-IN': 'काम के दिनों में आप हर रोज़ बाइक के पेट्रोल पर कितना खर्च करते हैं?',
      'en-IN': 'How much do you spend on bike petrol on a working day?',
    },
    hint: {
      'kn-IN': 'ನಾಳೆ ಕೆಲಸಕ್ಕೆ ಹೋಗಲು ಈ ಹಣ ಮೊದಲು ಸುರಕ್ಷಿತವಾಗಿಡಲಾಗುತ್ತದೆ.',
      'hi-IN': 'कल डिलीवरी पर जाने के लिए यह पेट्रोल राशि सबसे पहले सुरक्षित रखी जाएगी।',
      'en-IN': 'Protected first so you can always fuel up for tomorrow’s shift.',
    },
    chips: [150, 200, 250, 300, 350],
    unit: 'inr',
  },
  {
    title: {
      'kn-IN': '4. ಪ್ರಸ್ತುತ ಕೈಯಲ್ಲಿ ಮತ್ತು ಬ್ಯಾಂಕ್ ಹಣ',
      'hi-IN': '4. वर्तमान नकद और बैंक बैलेंस',
      'en-IN': '4. Current Cash & Bank Balance',
    },
    question: {
      'kn-IN': 'ಪ್ರಸ್ತುತ ನಿಮ್ಮ ಕೈಯಲ್ಲಿ ಮತ್ತು ಬ್ಯಾಂಕ್ ಖಾತೆಯಲ್ಲಿ ಒಟ್ಟು ಎಷ್ಟು ಹಣ ಇದೆ?',
      'hi-IN': 'अभी आपके पास हाथ में और बैंक खाते में कुल कितने रुपये हैं?',
      'en-IN': 'How much total cash and bank balance do you have right now?',
    },
    hint: {
      'kn-IN': 'ಈ ಹಣವನ್ನು ಪೆಟ್ರೋಲ್, ಬಿಲ್ ಶೀಲ್ಡ್ ಮತ್ತು ಖರ್ಚು ಹಣವಾಗಿ ವಿಭಜಿಸಲಾಗುತ್ತದೆ.',
      'hi-IN': 'इस राशि को पेट्रोल, बिल शील्ड और खर्च योग्य नकद में बांटा जाएगा।',
      'en-IN': 'SteadyGig slices this across Bike Fuel, Bill Shield, and Spendable Cash.',
    },
    chips: [1500, 3000, 5000, 8000, 12000],
    unit: 'inr',
  },
];

function formatOrdinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

export default function MultilingualOnboardingModal({
  open,
  profile,
  onClose,
  onSaved,
}: MultilingualOnboardingModalProps) {
  const [lang, setLang] = useState<SupportedLanguage>(profile.preferredLanguage || 'kn-IN');
  const [stepIdx, setStepIdx] = useState<number>(0);

  const [monthlyBills, setMonthlyBills] = useState<number>(profile.monthlyFixedBills || 12000);
  const [billDueDay, setBillDueDay] = useState<number>(profile.billDueDay || 5);
  const [dailyFuel, setDailyFuel] = useState<number>(profile.dailyFuelSpend || 250);
  const [currentBalance, setCurrentBalance] = useState<number>(profile.currentBalance || 6650);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [readBackText, setReadBackText] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Record<string, string>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (open) {
      setLang(profile.preferredLanguage || 'kn-IN');
      setMonthlyBills(profile.monthlyFixedBills || 12000);
      setBillDueDay(profile.billDueDay || 5);
      setDailyFuel(profile.dailyFuelSpend || 250);
      setCurrentBalance(profile.currentBalance || 6650);
      setStepIdx(0);
      setVoiceTranscript(null);
      setReadBackText(null);
      setVoiceError(null);
    }
  }, [open, profile]);

  const stopAnyAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    return () => stopAnyAudio();
  }, [stopAnyAudio]);

  const playBase64Audio = useCallback(
    (base64: string) => {
      stopAnyAudio();
      const src = base64.startsWith('data:')
        ? base64
        : `data:audio/wav;base64,${base64}`;
      const audio = new Audio(src);
      audioRef.current = audio;
      setIsSpeaking(true);
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      audio.play().catch(() => setIsSpeaking(false));
    },
    [stopAnyAudio]
  );

  const speakBrowserFallback = useCallback(
    (text: string, languageCode: SupportedLanguage) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      stopAnyAudio();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = languageCode;
      utter.rate = 0.96;
      setIsSpeaking(true);
      utter.onend = () => setIsSpeaking(false);
      utter.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utter);
    },
    [stopAnyAudio]
  );

  const speakText = useCallback(
    async (text: string, languageCode: SupportedLanguage) => {
      const cacheKey = `${languageCode}:${text}`;
      const cached = ttsCacheRef.current[cacheKey];
      if (cached) {
        playBase64Audio(cached);
        return;
      }

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, languageCode }),
        });
        if (res.ok) {
          const data = (await res.json()) as { audioBase64?: string | null };
          if (data.audioBase64) {
            ttsCacheRef.current[cacheKey] = data.audioBase64;
            playBase64Audio(data.audioBase64);
            return;
          }
        }
      } catch {
        // Fall back to Web Speech API
      }

      speakBrowserFallback(text, languageCode);
    },
    [playBase64Audio, speakBrowserFallback]
  );

  // Auto-speak question aloud when step or language changes while modal is open
  useEffect(() => {
    if (!open) return;
    const questionText = STEPS[stepIdx].question[lang];
    speakText(questionText, lang);
  }, [open, stepIdx, lang, speakText]);

  const currentVal =
    stepIdx === 0
      ? monthlyBills
      : stepIdx === 1
      ? billDueDay
      : stepIdx === 2
      ? dailyFuel
      : currentBalance;

  const setCurrentVal = (val: number) => {
    const clean = Math.max(0, Math.round(val || 0));
    if (stepIdx === 0) setMonthlyBills(clean);
    else if (stepIdx === 1) setBillDueDay(Math.min(31, Math.max(1, clean || 1)));
    else if (stepIdx === 2) setDailyFuel(clean);
    else setCurrentBalance(clean);
  };

  const startVoiceAnswer = async () => {
    try {
      stopAnyAudio();
      setVoiceError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/wav',
      ];
      const mimeType =
        mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        stream.getTracks().forEach((t) => t.stop());
        await submitVoiceAnswer(blob);
      };

      recorder.start(250);
      setIsRecording(true);
    } catch {
      setVoiceError('Allow microphone access to answer by voice, or tap a chip below.');
      setIsRecording(false);
    }
  };

  const stopVoiceAnswer = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const submitVoiceAnswer = async (audioBlob: Blob) => {
    setIsProcessingVoice(true);
    setVoiceError(null);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'onboarding_answer.webm');
      formData.append('mode', 'onboarding_step');
      formData.append('step', String(stepIdx + 1));
      formData.append('languageCode', lang);

      const res = await fetch('/api/voice', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Could not process voice answer');
      }

      const data = (await res.json()) as {
        transcript?: string;
        extractedValue?: number | null;
        confirmationText?: string;
        audioBase64?: string | null;
      };

      if (data.transcript) setVoiceTranscript(data.transcript);
      if (typeof data.extractedValue === 'number') {
        setCurrentVal(data.extractedValue);
      }
      if (data.confirmationText) {
        setReadBackText(data.confirmationText);
      }
      if (data.audioBase64) {
        playBase64Audio(data.audioBase64);
      } else if (data.confirmationText) {
        speakBrowserFallback(data.confirmationText, lang);
      }
    } catch (err) {
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Voice recognition unavailable. Tap a value or type below.'
      );
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedProfile: RiderBillProfile = {
        ...profile,
        monthlyFixedBills: monthlyBills,
        billDueDay,
        dailyFuelSpend: dailyFuel,
        currentBalance,
        preferredLanguage: lang,
        billSetupCompleted: true,
      };
      await persistRiderBillProfile(updatedProfile);
      window.dispatchEvent(
        new CustomEvent('steadygig:lang-change', { detail: lang })
      );
      window.dispatchEvent(new CustomEvent('steadygig:refresh'));
      stopAnyAudio();
      onSaved(updatedProfile);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  const step = STEPS[stepIdx];
  const copy = UI_STRINGS[lang];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl max-h-[92vh] overflow-y-auto"
      >
        {/* Top Row: Language Toggle + Close */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2
              id="onboarding-modal-title"
              className="text-base font-bold text-slate-900"
            >
              {copy.headerTitle}
            </h2>
            <p className="text-xs text-slate-500">
              {copy.stepOf} {stepIdx + 1} / {STEPS.length}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {LANGUAGE_LABELS.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    setLang(item.code);
                    setReadBackText(null);
                    setVoiceTranscript(null);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    lang === item.code
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                stopAnyAudio();
                onClose();
              }}
              aria-label="Close setup"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 4-Step Progress Bar */}
        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {STEPS.map((s, idx) => (
            <button
              key={s.title['en-IN']}
              type="button"
              onClick={() => {
                setStepIdx(idx);
                setReadBackText(null);
                setVoiceTranscript(null);
                setVoiceError(null);
              }}
              aria-label={`Jump to step ${idx + 1}`}
              className={`h-1.5 rounded-full transition-colors ${
                idx <= stepIdx ? 'bg-[#047857]' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* Question Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${stepIdx}-${lang}`}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.14 }}
            className="mt-5 space-y-4"
          >
            <div>
              <p className="text-xs font-semibold text-[#047857]">
                {step.title[lang]}
              </p>
              <h3 className="mt-1 text-lg font-bold leading-snug text-slate-900">
                {step.question[lang]}
              </h3>
              <p className="mt-1 text-xs text-slate-500">{step.hint[lang]}</p>
            </div>

            {/* Listen Again + Voice Answer Row */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => speakText(step.question[lang], lang)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap"
              >
                <Volume2
                  className={`h-4 w-4 ${
                    isSpeaking ? 'text-[#047857]' : 'text-slate-600'
                  }`}
                />
                <span>{copy.listenAgain}</span>
              </button>

              <button
                type="button"
                onClick={isRecording ? stopVoiceAnswer : startVoiceAnswer}
                disabled={isProcessingVoice}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap disabled:opacity-50 ${
                  isRecording
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#047857] hover:bg-[#065F46]'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span>{copy.stopRecording}</span>
                  </>
                ) : isProcessingVoice ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5" />
                    <span>{copy.speakAnswer}</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-slate-500">{copy.voiceTip}</p>

            {/* Voice Read-Back Confirmation */}
            {(voiceTranscript || readBackText) && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950">
                {voiceTranscript && (
                  <p className="text-emerald-800">
                    <span className="font-semibold">{copy.heardPrefix}</span> “
                    {voiceTranscript}”
                  </p>
                )}
                {readBackText && (
                  <p className="mt-1 font-medium text-emerald-950">
                    {readBackText}
                  </p>
                )}
              </div>
            )}

            {voiceError && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {voiceError}
              </p>
            )}

            {/* Quick-Tap Chips */}
            <div className="flex flex-wrap gap-2">
              {step.chips.map((chipVal) => {
                const active = currentVal === chipVal;
                return (
                  <button
                    key={chipVal}
                    type="button"
                    onClick={() => setCurrentVal(chipVal)}
                    className={`min-h-[40px] rounded-lg border px-3.5 py-1.5 font-mono text-xs font-semibold tabular-nums transition-colors ${
                      active
                        ? 'border-[#047857] bg-emerald-50 text-[#047857]'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {step.unit === 'day'
                      ? formatOrdinal(chipVal)
                      : `₹${chipVal.toLocaleString('en-IN')}`}
                  </button>
                );
              })}
            </div>

            {/* Numeric Direct Input */}
            <label className="block">
              <span className="text-xs font-medium text-slate-600">
                {step.unit === 'day'
                  ? 'Day of month (1–31)'
                  : 'Exact amount (₹)'}
              </span>
              <div className="mt-1.5 flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 focus-within:border-[#047857] focus-within:ring-2 focus-within:ring-[#047857]/20">
                {step.unit === 'inr' && (
                  <span className="mr-2 font-mono text-base font-bold text-slate-500">
                    ₹
                  </span>
                )}
                <input
                  type="number"
                  min={step.unit === 'day' ? 1 : 0}
                  max={step.unit === 'day' ? 31 : 250000}
                  value={currentVal}
                  onChange={(e) => setCurrentVal(Number(e.target.value))}
                  className="w-full bg-transparent font-mono text-lg font-bold text-slate-900 tabular-nums focus:outline-none"
                />
              </div>
            </label>
          </motion.div>
        </AnimatePresence>

        {/* Bottom Navigation */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2">
            {stepIdx > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setStepIdx((i) => Math.max(0, i - 1));
                  setReadBackText(null);
                  setVoiceTranscript(null);
                }}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>{copy.back}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  stopAnyAudio();
                  onClose();
                }}
                className="min-h-[40px] px-2 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                {copy.skip}
              </button>
            )}
          </div>

          {stepIdx < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
                setReadBackText(null);
                setVoiceTranscript(null);
                setVoiceError(null);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#047857] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
            >
              <span>{copy.next}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#047857] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46] disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{copy.saving}</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>{copy.saveFinish}</span>
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
