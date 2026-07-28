import { ImageResponse } from "next/og";

// Default social-share card for every route (Next injects it into each page's
// Open Graph + Twitter metadata automatically). Generated at build/request time
// with no remote assets, so it works under the CSP and offline builds.
export const alt = "BulkReach — Bulk SMS & Email for Uganda";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0D0F2E 0%, #1B1F4A 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 34,
            fontWeight: 700,
            color: "#00D4AA",
            letterSpacing: "0.06em",
          }}
        >
          BULKREACH
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 28,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            color: "#FFFFFF",
          }}
        >
          <span>Your message.</span>
          <span style={{ color: "#00D4AA" }}>20,000 inboxes.</span>
          <span>One send.</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontSize: 28,
            color: "rgba(255,255,255,0.62)",
          }}
        >
          Bulk SMS &amp; email campaigns for Uganda&apos;s businesses.
        </div>
      </div>
    ),
    size,
  );
}
