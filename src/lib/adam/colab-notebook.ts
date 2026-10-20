import { slugifyTitle } from "./gemini-studio";

export type ColabNotebookInput = {
  title?: string | null;
  slug?: string | null;
  teaserText?: string | null;
  markdown?: string | null;
  narrationText?: string | null;
  voiceName?: string | null;
  bannerPrompt?: string | null;
  videoPrompt?: string | null;
  apiBaseUrl?: string | null;
};

export type JupyterNotebookCell = {
  cell_type: "markdown" | "code";
  metadata: {
    id: string;
  };
  source: string[];
  execution_count?: number | null;
  outputs?: unknown[];
};

export type JupyterNotebookDocument = {
  nbformat: 4;
  nbformat_minor: 5;
  metadata: {
    colab: {
      name: string;
      provenance: unknown[];
    };
    kernelspec: {
      name: string;
      display_name: string;
    };
    language_info: {
      name: string;
    };
  };
  cells: JupyterNotebookCell[];
};

function toLines(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  return rawLines.map((line, idx) =>
    idx < rawLines.length - 1 ? `${line}\n` : line,
  );
}

/**
 * Builds a complete, ready-to-run Google Colab (.ipynb) notebook pre-populated
 * with the selected Dear Creative issue's content for generating:
 * 1. Hero Banners & Square Thumbnails (Gemini Image / Imagen 3)
 * 2. Pre-generated Static Audio Narration MP3/WAV (Gemini TTS < $0.01/article)
 * 3. AI Video Clips (Google Veo 2/3 Text-to-Video & Image-to-Video) + FFmpeg Audiogram MP4
 * 4. Verifiable Decentralized Uploads to Lens Grove (chain_id=232) + Dear Creative Sync
 */
