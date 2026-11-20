'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mic,
  Square,
  Loader2,
  Volume2,
  X,
  Sparkles,
  CheckCircle2,
  Fuel,
  Utensils,
  Home,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface VoiceAssistantProps {
  userId?: string;
  onMutation?: (action: any) => void;
}

interface ActionData {
  intent: 'LOG_EXPENSE' | 'CHECK_VAULT' | 'SIMULATE_PAYOUT';
  category: 'fuel' | 'food' | 'rent' | null;
  amount: number | null;
  previousBalance?: number;
  updatedBalance?: number;
  vaultBalance?: number;
  transactionId?: string;
}

export default function SarvamVoiceAssistant({
  userId = 'rider_blr_01',
  onMutation,
}: VoiceAssistantProps) {
  const router = useRouter();

  // State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Transcript & speech bubble state
  const [transcript, setTranscript] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string | null>(null);
  const [actionData, setActionData] = useState<ActionData | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [showBubble, setShowBubble] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup timers & audio on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  // Play audio from base64 string
  const playAudioBase64 = (base64String: string) => {
    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }

      const audioSrc = base64String.startsWith('data:')
        ? base64String
        : `data:audio/wav;base64,${base64String}`;

      const audio = new Audio(audioSrc);
      audioPlayerRef.current = audio;
      setIsPlayingAudio(true);

      audio.onended = () => {
        setIsPlayingAudio(false);
      };

      audio.onerror = () => {
        setIsPlayingAudio(false);
      };

      audio.play().catch((err) => {
        console.warn('[SarvamVoiceAssistant] Auto-play was prevented by browser policy:', err);
        setIsPlayingAudio(false);
      });
    } catch (err) {
      console.error('[SarvamVoiceAssistant] Audio playback error:', err);
      setIsPlayingAudio(false);
    }
  };

  // Start Voice Recording
  const startRecording = async () => {
    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Determine supported mimeType
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/wav'];
      const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        stream.getTracks().forEach((track) => track.stop());
        await sendAudioToPipeline(audioBlob);
      };

      recorder.start(250); // Slice chunks every 250ms
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('[SarvamVoiceAssistant] Mic access error:', err);
      setErrorMessage('ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನೀಡಿ / Please allow microphone access.');
      setIsRecording(false);
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Send Audio to /api/voice
  const sendAudioToPipeline = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'rider_voice.webm');
      formData.append('userId', userId);

      const response = await fetch('/api/voice', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Voice request failed with status ${response.status}`);
      }

      const data = await response.json();

      setTranscript(data.transcript || '');
      setReplyText(data.replyText || '');
      setActionData(data.action || null);
      setAudioBase64(data.audioBase64 || null);
      setShowBubble(true);

      // Trigger automatic spoken audio playback
      if (data.audioBase64) {
        playAudioBase64(data.audioBase64);
      }

      // Refresh Dashboard and Supabase state
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
    } catch (err: any) {
      console.error('[SarvamVoiceAssistant] Pipeline error:', err);
      setErrorMessage(err.message || 'ಧ್ವನಿ ಸಂಸ್ಕರಣೆ ವಿಫಲವಾಗಿದೆ / Voice processing failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Hackathon Judge Demo: Read Vault Status Aloud
  const handleReadVaultStatusAloud = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'read_vault',
          userId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to read vault status.');
      }

      const data = await response.json();
      setTranscript(data.transcript || 'ವಾಲ್ಟ್ ಸ್ಥಿತಿ ಪರಿಶೀಲನೆ (Vault Check)');
      setReplyText(data.replyText || '');
      setActionData(data.action || null);
      setAudioBase64(data.audioBase64 || null);
      setShowBubble(true);

      if (data.audioBase64) {
        playAudioBase64(data.audioBase64);
      }

      router.refresh();
    } catch (err: any) {
      console.error('[SarvamVoiceAssistant] Read vault status error:', err);
      setErrorMessage('ವಾಲ್ಟ್ ಸ್ಥಿತಿ ಓದಲು ಸಾಧ್ಯವಾಗಿಲ್ಲ / Could not read vault status.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Format recording timer
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-3 pointer-events-none select-none">
      {/* Speech Bubble Card */}
      {showBubble && replyText && (
        <div className="pointer-events-auto w-[340px] sm:w-[380px] bg-[#0A101D]/95 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-4 shadow-2xl shadow-black/80 flex flex-col gap-2.5 transition-all duration-200 animate-in fade-in slide-in-from-bottom-3">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold tracking-wide text-amber-400 uppercase">
                {actionData?.intent === 'LOG_EXPENSE' ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    ಖರ್ಚು ದಾಖಲಾಗಿದೆ / Expense Logged
                  </span>
                ) : actionData?.intent === 'SIMULATE_PAYOUT' ? (
                  <span className="flex items-center gap-1 text-sky-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    ಪೇಔಟ್ ಮಾಹಿತಿ / Payout Simulation
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    ವಾಲ್ಟ್ ಸ್ಥಿತಿ / Vault Status
                  </span>
                )}
              </span>
            </div>

            <button
              onClick={() => setShowBubble(false)}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User Spoken Transcript */}
          {transcript && (
            <div className="text-xs text-gray-400 bg-white/5 rounded-lg px-2.5 py-1.5 border border-white/5 italic">
              <span className="font-semibold text-gray-300 not-italic mr-1">Rider:</span>
              &ldquo;{transcript}&rdquo;
            </div>
          )}

          {/* Assistant Kannada Reply */}
          <div className="text-sm font-medium text-white leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <Volume2
                className={`w-4 h-4 mt-0.5 shrink-0 text-amber-400 ${
                  isPlayingAudio ? 'animate-bounce text-emerald-400' : ''
                }`}
              />
              <p className="text-amber-100 font-sans">{replyText}</p>
            </div>
          </div>

          {/* Mutation Impact Preview */}
          {actionData?.intent === 'LOG_EXPENSE' && actionData.amount && (
            <div className="flex items-center justify-between text-xs bg-black/40 rounded-lg px-3 py-2 border border-white/10">
              <div className="flex items-center gap-1.5 text-gray-300">
                {actionData.category === 'food' ? (
                  <Utensils className="w-3.5 h-3.5 text-amber-400" />
                ) : actionData.category === 'rent' ? (
                  <Home className="w-3.5 h-3.5 text-sky-400" />
                ) : (
                  <Fuel className="w-3.5 h-3.5 text-orange-400" />
                )}
                <span className="capitalize">{actionData.category || 'Expense'}:</span>
                <span className="font-bold text-white">₹{actionData.amount}</span>
              </div>

              {typeof actionData.updatedBalance === 'number' && (
                <div className="text-emerald-400 font-mono text-[11px]">
                  Balance: ₹{actionData.updatedBalance.toLocaleString('en-IN')}
                </div>
              )}
            </div>
          )}

          {/* Actions Footer */}
          <div className="flex items-center justify-between pt-1 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              {isPlayingAudio ? (
                <span className="text-emerald-400 font-medium animate-pulse">
                  ಧ್ವನಿ ನುಡಿಯುತ್ತಿದೆ... / Playing audio...
                </span>
              ) : (
                <span className="text-gray-400">Sarvam AI + Gemini</span>
              )}
            </span>

            {audioBase64 && (
              <button
                onClick={() => playAudioBase64(audioBase64)}
                disabled={isPlayingAudio}
                className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium px-2 py-1 rounded bg-amber-400/10 hover:bg-amber-400/20 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                ಮತ್ತೆ ಕೇಳಿ / Replay
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Toast */}
      {errorMessage && (
        <div className="pointer-events-auto bg-red-950/90 border border-red-500/40 text-red-200 text-xs rounded-xl px-3.5 py-2.5 shadow-xl max-w-xs flex items-center justify-between gap-2">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Secondary Demo Drawer Toggle */}
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          onClick={() => setShowDrawer((prev) => !prev)}
          className="bg-[#0B132B]/90 hover:bg-[#121E42] text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md transition-all flex items-center gap-1.5"
          title="Demo Options"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Demo Controls</span>
        </button>

        {showDrawer && (
          <button
            onClick={handleReadVaultStatusAloud}
            disabled={isProcessing || isRecording}
            className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-gray-950 font-bold px-3.5 py-1.5 rounded-full text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>ವಾಲ್ಟ್ ಸ್ಥಿತಿ ಕೇಳಿ / Read Vault Status</span>
          </button>
        )}
      </div>

      {/* Main High-Contrast Floating Mic Button */}
      <div className="pointer-events-auto flex items-center gap-3">
        {isRecording && (
          <div className="bg-red-950/90 border border-red-500/50 rounded-full px-3.5 py-1.5 flex items-center gap-2 shadow-lg backdrop-blur-md animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span className="text-xs font-mono font-bold text-red-200">
              {formatTime(recordingSeconds)}
            </span>
            <span className="text-xs text-red-300 font-medium">ಧ್ವನಿ ರೆಕಾರ್ಡ್ ಆಗುತ್ತಿದೆ...</span>
          </div>
        )}

        {isProcessing && (
          <div className="bg-[#0A101D]/90 border border-amber-500/40 rounded-full px-3.5 py-1.5 flex items-center gap-2 shadow-lg backdrop-blur-md">
            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            <span className="text-xs text-amber-200 font-medium">
              ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತಿದೆ... / Processing...
            </span>
          </div>
        )}

        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          aria-label={isRecording ? 'Stop recording' : 'Speak to Sarvam Voice Assistant'}
          className={`group relative flex items-center gap-2.5 px-4 py-3 sm:px-5 sm:py-3.5 rounded-full font-bold text-sm shadow-2xl transition-all duration-200 active:scale-95 ${
            isRecording
              ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white ring-4 ring-red-500/50 shadow-red-500/30 animate-pulse'
              : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-gray-950 shadow-amber-500/25 ring-2 ring-amber-400/40 hover:ring-amber-300'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isRecording ? (
            <>
              <Square className="w-5 h-5 fill-current" />
              <span className="tracking-wide">ನಿಲ್ಲಿಸಿ / Stop</span>
            </>
          ) : isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>ಕಾಯಿರಿ... / Wait</span>
            </>
          ) : (
            <>
              <div className="relative">
                <Mic className="w-5 h-5 text-gray-950" />
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <span className="tracking-wide font-sans">ಮಾತನಾಡಿ / Speak</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
