// Procedural festival ambience: wind, a slow taiko pulse, koto plucks, bells and a pad.
// No audio files: every sound is synthesised in WebAudio.
export class Ambience {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.timer = null;
    this.beat = 0;
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(ctx.destination);
    this.master.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 3.5);

    // reverb from a synthesised noise impulse
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(2.6, 2.2);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.42;
    this.verb.connect(this.wet);
    this.wet.connect(this.master);
    this.dry = ctx.createGain();
    this.dry.gain.value = 1.0;
    this.dry.connect(this.master);

    this._wind();
    this._pad();
    this._schedule();
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - Math.exp(-i / 300));
      }
    }
    return buf;
  }

  _noise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      // pinkish noise
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    return buf;
  }

  _wind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noise(6);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 60;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    // slow gusts
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start();
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 0.25;
    g.connect(send);
    send.connect(this.verb);
    src.start();
  }

  _pad() {
    const ctx = this.ctx;
    const freqs = [73.42, 110.0, 146.83, 220.0]; // D2 A2 D3 A3
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.055;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.04;
    const lg = ctx.createGain();
    lg.gain.value = 260;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    for (const f of freqs) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.5 / freqs.length;
        o.connect(g);
        g.connect(lp);
        o.start();
      }
    }
    lp.connect(this.padGain);
    this.padGain.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    this.padGain.connect(send);
    send.connect(this.verb);
  }

  _taiko(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.34);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g);
    g.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    g.connect(send);
    send.connect(this.verb);
    o.start(t);
    o.stop(t + 0.6);
    // skin noise
    const n = ctx.createBufferSource();
    n.buffer = this._noise(0.25);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.1;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.16, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(this.dry);
    n.start(t);
    n.stop(t + 0.25);
  }

  _koto(t, midi, vel = 0.22) {
    const ctx = this.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.005;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 2600;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(bp);
    bp.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 0.85;
    bp.connect(send);
    send.connect(this.verb);
    o.start(t); o2.start(t);
    o.stop(t + 1.6); o2.stop(t + 1.6);
  }

  _bell(t, midi, vel = 0.18) {
    const ctx = this.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * 3.51;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(f * 1.6, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + 2.4);
    mod.connect(modGain);
    modGain.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    car.connect(g);
    g.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 1.0;
    g.connect(send);
    send.connect(this.verb);
    car.start(t); mod.start(t);
    car.stop(t + 3.4); mod.stop(t + 3.4);
  }

  _schedule() {
    const ctx = this.ctx;
    const bpm = 62;
    const beat = 60 / bpm;
    const scale = [50, 53, 55, 57, 60, 62, 65, 69]; // D minor pentatonic-ish
    let next = ctx.currentTime + 0.15;
    let step = 0;
    const lookahead = () => {
      while (next < ctx.currentTime + 0.6) {
        const bar = Math.floor(step / 8);
        // taiko: a slow 8-beat pattern
        if (step % 8 === 0) this._taiko(next);
        if (step % 8 === 5) this._taiko(next + 0.02);
        if (step % 16 === 11) this._taiko(next);
        // koto: sparse melody, a phrase every other bar
        if (step % 2 === 0 && Math.random() < 0.55) {
          const deg = scale[Math.floor(Math.random() * scale.length)];
          this._koto(next + (Math.random() < 0.3 ? beat * 0.25 : 0), deg + 12, 0.10 + Math.random() * 0.1);
        }
        // bell every 3 bars
        if (step % 24 === 6) this._bell(next, scale[Math.floor(Math.random() * 3)] + 24, 0.10);
        // pad chord change every 32 beats
        if (step % 32 === 0) {
          const roots = [73.42, 87.31, 98.0, 110.0];
          const r = roots[Math.floor(Math.random() * roots.length)];
          this.padGain.gain.cancelScheduledValues(ctx.currentTime);
          this.padGain.gain.setTargetAtTime(0.035, ctx.currentTime, 2.5);
        }
        void bar;
        next += beat;
        step++;
      }
    };
    this.timer = setInterval(lookahead, 180);
    lookahead();
  }

  toggle() {
    if (!this.ctx) return;
    this.muted = !this.muted;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.3);
  }
}
