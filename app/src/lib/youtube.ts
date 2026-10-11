const API = "https://www.googleapis.com/youtube/v3";

function key() {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY is not set in .env");
  return k;
}

async function yt<T>(path: string, params: Record<string, string>, revalidate = 900): Promise<T> {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key: key() })}`;
  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) {
    if (res.status === 403) throw new Error("YouTube daily quota reached or the API key is restricted. Try again later.");
    throw new Error(`YouTube API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------- Channels ----------

export type ChannelInfo = {
  ytId: string;
  title: string;
  thumbnail: string | null;
  uploadsId: string;
  description?: string;
  subscribers?: number | null;
  videoCount?: number;
  banner?: string | null;
};

type ChannelsResp = {
  items?: {
    id: string;
    snippet: { title: string; description?: string; thumbnails?: { default?: { url: string }; medium?: { url: string } } };
    contentDetails: { relatedPlaylists: { uploads: string } };
    statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
    brandingSettings?: { image?: { bannerExternalUrl?: string } };
    topicDetails?: { topicCategories?: string[] };
  }[];
};

function toChannel(c: NonNullable<ChannelsResp["items"]>[number]): ChannelInfo {
  return {
    ytId: c.id,
    title: c.snippet.title,
    thumbnail: c.snippet.thumbnails?.medium?.url ?? c.snippet.thumbnails?.default?.url ?? null,
    uploadsId: c.contentDetails.relatedPlaylists.uploads,
    description: c.snippet.description,
    subscribers: c.statistics?.hiddenSubscriberCount ? null : c.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null,
    videoCount: c.statistics?.videoCount ? Number(c.statistics.videoCount) : undefined,
    banner: c.brandingSettings?.image?.bannerExternalUrl ? `${c.brandingSettings.image.bannerExternalUrl}=w1280-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj` : null,
  };
}

const CH_PARTS = "snippet,contentDetails,statistics,brandingSettings";

export async function channelById(ytId: string): Promise<ChannelInfo | null> {
  const data = await yt<ChannelsResp>("channels", { part: CH_PARTS, id: ytId }, 3600);
  const c = data.items?.[0];
  return c ? toChannel(c) : null;
}

// ---------- Keeping the search bar to study/education channels ----------
// YouTube's search endpoint has no "education only" filter for channels, so results are over-fetched and then
// filtered here: by topic (Wikipedia categories YouTube itself assigns to the channel) first, and by keywords in
// the name/description as a fallback when a channel has no topic data. Unclear channels are left out rather than
// shown, since the student asked for study channels, not "everything that isn't obviously off-topic".
const EDU_TOPICS = [
  "education", "knowledge", "science", "technology", "mathematics", "physics", "chemistry", "biology",
  "engineering", "language", "literature", "philosophy", "humanities", "society", "university",
];
// Broad patterns (not an exhaustive list) so every video-game genre, not just a few named ones, counts as off-topic.
const OFFTOPIC_TOPIC_PATTERN = /game|music|entertainment|film|television|sport|fashion|lifestyle|physical_attractiveness|food|pet|humour|religion/;
const STUDY_WORDS =
  /\b(education|educational|learn(?:ing)?|study|studies|student|teach(?:er|ing)?|tutor(?:ial)?|lectures?|lessons?|courses?|academy|academics?|school|college|university|class(?:es)?\s*(?:\d|[xvi]+)|exam(?:s|ination)?|revision|syllabus|curriculum|homework|cbse|icse|ncert|jee|neet|gate\b|upsc|ssc\b|sat\b|gre\b|gmat\b|ielts|toefl|physics|chemistry|biology|mathematics|\bmaths?\b|algebra|calculus|geometry|trigonometry|science|engineering|programming|coding|computer science|history|geography|economics|accounting|grammar|vocabulary|essay|board exam|gk\b|general knowledge)\b/i;
