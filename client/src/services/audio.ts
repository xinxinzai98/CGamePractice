export class AudioService {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private step = 0;
  muted = false;
  volume = 0.022;
  async enable() {
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
      if (!this.timer) this.timer = setInterval(() => this.music(), 420);
    } catch {}
  }
  private tone(frequency: number, duration: number, gain: number, type: OscillatorType = 'sine') {
    const c = this.context;
    if (!c || c.state !== 'running' || this.muted || document.hidden) return;
    const o = c.createOscillator(),
      g = c.createGain(),
      t = c.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(frequency, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + duration + 0.02);
  }
  private music() {
    const notes = [
      261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23, 246.94, 293.66, 392, 293.66, 261.63,
      329.63, 523.25, 392,
    ];
    this.tone(notes[this.step % 16], 0.5, this.volume);
    if (this.step % 4 === 0)
      this.tone(
        [130.81, 146.83, 123.47, 130.81][Math.floor(this.step / 4) % 4],
        1.1,
        this.volume * 0.55,
      );
    this.step++;
  }
  play(kind: string) {
    const frequencies: Record<string, number> = {
      fire: 180,
      missile: 90,
      hit: 75,
      boom: 40,
      heal: 660,
      skill: 420,
      win: 880,
      melee: 240,
    };
    if (kind in frequencies)
      this.tone(
        frequencies[kind],
        ['win', 'heal'].includes(kind) ? 0.3 : 0.12,
        0.04,
        ['fire', 'boom', 'hit'].includes(kind) ? 'triangle' : 'sine',
      );
  }
  destroy() {
    clearInterval(this.timer);
    void this.context?.close();
    this.context = null;
  }
}
