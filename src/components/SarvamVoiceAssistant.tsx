'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mic,
  Square,
  Loader2,
  Volume2,
  X,
  CheckCircle2,
  Fuel,
  Utensils,
  Home,
  ShieldCheck,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import { readLocalBillProfile, SupportedLanguage } from '@/lib/cashflow-slicer';
import { BrowserVoiceRecorder } from '@/lib/browser-audio';

interface VoiceAssistantProps {
  userId?: string;
  onMutation?: (action: ActionData) => void;
}

interface ActionData {
  intent: 'LOG_EXPENSE' | 'LOG_INCOME' | 'CHECK_BILLS_SHIELD' | 'CHECK_VAULT' | 'SIMULATE_PAYOUT';
  category: 'fuel' | 'food' | 'rent' | 'maintenance' | 'income' | null;
  amount: number | null;
  previousBalance?: number;
  updatedBalance?: number;
  billShieldBalance?: number;
  vaultBalance?: number;
  transactionId?: string;
}

const VOICE_BTN_LABELS: Record<
  SupportedLanguage,
  { speak: string; readShield: string; noSpeech: string; playing: string }
> = {
  'kn-IN': {
    speak: 'ಮಾತನಾಡಿ · Speak',
    readShield: 'ಬಿಲ್ ಶೀಲ್ಡ್ ಸ್ಥಿತಿ ಕೇಳಿ / Read Shield',
    noSpeech: 'ಧ್ವನಿ ಕೇಳಿಸಲಿಲ್ಲ. ಮೈಕ್ ಹತ್ತಿರ ಸ್ಪಷ್ಟವಾಗಿ ಮಾತನಾಡಿ.',
    playing: 'ಕನ್ನಡ ಉತ್ತರ ಕೇಳಿಸುತ್ತಿದೆ...',
  },
  'hi-IN': {
    speak: 'बोलें · Speak',
    readShield: 'बिल शील्ड स्थिति सुनें / Read Shield',
    noSpeech: 'आवाज़ सुनाई नहीं दी। माइक के पास स्पष्ट बोलें।',
    playing: 'हिन्दी उत्तर चल रहा है...',
  },
  'en-IN': {
    speak: 'Speak (Voice)',
    readShield: 'Read Bill Shield Status',
    noSpeech: 'No speech detected. Hold mic close and speak clearly.',
    playing: 'Playing voice reply...',
  },
};

function extractLanguageDetail(detail: unknown): SupportedLanguage | null {
  if (detail === 'kn-IN' || detail === 'hi-IN' || detail === 'en-IN') {
    return detail;
  }
  if (detail && typeof detail === 'object' && 'language' in detail) {
    const lang = (detail as { language?: unknown }).language;
    if (lang === 'kn-IN' || lang === 'hi-IN' || lang === 'en-IN') {
      return lang;
    }
  }
  return null;
}

