import { isAircraft } from './vehicleModels.js';
import { aircraftSpec } from './aircraftSpecs.js';
export function engineSoundProfile(vehicle,rpm,throttle,speed=0) {
  const air=isAircraft(vehicle),prop=air&&aircraftSpec(vehicle).engine==='prop';
  return {frequency:air?(prop?35+throttle*85:65+throttle*110):rpm/28,filter:air?(prop?500+throttle*1200:1200+throttle*4200):230+rpm/5,noise:air?(prop?.035:.12)+Math.min(350,speed)*.0006:0,type:air&&!prop?'sine':'sawtooth'};
}
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
      const noiseBuffer=this.context.createBuffer(1,this.context.sampleRate,this.context.sampleRate),noise=noiseBuffer.getChannelData(0);
      for(let i=0;i<noise.length;i++)noise[i]=Math.random()*2-1;
      this.airNoise=this.context.createBufferSource();this.airNoise.buffer=noiseBuffer;this.airNoise.loop=true;
      this.airNoiseGain=this.context.createGain();this.airNoiseGain.gain.value=0;this.airNoise.connect(this.airNoiseGain);this.airNoiseGain.connect(filter);this.airNoise.start();
    }
    await this.context.resume(); this.enabled = !this.enabled; return this.enabled;
  }
  update(rpm, throttle, paused, vehicle='veloce',speed=0) {
    this.paused=paused;
    if (!this.context) return;
    const t = this.context.currentTime;
    this.output.gain.setTargetAtTime(this.enabled && !paused ? this.volume * (0.45 + Math.abs(throttle || 0) * 0.5) : 0, t, 0.08);
    const profile=engineSoundProfile(vehicle,rpm,throttle,speed);
    this.oscillators.forEach((oscillator, i) => {oscillator.type=i? 'triangle':profile.type;oscillator.frequency.setTargetAtTime(profile.frequency * (i + 1), t, 0.08);});
    this.filter.frequency.setTargetAtTime(profile.filter, t, 0.1);this.airNoiseGain.gain.setTargetAtTime(profile.noise,t,.15);
  }
  aircraftEvent(kind,attenuation=1) {
    if(!this.enabled||!this.context||this.paused)return;
    const ctx=this.context,t=ctx.currentTime,duration=kind==='explosion'?.65:kind==='gear'?.35:.16;
    const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)**2;
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;
    filter.type='lowpass';filter.frequency.value=kind==='explosion'?500:kind==='gear'?900:kind==='flare'?3500:1800;
    gain.gain.setValueAtTime(this.volume*Math.max(0,Math.min(1,attenuation))*(kind==='explosion'?.9:.3),t);
    source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
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
