'use client';

export interface RecordedAudioResult {
  blob: Blob;
  durationMs: number;
  peakLevel: number;
  rmsLevel: number;
  isSilent: boolean;
}

export interface WavRecorderOptions {
  onLevel?: (level: number) => void;
  onError?: (message: string) => void;
}

const TARGET_SAMPLE_RATE = 16000;

/**
 * Downsamples mono Float32 PCM audio from sourceSampleRate to targetSampleRate (16kHz)
 * using linear interpolation and simple anti-aliasing box averaging.
 */
function downsampleTo16kHz(
  samples: Float32Array,
  sourceSampleRate: number
): Float32Array {
  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    return samples;
  }

  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(samples.length / ratio));
  const result = new Float32Array(outputLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < outputLength) {
    const nextOffsetBuffer = Math.min(
      samples.length,
      Math.round((offsetResult + 1) * ratio)
    );
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer; i++) {
      accum += samples[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

/**
 * Encodes mono Float32 PCM samples (-1..1) at 16kHz into a standard 16-bit PCM RIFF WAV Blob.
 */
function encodeMonoWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Reliable browser voice recorder that captures 16kHz Mono PCM WAV via Web Audio API
 * (optimal for Sarvam AI saaras:v4 & Gemini STT), with automatic MediaRecorder fallback.
 */
export class BrowserVoiceRecorder {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sinkGainNode: GainNode | null = null;
  private pcmChunks: Float32Array[] = [];
  private sampleRate = 48000;
  private peakLevel = 0;
  private sumSquares = 0;
  private totalSamples = 0;
  private startTime = 0;
  private isRecording = false;

  // Fallback MediaRecorder fields
  private mediaRecorder: MediaRecorder | null = null;
  private mediaChunks: Blob[] = [];
  private mediaMimeType = 'audio/webm';
  private usingFallback = false;

  private options: WavRecorderOptions;

  constructor(options: WavRecorderOptions = {}) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.isRecording) return;

    this.pcmChunks = [];
    this.mediaChunks = [];
    this.peakLevel = 0;
    this.sumSquares = 0;
    this.totalSamples = 0;
    this.usingFallback = false;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    this.stream = stream;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (AudioCtx) {
      try {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        this.audioCtx = ctx;
        this.sampleRate = ctx.sampleRate || 48000;

        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        const zeroGain = ctx.createGain();
        zeroGain.gain.value = 0;

        processor.onaudioprocess = (event: AudioProcessingEvent) => {
          if (!this.isRecording) return;
          const input = event.inputBuffer.getChannelData(0);
          const copy = new Float32Array(input.length);
          copy.set(input);
          this.pcmChunks.push(copy);

          let chunkSq = 0;
          let chunkPeak = 0;
          for (let i = 0; i < copy.length; i++) {
            const abs = Math.abs(copy[i]);
            if (abs > chunkPeak) chunkPeak = abs;
            chunkSq += copy[i] * copy[i];
          }
          if (chunkPeak > this.peakLevel) this.peakLevel = chunkPeak;
          this.sumSquares += chunkSq;
          this.totalSamples += copy.length;

          const chunkRms = Math.sqrt(chunkSq / Math.max(1, copy.length));
          // Normalize RMS to 0..1 visual meter
          const visualLevel = Math.min(1, chunkRms * 6);
          this.options.onLevel?.(visualLevel);
        };

        source.connect(processor);
        processor.connect(zeroGain);
        zeroGain.connect(ctx.destination);

        this.sourceNode = source;
        this.processorNode = processor;
        this.sinkGainNode = zeroGain;
        this.startTime = Date.now();
        this.isRecording = true;
        return;
      } catch {
        // Clean up partial Web Audio setup and fall back to MediaRecorder
        this.cleanupAudioGraph();
      }
    }

    // Fallback: MediaRecorder
    this.usingFallback = true;
    const mimeCandidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    const selectedMime =
      typeof MediaRecorder !== 'undefined'
        ? mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || ''
        : '';

    this.mediaMimeType =
      (selectedMime || 'audio/webm').split(';')[0].trim() || 'audio/webm';

    const recorder = new MediaRecorder(
      stream,
      selectedMime ? { mimeType: selectedMime } : undefined
    );
    this.mediaRecorder = recorder;
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        this.mediaChunks.push(ev.data);
      }
    };
    recorder.start(250);
    this.startTime = Date.now();
    this.isRecording = true;
  }

  async stop(): Promise<RecordedAudioResult> {
    if (!this.isRecording) {
      return {
        blob: new Blob([], { type: 'audio/wav' }),
        durationMs: 0,
        peakLevel: 0,
        rmsLevel: 0,
        isSilent: true,
      };
    }

    this.isRecording = false;
    const durationMs = Math.max(0, Date.now() - this.startTime);

    if (!this.usingFallback) {
      this.cleanupAudioGraph();
      this.stopStream();

      const merged = new Float32Array(this.totalSamples);
      let offset = 0;
      for (const chunk of this.pcmChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      this.pcmChunks = [];

      const downsampled = downsampleTo16kHz(merged, this.sampleRate);
      const wavBlob = encodeMonoWav(downsampled, TARGET_SAMPLE_RATE);
      const rmsLevel = Math.sqrt(this.sumSquares / Math.max(1, this.totalSamples));
      const isSilent =
        durationMs < 300 || this.totalSamples < 1600 || this.peakLevel < 0.006;

      return {
        blob: wavBlob,
        durationMs,
        peakLevel: this.peakLevel,
        rmsLevel,
        isSilent,
      };
    }

    // Fallback MediaRecorder stop
    return new Promise<RecordedAudioResult>((resolve) => {
      const recorder = this.mediaRecorder;
      if (!recorder || recorder.state === 'inactive') {
        this.stopStream();
        const blob = new Blob(this.mediaChunks, { type: this.mediaMimeType });
        resolve({
          blob,
          durationMs,
          peakLevel: blob.size > 1000 ? 0.1 : 0,
          rmsLevel: blob.size > 1000 ? 0.05 : 0,
          isSilent: durationMs < 350 || blob.size < 1000,
        });
        return;
      }

      recorder.onstop = () => {
        this.stopStream();
        const blob = new Blob(this.mediaChunks, { type: this.mediaMimeType });
        this.mediaChunks = [];
        this.mediaRecorder = null;
        resolve({
          blob,
          durationMs,
          peakLevel: blob.size > 1000 ? 0.1 : 0,
          rmsLevel: blob.size > 1000 ? 0.05 : 0,
          isSilent: durationMs < 350 || blob.size < 1000,
        });
      };

      try {
        if (recorder.state === 'recording') {
          recorder.requestData();
        }
        recorder.stop();
      } catch {
        this.stopStream();
        const blob = new Blob(this.mediaChunks, { type: this.mediaMimeType });
        resolve({
          blob,
          durationMs,
          peakLevel: 0,
          rmsLevel: 0,
          isSilent: true,
        });
      }
    });
  }

  cancel(): void {
    this.isRecording = false;
    this.cleanupAudioGraph();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.mediaRecorder = null;
    this.mediaChunks = [];
    this.pcmChunks = [];
    this.stopStream();
  }

  private cleanupAudioGraph(): void {
    try {
      this.processorNode?.disconnect();
      this.sourceNode?.disconnect();
      this.sinkGainNode?.disconnect();
    } catch {
      // ignore disconnect errors
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
    }
    this.processorNode = null;
    this.sourceNode = null;
    this.sinkGainNode = null;
    this.audioCtx = null;
  }

  private stopStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}
