import { useEffect, useRef, useState } from "react";
import type { Song } from "../../shared/types";
import { api } from "../api";
import { SongEditor } from "../components/SongEditor";
import { SongView } from "../components/SongView";

export function SongPage({ slug }: { slug: string }) {
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState("");
  const loadedSlug = useRef("");

  useEffect(() => {
    if (!slug || loadedSlug.current === slug) return;
    loadedSlug.current = slug;
    api<Song>(`/api/songs/${slug}`).then(setSong).catch((reason: Error) => setError(reason.message));
  }, [slug]);

  if (error) return <section className="page"><p className="error">{error}</p></section>;
  if (!song) return <section className="page"><p className="muted">読み込み中…</p></section>;
  return song.canEdit
    ? <SongEditor initialSong={song} onDeleted={() => window.location.assign("/?mine=1")} />
    : <SongView song={song} />;
}
