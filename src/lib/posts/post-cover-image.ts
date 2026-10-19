/**
 * Post cover image & banner resolver.
 * Handles explicit cover images, images embedded in bodyHtml/Markdown,
 * and generates deterministic artistic SVG banners for any post.
 */

export function extractFirstImageFromHtml(
  html: string | null | undefined,
): string | null {
  if (!html) return null;

  // HTML <img ... src="..." ...>
  const imgMatch = /<img\s+[^>]*src=["']([^"']+)["']/i.exec(html);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }

  // Markdown ![alt](url)
  const mdMatch = /!\[.*?\]\(((?:https?:\/\/|\/)[^\s)]+)\)/i.exec(html);
  if (mdMatch && mdMatch[1]) {
    return mdMatch[1];
  }

  return null;
}

const PALETTES = [
  {
    bg1: "#09090b",
    bg2: "#18181b",
    accent1: "#8b5cf6",
    accent2: "#3b82f6",
    glow: "#a855f7",
    label: "violet",
  },
  {
    bg1: "#022c22",
    bg2: "#064e3b",
    accent1: "#10b981",
    accent2: "#06b6d4",
    glow: "#34d399",
    label: "emerald",
  },
  {
    bg1: "#1e1b4b",
    bg2: "#312e81",
    accent1: "#6366f1",
    accent2: "#ec4899",
    glow: "#818cf8",
    label: "indigo",
  },
  {
    bg1: "#1c1917",
    bg2: "#292524",
    accent1: "#f59e0b",
    accent2: "#ef4444",
    glow: "#fbbf24",
    label: "amber",
  },
  {
    bg1: "#0f172a",
    bg2: "#1e293b",
    accent1: "#38bdf8",
    accent2: "#818cf8",
    glow: "#67e8f9",
    label: "cyan",
  },
];

export const PAST_ISSUE_BANNERS = [
  {
    slug: "anime-beanie",
    src: "/images/banners/banner-anime-beanie.png",
    alt: "Dear Creative Issue — Anime Beanie Edition",
    title: "A monthly publication",
  },
  {
    slug: "together-we-rise",
    src: "/images/banners/banner-together-we-rise.png",
    alt: "Dear Creative Issue — Together We Rise",
    title: "Use Your Voice • Together We Rise",
  },
  {
    slug: "neon-portraits",
    src: "/images/banners/banner-neon-portraits.jpg",
    alt: "Dear Creative Issue — Neon Dual Portraits",
    title: "Official Partner Edition",
  },
  {
    slug: "goldie-scary-garys",
    src: "/images/banners/banner-goldie-scary-garys.png",
    alt: "Dear Creative Issue — Goldie Scary Garys Feature",
    title: "Artist Spotlight: Goldie (@goldiesnftart)",
  },
  {
    slug: "magenta-pop-art",
    src: "/images/banners/banner-magenta-pop-art.png",
    alt: "Dear Creative Issue — Magenta Pop Art Edition",
    title: "Sound & Creative Motion",
  },
] as const;