export function buildDearCreativeAssetNotebook(
  input: ColabNotebookInput = {},
): JupyterNotebookDocument {
  const title = (input.title || "Creative Ownership & Autonomous Studios").trim();
  const slug = slugifyTitle(input.slug || title);
  const teaser = (
    input.teaserText ||
    "How independent creators combine AI studio tools with verifiable decentralized storage on Lens Grove."
  ).trim();
  const voiceName = (input.voiceName || "Puck").trim();
  const apiBaseUrl = (
    input.apiBaseUrl || "https://news.creativeplatform.xyz"
  ).trim();

  const rawBody = (
    input.markdown ||
    input.narrationText ||
    `Welcome back to Dear Creative. In this issue — ${title} — we explore how pre-generating static audio, custom banners, and video dispatches at publication time keeps margins healthy while anchoring every media asset on Lens Grove.`
  )
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);

  const narrationScript = `${title}. ${teaser}. ${rawBody}`.trim();

  const bannerPrompt = (
    input.bannerPrompt ||
    `Editorial widescreen cover illustration for Dear Creative issue "${title}". Bold geometric lighting, vibrant studio palette, tactile modern print-meets-digital aesthetic, high contrast, no watermark.`
  ).trim();

  const videoPrompt = (
    input.videoPrompt ||
    `Cinematic slow-motion editorial teaser loop for "${title}". Subtle camera push-in through a glowing creative studio workspace with warm amber and electric violet light rays, 16:9 widescreen.`
  ).trim();

  const cells: JupyterNotebookCell[] = [
    {
      cell_type: "markdown",
      metadata: { id: "intro-header" },
      source: toLines(
        [
          `# 🎨 Dear Creative — Studio Asset Generator Notebook`,
          ``,
          `**Issue:** ${title} (\`${slug}\`)`,
          ``,
          `This Google Colab notebook is pre-populated from **Dear Creative Studio** so you can generate and publish all rich media assets for your issue in one place:`,
          `1. **🖼️ AI Hero Banner & 1:1 Thumbnail** — via Google Gemini (\`gemini-2.5-flash-image\`) & Imagen 3 (\`imagen-3.0-generate-002\`).`,
          `2. **🎧 Static Audio Narration (MP3 / WAV)** — pre-generated once at publication time (\`< $0.01\` per article) using Gemini TTS (\`gemini-2.5-flash-preview-tts\`).`,
          `3. **🎬 AI Video & Dispatch Audiogram (MP4)** — cinematic video generation via **Google Veo** (\`veo-2.0-generate-001\`, supporting both text-to-video and image-to-video animation of your banner) plus an **FFmpeg Audiogram** combining your banner + narration audio.`,
          `4. **☁️ Lens Grove Decentralized Storage (\`chain_id=232\`)** — uploads your generated PNG, WAV/MP3, and MP4 directly to \`https://api.grove.storage?chain_id=232\` and outputs verifiable \`lens://\` URIs and Markdown snippets for Dear Creative.`,
          ``,
          `> **Setup:** Add \`GEMINI_API_KEY\` to **Colab Secrets** (🔑 icon on the left sidebar) or enter it when prompted in Cell 2.`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "code",
      metadata: { id: "install-deps" },
      execution_count: null,
      outputs: [],
      source: toLines(
        [
          `# 1. Install Google GenAI SDK and media utilities`,
          `!pip install -q -U google-genai pillow requests`,
          `print("✅ Dependencies ready.")`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "markdown",
      metadata: { id: "config-header" },
      source: toLines(
        [
          `## ⚙️ Issue Configuration & API Keys`,
          `Review or tweak the pre-filled issue metadata, prompts, and narration script below before running the generator cells.`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "code",
      metadata: { id: "issue-config" },
      execution_count: null,
      outputs: [],
      source: toLines(
        [
          `import os`,
          `import getpass`,
          `from google import genai`,
          `from google.genai import types`,
          ``,
          `# Load GEMINI_API_KEY from Colab Secrets or environment`,
          `GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")`,
          `if not GEMINI_API_KEY:`,
          `    try:`,
          `        from google.colab import userdata`,
          `        GEMINI_API_KEY = userdata.get("GEMINI_API_KEY") or ""`,
          `    except Exception:`,
          `        pass`,
          `if not GEMINI_API_KEY:`,
          `    GEMINI_API_KEY = getpass.getpass("Enter your GEMINI_API_KEY: ").strip()`,
          ``,
          `client = genai.Client(api_key=GEMINI_API_KEY)`,
          ``,
          `# Pre-populated Dear Creative Issue Context`,
          `ISSUE_TITLE = ${JSON.stringify(title)}`,
          `ISSUE_SLUG = ${JSON.stringify(slug)}`,
          `ISSUE_TEASER = ${JSON.stringify(teaser)}`,
          `VOICE_NAME = ${JSON.stringify(voiceName)}  # Options: "Puck" (Adam), "Aoede", "Charon", "Fenrir"`,
          `DEAR_CREATIVE_API_BASE = ${JSON.stringify(apiBaseUrl)}`,
          ``,
          `BANNER_PROMPT = ${JSON.stringify(bannerPrompt)}`,
          `VIDEO_PROMPT = ${JSON.stringify(videoPrompt)}`,
          `NARRATION_SCRIPT = ${JSON.stringify(narrationScript)}`,
          ``,
          `print(f"✅ Configured issue: {ISSUE_TITLE} ({ISSUE_SLUG})")`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "markdown",
      metadata: { id: "banner-section" },
      source: toLines(
        [
          `## 🖼️ Step 1: Generate Hero Banner & Thumbnail (Gemini / Imagen 3)`,
          `Generates a widescreen \`16:9\` hero banner (and optional \`1:1\` square thumbnail) and displays a live preview.`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "code",
      metadata: { id: "generate-banner" },
      execution_count: null,
      outputs: [],
      source: toLines(
        [
          `from io import BytesIO`,
          `from PIL import Image`,
          `from IPython.display import display`,
          ``,
          `BANNER_PATH = f"{ISSUE_SLUG}-banner.png"`,
          `banner_bytes = None`,
          ``,
          `try:`,
          `    # Primary: Imagen 3 widescreen generation`,
          `    result = client.models.generate_images(`,
          `        model="imagen-3.0-generate-002",`,
          `        prompt=BANNER_PROMPT,`,
          `        config=types.GenerateImagesConfig(`,
          `            number_of_images=1,`,
          `            output_mime_type="image/png",`,
          `            aspect_ratio="16:9",`,
          `        ),`,
          `    )`,
          `    banner_bytes = result.generated_images[0].image.image_bytes`,
          `    print("✅ Generated 16:9 banner with Imagen 3.")`,
          `except Exception as e:`,
          `    print(f"ℹ️ Imagen 3 fallback to gemini-2.5-flash-image ({e})...")`,
          `    response = client.models.generate_content(`,
          `        model="gemini-2.5-flash-image",`,
          `        contents=BANNER_PROMPT,`,
          `        config=types.GenerateContentConfig(`,
          `            response_modalities=["TEXT", "IMAGE"],`,
          `        ),`,
          `    )`,
          `    for part in response.candidates[0].content.parts:`,
          `        if part.inline_data and part.inline_data.data:`,
          `            banner_bytes = part.inline_data.data`,
          `            break`,
          ``,
          `if banner_bytes:`,
          `    with open(BANNER_PATH, "wb") as f:`,
          `        f.write(banner_bytes)`,
          `    img = Image.open(BytesIO(banner_bytes))`,
          `    display(img)`,
          `    print(f"💾 Saved banner to {BANNER_PATH} ({len(banner_bytes):,} bytes)")`,
          `else:`,
          `    raise RuntimeError("No image bytes returned from Gemini/Imagen.")`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "markdown",
      metadata: { id: "audio-section" },
      source: toLines(
        [
          `## 🎧 Step 2: Pre-Generate Static Audio Narration (< $0.01 / article)`,
          `Synthesizes the full dispatch narration once into a static audio file so readers can stream directly from Lens Grove without incurring per-visitor TTS API costs.`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "code",
      metadata: { id: "generate-audio" },
      execution_count: null,
      outputs: [],
      source: toLines(
        [
          `import wave`,
          `import subprocess`,
          `from IPython.display import Audio`,
          ``,
          `WAV_PATH = f"{ISSUE_SLUG}-{VOICE_NAME.lower()}.wav"`,
          `MP3_PATH = f"{ISSUE_SLUG}-{VOICE_NAME.lower()}.mp3"`,
          ``,
          `tts_response = client.models.generate_content(`,
          `    model="gemini-2.5-flash-preview-tts",`,
          `    contents=NARRATION_SCRIPT[:8000],`,
          `    config=types.GenerateContentConfig(`,
          `        response_modalities=["AUDIO"],`,
          `        speech_config=types.SpeechConfig(`,
          `            voice_config=types.VoiceConfig(`,
          `                prebuilt_voice_config=types.PrebuiltVoiceConfig(`,
          `                    voice_name=VOICE_NAME`,
          `                )`,
          `            )`,
          `        ),`,
          `    ),`,
          `)`,
          ``,
          `pcm_bytes = tts_response.candidates[0].content.parts[0].inline_data.data`,
          `with wave.open(WAV_PATH, "wb") as wf:`,
          `    wf.setnchannels(1)`,
          `    wf.setsampwidth(2)  # 16-bit PCM`,
          `    wf.setframerate(24000)`,
          `    wf.writeframes(pcm_bytes)`,
          ``,
          `# Convert WAV to compact MP3 using ffmpeg (pre-installed in Google Colab)`,
          `subprocess.run(["ffmpeg", "-y", "-i", WAV_PATH, "-codec:a", "libmp3lame", "-qscale:a", "3", MP3_PATH], check=True)`,
          `print(f"✅ Saved static MP3 narration to {MP3_PATH}")`,
          `display(Audio(MP3_PATH))`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "markdown",
      metadata: { id: "video-section" },
      source: toLines(
        [
          `## 🎬 Step 3: Generate Video (Google Veo 2/3 AI Video + FFmpeg Dispatch Audiogram)`,
          `You can generate video in two ways:`,
          `- **Cell 3A (Google Veo AI Video):** Animates your generated banner image (or generates from \`VIDEO_PROMPT\`) into a cinematic 16:9 MP4 video clip using \`veo-2.0-generate-001\`.`,
          `- **Cell 3B (FFmpeg Dispatch Audiogram):** Combines your 16:9 banner + static MP3 narration into a full-length video dispatch ready for X, Lens, and Creative TV at zero extra API cost.`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "code",
      metadata: { id: "generate-veo-video" },
      execution_count: null,
      outputs: [],
      source: toLines(
        [
          `import time`,
          `from IPython.display import Video`,
          ``,
          `VEO_VIDEO_PATH = f"{ISSUE_SLUG}-veo-teaser.mp4"`,
          `USE_BANNER_AS_STARTING_FRAME = True`,
          ``,
          `try:`,
          `    veo_image = None`,
          `    if USE_BANNER_AS_STARTING_FRAME and os.path.exists(BANNER_PATH):`,
          `        with open(BANNER_PATH, "rb") as f:`,
          `            veo_image = types.Image(image_bytes=f.read(), mime_type="image/png")`,
          ``,
          `    print("⏳ Starting Google Veo video generation (typically takes 30-90s)...")`,
          `    operation = client.models.generate_videos(`,
          `        model="veo-2.0-generate-001",`,
          `        prompt=VIDEO_PROMPT,`,
          `        image=veo_image,`,
          `        config=types.GenerateVideosConfig(`,
          `            aspect_ratio="16:9",`,
          `            number_of_videos=1,`,
          `        ),`,
          `    )`,
          ``,
          `    while not operation.done:`,
          `        time.sleep(10)`,
          `        operation = client.operations.get(operation)`,
          `        print("   ...still rendering Veo video...")`,
          ``,
          `    generated_video = operation.response.generated_videos[0]`,
          `    client.files.download(file=generated_video.video)`,
          `    generated_video.video.save(VEO_VIDEO_PATH)`,
          `    print(f"✅ Saved Google Veo clip to {VEO_VIDEO_PATH}")`,
          `    display(Video(VEO_VIDEO_PATH, embed=True, width=640))`,
          `except Exception as veo_err:`,
          `    print(f"ℹ️ Veo generation skipped or unavailable on this tier: {veo_err}")`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "code",
      metadata: { id: "generate-audiogram-video" },
      execution_count: null,
      outputs: [],
      source: toLines(
        [
          `# Cell 3B: Render Full-Length MP4 Dispatch Audiogram (Banner + Narration MP3)`,
          `AUDIOGRAM_PATH = f"{ISSUE_SLUG}-audiogram.mp4"`,
          ``,
          `if os.path.exists(BANNER_PATH) and os.path.exists(MP3_PATH):`,
          `    subprocess.run([`,
          `        "ffmpeg", "-y",`,
          `        "-loop", "1", "-i", BANNER_PATH,`,
          `        "-i", MP3_PATH,`,
          `        "-c:v", "libx264", "-tune", "stillimage",`,
          `        "-c:a", "aac", "-b:a", "192k",`,
          `        "-pix_fmt", "yuv420p",`,
          `        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",`,
          `        "-shortest",`,
          `        AUDIOGRAM_PATH,`,
          `    ], check=True)`,
          `    print(f"✅ Rendered MP4 audiogram to {AUDIOGRAM_PATH}")`,
          `    display(Video(AUDIOGRAM_PATH, embed=True, width=640))`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "markdown",
      metadata: { id: "grove-upload-section" },
      source: toLines(
        [
          `## ☁️ Step 4: Upload Assets to Lens Grove (\`chain_id=232\`) & Sync to Dear Creative`,
          `Uploads the generated Banner PNG, Static MP3 Narration, and MP4 Video to **Lens Grove** decentralized storage and prints the ready-to-use Markdown embeds.`,
        ].join("\n"),
      ),
    },
    {
      cell_type: "code",
      metadata: { id: "upload-lens-grove" },
      execution_count: null,
      outputs: [],
      source: toLines(
        [
          `import requests`,
          ``,
          `def upload_to_lens_grove(file_path: str, mime_type: str, ext_hint: str = "") -> dict:`,
          `    with open(file_path, "rb") as f:`,
          `        data = f.read()`,
          `    res = requests.post(`,
          `        "https://api.grove.storage?chain_id=232",`,
          `        headers={`,
          `            "Content-Type": mime_type,`,
          `            "Content-Length": str(len(data)),`,
          `        },`,
          `        data=data,`,
          `        timeout=60,`,
          `    )`,
          `    res.raise_for_status()`,
          `    payload = res.json()`,
          `    item = payload[0] if isinstance(payload, list) and payload else payload`,
          `    storage_key = item.get("storage_key") or item.get("uri", "").replace("lens://", "")`,
          `    uri = item.get("uri") or f"lens://{storage_key}"`,
          `    gateway_url = f"https://api.grove.storage/{storage_key}{ext_hint}"`,
          `    return {"uri": uri, "gatewayUrl": gateway_url, "storageKey": storage_key}`,
          ``,
          `uploaded_assets = {}`,
          `if os.path.exists(BANNER_PATH):`,
          `    uploaded_assets["banner"] = upload_to_lens_grove(BANNER_PATH, "image/png")`,
          `    print("🖼️ Banner Lens Grove:", uploaded_assets["banner"]["gatewayUrl"])`,
          ``,
          `if os.path.exists(MP3_PATH):`,
          `    uploaded_assets["audio"] = upload_to_lens_grove(MP3_PATH, "audio/mpeg", "?ext=mp3")`,
          `    print("🎧 Audio Lens Grove: ", uploaded_assets["audio"]["gatewayUrl"])`,
          ``,
          `video_candidate = VEO_VIDEO_PATH if os.path.exists(VEO_VIDEO_PATH) else (AUDIOGRAM_PATH if os.path.exists(AUDIOGRAM_PATH) else None)`,
          `if video_candidate:`,
          `    uploaded_assets["video"] = upload_to_lens_grove(video_candidate, "video/mp4", "?ext=mp4")`,
          `    print("🎬 Video Lens Grove: ", uploaded_assets["video"]["gatewayUrl"])`,
          ``,
          `print("\\n--- 📋 Ready-to-Paste Dear Creative Markdown ---")`,
          `if "banner" in uploaded_assets:`,
          `    print(f"![{ISSUE_TITLE}]({uploaded_assets['banner']['gatewayUrl']})\\n")`,
          `if "video" in uploaded_assets:`,
          `    print(f"[video: {ISSUE_TITLE} Video Dispatch]({uploaded_assets['video']['gatewayUrl']})\\n")`,
        ].join("\n"),
      ),
    },
  ];

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      colab: {
        name: `dear-creative-${slug}-assets.ipynb`,
        provenance: [],
      },
      kernelspec: {
        name: "python3",
        display_name: "Python 3",
      },
      language_info: {
        name: "python",
      },
    },
    cells,
  };
}
