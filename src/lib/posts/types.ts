export type PostMeta = {
  slug: string;
  title: string;
  publishedAt: string;
  excerpt?: string;
  coverImage?: string;
  readMinutes?: number;
  listenMinutes?: number;
  readingTimeLabel?: string;
  topic?: "ai-ownership" | "creator-economics" | "onchain-culture";
};

export type RecentPost = PostMeta & {
  canonicalUrl: string;
  x402Url: string;
};

