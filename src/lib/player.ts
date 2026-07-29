import type { ChordBlock, KeyChange } from "../../shared/types";
import { keyAtBeat, midiVoicing } from "./music";

const QUARTER_NOTE_BEAT_UNIT = 4;

export class ChordPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private sources: AudioBufferSourceNode[] = [];
  private timer: number | null = null;
  private volume = 0.7;

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.gain && this.context) {
      this.gain.gain.setValueAtTime(this.volume, this.context.currentTime);
    }
  }

  async play(
    blocks: ChordBlock[],
    bpm: number,
    beatUnit: number,
    initialKey: number,
    keyChanges: KeyChange[],
    startBeat: number,
    onBeat: (beat: number | null) => void,
  ) {
    this.stop(onBeat);
    this.context ??= new AudioContext();
    if (!this.gain) {
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
    }
    this.gain.gain.setValueAtTime(this.volume, this.context.currentTime);
    await this.context.resume();
    const playable = blocks.filter(
      (block) => block.degree !== null && block.startBeat + block.duration > startBeat,
    );
    let previousUpper: number[] = [];
    const voicings = new Map<string, number[]>();
    for (const block of playable) {
      const voicing = midiVoicing(
        block,
        keyAtBeat(initialKey, keyChanges, block.startBeat),
        previousUpper,
      );
      voicings.set(block.id, voicing);
      previousUpper = voicing.slice(1);
    }
    const notes = [...new Set([...voicings.values()].flat())];
    await Promise.all(notes.map((note) => this.load(note)));
    const secondsPerBeat = 60 / bpm * (QUARTER_NOTE_BEAT_UNIT / beatUnit);
    const startAt = this.context.currentTime + 0.08;
    for (const block of playable) {
      const effectiveStart = Math.max(block.startBeat, startBeat);
      const at = startAt + (effectiveStart - startBeat) * secondsPerBeat;
      const stopAt = at + (block.startBeat + block.duration - effectiveStart) * secondsPerBeat;
      for (const note of voicings.get(block.id) ?? []) {
        const source = this.context.createBufferSource();
        source.buffer = this.buffers.get(note)!;
        source.connect(this.gain);
        source.start(at);
        source.stop(stopAt);
        this.sources.push(source);
      }
    }
    const totalBeats = Math.max(...blocks.map((block) => block.startBeat + block.duration), 0);
    const started = performance.now();
    this.timer = window.setInterval(() => {
      const beat = startBeat + Math.floor((performance.now() - started) / 1000 / secondsPerBeat);
      if (beat >= totalBeats) this.stop(onBeat);
      else onBeat(beat);
    }, 50);
  }

  stop(onBeat: (beat: number | null) => void) {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // A source that ended naturally is already stopped.
      }
    }
    this.sources = [];
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    onBeat(null);
  }

  private async load(note: number) {
    if (this.buffers.has(note)) return;
    const response = await fetch(`/notes/${note}.wav`);
    if (!response.ok) throw new Error(`音源 ${note} を読み込めませんでした`);
    this.buffers.set(note, await this.context!.decodeAudioData(await response.arrayBuffer()));
  }
}
