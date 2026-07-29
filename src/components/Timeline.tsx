import { useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { ChordBlock, KeyChange, ProgressionRange, SongSection } from "../../shared/types";
import { chordLabel, functionColor, KEY_NAMES } from "../lib/music";

export function Timeline({
  blocks,
  progressions,
  sections,
  initialKey,
  keyChanges,
  beatsPerMeasure,
  activeBeat,
  editable,
  hideTrailingNc,
  onBeat,
  onDeleteMeasure,
}: {
  blocks: ChordBlock[];
  progressions: ProgressionRange[];
  sections: SongSection[];
  initialKey: number;
  keyChanges: KeyChange[];
  beatsPerMeasure: number;
  activeBeat: number | null;
  editable?: boolean;
  hideTrailingNc?: boolean;
  onBeat?: (beat: number) => void;
  onDeleteMeasure?: (measure: number) => void;
}) {
  const [hoveredBeat, setHoveredBeat] = useState<number | null>(null);
  let visible = blocks;
  if (hideTrailingNc) {
    let last = blocks.length;
    while (last > 0 && blocks[last - 1].degree === null) last -= 1;
    visible = blocks.slice(0, last);
  }
  const measures = new Map<number, ChordBlock[]>();
  for (const block of visible) {
    const measure = Math.floor(block.startBeat / beatsPerMeasure);
    measures.set(measure, [...(measures.get(measure) ?? []), block]);
  }
  const timelineEnd = Math.max(
    0,
    ...visible.map((block) => block.startBeat + block.duration),
  );
  const sortedChanges = [...keyChanges].sort((a, b) => a.startBeat - b.startBeat);
  const keyRanges = [
    {
      id: "initial-key",
      name: `${KEY_NAMES[initialKey]} major`,
      startBeat: 0,
      endBeat: sortedChanges[0]?.startBeat ?? timelineEnd,
    },
    ...sortedChanges.map((change, index) => ({
      id: change.id,
      name: `${KEY_NAMES[change.keyPitchClass]} major`,
      startBeat: change.startBeat,
      endBeat: sortedChanges[index + 1]?.startBeat ?? timelineEnd,
    })),
  ].filter((range) => range.endBeat > range.startBeat);
  const progressionLanes = assignRangeLanes(progressions);
  return (
    <div className="timeline">
      {[...measures.entries()].map(([measure, items]) => (
        <div className={`measure ${editable ? "editable" : ""}`} key={measure}>
          <div className="measure-header">
            <div className="measure-number">{measure + 1}</div>
            {editable && (
              <button
                type="button"
                className="delete-measure"
                onClick={() => onDeleteMeasure?.(measure)}
                aria-label={`${measure + 1}小節目を削除`}
                title="この小節を削除"
              >
                <TrashIcon />
              </button>
            )}
          </div>
          <div className="measure-annotations">
            <AnnotationTrack
              ranges={keyRanges}
              measure={measure}
              beatsPerMeasure={beatsPerMeasure}
              kind="key"
            />
            {progressionLanes.map((ranges, lane) => (
              <AnnotationTrack
                ranges={ranges}
                measure={measure}
                beatsPerMeasure={beatsPerMeasure}
                kind="progression"
                key={lane}
              />
            ))}
          </div>
          <div
            className="measure-blocks"
            style={{ "--beats-per-measure": beatsPerMeasure } as CSSProperties}
          >
            <div className="section-markers" aria-label="セクション">
              {sections
                .filter((section) => Math.floor(section.startBeat / beatsPerMeasure) === measure)
                .map((section) => (
                  <span
                    className="section-marker"
                    style={{ left: `${(section.startBeat % beatsPerMeasure) / beatsPerMeasure * 100}%` }}
                    key={section.id}
                  >
                    {section.name}
                  </span>
                ))}
            </div>
            {items.map((block) => {
              const color = functionColor(block);
              const selected = activeBeat !== null &&
                activeBeat >= block.startBeat &&
                activeBeat < block.startBeat + block.duration;
              return (
                <button
                  type="button"
                  key={block.id}
                  className={`chord-block ${color ? `function-${color}` : "nc"} ${selected ? "playing" : ""}`}
                  style={{
                    gridColumn: `${block.startBeat % beatsPerMeasure + 1} / span ${block.duration}`,
                  }}
                  onClick={(event) => editable && onBeat?.(beatFromClick(event, block))}
                  onMouseMove={(event) => editable && setHoveredBeat(beatFromClick(event, block))}
                  onMouseLeave={() => setHoveredBeat(null)}
                  disabled={!editable}
                  aria-label={`${chordLabel(block)}、${block.duration}拍`}
                >
                  <span className="chord-name">{chordLabel(block)}</span>
                  <span className="duration">{block.duration}拍</span>
                </button>
              );
            })}
            {editable &&
              hoveredBeat !== null &&
              Math.floor(hoveredBeat / beatsPerMeasure) === measure && (
                <span
                  className="beat-hover"
                  style={{
                    left: `${(hoveredBeat % beatsPerMeasure) / beatsPerMeasure * 100}%`,
                    width: `${100 / beatsPerMeasure}%`,
                  }}
                  aria-hidden="true"
                  key={hoveredBeat}
                />
              )}
            {editable && (
              <div className="beat-grid" aria-hidden="true">
                {Array.from({ length: beatsPerMeasure }, (_, beat) => <i key={beat} />)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface AnnotationRange {
  id: string;
  name: string;
  startBeat: number;
  endBeat: number;
}

function AnnotationTrack({
  ranges,
  measure,
  beatsPerMeasure,
  kind,
}: {
  ranges: AnnotationRange[];
  measure: number;
  beatsPerMeasure: number;
  kind: "key" | "progression";
}) {
  const measureStart = measure * beatsPerMeasure;
  const measureEnd = measureStart + beatsPerMeasure;
  return (
    <div className="annotation-track">
      {ranges
        .filter((range) => range.startBeat < measureEnd && range.endBeat > measureStart)
        .map((range) => {
          const start = Math.max(range.startBeat, measureStart);
          const end = Math.min(range.endBeat, measureEnd);
          const segmentClasses = [
            start === range.startBeat ? "actual-start" : "",
            end === range.endBeat ? "actual-end" : "",
            measure % 8 === 0 ? "wide-row-start" : "",
            measure % 8 === 7 ? "wide-row-end" : "",
            measure % 4 === 0 ? "medium-row-start" : "",
            measure % 4 === 3 ? "medium-row-end" : "",
            measure % 2 === 0 ? "compact-row-start" : "",
            measure % 2 === 1 ? "compact-row-end" : "",
          ].filter(Boolean).join(" ");
          return (
            <span
              className={`timeline-annotation ${kind}-annotation ${segmentClasses}`}
              style={{
                left: `${(start - measureStart) / beatsPerMeasure * 100}%`,
                width: `${(end - start) / beatsPerMeasure * 100}%`,
              }}
              title={range.name}
              key={range.id}
            >
              <span className="band-label">{range.name}</span>
            </span>
          );
        })}
    </div>
  );
}

function assignRangeLanes(ranges: ProgressionRange[]) {
  const lanes: ProgressionRange[][] = [];
  for (const range of [...ranges].sort((a, b) => a.startBeat - b.startBeat || a.endBeat - b.endBeat)) {
    const lane = lanes.find((items) => items.every(
      (item) => item.endBeat <= range.startBeat || item.startBeat >= range.endBeat,
    ));
    if (lane) lane.push(range);
    else lanes.push([range]);
  }
  return lanes;
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
    </svg>
  );
}

function beatFromClick(event: MouseEvent<HTMLButtonElement>, block: ChordBlock) {
  const box = event.currentTarget.getBoundingClientRect();
  const offset = Math.min(block.duration - 1, Math.floor((event.clientX - box.left) / box.width * block.duration));
  return block.startBeat + Math.max(0, offset);
}
