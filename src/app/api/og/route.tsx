import { ImageResponse } from "next/og";
import { connection, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  await connection();
  try {
    const { searchParams } = new URL(request.url);

    const title = searchParams.get("title") || "Dear Creative";
    const date = searchParams.get("date") || "Weekly Dispatch";
    const readTime = searchParams.get("readTime") || "3 min read • 2 min audio";
    const topic = searchParams.get("topic") || "Creator Economics";

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundColor: "#09090b",
            backgroundImage:
              "radial-gradient(circle at 25% 25%, rgba(99, 102, 241, 0.15) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(59, 130, 246, 0.15) 0%, transparent 50%)",
            padding: "60px 70px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#ffffff",
          }}
        >
          {/* Top Brand Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  backgroundColor: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: "20px",
                  color: "#000000",
                }}
              >
                DC
              </div>
              <span
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: "#f4f4f5",
                }}
              >
                DEAR CREATIVE
              </span>
            </div>

            <div
              style={{
                backgroundColor: "rgba(99, 102, 241, 0.2)",
                border: "1px solid rgba(129, 140, 248, 0.4)",
                padding: "8px 18px",
                borderRadius: "9999px",
                fontSize: "15px",
                fontWeight: 600,
                color: "#a5b4fc",
                letterSpacing: "0.02em",
              }}
            >
              {topic}
            </div>
          </div>

          {/* Center Title Content */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              maxWidth: "1000px",
            }}
          >
            <h1
              style={{
                fontSize: title.length > 55 ? "50px" : "62px",
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: "-0.03em",
                color: "#ffffff",
                margin: 0,
              }}
            >
              {title}
            </h1>
          </div>

          {/* Bottom Meta & Audio Badge Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid rgba(255, 255, 255, 0.12)",
              paddingTop: "28px",
              fontSize: "17px",
              color: "#a1a1aa",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "18px",
              }}
            >
              <span style={{ color: "#e4e4e7", fontWeight: 600 }}>
                🎧 {readTime}
              </span>
              <span>•</span>
              <span>{date}</span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "16px",
                color: "#71717a",
                fontWeight: 500,
              }}
            >
              <span>Onchain Dispatches & AI Systems</span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_")
    ) {
      throw error;
    }
    console.error("Failed to generate OG social preview card:", error);
    return new Response("Failed to generate social preview image", {
      status: 500,
    });
  }
}
