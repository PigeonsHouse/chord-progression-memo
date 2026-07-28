import type { ChordBlock, ChordQuality, KeyChange } from "../../shared/types";

export const KEY_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const ROMAN_SHARP = ["Ⅰ", "Ⅰ♯", "Ⅱ", "Ⅱ♯", "Ⅲ", "Ⅳ", "Ⅳ♯", "Ⅴ", "Ⅴ♯", "Ⅵ", "Ⅵ♯", "Ⅶ"];
const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  major: "",
  minor: "m",
  dominant7: "7",
  diminished: "dim",
  augmented: "aug",
  half_diminished7: "ø7",
};

export type FunctionColor = "T" | "P" | "Pm" | "S" | "Sm" | "D" | "Dm";

export function degreeLabel(degree: number, quality: ChordQuality | null, bass = false) {
  const normalized = mod12(degree);
  if (!bass && quality === "major") {
    if (normalized === 3) return "♭Ⅲ";
    if (normalized === 8) return "♭Ⅵ";
    if (normalized === 10) return "♭Ⅶ";
  }
  return ROMAN_SHARP[normalized];
}

export function chordLabel(block: Pick<ChordBlock, "degree" | "quality" | "bassDegree">) {
  if (block.degree === null || block.quality === null) return "N.C.";
  const root = degreeLabel(block.degree, block.quality);
  const bass =
    block.bassDegree !== null && block.bassDegree !== block.degree
      ? `/${degreeLabel(block.bassDegree, "major", true)}`
      : "";
  return `${root}${QUALITY_SUFFIX[block.quality]}${bass}`;
}

export function functionColor(block: Pick<ChordBlock, "degree" | "quality" | "bassDegree">): FunctionColor | null {
  if (block.degree === null || block.quality === null) return null;
  const degree = mod12(block.degree);
  if (degree === 10 && block.quality === "major") return "Dm";
  if (degree === 0 && block.quality === "augmented") return "T";
  if (degree === 6 && block.quality === "minor") return "P";
  if (degree === 4 && block.quality === "half_diminished7") return "T";
  if (degree === 0 && block.quality === "minor") return "Pm";
  if (degree === 3 && block.quality === "major") return "Pm";
  if (degree === 5 && block.quality === "minor") return "Sm";
  if (degree === 8 && block.quality === "major") return "Sm";
  if (degree === 7 && block.quality === "minor") return "Dm";
  if (degree === 10 && block.quality === "minor") return "Pm";
  if ([0, 9].includes(degree)) return "T";
  if ([1, 6].includes(degree)) return "P";
  if ([2, 5, 11].includes(degree)) return "S";
  if ([4, 7].includes(degree)) return "D";
  if (degree === 8) return block.quality === "diminished" ? "S" : "Sm";
  return "D";
}

export interface BeatValue {
  degree: number | null;
  quality: ChordQuality | null;
  bassDegree: number | null;
}

export function expandBlocks(blocks: ChordBlock[]): BeatValue[] {
  const length = Math.max(0, ...blocks.map((block) => block.startBeat + block.duration));
  const beats = Array.from({ length }, (): BeatValue => ({ degree: null, quality: null, bassDegree: null }));
  for (const block of blocks) {
    for (let i = block.startBeat; i < block.startBeat + block.duration; i += 1) {
      beats[i] = { degree: block.degree, quality: block.quality, bassDegree: block.bassDegree };
    }
  }
  return beats;
}

export function compressBeats(beats: BeatValue[]): ChordBlock[] {
  const blocks: ChordBlock[] = [];
  let start = 0;
  while (start < beats.length) {
    const value = beats[start];
    let duration = 1;
    while (
      start + duration < beats.length &&
      duration < 4 &&
      Math.floor(start / 4) === Math.floor((start + duration) / 4) &&
      sameBeat(value, beats[start + duration])
    ) {
      duration += 1;
    }
    blocks.push({
      id: crypto.randomUUID(),
      startBeat: start,
      duration,
      ...value,
    });
    start += duration;
  }
  return blocks;
}

