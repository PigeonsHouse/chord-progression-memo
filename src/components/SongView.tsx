import { useState } from "react";
import type { Song } from "../../shared/types";
import { KEY_NAMES } from "../lib/music";
import { PlayerControls } from "./PlayerControls";
import { Timeline } from "./Timeline";

export function SongView({ song }: { song: Song }) {
  const [activeBeat, setActiveBeat] = useState<number | null>(null);
  return (
    <article className="page song-page">
      <header className="song-heading">
        <div>
          <p className="eyebrow">
            {KEY_NAMES[song.initialKey]} MAJOR · {song.timeSignatureNumerator}/
            {song.timeSignatureDenominator} · {song.bpm} BPM
          </p>
          <h1>{song.title}</h1>
          <p className="muted">作成者：{song.creatorName}</p>
        </div>
        <div className="song-view-actions">
          <PlayerControls song={song} onBeat={setActiveBeat} />
          {song.canEdit && (
            <a className="button" href={`/songs/${song.slug}/edit`}>
              編集する
            </a>
          )}
        </div>
      </header>
      <div className="tags">
        {song.tags.map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      {song.sourceUrl && (
        <p>
          <a href={song.sourceUrl} target="_blank" rel="noreferrer">
            参照動画を開く ↗
          </a>
        </p>
      )}
      <Timeline
        blocks={song.blocks}
        progressions={song.progressions}
        sections={song.sections}
        initialKey={song.initialKey}
        keyChanges={song.keyChanges}
        beatsPerMeasure={song.timeSignatureNumerator}
        activeBeat={activeBeat}
        hideTrailingNc
      />
    </article>
  );
}
