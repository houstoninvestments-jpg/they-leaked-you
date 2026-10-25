import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  delayRender,
  continueRender,
  cancelRender,
} from "remotion";
import {
  CLOSER,
  DISCLAIMER,
  supportedSeverity,
  type BreachProps,
} from "./props";
import { CARD, HEAD, RESULT, CAPTIONS, FOOTER, type Box } from "./layout";
import { C, fontFamily } from "./theme";
const box = (b: Box): React.CSSProperties => ({
  position: "absolute",
  left: b.x,
  top: b.y,
  width: b.w,
  height: b.h,
  boxSizing: "border-box",
});
const label: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 750,
  letterSpacing: 2,
  lineHeight: 1.2,
};
export const BreachShort: React.FC<BreachProps> = (p) => {
  const frame = useCurrentFrame();
  const [layoutHandle] = useState(() =>
    delayRender("Checking text fits safe areas"),
  );
  useEffect(() => {
    document.fonts.ready
      .then(() => {
        try {
          for (const el of document.querySelectorAll<HTMLElement>(
            "[data-fit]",
          )) {
            if (
              el.scrollHeight > el.clientHeight + 1 ||
              el.scrollWidth > el.clientWidth + 1
            )
              throw new Error(`Text overflow: ${el.dataset.fit}`);
          }
          const source = document.querySelector<HTMLElement>(
            '[data-fit="source"]',
          );
          const data =
            document.querySelector<HTMLElement>('[data-fit="types"]');
          if (
            source &&
            data &&
            data.getBoundingClientRect().bottom >
              source.getBoundingClientRect().top
          )
            throw new Error("Data types cover source line");
          continueRender(layoutHandle);
        } catch (error) {
          cancelRender(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      })
      .catch(cancelRender);
  }, [layoutHandle]);
  const stamp = p.timeline.beats.find((b) => b.id === "stamp")!;
  const closer = p.timeline.beats.find((b) => b.id === "scoreboard")!;
  const closing = frame >= closer.from;
  const severity = supportedSeverity(p.card);
  const caption = p.timeline.captions.find(
    (c) => frame >= c.from && frame < c.to,
  );
  return (
    <AbsoluteFill style={{ background: C.bg, color: C.ink, fontFamily }}>
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 65,
          width: 830,
          fontSize: 44,
          fontWeight: 900,
          letterSpacing: 1,
        }}
      >
        THEY <span style={{ color: C.cyan }}>LEAKED</span> YOU
        <span style={{ color: C.cyan }}>.</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 132,
          width: 830,
          fontSize: 23,
          color: C.dim,
          fontWeight: 700,
        }}
      >
        PUBLIC NOTICE / {String(p.number).padStart(3, "0")} · {p.voiceLabel}
      </div>
      <div
        data-fit="headline"
        style={{
          ...box(HEAD),
          fontSize: 56,
          fontWeight: 900,
          lineHeight: 1.08,
          display: "flex",
          alignItems: "center",
          overflowWrap: "anywhere",
        }}
      >
        {frame >= stamp.from ? (
          <div>
            <div
              style={{
                fontSize: 23,
                letterSpacing: 2,
                color: C.dim,
                marginBottom: 12,
              }}
            >
              DATA RISK SIGNAL
            </div>
            <div style={{ color: severity === "UNKNOWN" ? C.cyan : C.alert }}>
              {severity === "UNKNOWN" ? "DATA RISK UNKNOWN" : severity}
            </div>
          </div>
        ) : (
          p.hook
        )}
      </div>
      <div
        data-region="breach-card"
        style={{
          ...box(CARD),
          background: C.card,
          color: C.dark,
          padding: 30,
          borderTop: `10px solid ${C.cyan}`,
        }}
      >
        <div
          style={{
            ...label,
            borderBottom: "2px solid #A5B0BF",
            paddingBottom: 14,
          }}
        >
          OFFICIAL BREACH NOTICE
        </div>
        <div
          data-fit="company"
          style={{
            fontSize: 44,
            fontWeight: 900,
            lineHeight: 1.08,
            marginTop: 16,
            height: 100,
            overflowWrap: "anywhere",
          }}
        >
          {p.card.company}
        </div>
        <div style={{ ...label, marginTop: 10 }}>REPORT DATE</div>
        <div
          data-fit="report date"
          style={{ fontSize: 34, fontWeight: 750, marginTop: 7, height: 42 }}
        >
          {p.card.reportDate}
        </div>
        <div style={{ ...label, marginTop: 18 }}>
          REPORTED COUNT · {p.card.countScope || "Scope not specified"}
        </div>
        <div
          data-fit="count"
          style={{
            fontSize: 52,
            fontWeight: 900,
            lineHeight: 1.15,
            marginTop: 7,
            height: 60,
          }}
        >
          {p.card.affectedCount}
        </div>
        <div style={{ ...label, marginTop: 18 }}>DATA TYPES REPORTED</div>
        <div
          data-fit="types"
          style={{
            fontSize: 32,
            fontWeight: 750,
            lineHeight: 1.28,
            marginTop: 8,
            height: 124,
            overflowWrap: "anywhere",
          }}
        >
          {p.card.dataTypes.length
            ? p.card.dataTypes.join(" · ")
            : "Not specified in the notice"}
        </div>
        <div
          data-fit="source"
          style={{
            position: "absolute",
            left: 30,
            bottom: 24,
            right: 30,
            height: 60,
            fontSize: 25,
            lineHeight: 1.2,
            color: "#35445B",
          }}
        >
          Source: {p.card.sourceLabel}
        </div>
      </div>
      <div
        data-fit="result"
        style={{
          ...box(RESULT),
          fontSize: closing ? 50 : 28,
          fontWeight: 800,
          lineHeight: 1.2,
          color: C.cyan,
          display: "flex",
          alignItems: "center",
        }}
      >
        {closing
          ? CLOSER
          : "Public records. No stolen data. No personal details."}
      </div>
      <div
        data-fit="captions"
        style={{
          ...box(CAPTIONS),
          fontSize: 42,
          lineHeight: 1.18,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
        }}
      >
        {closing
          ? "Use the official notice linked in the description."
          : caption?.text}
      </div>
      <div
        data-fit="footer"
        style={{ ...box(FOOTER), fontSize: 28, lineHeight: 1.3, color: C.dim }}
      >
        {DISCLAIMER}
        {p.testLabel ? (
          <div style={{ fontSize: 22, color: C.cyan, marginTop: 9 }}>
            {p.testLabel}
          </div>
        ) : null}
      </div>
      {p.timeline.beats
        .filter((b) => b.audio)
        .map((b) => (
          <Sequence key={b.id} from={b.from} durationInFrames={b.to - b.from}>
            <Audio src={staticFile(b.audio!)} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
};
