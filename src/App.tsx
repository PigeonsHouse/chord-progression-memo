import { useEffect, useState } from "react";
import type { SessionUser } from "../shared/types";
import { api } from "./api";
import { HomePage } from "./pages/HomePage";
import { SongPage } from "./pages/SongPage";

export function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const songMatch = window.location.pathname.match(/^\/songs\/([^/]+)(\/edit)?$/);

  useEffect(() => {
    api<{ user: SessionUser | null }>("/api/session").then((data) => setUser(data.user)).catch(() => setUser(null));
  }, []);

  async function createSong() {
    const { slug } = await api<{ slug: string }>("/api/songs", { method: "POST" });
    window.location.assign(`/songs/${slug}/edit`);
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    window.location.assign("/");
  }

  return (
    <>
      <header className="site-header">
        <a href="/" className="brand">Chord Memo</a>
        <nav>
          {user?.allowed && <button className="button primary compact" onClick={createSong}>新しいメモ</button>}
          {user?.allowed && <a href="/?mine=1">自分のメモ</a>}
          {user ? (
            <>
              <span className="user-name">{user.displayName}</span>
              <button className="text-button" onClick={logout}>ログアウト</button>
            </>
          ) : user === null ? (
            <a href="/auth/google">Googleでログイン</a>
          ) : null}
        </nav>
      </header>
      {user && !user.allowed && (
        <div className="permission-notice">このアカウントには編集権限がありません。公開メモは閲覧できます。</div>
      )}
      <main>
        {songMatch
          ? <SongPage slug={decodeURIComponent(songMatch[1])} edit={Boolean(songMatch[2])} />
          : <HomePage user={user ?? null} />}
      </main>
    </>
  );
}
