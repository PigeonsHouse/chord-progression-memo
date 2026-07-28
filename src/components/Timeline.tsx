import type { MouseEvent } from "react";
import type { ChordBlock, ProgressionRange } from "../../shared/types";
import { chordLabel, functionColor } from "../lib/music";

export function Timeline({
  blocks,
  progressions,
  activeBeat,
  editable,
  hideTrailingNc,
  onBeat,
  onDeleteMeasure,
}: {
  blocks: ChordBlock[];
  progressions: ProgressionRange[];
  activeBeat: number | null;
  editable?: boolean;
  hideTrailingNc?: boolean;
  onBeat?: (beat: number) => void;
  onDeleteMeasure?: (measure: number) => void;
}) {
  let visible = blocks;
  if (hideTrailingNc) {
    let last = blocks.length;
    while (last > 0 && blocks[last - 1].degree === null) last -= 1;
    visible = blocks.slice(0, last);
  }
  const measures = new Map<number, ChordBlock[]>();
  for (const block of visible) {
    const measure = Math.floor(block.startBeat / 4);
    measures.set(measure, [...(measures.get(measure) ?? []), block]);
  }
  return (
    <div className="timeline">
      {[...measures.entries()].map(([measure, items]) => (
        <div className={`measure ${editable ? "editable" : ""}`} key={measure}>
          <div className="measure-header">
            <div className="measure-number">小節 {measure + 1}</div>
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
          <div className="measure-blocks">
            {items.map((block) => {
              const color = functionColor(block);
              const selected = activeBeat !== null &&
                activeBeat >= block.startBeat &&
                activeBeat < block.startBeat + block.duration;
              const labels = progressions.filter((range) =>
                range.startBeat <= block.startBeat && range.endBeat > block.startBeat);
              return (
                <button
                  type="button"
                  key={block.id}
                  className={`chord-block ${color ? `function-${color}` : "nc"} ${selected ? "playing" : ""}`}
                  style={{
                    gridColumn: `${block.startBeat % 4 + 1} / span ${block.duration}`,
                  }}
                  onClick={(event) => editable && onBeat?.(beatFromClick(event, block))}
                  disabled={!editable}
                  aria-label={`${chordLabel(block)}、${block.duration}拍`}
                >
                  <span className="chord-name">{chordLabel(block)}</span>
                  <span className="duration">{block.duration}拍</span>
                  {labels.length > 0 && <span className="range-dots">{labels.map((label) => label.name).join(" · ")}</span>}
                </button>
              );
            })}
            <div className="beat-grid" aria-hidden="true">
              <i /><i /><i /><i />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
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
