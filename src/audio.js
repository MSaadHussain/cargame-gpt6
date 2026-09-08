export class EngineAudio {
  constructor() { this.enabled = false; this.volume = 0.25; }
  async toggle() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      this.output = this.context.createGain(); this.output.gain.value = 0;
      const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 450;
      this.filter = filter; filter.connect(this.output); this.output.connect(this.context.destination);
      this.oscillators = [1, 2, 3].map((n) => {
        const oscillator = this.context.createOscillator(); oscillator.type = n === 1 ? 'sawtooth' : 'triangle';
        oscillator.frequency.value = 35 * n;
        const gain = this.context.createGain(); gain.gain.value = 0.18 / n;
        oscillator.connect(gain); gain.connect(filter); oscillator.start(); return oscillator;
      });
    }
    await this.context.resume(); this.enabled = !this.enabled; return this.enabled;
  }
  update(rpm, throttle, paused) {
    if (!this.context) return;
    const t = this.context.currentTime;
    this.output.gain.setTargetAtTime(this.enabled && !paused ? this.volume * (0.45 + Math.abs(throttle || 0) * 0.5) : 0, t, 0.08);
    this.oscillators.forEach((oscillator, i) => oscillator.frequency.setTargetAtTime(rpm / 28 * (i + 1), t, 0.08));
    this.filter.frequency.setTargetAtTime(230 + rpm / 5, t, 0.1);
  }
  impact(strength) {
    if (!this.enabled || !this.context) return;
    const ctx = this.context, length = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600;
    const gain = ctx.createGain(); gain.gain.value = this.volume * Math.min(1, strength / 12);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
}
