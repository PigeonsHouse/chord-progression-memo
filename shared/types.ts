export type ChordQuality =
  | "major"
  | "minor"
  | "dominant7"
  | "diminished"
  | "augmented"
  | "half_diminished7";

export interface ChordBlock {
  id: string;
  startBeat: number;
  duration: number;
  degree: number | null;
  quality: ChordQuality | null;
  bassDegree: number | null;
}

export interface KeyChange {
  id: string;
  startBeat: number;
  keyPitchClass: number;
}

export interface ProgressionRange {
  id: string;
  name: string;
  startBeat: number;
  endBeat: number;
}

export interface Song {
  id: string;
  slug: string;
  title: string;
  bpm: number;
  initialKey: number;
  sourceUrl: string | null;
  status: "draft" | "published";
  createdByUserId: string;
  creatorName: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  blocks: ChordBlock[];
  keyChanges: KeyChange[];
  tags: string[];
  progressions: ProgressionRange[];
  canEdit: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  allowed: boolean;
}

export interface SongSummary {
  id: string;
  slug: string;
  title: string;
  bpm: number;
  initialKey: number;
  tags: string[];
  creatorName: string;
  publishedAt: string | null;
  status: "draft" | "published";
}
