import { describe, expect, it } from "vitest";
import type { ChordBlock } from "../../shared/types";
import {
  applyAt,
  chordLabel,
  functionColor,
  keyAtBeat,
  midiVoicing,
  insertMeasures,
  positionAfterMeasureInsertion,
  positionAfterMeasureRemoval,
  removeMeasure,
} from "./music";

const nc: ChordBlock = {
  id: "nc",
  startBeat: 0,
  duration: 4,
  degree: null,
  quality: null,
  bassDegree: null,
};

describe("chord notation", () => {
  it("uses flat labels only for standalone major roots", () => {
    expect(chordLabel({ degree: 10, quality: "major", bassDegree: null })).toBe("♭Ⅶ");
    expect(chordLabel({ degree: 10, quality: "minor", bassDegree: null })).toBe("Ⅵ♯m");
    expect(chordLabel({ degree: 0, quality: "major", bassDegree: 10 })).toBe("Ⅰ/Ⅵ♯");
  });

  it("uses the chosen color for overlapping chords", () => {
    expect(functionColor({ degree: 10, quality: "major", bassDegree: 0 })).toBe("Dm");
    expect(functionColor({ degree: 0, quality: "augmented", bassDegree: null })).toBe("T");
    expect(functionColor({ degree: 6, quality: "minor", bassDegree: null })).toBe("P");
    expect(functionColor({ degree: 4, quality: "half_diminished7", bassDegree: null })).toBe("T");
    expect(functionColor({ degree: 4, quality: "minor", bassDegree: null })).toBe("T");
  });
});

describe("timeline editing", () => {
  it("applies the retained width and splits at bar lines", () => {
    const blocks = applyAt([nc], 3, 3, { degree: 0, quality: "major", bassDegree: null });
    expect(blocks.map((block) => [block.startBeat, block.duration, block.degree])).toEqual([
      [0, 3, null],
      [3, 1, 0],
      [4, 2, 0],
      [6, 2, null],
    ]);
  });

  it("removes a whole measure and shifts following beats", () => {
    const blocks = applyAt([nc], 4, 4, { degree: 7, quality: "major", bassDegree: null });
    const removed = removeMeasure(blocks, 0);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ startBeat: 0, duration: 4, degree: 7 });
    expect(positionAfterMeasureRemoval(2, 0)).toBe(0);
    expect(positionAfterMeasureRemoval(8, 0)).toBe(4);
  });

  it("inserts empty measures and shifts positions at the insertion point", () => {
    const blocks = applyAt([nc], 4, 4, { degree: 7, quality: "major", bassDegree: null });
    const inserted = insertMeasures(blocks, 1, 2);
    expect(inserted.map((block) => [block.startBeat, block.duration, block.degree])).toEqual([
      [0, 4, null],
      [4, 4, null],
      [8, 4, null],
      [12, 4, 7],
    ]);
    expect(positionAfterMeasureInsertion(3, 1, 2)).toBe(3);
    expect(positionAfterMeasureInsertion(4, 1, 2)).toBe(12);
  });

  it("uses the song meter when splitting and inserting measures", () => {
    const threeFour = applyAt(
      [nc],
      0,
      4,
      { degree: 0, quality: "major", bassDegree: null },
      3,
    );
    expect(threeFour.map((block) => [block.startBeat, block.duration])).toEqual([
      [0, 3],
      [3, 1],
      [4, 2],
    ]);
    const inserted = insertMeasures(threeFour, 1, 1, 3);
    expect(inserted.find((block) => block.degree === 0 && block.startBeat === 6)).toBeDefined();
    expect(positionAfterMeasureInsertion(3, 1, 1, 3)).toBe(6);
  });
});

describe("playback calculation", () => {
  it("applies song-level key changes", () => {
    expect(keyAtBeat(0, [{ id: "x", startBeat: 4, keyPitchClass: 7 }], 3)).toBe(0);
    expect(keyAtBeat(0, [{ id: "x", startBeat: 4, keyPitchClass: 7 }], 4)).toBe(7);
  });

  it("keeps the bass in MIDI 36 through 48", () => {
    const notes = midiVoicing({ ...nc, degree: 0, quality: "major" }, 0);
    expect(notes[0]).toBeGreaterThanOrEqual(36);
    expect(notes[0]).toBeLessThanOrEqual(48);
    expect(notes.slice(1).map((note) => note % 12).sort((a, b) => a - b)).toEqual([0, 4, 7]);
    expect(Math.max(...notes.slice(1)) - Math.min(...notes.slice(1))).toBeLessThanOrEqual(12);
  });
});
