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
          <p className="eyebrow">{KEY_NAMES[song.initialKey]} MAJOR · {song.bpm} BPM</p>
          <h1>{song.title}</h1>
          <p className="muted">作成者：{song.creatorName}</p>
        </div>
        <PlayerControls song={song} onBeat={setActiveBeat} />
      </header>
      <div className="tags">{song.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
      {song.sourceUrl && <p><a href={song.sourceUrl} target="_blank" rel="noreferrer">参照動画を開く ↗</a></p>}
      <Timeline blocks={song.blocks} progressions={song.progressions} activeBeat={activeBeat} hideTrailingNc />
      {song.progressions.length > 0 && (
        <section className="panel">
          <h2>進行メモ</h2>
          <ul className="range-list">
            {song.progressions.map((range) => (
              <li key={range.id}><strong>{range.name}</strong><span>{range.startBeat + 1}〜{range.endBeat}拍目</span></li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
