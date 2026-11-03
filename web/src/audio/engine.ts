/**
 * Plays a composed Song with the Web Audio API.
 *
 * A look-ahead scheduler ("A Tale of Two Clocks") queues sixteenth-note steps a little ahead of
 * time on the audio clock, so playback stays tight even when the main thread is busy.
 */

import { compose, midiToHz, type Song } from "./compose";

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

export interface EngineTrack {
  seed: number;
  durationMs: number;
  features?: number[] | null;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  private master: GainNode;
  private bus: GainNode;
  private reverb: ConvolverNode;
  private noise: AudioBuffer;
  private song: Song | null = null;
  private timer: number | null = null;
  private stepS = 0.125;
  private nextStep = 0;
  private nextTime = 0;
  private startCtxTime = 0;
  private startOffsetMs = 0;
  private live = new Set<AudioScheduledSourceNode>();
  private playing = false;
  onEnded: (() => void) | null = null;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "playback" });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;

    this.bus = this.ctx.createGain();
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.28;

    this.bus.connect(comp);
    this.bus.connect(this.reverb).connect(wet).connect(comp);
    comp.connect(this.master).connect(this.analyser).connect(this.ctx.destination);

    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  private impulse(seconds: number): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    return buf;
  }

  setVolume(v: number) {
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.03);
  }

  load(track: EngineTrack) {
    this.stop();
    this.song = compose(track.seed, track.durationMs, track.features);
    this.stepS = 60 / this.song.bpm / 4;
    this.startOffsetMs = 0;
  }

  get positionMs(): number {
    if (!this.song) return 0;
    if (!this.playing) return this.startOffsetMs;
    return this.startOffsetMs + Math.max(0, (this.ctx.currentTime - this.startCtxTime) * 1000);
  }

  async play(fromMs = this.startOffsetMs) {
    if (!this.song) return;
    if (this.ctx.state !== "running") await this.ctx.resume();
    this.stopVoices();
    this.startOffsetMs = fromMs;
    this.startCtxTime = this.ctx.currentTime + 0.05;
    this.nextStep = Math.floor(fromMs / 1000 / this.stepS);
    this.nextTime = this.startCtxTime + (this.nextStep * this.stepS - fromMs / 1000);
    this.playing = true;
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.setValueAtTime(0, this.ctx.currentTime);
    this.bus.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.08);
    this.timer ??= window.setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  pause() {
    if (!this.playing) return;
    this.startOffsetMs = this.positionMs;
    this.playing = false;
    this.halt();
  }

  seek(ms: number) {
    if (this.playing) void this.play(ms);
    else this.startOffsetMs = ms;
  }

  stop() {
    this.playing = false;
    this.startOffsetMs = 0;
    this.halt();
  }

  private halt() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0, t, 0.02);
    window.setTimeout(() => this.stopVoices(), 120);
  }

  private stopVoices() {
    for (const node of this.live) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    this.live.clear();
  }

  private schedule() {
    const song = this.song;
    if (!song || !this.playing) return;
    const totalSteps = song.bars * 16;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD_S) {
      if (this.nextStep >= totalSteps) {
        this.playing = false;
        this.halt();
        this.startOffsetMs = song.bars * 16 * this.stepS * 1000;
        window.setTimeout(() => this.onEnded?.(), 200);
        return;
      }
      this.step(song, this.nextStep, this.nextTime);
      this.nextStep++;
      this.nextTime += this.stepS;
    }
  }

  private track<T extends AudioScheduledSourceNode>(node: T): T {
    this.live.add(node);
    node.onended = () => this.live.delete(node);
    return node;
  }

  private step(song: Song, index: number, time: number) {
    const bar = Math.floor(index / 16);
    const s = index % 16;
    const level = song.intensity[bar] ?? 0.5;
    const chord = song.progression[bar] ?? [0, 4, 7];
    const f = song.features;
    const swing = s % 2 === 1 ? this.stepS * 0.12 * f.danceability : 0;
    const t = time + swing;

    if (s === 0) this.pad(chord, song, t, level);
    if (s % 4 === 0 && level > 0.3) this.bass(song.root + (chord[0] ?? 0), t, f.danceability, s);
    if (level > 0.45 && f.acousticness > 0.35 && s % 2 === 0) {
      const note = chord[(s / 2) % 3] ?? 0;
      this.pluck(song.root + 24 + note, t, 0.06 + 0.05 * level);
    }
    if (level > 0.55 && f.instrumentalness < 0.95) {
      const pos = (bar % 2) * 16 + s;
      const hit = song.motif.find(([step]) => step === pos);
      if (hit) {
        const degree = hit[1];
        const octave = Math.floor(degree / song.scale.length);
        const note =
          song.root +
          24 +
          (song.scale[degree % song.scale.length] ?? 0) +
          12 * octave +
          (bar % 8 >= 4 ? 12 : 0);
        this.lead(note, t, song.brightness, level);
      }
    }
    if (level > 0.4) {
      const k = song.drums.kick[s] ?? 0;
      const sn = song.drums.snare[s] ?? 0;
      const h = song.drums.hat[s] ?? 0;
      if (k) this.kick(t, k * level);
      if (sn && level > 0.5) this.snare(t, sn * level);
      if (h && level > 0.55) this.hat(t, h * level);
    }
  }

  // --- voices ---------------------------------------------------------------------------------

  private env(gain: GainNode, t: number, peak: number, attack: number, release: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  private pad(chord: number[], song: Song, t: number, level: number) {
    const barS = this.stepS * 16;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500 + 1800 * song.brightness * level;
    filter.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05 + 0.04 * level, t + barS * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + barS * 1.05);
    filter.connect(gain).connect(this.bus);
    for (const note of chord) {
      for (const detune of [-7, 7]) {
        const osc = this.track(this.ctx.createOscillator());
        osc.type = song.brightness > 0.5 ? "sawtooth" : "triangle";
        osc.frequency.value = midiToHz(song.root + 12 + note);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + barS * 1.1);
      }
    }
  }

  private bass(note: number, t: number, dance: number, s: number) {
    const osc = this.track(this.ctx.createOscillator());
    osc.type = "sine";
    osc.frequency.value = midiToHz(dance > 0.6 && s % 8 === 4 ? note + 12 : note);
    const gain = this.ctx.createGain();
    this.env(gain, t, 0.22, 0.01, this.stepS * 3.2);
    osc.connect(gain).connect(this.bus);
    osc.start(t);
    osc.stop(t + this.stepS * 3.5);
  }

  private pluck(note: number, t: number, peak: number) {
    const osc = this.track(this.ctx.createOscillator());
    osc.type = "triangle";
    osc.frequency.value = midiToHz(note);
    const gain = this.ctx.createGain();
    this.env(gain, t, peak, 0.004, 0.5);
    osc.connect(gain).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  private lead(note: number, t: number, brightness: number, level: number) {
    const osc = this.track(this.ctx.createOscillator());
    osc.type = brightness > 0.6 ? "square" : "sine";
    osc.frequency.value = midiToHz(note);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400 + 2600 * brightness;
    const gain = this.ctx.createGain();
    this.env(gain, t, 0.05 + 0.04 * level, 0.02, this.stepS * 3);
    osc.connect(filter).connect(gain).connect(this.bus);
    osc.start(t);
    osc.stop(t + this.stepS * 3.4);
  }

  private kick(t: number, v: number) {
    const osc = this.track(this.ctx.createOscillator());
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const gain = this.ctx.createGain();
    this.env(gain, t, 0.55 * v, 0.003, 0.28);
    osc.connect(gain).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  private snare(t: number, v: number) {
    const src = this.track(this.ctx.createBufferSource());
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    this.env(gain, t, 0.22 * v, 0.002, 0.16);
    src.connect(filter).connect(gain).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.2);
  }

  private hat(t: number, v: number) {
    const src = this.track(this.ctx.createBufferSource());
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const gain = this.ctx.createGain();
    this.env(gain, t, 0.07 * v, 0.001, 0.045);
    src.connect(filter).connect(gain).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.06);
  }
}
