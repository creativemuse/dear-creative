/**
 * GaplessAudioQueue
 *
 * Implements high-precision Web Audio API hardware timeline scheduling (audioCtx.currentTime)
 * to achieve seamless, gapless playback across asynchronously generated Kokoro-82M chunks.
 *
 * Instead of relying on JavaScript event loop chaining (source.onended) which introduces
 * 10-50ms stutter between sentences, incoming buffers are scheduled continuously:
 * nextStartTime = Math.max(audioCtx.currentTime, nextStartTime) + duration
 */

export type AudioQueueOptions = {
  sampleRate?: number;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onEnded?: () => void;
};

export class GaplessAudioQueue {
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime = 0;
  private _isPlaying = false;
  private _isPaused = false;
  private activeSources: AudioBufferSourceNode[] = [];
  private playbackSpeed = 1.0;
  private sampleRate: number;
  private onStateChange?: (isPlaying: boolean) => void;
  private onEnded?: () => void;

  constructor(options: AudioQueueOptions = {}) {
    this.sampleRate = options.sampleRate ?? 24000;
    this.onStateChange = options.onPlaybackStateChange;
    this.onEnded = options.onEnded;
  }

  get isPlaying(): boolean {
    return this._isPlaying && !this._isPaused;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  get currentTime(): number {
    if (!this.audioCtx) return 0;
    return this.audioCtx.currentTime;
  }

  /**
   * Initialize or resume the AudioContext on user interaction.
   * Browsers require user interaction before playing audio.
   */
  init(): AudioContext {
    if (typeof window === "undefined") {
      throw new Error("Web Audio API is only available in browser environments");
    }

    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      this.audioCtx = new AudioContextClass({
        latencyHint: "interactive",
      });

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }

    return this.audioCtx;
  }

  /**
   * Set the playback rate (e.g. 1.0, 1.25, 1.5).
   * Note: Active sources will update their playback rate, and subsequent chunks
   * will be scheduled taking the speed factor into account.
   */
  setPlaybackRate(speed: number) {
    if (speed <= 0) return;
    this.playbackSpeed = speed;
    for (const source of this.activeSources) {
      try {
        source.playbackRate.value = speed;
      } catch {
        // Source might have finished
      }
    }
  }

  /**
   * Enqueue and schedule a raw PCM chunk immediately.
   *
   * @param rawBuffer - Transferred Float32Array or ArrayBuffer PCM buffer.
   * @param sampleRate - Audio sample rate (Kokoro-82M outputs 24,000 Hz).
   */
  enqueueChunk(rawBuffer: ArrayBuffer | Float32Array, sampleRate: number = this.sampleRate) {
    const ctx = this.init();

    // 1. Convert raw ArrayBuffer / Float32Array into an AudioBuffer
    const float32Data =
      rawBuffer instanceof Float32Array ? rawBuffer : new Float32Array(rawBuffer);

    if (float32Data.length === 0) {
      return;
    }

    const audioBuffer = ctx.createBuffer(1, float32Data.length, sampleRate);
    if (typeof audioBuffer.copyToChannel === "function") {
      audioBuffer.copyToChannel(float32Data as unknown as Float32Array<ArrayBuffer>, 0);
    } else {
      audioBuffer.getChannelData(0).set(float32Data);
    }

    // 2. Create the buffer source node
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = this.playbackSpeed;

    if (this.gainNode) {
      source.connect(this.gainNode);
    } else {
      source.connect(ctx.destination);
    }

    // 3. Compute continuous start time
    // If the queue fell idle or is starting fresh, clamp to current hardware clock
    const currentTime = ctx.currentTime;
    const startTime = Math.max(currentTime, this.nextStartTime);

    // 4. Schedule playback natively on the hardware clock
    source.start(startTime);

    // 5. Advance timeline pointer for the subsequent chunk taking playback rate into account
    const effectiveDuration = audioBuffer.duration / this.playbackSpeed;
    this.nextStartTime = startTime + effectiveDuration;
    this._isPlaying = true;
    this._isPaused = false;
    this.onStateChange?.(true);

    // Track active sources for teardown/cleanup
    this.activeSources.push(source);
    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) {
        this.activeSources.splice(idx, 1);
      }

      // Check if all queued chunks have finished playing
      if (
        this.activeSources.length === 0 &&
        this.audioCtx &&
        this.audioCtx.currentTime >= this.nextStartTime - 0.05
      ) {
        this._isPlaying = false;
        this.onStateChange?.(false);
        this.onEnded?.();
      }
    };
  }

  /**
   * Pause playback by suspending the audio context.
   */
  async pause() {
    if (this.audioCtx && this.audioCtx.state === "running") {
      await this.audioCtx.suspend();
      this._isPaused = true;
      this.onStateChange?.(false);
    }
  }

  /**
   * Resume playback by resuming the audio context.
   */
  async resume() {
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
      this._isPaused = false;
      this.onStateChange?.(true);
    }
  }

  /**
   * Stop immediately, discard scheduled audio, and reset the timeline.
   */
  stop() {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignore errors if source already ended
      }
    }
    this.activeSources = [];
    if (this.audioCtx) {
      this.nextStartTime = this.audioCtx.currentTime;
    }
    this._isPlaying = false;
    this._isPaused = false;
    this.onStateChange?.(false);
  }

  /**
   * Set output volume gain (0.0 to 1.0).
   */
  setVolume(volume: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }
}
