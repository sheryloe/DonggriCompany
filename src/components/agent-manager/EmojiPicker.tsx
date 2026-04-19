import { useEffect, useRef, useState } from "react";
import { EMOJI_GROUPS } from "./constants";

export function StackedSpriteIcon({ sprites }: { sprites: [number, number] }) {
  return (
    <span className="relative inline-flex items-center" style={{ width: 22, height: 16 }}>
      <img
        src={`/sprites/${sprites[0]}-D-1.png`}
        alt=""
        className="absolute left-0 top-0 h-4 w-4 rounded-full object-cover"
        style={{ imageRendering: "pixelated", opacity: 0.85 }}
      />
      <img
        src={`/sprites/${sprites[1]}-D-1.png`}
        alt=""
        className="absolute left-1.5 top-px h-4 w-4 rounded-full object-cover"
        style={{ imageRendering: "pixelated", zIndex: 1 }}
      />
    </span>
  );
}

export default function EmojiPicker({
  tr,
  value,
  onChange,
  size = "md",
}: {
  tr: (ko: string, en: string) => string;
  value: string;
  onChange: (emoji: string) => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const btnSize = size === "sm" ? "h-10 w-10 text-lg" : "h-10 w-14 text-xl";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`${btnSize} flex items-center justify-center rounded-lg border transition-all hover:scale-105 hover:shadow-md`}
        style={{ background: "var(--th-input-bg)", borderColor: "var(--th-input-border)" }}
        aria-label={value || "BOT"}
      >
        {value || "BOT"}
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-[60] mt-1 max-h-[60vh] w-72 overflow-y-auto overscroll-contain rounded-xl p-3 shadow-2xl"
          style={{
            background: "var(--th-card-bg)",
            border: "1px solid var(--th-card-border)",
            backdropFilter: "blur(20px)",
          }}
        >
          {EMOJI_GROUPS.map((group) => (
            <div key={group.labelEn} className="mb-2 last:mb-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--th-text-muted)" }}>
                {tr(group.label, group.labelEn)}
              </div>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onChange(emoji);
                      setOpen(false);
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-all hover:scale-125 hover:bg-[var(--th-bg-surface-hover)] ${
                      value === emoji ? "bg-blue-500/15 ring-2 ring-blue-400" : ""
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
