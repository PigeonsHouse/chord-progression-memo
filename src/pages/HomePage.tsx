import { useEffect, useState } from "react";
import type { SessionUser, SongSummary } from "../../shared/types";
import { api } from "../api";
import { KEY_NAMES } from "../lib/music";

export function HomePage({ user }: { user: SessionUser | null }) {
  const params = new URLSearchParams(window.location.search);
  const mine = params.get("mine") === "1" && Boolean(user?.allowed);
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const [data, setData] = useState<{ items: SongSummary[]; totalPages: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    api<{ items: SongSummary[]; totalPages: number }>(`/api/songs?page=${page}${mine ? "&mine=1" : ""}`)
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, [mine, page]);

  return (
    <section className="page home">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{mine ? "PRIVATE LIBRARY" : "PUBLIC LIBRARY"}</p>
          <h1>{mine ? "自分のコードメモ" : "最近公開されたメモ"}</h1>
        </div>
        {user?.allowed && (
          <button className="segmented" onClick={() => window.location.assign(mine ? "/" : "/?mine=1")}>
            {mine ? "公開一覧へ" : "下書きを含めて表示"}
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {!data ? <p className="muted">読み込み中…</p> : data.items.length === 0 ? (
        <div className="empty-state">まだメモがありません。</div>
      ) : (
        <div className="song-list">
          {data.items.map((song) => (
            <a href={`/songs/${song.slug}`} className="song-card" key={song.id}>
              <div className="song-card-top">
                <h2>{song.title}</h2>
                {song.status === "draft" && <span className="status draft">下書き</span>}
              </div>
              <p>{KEY_NAMES[song.initialKey]} major · {song.bpm} BPM · {song.creatorName}</p>
              <div className="tags">{song.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
              {song.publishedAt && <time>{new Date(song.publishedAt).toLocaleDateString("ja-JP")}</time>}
            </a>
          ))}
        </div>
      )}
      {data && data.totalPages > 1 && (
        <nav className="pagination">
          <button disabled={page <= 1} onClick={() => goToPage(page - 1, mine)}>前へ</button>
          <span>{page} / {data.totalPages}</span>
          <button disabled={page >= data.totalPages} onClick={() => goToPage(page + 1, mine)}>次へ</button>
        </nav>
      )}
    </section>
  );
}

function goToPage(page: number, mine: boolean) {
  const params = new URLSearchParams();
  if (mine) params.set("mine", "1");
  params.set("page", String(page));
  window.location.assign(`/?${params}`);
}
