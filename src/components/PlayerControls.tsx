import { useRef, useState } from "react";
import type { Song } from "../../shared/types";
import { ChordPlayer } from "../lib/player";

export function PlayerControls({ song, onBeat }: { song: Song; onBeat: (beat: number | null) => void }) {
  const player = useRef(new ChordPlayer());
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [volume, setVolume] = useState(() => {
    const saved = Number(window.localStorage.getItem("chord-memo-volume"));
    return Number.isFinite(saved) && saved >= 0 && saved <= 100 ? saved : 70;
  });

  function changeVolume(next: number) {
    setVolume(next);
    player.current.setVolume(next / 100);
    window.localStorage.setItem("chord-memo-volume", String(next));
  }

  async function toggle() {
    setError("");
    if (playing) {
      player.current.stop(onBeat);
      setPlaying(false);
      return;
    }
    try {
      setPlaying(true);
      player.current.setVolume(volume / 100);
      await player.current.play(song.blocks, song.bpm, song.initialKey, song.keyChanges, (beat) => {
        onBeat(beat);
        if (beat === null) setPlaying(false);
      });
    } catch (reason) {
      setPlaying(false);
      setError(reason instanceof Error ? reason.message : "再生できませんでした");
    }
  }

  return (
    <div className="player-controls">
      <button className="button primary" onClick={toggle}>{playing ? "停止" : "最初から再生"}</button>
      <label className="volume-control">
        <VolumeIcon muted={volume === 0} />
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={volume}
          onChange={(event) => changeVolume(Number(event.target.value))}
          aria-label={`音量 ${volume}%`}
        />
        <span>{volume}%</span>
      </label>
      {error && <span className="error">{error}</span>}
    </div>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9v6h4l5 4V5L9 9H5Z" />
      {muted
        ? <path d="m17 9 4 6m0-6-4 6" />
        : <path d="M17 9.5a4 4 0 0 1 0 5M19 7a7 7 0 0 1 0 10" />}
    </svg>
  );
}
