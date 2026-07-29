import { useEffect, useRef, useState } from "react";
import type { BeatValue } from "../lib/music";
import type { ChordQuality, Song } from "../../shared/types";
import { api } from "../api";
import {
  addMeasure,
  applyAt,
  chordLabel,
  degreeLabel,
  keyAtBeat,
  KEY_NAMES,
  insertMeasures,
  positionAfterMeasureInsertion,
  positionAfterMeasureRemoval,
  removeMeasure,
  reflowTimeSignature,
} from "../lib/music";
import { PlayerControls } from "./PlayerControls";
import { Timeline } from "./Timeline";

const PALETTES: { name: string; chords: BeatValue[] }[] = [
  {
    name: "ダイアトニック",
    chords: [
      chord(0, "major"),
      chord(2, "minor"),
      chord(4, "minor"),
      chord(5, "major"),
      chord(7, "major"),
      chord(9, "minor"),
      chord(11, "diminished"),
    ],
  },
  {
    name: "同主短調借用",
    chords: [
      chord(0, "minor"),
      chord(3, "major"),
      chord(5, "minor"),
      chord(7, "minor"),
      chord(8, "major"),
      chord(10, "major"),
    ],
  },
  {
    name: "ドミナントセブンス",
    chords: [0, 2, 4, 5, 7, 9, 11].map((degree) => chord(degree, "dominant7")),
  },
];

const QUALITIES: { value: ChordQuality; label: string }[] = [
  { value: "major", label: "メジャー" },
  { value: "minor", label: "マイナー" },
  { value: "dominant7", label: "7" },
  { value: "diminished", label: "dim" },
  { value: "augmented", label: "aug" },
  { value: "half_diminished7", label: "ø7" },
];

