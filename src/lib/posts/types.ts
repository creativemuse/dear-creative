export type PostMeta = {
  slug: string;
  title: string;
  publishedAt: string;
  excerpt?: string;
  coverImage?: string;
};

export type RecentPost = PostMeta & {
  canonicalUrl: string;
  x402Url: string;
};
