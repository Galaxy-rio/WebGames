import { loadPreferences } from './storage';
let context: AudioContext | undefined;
export function sound(kind: 'tap' | 'submit' | 'good' | 'finish' = 'tap') {
  const prefs = loadPreferences();
  if (!prefs.sound || prefs.volume === 0) return;
  try {
    context ??= new AudioContext();
    void context.resume();
    const notes =
      kind === 'good'
        ? [523.25, 659.25, 783.99]
        : kind === 'finish'
          ? [392, 523.25, 659.25, 783.99]
          : kind === 'submit'
            ? [330, 440]
            : [500];
    notes.forEach((frequency, i) => {
      const osc = context!.createOscillator();
      const gain = context!.createGain();
      const at = context!.currentTime + i * 0.075;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(prefs.volume * 0.15, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.13);
      osc.connect(gain);
      gain.connect(context!.destination);
      osc.start(at);
      osc.stop(at + 0.14);
    });
  } catch {}
}