export default function SarvamVoiceAssistant({
  userId = 'rider_blr_01',
  onMutation,
}: VoiceAssistantProps) {
  const router = useRouter();

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [transcript, setTranscript] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string | null>(null);
  const [actionData, setActionData] = useState<ActionData | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [showBubble, setShowBubble] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [languageCode, setLanguageCode] = useState<SupportedLanguage>('kn-IN');

  const recorderRef = useRef<BrowserVoiceRecorder | null>(null);
  const isRecordingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const stopPlayback = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
  };

  useEffect(() => {
    const saved = readLocalBillProfile(userId);
    if (saved?.preferredLanguage) {
      setLanguageCode(saved.preferredLanguage);
    }

    const handleLangEvent = (ev: Event) => {
      const parsedLang = extractLanguageDetail((ev as CustomEvent).detail);
      if (parsedLang) {
        setLanguageCode(parsedLang);
      }
    };
    window.addEventListener('steadygig:lang-change', handleLangEvent);

    return () => {
      window.removeEventListener('steadygig:lang-change', handleLangEvent);
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.cancel();
      stopPlayback();
    };
  }, [userId]);

  const playAudioBase64 = (base64String: string) => {
    try {
      stopPlayback();

      const audioSrc = base64String.startsWith('data:')
        ? base64String
        : `data:audio/wav;base64,${base64String}`;

      const audio = new Audio(audioSrc);
      audioPlayerRef.current = audio;
      setIsPlayingAudio(true);

      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => setIsPlayingAudio(false);

      audio.play().catch(() => {
        setIsPlayingAudio(false);
      });
    } catch {
      setIsPlayingAudio(false);
    }
  };

  const speakBrowserFallback = (text: string, lang: SupportedLanguage) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
      return;
    }
    try {
      stopPlayback();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = 0.98;
      setIsPlayingAudio(true);
      utter.onend = () => setIsPlayingAudio(false);
      utter.onerror = () => setIsPlayingAudio(false);
      window.speechSynthesis.speak(utter);
    } catch {
      setIsPlayingAudio(false);
    }
  };

  const startRecording = async () => {
    if (isRecordingRef.current || isProcessing) return;

    try {
      stopPlayback();
      setErrorMessage(null);
      setMicLevel(0);

      const recorder = new BrowserVoiceRecorder({
        onLevel: (level) => setMicLevel(level),
      });
      await recorder.start();

      recorderRef.current = recorder;
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingSeconds(0);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      recorderRef.current?.cancel();
      recorderRef.current = null;
      isRecordingRef.current = false;
      setErrorMessage(
        'ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನೀಡಿ · Allow microphone access to speak.'
      );
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!isRecordingRef.current || !recorderRef.current) {
      setIsRecording(false);
      setMicLevel(0);
      return;
    }

    isRecordingRef.current = false;
    setIsRecording(false);
    setMicLevel(0);

    const recorder = recorderRef.current;
    recorderRef.current = null;
    const result = await recorder.stop();

    if (result.isSilent) {
      setErrorMessage(VOICE_BTN_LABELS[languageCode].noSpeech);
      return;
    }

    await sendAudioToPipeline(result.blob);
  };

  const sendAudioToPipeline = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      const ext = audioBlob.type.includes('wav')
        ? 'wav'
        : audioBlob.type.includes('mp4')
        ? 'mp4'
        : audioBlob.type.includes('ogg')
        ? 'ogg'
        : 'webm';
      formData.append('file', audioBlob, `rider_voice.${ext}`);
      formData.append('userId', userId);
      formData.append('languageCode', languageCode);

      const response = await fetch('/api/voice', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(
          errJson.error || `Voice request failed (${response.status})`
        );
      }

      const data = await response.json();

      setTranscript(data.transcript || '');
      setReplyText(data.replyText || '');
      setActionData(data.action || null);
      setAudioBase64(data.audioBase64 || null);
      setShowBubble(true);

      if (data.audioBase64) {
        playAudioBase64(data.audioBase64);
      } else if (data.replyText) {
        speakBrowserFallback(data.replyText, languageCode);
      }

      if (data.action) {
        window.dispatchEvent(
          new CustomEvent('steadygig:refresh', { detail: data.action })
        );
        window.dispatchEvent(
          new CustomEvent('supabase:mutation', { detail: data })
        );
        if (onMutation) {
          onMutation(data.action);
        }
        router.refresh();
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'ಧ್ವನಿ ಸಂಸ್ಕರಣೆ ವಿಫಲವಾಗಿದೆ · Voice processing failed.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReadVaultStatusAloud = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'read_bill_shield',
          userId,
          languageCode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to read Bill Shield status.');
      }

      const data = await response.json();
      setTranscript(data.transcript || 'Bill Shield Status Check');
      setReplyText(data.replyText || '');
      setActionData(data.action || null);
      setAudioBase64(data.audioBase64 || null);
      setShowBubble(true);

      if (data.audioBase64) {
        playAudioBase64(data.audioBase64);
      }

      router.refresh();
    } catch {
      setErrorMessage(
        'ಬಿಲ್ ಶೀಲ್ಡ್ ಸ್ಥಿತಿ ಓದಲು ಸಾಧ್ಯವಾಗಿಲ್ಲ · Could not read Bill Shield status.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed right-4 bottom-4 sm:right-6 sm:bottom-6 z-50 flex flex-col items-end gap-2.5 pointer-events-none select-none">
      {/* Clean Minimal Response Card */}
      {showBubble && replyText && (
        <div className="pointer-events-auto w-[336px] sm:w-[380px] rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              {actionData?.intent === 'LOG_EXPENSE' ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Expense Logged</span>
                </>
              ) : actionData?.intent === 'LOG_INCOME' ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Earnings Added</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>Bill Shield Status</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowBubble(false)}
              aria-label="Close voice reply"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {transcript && (
            <p className="mt-2.5 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Rider:</span> “
              {transcript}”
            </p>
          )}

          <div className="mt-2.5 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-900">
            <div className="flex items-start gap-2">
              <Volume2
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  isPlayingAudio ? 'text-emerald-600' : 'text-slate-500'
                }`}
              />
              <p>{replyText}</p>
            </div>
          </div>

          {(actionData?.intent === 'LOG_EXPENSE' || actionData?.intent === 'LOG_INCOME') &&
            actionData.amount && (
              <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                <div className="flex items-center gap-1.5 text-slate-600">
                  {actionData.category === 'food' ? (
                    <Utensils className="h-3.5 w-3.5 text-slate-500" />
                  ) : actionData.category === 'rent' ? (
                    <Home className="h-3.5 w-3.5 text-slate-500" />
                  ) : (
                    <Fuel className="h-3.5 w-3.5 text-slate-500" />
                  )}
                  <span className="capitalize">
                    {actionData.category ||
                      (actionData.intent === 'LOG_INCOME' ? 'Earnings' : 'Expense')}
                  </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {actionData.intent === 'LOG_INCOME' ? '+' : ''}₹{actionData.amount}
                  </span>
                </div>

                {typeof actionData.updatedBalance === 'number' && (
                  <span className="font-mono font-medium text-emerald-700 tabular-nums">
                    Balance ₹{actionData.updatedBalance.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            )}

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {isPlayingAudio ? VOICE_BTN_LABELS[languageCode].playing : 'Sarvam AI + Gemini'}
            </span>
            {audioBase64 && (
              <button
                type="button"
                onClick={() => playAudioBase64(audioBase64)}
                disabled={isPlayingAudio}
                className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Replay</span>
              </button>
            )}
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="pointer-events-auto flex max-w-xs items-center justify-between gap-2 rounded-xl border border-rose-200 bg-white px-3.5 py-2.5 text-xs text-rose-700 shadow-md"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss error"
            className="text-rose-400 hover:text-rose-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Multilingual & Demo Controls Row */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
        {showDrawer && (
          <>
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {(
                [
                  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
                  { code: 'hi-IN', label: 'हिन्दी' },
                  { code: 'en-IN', label: 'EN' },
                ] as { code: SupportedLanguage; label: string }[]
              ).map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    setLanguageCode(item.code);
                    window.dispatchEvent(
                      new CustomEvent('steadygig:lang-change', {
                        detail: { language: item.code },
                      })
                    );
                  }}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                    languageCode === item.code
                      ? 'bg-[#047857] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleReadVaultStatusAloud}
              disabled={isProcessing || isRecording}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Volume2 className="h-3.5 w-3.5 shrink-0" />
              <span>{VOICE_BTN_LABELS[languageCode].readShield}</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setShowDrawer((prev) => !prev)}
          aria-expanded={showDrawer}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium shadow-sm transition-colors whitespace-nowrap shrink-0 ${
            showDrawer
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
          <span>Voice &amp; Demo</span>
        </button>
      </div>

      {/* Primary Mic Action Row */}
      <div className="pointer-events-auto flex items-center gap-2">
        {isRecording && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-rose-600 animate-pulse" />
            <span className="h-1.5 w-10 overflow-hidden rounded-full bg-rose-100">
              <span
                className="block h-full bg-rose-600 transition-all duration-75"
                style={{ width: `${Math.max(12, Math.round(micLevel * 100))}%` }}
              />
            </span>
            <span className="font-mono tabular-nums">
              {formatTime(recordingSeconds)}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          aria-label={
            isRecording
              ? 'Stop recording'
              : 'Speak to Multilingual Voice Co-Pilot'
          }
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition-colors whitespace-nowrap shrink-0 ${
            isRecording
              ? 'bg-rose-600 text-white hover:bg-rose-700'
              : 'bg-[#047857] text-white hover:bg-[#065F46]'
          } disabled:opacity-50`}
        >
          {isRecording ? (
            <>
              <Square className="h-4 w-4 fill-current" />
              <span>Stop</span>
            </>
          ) : isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              <span>{VOICE_BTN_LABELS[languageCode].speak}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
