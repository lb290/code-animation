// Procedural ambience for CIELO — no audio files, everything is synthesised.
// Layers: high wind, airy harmonic pad, distant church bells, a whale call,
// steam-train whistle, and doves. All routed through a synthesised reverb.
export class Ambience {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.next = {};
    this.train = null;   // {x,z} set by main each frame (nearest train position)
    this.camPos = [0, 30, 110];
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(ctx.destination);
    this.master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 4.0);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(3.4, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.verb.connect(this.wet);
    this.wet.connect(this.master);
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.85;
    this.dry.connect(this.master);

    this._wind();
    this._pad();
    this._tick = setInterval(() => this._schedule(), 200);
  }

  toggle() {
    if (!this.ctx) { this.start(); return true; }
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.25);
    return !this.muted;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - Math.exp(-i / 400));
      }
    }
    return buf;
  }

  _noise(seconds, pink = 1) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18 * pink;
    }
    return buf;
  }

  // ---- high altitude wind -------------------------------------------------
  _wind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noise(7);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.10;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = ctx.createGain();
    lg.gain.value = 0.055;
    lfo.connect(lg);
    lg.connect(g.gain);
    lfo.start();
    src.connect(bp);
    bp.connect(g);
    g.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 0.4;
    g.connect(send);
    send.connect(this.verb);
    src.start();
  }

  // ---- airy chord pad -----------------------------------------------------
  _pad() {
    const ctx = this.ctx;
    // Cmaj9-ish, wide and soft, very quiet
    const freqs = [130.81, 196.0, 246.94, 329.63, 392.0];
    const g = ctx.createGain();
    g.gain.value = 0.030;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.Q.value = 0.4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.035;
    const lg = ctx.createGain();
    lg.gain.value = 420;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 2) * 5;
      const og = ctx.createGain();
      og.gain.value = 0.55 / freqs.length;
      o.connect(og);
      og.connect(lp);
      o.start();
    });
    lp.connect(g);
    g.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 0.8;
    g.connect(send);
    send.connect(this.verb);
  }

  // ---- one-shots ----------------------------------------------------------
  _bell(t, midi = 72, vel = 0.10) {
    const ctx = this.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    for (const [mul, amp] of [[1, 1], [2.01, 0.45], [3.02, 0.22], [4.98, 0.1]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel * amp, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2 + mul * 0.6);
      o.connect(g);
      g.connect(this.dry);
      const send = ctx.createGain();
      send.gain.value = 0.9;
      g.connect(send);
      send.connect(this.verb);
      o.start(t);
      o.stop(t + 5.5);
    }
  }

  _whale(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const base = 58 + Math.random() * 16;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 1.7, t + 1.1);
    o.frequency.linearRampToValueAtTime(base * 0.8, t + 3.4);
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.2;
    const vg = ctx.createGain();
    vg.gain.value = 3.5;
    vib.connect(vg);
    vg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.5);
    g.gain.linearRampToValueAtTime(0.05, t + 2.6);
    g.gain.linearRampToValueAtTime(0, t + 4.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    o.connect(lp);
    lp.connect(g);
    g.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 1.1;
    g.connect(send);
    send.connect(this.verb);
    o.start(t); vib.start(t);
    o.stop(t + 4.4); vib.stop(t + 4.4);
  }

  _whistle(t) {
    const ctx = this.ctx;
    // three detuned steam whistles, short and distant
    const base = 392 * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.08);
    g.gain.setValueAtTime(0.05, t + 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    g.connect(bp);
    bp.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 1.0;
    bp.connect(send);
    send.connect(this.verb);
    for (const d of [-14, 0, 18]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = base;
      o.detune.value = d;
      o.connect(g);
      o.start(t);
      o.stop(t + 1.7);
    }
  }

  _dove(t) {
    const ctx = this.ctx;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.16;
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = 340 + Math.random() * 90;
      o.frequency.setValueAtTime(f0, tt);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.5, tt + 0.06);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.9, tt + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(0.022, tt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.2);
      o.connect(g);
      g.connect(this.dry);
      o.start(tt);
      o.stop(tt + 0.25);
    }
  }

  // sparse random schedule
  _schedule() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const now = performance.now() / 1000;
    if (!this.next.bell) this.next.bell = now + 6;
    if (!this.next.whale) this.next.whale = now + 12;
    if (!this.next.whistle) this.next.whistle = now + 18;
    if (!this.next.dove) this.next.dove = now + 8;
    if (now > this.next.bell) {
      const midi = [72, 76, 79, 84][Math.floor(Math.random() * 4)];
      this._bell(t, midi, 0.05 + Math.random() * 0.06);
      this._bell(t + 0.28, midi + 7, 0.03 + Math.random() * 0.04);
      this.next.bell = now + 26 + Math.random() * 26;
    }
    if (now > this.next.whale) { this._whale(t + 0.05); this.next.whale = now + 34 + Math.random() * 30; }
    if (now > this.next.whistle) { this._whistle(t + 0.05); this.next.whistle = now + 26 + Math.random() * 34; }
    if (now > this.next.dove) { this._dove(t + 0.05); this.next.dove = now + 7 + Math.random() * 12; }
  }
}