const OFFTOPIC_WORDS =
  /\b(gameplay|gaming|let'?s play|walkthrough|speedrun|unboxing|prank(?:s)?|vlog(?:s|ging)?|official music video|lyrics?|full movie|movie trailer|highlights?|reaction(?:s)?|roast(?:s)?|stand[\s-]?up comedy|makeup tutorial|beauty hacks|fashion haul|dating advice|celebrity gossip|meme(?:s)?|funny moments|asmr|workout routine)\b/i;

function topicSlug(url: string) {
  return decodeURIComponent(url.split("/").pop() ?? "").toLowerCase();
}

function isStudyRelated(c: NonNullable<ChannelsResp["items"]>[number]): boolean {
  const topics = (c.topicDetails?.topicCategories ?? []).map(topicSlug);
  if (topics.some((t) => EDU_TOPICS.some((k) => t.includes(k)))) return true;
  const onlyOfftopic = topics.length > 0 && topics.every((t) => OFFTOPIC_TOPIC_PATTERN.test(t));
  if (onlyOfftopic) return false;

  const text = `${c.snippet.title} ${c.snippet.description ?? ""}`;
  if (OFFTOPIC_WORDS.test(text) && !STUDY_WORDS.test(text)) return false;
  return STUDY_WORDS.test(text);
}

/** Search all of YouTube for channels by name, kept to study/education channels (cached for an hour). */
export async function searchChannels(q: string, max = 10): Promise<ChannelInfo[]> {
  const query = q.trim();
  if (!query) return [];
  // Over-fetch: filtering removes some results, so ask YouTube for more than we plan to show.
  const found = await yt<{ items?: { id: { channelId: string } }[] }>(
    "search",
    { part: "snippet", type: "channel", maxResults: String(Math.min(50, max * 3)), q: query },
    3600,
  );
  const ids = (found.items ?? []).map((i) => i.id.channelId);
  if (ids.length === 0) return [];
  const data = await yt<ChannelsResp>("channels", { part: `${CH_PARTS},topicDetails`, id: ids.join(",") }, 3600);
  const byId = new Map((data.items ?? []).map((c) => [c.id, c]));
  return ids
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c && isStudyRelated(c))
    .slice(0, max)
    .map(toChannel);
}

/** Accepts a channel URL, @handle, UC... id, or a plain name (falls back to search). */
export async function resolveChannel(input: string): Promise<ChannelInfo | null> {
  const text = input.trim();
  if (!text) return null;
  const params: Record<string, string> = { part: CH_PARTS };
  const idMatch = text.match(/(UC[\w-]{22})/);
  const handleMatch = text.match(/@([\w.-]+)/);
  if (idMatch) params.id = idMatch[1];
  else if (handleMatch) params.forHandle = `@${handleMatch[1]}`;
  else if (/^[\w.-]+$/.test(text)) params.forHandle = `@${text}`;

  if (params.id || params.forHandle) {
    const data = await yt<ChannelsResp>("channels", params, 3600);
    if (data.items?.[0]) return toChannel(data.items[0]);
  }
  return (await searchChannels(text, 1))[0] ?? null;
}

// ---------- Videos ----------

export type Video = {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  duration?: string;
  views?: number;
};

type PlaylistResp = {
  nextPageToken?: string;
  items?: {
    snippet: {
      title: string;
      publishedAt: string;
      channelTitle: string;
      channelId: string;
      videoOwnerChannelTitle?: string;
      videoOwnerChannelId?: string;
      resourceId: { videoId: string };
      thumbnails?: { medium?: { url: string }; high?: { url: string } };
    };
  }[];
};

type VideoStatsResp = {
  items?: { id: string; contentDetails: { duration: string }; statistics?: { viewCount?: string } }[];
};