export function SongEditor({
  initialSong,
  onDeleted,
}: {
  initialSong: Song;
  onDeleted: () => void;
}) {
  const [song, setSong] = useState(initialSong);
  const songRef = useRef(song);
  const versionRef = useRef(song.version);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<
    "saved" | "waiting" | "saving" | "error"
  >("saved");
  const [saveError, setSaveError] = useState("");
  const [width, setWidth] = useState(4);
  const [pickerChord, setPickerChord] = useState<BeatValue>(chord(0, "major"));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<
    "chord" | "key" | "progression" | "section" | "measure"
  >("chord");
  const [pickerKey, setPickerKey] = useState(song.initialKey);
  const [selectedBeat, setSelectedBeat] = useState(0);
  const [activeBeat, setActiveBeat] = useState<number | null>(null);
  const [tagText, setTagText] = useState(song.tags.join(", "));
  const [rangeName, setRangeName] = useState("");
  const [rangeBeats, setRangeBeats] = useState(4);
  const [editingProgressionId, setEditingProgressionId] = useState<string | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [measureInsertCount, setMeasureInsertCount] = useState(1);
  const [suggestions, setSuggestions] = useState<{
    tags: string[];
    progressions: string[];
  }>({ tags: [], progressions: [] });

  songRef.current = song;
  const beatsPerMeasure = song.timeSignatureNumerator;

  useEffect(() => {
    api<{ tags: string[]; progressions: string[] }>("/api/suggestions")
      .then(setSuggestions)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (revision === 0) return;
    setSaveState("waiting");
    const timer = window.setTimeout(() => void performSave(), 800);
    return () => window.clearTimeout(timer);
  }, [revision]);

  function update(mutator: (current: Song) => Song) {
    setSong((current) => {
      const next = mutator(current);
      songRef.current = next;
      return next;
    });
    revisionRef.current += 1;
    setRevision(revisionRef.current);
  }

  async function performSave() {
    if (savingRef.current) return;
    savingRef.current = true;
    const savingRevision = revisionRef.current;
    setSaveState("saving");
    setSaveError("");
    try {
      const snapshot = { ...songRef.current, version: versionRef.current };
      const result = await api<{ version: number; publishedAt: string | null }>(
        `/api/songs/${snapshot.id}`,
        {
          method: "PUT",
          body: JSON.stringify(snapshot),
        },
      );
      versionRef.current = result.version;
      setSong((current) => ({
        ...current,
        version: result.version,
        publishedAt: result.publishedAt,
      }));
      setSaveState(
        savingRevision === revisionRef.current ? "saved" : "waiting",
      );
    } catch (reason) {
      setSaveState("error");
      setSaveError(
        reason instanceof Error ? reason.message : "保存できませんでした",
      );
    } finally {
      savingRef.current = false;
      if (savingRevision !== revisionRef.current)
        window.setTimeout(() => void performSave(), 100);
    }
  }

  function openPicker(beat: number) {
    setSelectedBeat(beat);
    setPickerKey(keyAtBeat(song.initialKey, song.keyChanges, beat));
    setSectionName(
      song.sections.find((section) => section.startBeat === beat)?.name ?? "",
    );
    setEditingProgressionId(null);
    setRangeName("");
    setPickerTab("chord");
    setPickerOpen(true);
  }

  function applyChoice(choice: BeatValue) {
    update((current) => ({
      ...current,
      blocks: applyAt(
        current.blocks,
        selectedBeat,
        width,
        choice,
        current.timeSignatureNumerator,
      ),
    }));
    setPickerChord(choice.degree === null ? chord(0, "major") : choice);
    setPickerOpen(false);
  }

  function deleteMeasure(measureIndex: number) {
    const measureCount = Math.ceil(
      Math.max(
        ...song.blocks.map((block) => block.startBeat + block.duration),
        beatsPerMeasure,
      ) / beatsPerMeasure,
    );
    if (measureCount <= 1) {
      update((current) => ({
        ...current,
        blocks: removeMeasure(
          current.blocks,
          measureIndex,
          current.timeSignatureNumerator,
        ),
      }));
      return;
    }
    if (
      !window.confirm(
        `${measureIndex + 1}小節目を削除します。後ろの小節は前へ詰まります。`,
      )
    )
      return;
    update((current) => {
      const keyChanges = current.keyChanges
        .filter(
          (change) =>
            Math.floor(change.startBeat / beatsPerMeasure) !== measureIndex,
        )
        .map((change) => ({
          ...change,
          startBeat: positionAfterMeasureRemoval(
            change.startBeat,
            measureIndex,
            beatsPerMeasure,
          ),
        }))
        .filter((change) => change.startBeat > 0);
      const progressions = current.progressions
        .map((range) => ({
          ...range,
          startBeat: positionAfterMeasureRemoval(
            range.startBeat,
            measureIndex,
            beatsPerMeasure,
          ),
          endBeat: positionAfterMeasureRemoval(
            range.endBeat,
            measureIndex,
            beatsPerMeasure,
          ),
        }))
        .filter((range) => range.endBeat > range.startBeat);
      const sections = current.sections
        .filter(
          (section) =>
            Math.floor(section.startBeat / beatsPerMeasure) !== measureIndex,
        )
        .map((section) => ({
          ...section,
          startBeat: positionAfterMeasureRemoval(
            section.startBeat,
            measureIndex,
            beatsPerMeasure,
          ),
        }));
      return {
        ...current,
        blocks: removeMeasure(current.blocks, measureIndex, beatsPerMeasure),
        keyChanges,
        progressions,
        sections,
      };
    });
    setSelectedBeat(
      Math.max(
        0,
        Math.min(selectedBeat, (measureCount - 1) * beatsPerMeasure - 1),
      ),
    );
  }

  function setMeta<K extends keyof Song>(key: K, value: Song[K]) {
    update((current) => ({ ...current, [key]: value }));
  }

  function commitTags(value = tagText) {
    const tags = [
      ...new Set(
        value
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ];
    setTagText(tags.join(", "));
    update((current) => ({ ...current, tags }));
  }

  function applyKeyChange() {
    if (selectedBeat === 0) {
      setMeta("initialKey", pickerKey);
    } else {
      update((current) => ({
        ...current,
        keyChanges: [
          ...current.keyChanges.filter(
            (item) => item.startBeat !== selectedBeat,
          ),
          {
            id: crypto.randomUUID(),
            startBeat: selectedBeat,
            keyPitchClass: pickerKey,
          },
        ].sort((a, b) => a.startBeat - b.startBeat),
      }));
    }
    setPickerOpen(false);
  }

  function addProgression() {
    const name = rangeName.trim();
    if (!name) return;
    const timelineEnd = Math.max(
      ...song.blocks.map((block) => block.startBeat + block.duration),
    );
    const editing = song.progressions.find((range) => range.id === editingProgressionId);
    const startBeat = editing?.startBeat ?? selectedBeat;
    const endBeat = Math.min(timelineEnd, startBeat + rangeBeats);
    if (endBeat <= startBeat) return;
    update((current) => ({
      ...current,
      progressions: editing
        ? current.progressions.map((range) =>
            range.id === editing.id ? { ...range, name, endBeat } : range
          )
        : [
            ...current.progressions,
            {
              id: crypto.randomUUID(),
              name,
              startBeat,
              endBeat,
            },
          ],
    }));
    setRangeName("");
    setEditingProgressionId(null);
    setPickerOpen(false);
  }

  function addSection() {
    const name = sectionName.trim();
    if (name.length < 1 || name.length > 50) return;
    update((current) => ({
      ...current,
      sections: [
        ...current.sections.filter(
          (section) => section.startBeat !== selectedBeat,
        ),
        { id: crypto.randomUUID(), name, startBeat: selectedBeat },
      ].sort((a, b) => a.startBeat - b.startBeat),
    }));
    setSectionName("");
    setPickerOpen(false);
  }

  function addMeasuresAtSelection(side: "before" | "after") {
    if (
      !Number.isFinite(measureInsertCount) ||
      measureInsertCount < 1 ||
      measureInsertCount > 64
    )
      return;
    const count = Math.min(64, Math.max(1, Math.floor(measureInsertCount)));
    const selectedMeasure = Math.floor(selectedBeat / beatsPerMeasure);
    const insertionMeasure = selectedMeasure + (side === "after" ? 1 : 0);
    const insertionBeat = insertionMeasure * beatsPerMeasure;
    const shift = (position: number) =>
      positionAfterMeasureInsertion(
        position,
        insertionMeasure,
        count,
        beatsPerMeasure,
      );
    update((current) => ({
      ...current,
      blocks: insertMeasures(
        current.blocks,
        insertionMeasure,
        count,
        beatsPerMeasure,
      ),
      keyChanges: current.keyChanges.map((change) => ({
        ...change,
        startBeat: shift(change.startBeat),
      })),
      sections: current.sections.map((section) => ({
        ...section,
        startBeat: shift(section.startBeat),
      })),
      progressions: current.progressions.map((range) => ({
        ...range,
        startBeat: shift(range.startBeat),
        endBeat:
          range.endBeat > insertionBeat
            ? range.endBeat + count * beatsPerMeasure
            : range.endBeat,
      })),
    }));
    setSelectedBeat(insertionBeat);
    setPickerOpen(false);
  }

  async function deleteSong() {
    if (!window.confirm("このコードメモを削除します。元に戻せません。")) return;
    await api(`/api/songs/${song.id}`, { method: "DELETE" });
    onDeleted();
  }

  const timelineEnd = Math.max(
    ...song.blocks.map((block) => block.startBeat + block.duration),
  );
  const editingProgression = song.progressions.find(
    (range) => range.id === editingProgressionId,
  );
  const progressionStart = editingProgression?.startBeat ?? selectedBeat;
  const remainingBeats = Math.max(1, timelineEnd - progressionStart);
  const coveredProgressions = song.progressions.filter(
    (range) => range.startBeat <= selectedBeat && range.endBeat > selectedBeat,
  );

  return (
    <article className="page editor-page">
      <div className="editor-topbar">
        <div className={`save-state ${saveState}`}>
          {saveState === "saved" && "保存済み"}
          {saveState === "waiting" && "変更あり"}
          {saveState === "saving" && "保存中…"}
          {saveState === "error" && `保存失敗：${saveError}`}
        </div>
        <div className="editor-topbar-actions">
          <button
            className="button compact"
            disabled={saveState !== "saved"}
            onClick={() =>
              window.open(
                `/songs/${song.slug}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            {saveState === "saved" ? "閲覧ページを確認" : "保存後に確認"}
          </button>
          <label className="publish-toggle">
            <input
              type="checkbox"
              checked={song.status === "published"}
              onChange={(event) =>
                setMeta("status", event.target.checked ? "published" : "draft")
              }
            />
            {song.status === "published" ? "公開中" : "下書き"}
          </label>
        </div>
      </div>

      <section className="metadata-grid panel">
        <label className="title-field">
          タイトル
          <input
            value={song.title}
            onChange={(event) => setMeta("title", event.target.value)}
          />
        </label>
        <label>
          BPM
          <input
            type="number"
            min="20"
            max="400"
            value={song.bpm}
            onChange={(event) => setMeta("bpm", Number(event.target.value))}
          />
        </label>
        <label>
          拍子
          <select
            value={`${song.timeSignatureNumerator}/${song.timeSignatureDenominator}`}
            onChange={(event) => {
              const [numerator, denominator] = event.target.value
                .split("/")
                .map(Number);
              update((current) => ({
                ...current,
                timeSignatureNumerator: numerator,
                timeSignatureDenominator: denominator,
                blocks: reflowTimeSignature(current.blocks, numerator),
              }));
            }}
          >
            <option value="3/4">3/4</option>
            <option value="4/4">4/4</option>
          </select>
        </label>
        <label>
          動画URL（任意）
          <input
            type="url"
            value={song.sourceUrl ?? ""}
            onChange={(event) => setMeta("sourceUrl", event.target.value)}
            placeholder="https://…"
          />
        </label>
        <label className="title-field">
          タグ（カンマ区切り）
          <input
            list="tag-suggestions"
            value={tagText}
            onChange={(event) => setTagText(event.target.value)}
            onBlur={(event) => commitTags(event.target.value)}
          />
          <datalist id="tag-suggestions">
            {suggestions.tags.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </datalist>
        </label>
      </section>

      <section className="duration-toolbar panel">
        <div className="width-picker">
          <span>適用幅</span>
          {[1, 2, 3, 4].map((value) => (
            <button
              className={width === value ? "selected" : ""}
              onClick={() => setWidth(value)}
              key={value}
            >
              {value}拍
            </button>
          ))}
        </div>
      </section>

      <div className="timeline-actions">
        <p>入力を開始する拍を選ぶとコードパレットが開きます。</p>
        <button
          onClick={() =>
            update((current) => ({
              ...current,
              blocks: addMeasure(
                current.blocks,
                current.timeSignatureNumerator,
              ),
            }))
          }
        >
          小節を追加
        </button>
      </div>
      <Timeline
        blocks={song.blocks}
        progressions={song.progressions}
        sections={song.sections}
        initialKey={song.initialKey}
        keyChanges={song.keyChanges}
        beatsPerMeasure={beatsPerMeasure}
        activeBeat={activeBeat ?? (pickerOpen ? selectedBeat : null)}
        editable
        onBeat={openPicker}
        onDeleteMeasure={deleteMeasure}
      />

      {pickerOpen && (
        <div
          className="picker-backdrop"
          role="presentation"
          onMouseDown={() => setPickerOpen(false)}
        >
          <section
            className="chord-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chord-picker-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="chord-picker-header">
              <div>
                <p className="eyebrow">
                  {Math.floor(selectedBeat / beatsPerMeasure) + 1}小節目・
                  {(selectedBeat % beatsPerMeasure) + 1}拍目から{width}拍
                </p>
                <h2 id="chord-picker-title">選択位置を編集</h2>
              </div>
              <button
                className="picker-close"
                onClick={() => setPickerOpen(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </header>
            <div className="picker-tabs" role="tablist" aria-label="入力内容">
              <button
                className={pickerTab === "chord" ? "active" : ""}
                onClick={() => setPickerTab("chord")}
              >
                コード
              </button>
              <button
                className={pickerTab === "key" ? "active" : ""}
                onClick={() => setPickerTab("key")}
              >
                調の指定
              </button>
              <button
                className={pickerTab === "progression" ? "active" : ""}
                onClick={() => setPickerTab("progression")}
              >
                進行メモ
              </button>
              <button
                className={pickerTab === "section" ? "active" : ""}
                onClick={() => setPickerTab("section")}
              >
                セクション
              </button>
              <button
                className={pickerTab === "measure" ? "active" : ""}
                onClick={() => setPickerTab("measure")}
              >
                小節
              </button>
            </div>

            {pickerTab === "chord" && (
              <div className="picker-tab-panel">
                <button
                  type="button"
                  className="eraser-tool"
                  onClick={() =>
                    applyChoice({
                      degree: null,
                      quality: null,
                      bassDegree: null,
                    })
                  }
                >
                  <EraserIcon />
                  <span>消しゴム</span>
                </button>
                {PALETTES.map((palette) => (
                  <div className="palette-row" key={palette.name}>
                    <h3>{palette.name}</h3>
                    <div>
                      {palette.chords.map((item) => (
                        <button
                          key={`${item.degree}-${item.quality}`}
                          onClick={() => applyChoice(item)}
                        >
                          {chordLabel(item)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <details className="free-picker">
                  <summary>自由選択</summary>
                  <div className="free-picker-grid">
                    <label>
                      ディグリー
                      <select
                        value={pickerChord.degree ?? 0}
                        onChange={(event) =>
                          setPickerChord(
                            chord(
                              Number(event.target.value),
                              pickerChord.quality ?? "major",
                              pickerChord.bassDegree,
                            ),
                          )
                        }
                      >
                        {Array.from({ length: 12 }, (_, degree) => (
                          <option value={degree} key={degree}>
                            {degreeLabel(
                              degree,
                              pickerChord.quality ?? "major",
                            )}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      コード種別
                      <select
                        value={pickerChord.quality ?? "major"}
                        onChange={(event) =>
                          setPickerChord(
                            chord(
                              pickerChord.degree ?? 0,
                              event.target.value as ChordQuality,
                              pickerChord.bassDegree,
                            ),
                          )
                        }
                      >
                        {QUALITIES.map((quality) => (
                          <option value={quality.value} key={quality.value}>
                            {quality.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      ベース音
                      <select
                        value={pickerChord.bassDegree ?? ""}
                        onChange={(event) =>
                          setPickerChord({
                            ...pickerChord,
                            bassDegree:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          })
                        }
                      >
                        <option value="">指定なし</option>
                        {Array.from({ length: 12 }, (_, degree) => (
                          <option value={degree} key={degree}>
                            {degreeLabel(degree, "major", true)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="button primary"
                      onClick={() => applyChoice(pickerChord)}
                    >
                      {chordLabel(pickerChord)}を適用
                    </button>
                  </div>
                </details>
              </div>
            )}

            {pickerTab === "key" && (
              <div className="picker-tab-panel focused-action">
                <div>
                  <h3>
                    {selectedBeat === 0 ? "曲の最初の調" : "ここから調を変更"}
                  </h3>
                  <p className="muted">
                    {Math.floor(selectedBeat / beatsPerMeasure) + 1}小節目・
                    {(selectedBeat % beatsPerMeasure) + 1}
                    拍目から、次の転調位置まで適用されます。
                  </p>
                </div>
                <label>
                  調
                  <select
                    value={pickerKey}
                    onChange={(event) =>
                      setPickerKey(Number(event.target.value))
                    }
                  >
                    {KEY_NAMES.map((name, index) => (
                      <option value={index} key={name}>
                        {name} major
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button primary" onClick={applyKeyChange}>
                  {selectedBeat === 0 ? "最初の調を変更" : "ここから調を変更"}
                </button>
              </div>
            )}

            {pickerTab === "progression" && (
              <div className="picker-tab-panel focused-action">
                {coveredProgressions.length > 0 && (
                  <div className="covered-progressions">
                    <h3>この拍にかかっている進行メモ</h3>
                    <ul>
                      {coveredProgressions.map((range) => (
                        <li key={range.id}>
                          <span>
                            <strong>{range.name}</strong>
                            {range.endBeat - range.startBeat}拍
                          </span>
                          <span className="covered-progression-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProgressionId(range.id);
                                setRangeName(range.name);
                                setRangeBeats(range.endBeat - range.startBeat);
                              }}
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              className="danger-text"
                              onClick={() => {
                                update((current) => ({
                                  ...current,
                                  progressions: current.progressions.filter(
                                    (item) => item.id !== range.id,
                                  ),
                                }));
                                if (editingProgressionId === range.id) {
                                  setEditingProgressionId(null);
                                  setRangeName("");
                                }
                              }}
                            >
                              削除
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <h3>
                    {editingProgression
                      ? "進行メモを編集"
                      : "ここから進行メモを追加"}
                  </h3>
                  <p className="muted">
                    {Math.floor(progressionStart / beatsPerMeasure) + 1}
                    小節目・{(progressionStart % beatsPerMeasure) + 1}
                    拍目を開始位置にします。
                  </p>
                  {editingProgression && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setEditingProgressionId(null);
                        setRangeName("");
                      }}
                    >
                      新規追加に戻る
                    </button>
                  )}
                </div>
                <label>
                  進行名
                  <input
                    list="progression-suggestions"
                    value={rangeName}
                    onChange={(event) => setRangeName(event.target.value)}
                    placeholder="例：王道進行"
                  />
                </label>
                <datalist id="progression-suggestions">
                  {suggestions.progressions.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </datalist>
                <div className="beat-presets" aria-label="長さのプリセット">
                  {[2, 4, 8, 16, 32].map((beats) => (
                    <button
                      type="button"
                      key={beats}
                      className={rangeBeats === beats ? "selected" : ""}
                      disabled={beats > remainingBeats}
                      onClick={() => setRangeBeats(beats)}
                    >
                      <strong>{beats}拍</strong>
                      {beats >= beatsPerMeasure &&
                        beats % beatsPerMeasure === 0 && (
                          <span>（{beats / beatsPerMeasure}小節）</span>
                        )}
                    </button>
                  ))}
                </div>
                <label>
                  長さ
                  <span className="beat-count-input">
                    <input
                      type="number"
                      min="1"
                      max={remainingBeats}
                      value={rangeBeats}
                      onChange={(event) =>
                        setRangeBeats(Math.max(1, Number(event.target.value)))
                      }
                    />
                    <span>拍</span>
                  </span>
                </label>
                <button
                  className="button primary"
                  disabled={!rangeName.trim()}
                  onClick={addProgression}
                >
                  {editingProgression ? "変更を保存" : "進行メモを追加"}
                </button>
              </div>
            )}

            {pickerTab === "section" && (
              <div className="picker-tab-panel focused-action">
                <div>
                  <h3>ここをセクションの頭にする</h3>
                  <p className="muted">
                    {Math.floor(selectedBeat / beatsPerMeasure) + 1}小節目・
                    {(selectedBeat % beatsPerMeasure) + 1}
                    拍目から再生できるようになります。
                  </p>
                </div>
                <label>
                  セクション名
                  <input
                    value={sectionName}
                    maxLength={50}
                    onChange={(event) => setSectionName(event.target.value)}
                    placeholder="例：Aメロ、サビ"
                  />
                  <span className="field-counter">
                    {sectionName.length}/50文字
                  </span>
                </label>
                <button
                  className="button primary"
                  disabled={
                    sectionName.trim().length < 1 ||
                    sectionName.trim().length > 50
                  }
                  onClick={addSection}
                >
                  セクションを追加
                </button>
              </div>
            )}

            {pickerTab === "measure" && (
              <div className="picker-tab-panel focused-action measure-insert-panel">
                <div>
                  <h3>
                    {Math.floor(selectedBeat / beatsPerMeasure) + 1}
                    小節目を基準に追加
                  </h3>
                  <p className="muted">
                    追加した小節はN.C.になります。後ろの内容と各メモの位置は自動で移動します。
                  </p>
                </div>
                <label>
                  追加する小節数
                  <div className="measure-count-presets">
                    {[1, 2, 4, 8].map((count) => (
                      <button
                        type="button"
                        className={
                          measureInsertCount === count ? "selected" : ""
                        }
                        onClick={() => setMeasureInsertCount(count)}
                        key={count}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="64"
                    value={measureInsertCount}
                    onChange={(event) =>
                      setMeasureInsertCount(Number(event.target.value))
                    }
                  />
                </label>
                <div className="measure-insert-actions">
                  <button
                    className="button"
                    disabled={
                      !Number.isFinite(measureInsertCount) ||
                      measureInsertCount < 1 ||
                      measureInsertCount > 64
                    }
                    onClick={() => addMeasuresAtSelection("before")}
                  >
                    手前に追加
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      !Number.isFinite(measureInsertCount) ||
                      measureInsertCount < 1 ||
                      measureInsertCount > 64
                    }
                    onClick={() => addMeasuresAtSelection("after")}
                  >
                    直後に追加
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <section className="editor-footer">
        <PlayerControls song={song} onBeat={setActiveBeat} />
        <button className="button danger" onClick={deleteSong}>
          このメモを削除
        </button>
      </section>
    </article>
  );
}

function chord(
  degree: number,
  quality: ChordQuality,
  bassDegree: number | null = null,
): BeatValue {
  return {
    degree,
    quality,
    bassDegree: bassDegree === degree ? null : bassDegree,
  };
}

function EraserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 15 8.5-8.5a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3L10 19H6l-2-2a1.4 1.4 0 0 1 0-2Z" />
      <path d="m9 10 6 6M10 19h10" />
    </svg>
  );
}