function escapeSvg(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates an ultra-crisp, deterministic SVG banner for a post
 * reflecting the signature puffy DEAR, Creative typography and circuit lockup.
 */
export function generateDeterministicBannerSvg(options: {
  title?: string;
  slug?: string;
}): string {
  const title = (options.title || "Dear Creative").trim();
  const slug = (options.slug || "post").trim();

  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash << 5) - hash + slug.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);
  const palette = PALETTES[absHash % PALETTES.length]!;

  const safeTitle = escapeSvg(title);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.bg1}" />
      <stop offset="100%" stop-color="${palette.bg2}" />
    </linearGradient>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.accent1}" stop-opacity="0.85" />
      <stop offset="100%" stop-color="${palette.accent2}" stop-opacity="0.65" />
    </linearGradient>
    <linearGradient id="iconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="30%" r="60%">
      <stop offset="0%" stop-color="${palette.glow}" stop-opacity="0.35" />
      <stop offset="100%" stop-color="${palette.bg1}" stop-opacity="0" />
    </radialGradient>
    <filter id="puffyShadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="8" stdDeviation="0" flood-color="#f59e0b" flood-opacity="0.85" />
    </filter>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="1200" height="630" fill="url(#grid)" />
  <rect width="1200" height="630" fill="url(#glow)" />

  <!-- Abstract geometric shapes -->
  <g transform="translate(680, 50)" opacity="0.8">
    <circle cx="250" cy="220" r="180" fill="none" stroke="url(#grad1)" stroke-width="2" opacity="0.6" />
    <circle cx="280" cy="200" r="120" fill="none" stroke="${palette.accent1}" stroke-width="1.5" stroke-dasharray="6,6" opacity="0.5" />
    <path d="M 80 320 Q 240 100 440 280 T 520 180" fill="none" stroke="url(#grad1)" stroke-width="4" opacity="0.75" />
    <polygon points="260,80 360,260 160,260" fill="none" stroke="url(#grad1)" stroke-width="2" opacity="0.4" />
  </g>

  <!-- Official Partner badge (matching past issues) -->
  <g transform="translate(80, 530)">
    <rect width="140" height="42" rx="8" fill="#ffffff" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.2))" />
    <rect x="12" y="11" width="20" height="20" rx="4" fill="url(#iconGrad)" />
    <text x="40" y="22" fill="#71717a" font-family="-apple-system, sans-serif" font-size="10" font-weight="600">Official</text>
    <text x="40" y="34" fill="#18181b" font-family="-apple-system, sans-serif" font-size="11" font-weight="700">Partner</text>
  </g>

  <!-- Signature DEAR, Creative Lockup -->
  <g transform="translate(80, 90)">
    <!-- Brand Pill -->
    <rect width="176" height="34" rx="17" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" stroke-width="1" />
    <circle cx="22" cy="17" r="4.5" fill="${palette.glow}" />
    <text x="36" y="22" fill="#f4f4f5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" letter-spacing="1.5">DEAR CREATIVE</text>

    <!-- Puffy DEAR, with 3D drop shadow -->
    <text x="0" y="140" fill="#ffffff" filter="url(#puffyShadow)" font-family="Arial Rounded MT Bold, 'Comic Sans MS', -apple-system, sans-serif" font-size="96" font-weight="900" letter-spacing="-0.03em">DEAR,</text>

    <!-- Circuit triangle logo icon -->
    <g transform="translate(290, 155)">
      <polygon points="0,30 36,10 36,50" fill="url(#iconGrad)" />
      <circle cx="4" cy="30" r="3" fill="#ffffff" />
      <circle cx="36" cy="10" r="3" fill="#ffffff" />
      <circle cx="36" cy="50" r="3" fill="#ffffff" />
    </g>

    <!-- Flowing Cursive Creative -->
    <text x="0" y="235" fill="#fef08a" font-family="'Brush Script MT', 'Snell Roundhand', 'Dancing Script', 'Caveat', cursive" font-size="82" font-weight="600" font-style="italic">Creative</text>

    <!-- Tagline -->
    <text x="4" y="275" fill="#d4d4d8" font-family="'Georgia', serif" font-size="22" font-style="italic" letter-spacing="0.5">A monthly publication</text>

    <!-- Specific Dispatch Title -->
    <text x="4" y="360" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="38" font-weight="700" letter-spacing="-0.02em">
      ${safeTitle.length > 42 ? safeTitle.slice(0, 40) + "…" : safeTitle}
    </text>
  </g>

  <!-- Bottom Accent Line -->
  <rect x="0" y="624" width="1200" height="6" fill="url(#grad1)" />
</svg>`.trim();
}

/**
 * Returns data:image/svg+xml;utf8,... URL for direct use in <img src="..." />.
 */
export function generateDeterministicBannerDataUrl(options: {
  title?: string;
  slug?: string;
}): string {
  const svg = generateDeterministicBannerSvg(options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Resolves the primary banner / thumbnail image URL for any post.
 */
export function resolvePostCoverImage(post: {
  coverImage?: string | null;
  bodyHtml?: string | null;
  slug?: string;
  title?: string;
}): string {
  // 1. Explicit cover image
  if (post.coverImage && post.coverImage.trim()) {
    return post.coverImage.trim();
  }

  // 2. Sample post special asset
  if (post.slug === "hello-dear-creative") {
    return "/images/hello-dear-creative-banner.jpg";
  }

  // 3. Image extracted from post body
  const bodyImage = extractFirstImageFromHtml(post.bodyHtml);
  if (bodyImage) {
    return bodyImage;
  }

  // 4. Deterministic vector banner
  return generateDeterministicBannerDataUrl({
    title: post.title,
    slug: post.slug,
  });
}