export function applyAt(blocks: ChordBlock[], startBeat: number, width: number, value: BeatValue) {
  const beats = expandBlocks(blocks);
  while (beats.length < startBeat + width) {
    beats.push({ degree: null, quality: null, bassDegree: null });
  }
  for (let i = startBeat; i < startBeat + width; i += 1) beats[i] = value;
  while (beats.length % 4 !== 0) beats.push({ degree: null, quality: null, bassDegree: null });
  return compressBeats(beats);
}

export function addMeasure(blocks: ChordBlock[]) {
  const beats = expandBlocks(blocks);
  while (beats.length % 4 !== 0) beats.push({ degree: null, quality: null, bassDegree: null });
  beats.push(...Array.from({ length: 4 }, () => ({ degree: null, quality: null, bassDegree: null })));
  return compressBeats(beats);
}

export function removeMeasure(blocks: ChordBlock[], measureIndex: number) {
  const beats = expandBlocks(blocks);
  if (beats.length <= 4) return compressBeats([
    { degree: null, quality: null, bassDegree: null },
    { degree: null, quality: null, bassDegree: null },
    { degree: null, quality: null, bassDegree: null },
    { degree: null, quality: null, bassDegree: null },
  ]);
  beats.splice(measureIndex * 4, 4);
  return compressBeats(beats);
}

export function positionAfterMeasureRemoval(position: number, measureIndex: number) {
  const start = measureIndex * 4;
  const end = start + 4;
  if (position <= start) return position;
  if (position >= end) return position - 4;
  return start;
}

export function keyAtBeat(initialKey: number, changes: KeyChange[], beat: number) {
  return changes
    .filter((change) => change.startBeat <= beat)
    .sort((a, b) => a.startBeat - b.startBeat)
    .reduce((key, change) => change.keyPitchClass, initialKey);
}

const INTERVALS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dominant7: [0, 4, 7, 10],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  half_diminished7: [0, 3, 6, 10],
};

export function midiVoicing(block: ChordBlock, keyPitchClass: number, previousUpper: number[] = []): number[] {
  if (block.degree === null || block.quality === null) return [];
  const rootPc = mod12(keyPitchClass + block.degree);
  const bassPc = mod12(keyPitchClass + (block.bassDegree ?? block.degree));
  const bass = midiInRootRange(bassPc);
  const rootPosition = INTERVALS[block.quality].map((interval) => {
    const pitchClass = mod12(rootPc + interval);
    let note = 48 + mod12(pitchClass);
    if (note < 48) note += 12;
    return note;
  });
  for (let i = 1; i < rootPosition.length; i += 1) {
    while (rootPosition[i] <= rootPosition[i - 1]) rootPosition[i] += 12;
  }
  const inversions = rootPosition.map((_, inversion) => {
    const notes = [...rootPosition];
    for (let i = 0; i < inversion; i += 1) notes[i] += 12;
    return notes.sort((a, b) => a - b);
  });
  const upper = inversions.sort((a, b) => voicingScore(a, previousUpper) - voicingScore(b, previousUpper))[0];
  return [bass, ...upper].filter((note) => note >= 24 && note <= 95);
}

function midiInRootRange(pitchClass: number) {
  const candidates = Array.from({ length: 13 }, (_, i) => 36 + i).filter((note) => note % 12 === pitchClass);
  return candidates.sort((a, b) => Math.abs(a - 42) - Math.abs(b - 42))[0];
}

function sameBeat(a: BeatValue, b: BeatValue) {
  return a.degree === b.degree && a.quality === b.quality && a.bassDegree === b.bassDegree;
}

function voicingScore(notes: number[], previous: number[]) {
  if (previous.length === notes.length) {
    return notes.reduce((score, note, index) => score + Math.abs(note - previous[index]), 0);
  }
  return notes.reduce((score, note) => score + Math.abs(note - 60), 0);
}

function mod12(value: number) {
  return ((value % 12) + 12) % 12;
}
