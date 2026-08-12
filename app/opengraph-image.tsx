import { ImageResponse } from "next/og";

export const alt = "Michael Vasandani — engineer of dependable agentic systems";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", padding: 72, color: "#211f1b", background: "#f4eedf", fontFamily: "Georgia, serif" }}>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid rgba(33,31,27,.35)", padding: 52 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Arial, sans-serif", fontSize: 18, letterSpacing: 4, textTransform: "uppercase" }}>
          <span>Portfolio · 2026</span><span>AI systems · Software engineering</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 84, lineHeight: .94 }}>Michael Sagar Vasandani</div>
          <div style={{ marginTop: 24, fontFamily: "Arial, sans-serif", fontSize: 22, letterSpacing: 3, textTransform: "uppercase" }}>Engineer of dependable agentic systems</div>
        </div>
        <div style={{ fontSize: 23 }}>Source-grounded systems. Measurable outcomes. Maintainable software.</div>
      </div>
    </div>,
    size,
  );
}
