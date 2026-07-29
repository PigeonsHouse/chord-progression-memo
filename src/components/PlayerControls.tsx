import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { ChordBlock, Song } from "../../shared/types";
import { keyAtBeat } from "../lib/music";
import { ChordPlayer } from "../lib/player";

export interface PlayerControlsHandle {
  playFromBeat: (beat: number) => Promise<void>;
  playSingle: (block: ChordBlock) => Promise<void>;
}

export const PlayerControls = forwardRef<PlayerControlsHandle, {
  song: Song;
  onBeat: (beat: number | null) => void;
  onPlayingChange?: (playing: boolean) => void;
}>(function PlayerControls({ song, onBeat, onPlayingChange }, ref) {
  const player = useRef(new ChordPlayer());
  const [playing, setPlaying] = useState(false);
  const [startPoint, setStartPoint] = useState("song-start");
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

  function changePlaying(next: boolean) {
    setPlaying(next);
    onPlayingChange?.(next);
  }

  async function playFromBeat(startBeat: number) {
    setError("");
    player.current.stop(onBeat);
    onBeat(null);
    try {
      changePlaying(true);
      player.current.setVolume(volume / 100);
      await player.current.play(
        song.blocks,
        song.bpm,
        song.timeSignatureDenominator,
        song.initialKey,
        song.keyChanges,
        startBeat,
        (beat) => {
          onBeat(beat);
          if (beat === null) changePlaying(false);
        },
      );
    } catch (reason) {
      changePlaying(false);
      setError(
        reason instanceof Error ? reason.message : "再生できませんでした",
      );
    }
  }

  async function play() {
    const startBeat =
      song.sections.find((section) => section.id === startPoint)?.startBeat ??
      0;
    await playFromBeat(startBeat);
  }

  async function playSingle(block: ChordBlock) {
    setError("");
    changePlaying(false);
    onBeat(null);
    player.current.setVolume(volume / 100);
    try {
      await player.current.playSingle(
        block,
        song.bpm,
        song.timeSignatureDenominator,
        keyAtBeat(song.initialKey, song.keyChanges, block.startBeat),
        onBeat,
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "コードを再生できませんでした",
      );
    }
  }

  useImperativeHandle(ref, () => ({ playFromBeat, playSingle }));

  function stop() {
    player.current.stop(onBeat);
    changePlaying(false);
  }

  const sections = [...song.sections].sort((a, b) => a.startBeat - b.startBeat);

  return (
    <div className="player-controls">
      <label className="playback-start">
        <span>再生位置</span>
        <select
          value={startPoint}
          onChange={(event) => setStartPoint(event.target.value)}
        >
          <option value="song-start">曲頭</option>
          {sections.map((section) => (
            <option value={section.id} key={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </label>
      <button className="button primary" onClick={play}>
        {playing ? "再生し直す" : "再生"}
      </button>
      <button className="button" onClick={stop}>
        停止
      </button>
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
});

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9v6h4l5 4V5L9 9H5Z" />
      {muted ? (
        <path d="m17 9 4 6m0-6-4 6" />
      ) : (
        <path d="M17 9.5a4 4 0 0 1 0 5M19 7a7 7 0 0 1 0 10" />
      )}
    </svg>
  );
}