function fmtIso(d: string) {
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const [h, mi, s] = [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)];
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(mi).padStart(2, "0")}:${ss}` : `${mi}:${ss}`;
}

/** Adds duration and view count (one extra quota unit per call). */
async function enrich(videos: Video[]): Promise<Video[]> {
  if (videos.length === 0) return videos;
  try {
    const data = await yt<VideoStatsResp>("videos", { part: "contentDetails,statistics", id: videos.map((v) => v.id).join(",") });
    const map = new Map((data.items ?? []).map((i) => [i.id, i]));
    return videos.map((v) => {
      const i = map.get(v.id);
      return i ? { ...v, duration: fmtIso(i.contentDetails.duration), views: i.statistics?.viewCount ? Number(i.statistics.viewCount) : undefined } : v;
    });
  } catch {
    return videos;
  }
}

/** Works for the uploads playlist and for any other playlist. Max 50 per page. */
export async function uploadsPage(uploadsId: string, max = 12, pageToken?: string): Promise<{ videos: Video[]; next?: string }> {
  const params: Record<string, string> = { part: "snippet", playlistId: uploadsId, maxResults: String(max) };
  if (pageToken) params.pageToken = pageToken;
  const data = await yt<PlaylistResp>("playlistItems", params);
  const videos = (data.items ?? [])
    .filter((i) => i.snippet.title !== "Private video" && i.snippet.title !== "Deleted video")
    .map((i) => ({
      id: i.snippet.resourceId.videoId,
      title: i.snippet.title,
      thumbnail: i.snippet.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${i.snippet.resourceId.videoId}/mqdefault.jpg`,
      channelTitle: i.snippet.videoOwnerChannelTitle ?? i.snippet.channelTitle,
      channelId: i.snippet.videoOwnerChannelId ?? i.snippet.channelId,
      publishedAt: i.snippet.publishedAt,
    }));
  return { videos: await enrich(videos), next: data.nextPageToken };
}

export const latestVideos = async (uploadsId: string, max = 12) => (await uploadsPage(uploadsId, max)).videos;

type VideoDetailResp = {
  items?: {
    snippet: { title: string; description: string; channelId: string; channelTitle: string; publishedAt: string };
    statistics?: { viewCount?: string; likeCount?: string };
    contentDetails: { duration: string };
  }[];
};

export type VideoDetail = {
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  views?: number;
  likes?: number;
  duration?: string;
  thumbnail: string;
};

/** Also used to make sure a video belongs to an approved channel before it is embedded. */
export async function videoDetail(id: string): Promise<VideoDetail | null> {
  if (!/^[\w-]{11}$/.test(id)) return null;
  const data = await yt<VideoDetailResp>("videos", { part: "snippet,statistics,contentDetails", id });
  const v = data.items?.[0];
  if (!v) return null;
  return {
    title: v.snippet.title,
    description: v.snippet.description,
    channelId: v.snippet.channelId,
    channelTitle: v.snippet.channelTitle,
    publishedAt: v.snippet.publishedAt,
    views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : undefined,
    likes: v.statistics?.likeCount ? Number(v.statistics.likeCount) : undefined,
    duration: fmtIso(v.contentDetails.duration),
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  };
}

// ---------- Playlists ----------

export type Playlist = { id: string; title: string; thumbnail: string | null; itemCount: number; channelId: string; channelTitle: string };

type PlaylistsResp = {
  nextPageToken?: string;
  items?: {
    id: string;
    snippet: { title: string; channelId: string; channelTitle: string; thumbnails?: { medium?: { url: string } } };
    contentDetails?: { itemCount?: number };
  }[];
};

const toPlaylist = (i: NonNullable<PlaylistsResp["items"]>[number]): Playlist => ({
  id: i.id,
  title: i.snippet.title,
  thumbnail: i.snippet.thumbnails?.medium?.url ?? null,
  itemCount: i.contentDetails?.itemCount ?? 0,
  channelId: i.snippet.channelId,
  channelTitle: i.snippet.channelTitle,
});

export async function channelPlaylists(channelId: string, pageToken?: string): Promise<{ playlists: Playlist[]; next?: string }> {
  const params: Record<string, string> = { part: "snippet,contentDetails", channelId, maxResults: "48" };
  if (pageToken) params.pageToken = pageToken;
  const data = await yt<PlaylistsResp>("playlists", params, 1800);
  return { playlists: (data.items ?? []).map(toPlaylist), next: data.nextPageToken };
}

export async function playlistInfo(id: string): Promise<Playlist | null> {
  if (!/^[\w-]{10,50}$/.test(id)) return null;
  const data = await yt<PlaylistsResp>("playlists", { part: "snippet,contentDetails", id }, 1800);
  return data.items?.[0] ? toPlaylist(data.items[0]) : null;
}
