// Costa Palma — every sound is synthesized with WebAudio; there are no
// audio files. Engine hum follows speed, sirens belong to the nearest
// cruiser, and the sea is filtered noise turned down low.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineNodes = null;
    this.sirenNodes = null;
  }

  // Browsers require a gesture; the start button calls this.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.startSurf();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  noiseBuffer(seconds = 0.4) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  startSurf() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(2);
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.035;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  // Continuous engine note; ratio 0..1 of top speed. on=false parks it.
  engine(ratio, on) {
    if (!this.ctx) return;
    if (on && !this.engineNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.05;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.master);
      osc.start();
      osc2.start();
      this.engineNodes = { osc, osc2, filter, gain };
    }
    if (!on && this.engineNodes) {
      const { osc, osc2, gain } = this.engineNodes;
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      osc.stop(this.ctx.currentTime + 0.3);
      osc2.stop(this.ctx.currentTime + 0.3);
      this.engineNodes = null;
      return;
    }
    if (this.engineNodes) {
      const f = 52 + ratio * 165;
      this.engineNodes.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
      this.engineNodes.osc2.frequency.setTargetAtTime(f * 0.5 + 3, this.ctx.currentTime, 0.05);
      this.engineNodes.filter.frequency.setTargetAtTime(380 + ratio * 900, this.ctx.currentTime, 0.08);
    }
  }

  // Two-tone siren; call each frame with the nearest cruiser's distance.
  siren(distance) {
    if (!this.ctx) return;
    const audible = distance < 85;
    if (audible && !this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(this.master);
      osc.start();
      this.sirenNodes = { osc, gain };
    }
    if (!audible && this.sirenNodes) {
      this.sirenNodes.osc.stop();
      this.sirenNodes = null;
      return;
    }
    if (this.sirenNodes) {
      const wail = Math.floor(this.ctx.currentTime * 1.6) % 2 === 0;
      this.sirenNodes.osc.frequency.setTargetAtTime(wail ? 715 : 950, this.ctx.currentTime, 0.03);
      const vol = Math.max(0, 0.075 * (1 - distance / 85));
      this.sirenNodes.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
    }
  }

  burst({ type = 'lowpass', freq = 800, gain = 0.4, seconds = 0.15, sweepTo = null }) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(seconds);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, this.ctx.currentTime + seconds);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + seconds);
    src.connect(filter).connect(g).connect(this.master);
    src.start();
  }

  gunshot(enemy = false) {
    this.burst({ freq: enemy ? 1500 : 1900, gain: enemy ? 0.22 : 0.4, seconds: 0.13, sweepTo: 220 });
  }

  punch() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(42, this.ctx.currentTime + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.11);
  }

  crash(intensity = 0.5) {
    this.burst({ freq: 340, gain: 0.25 + intensity * 0.45, seconds: 0.22 });
  }

  tone(freq, at, seconds = 0.16, type = 'triangle', gain = 0.22) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    const t0 = this.ctx.currentTime + at;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
  }

  jingle() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.11, 0.24));
  }

  fail() {
    [392, 330, 262].forEach((f, i) => this.tone(f, i * 0.13, 0.22, 'triangle', 0.18));
  }

  cash() {
    this.tone(988, 0, 0.1, 'square', 0.12);
    this.tone(1319, 0.07, 0.16, 'square', 0.12);
  }

  pop() {
    this.tone(660, 0, 0.09, 'sine', 0.25);
    this.tone(880, 0.05, 0.12, 'sine', 0.2);
  }
}
