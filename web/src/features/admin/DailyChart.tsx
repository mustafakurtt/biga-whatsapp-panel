// Günlük gelen/giden sütun grafiği: elle çizilmiş SVG, ResizeObserver ile genişliğe uyar, gün başına ipucu.
// Kurallar: 4–5 yuvarlak tik (en üst tik verinin üstünde), y ekseni çizgisi yok, tek taban çizgisi, kare tabanlı sütunlar.
import { useEffect, useRef, useState } from "react";
import type { Summary } from "../../api/types";
import { nf } from "../../lib/format";

type Day = Summary["daily"][number];

export function niceMax(v: number): { max: number; step: number } {
  if (v <= 4) return { max: 4, step: 1 };
  const raw = v / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= raw) ?? 10 * p;
  let max = Math.ceil(v / step) * step;
  if (max === v) max += step; // en üst çizgi verinin üstünde
  return { max, step };
}

export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions): string {
  const [y = 1970, m = 1, d = 1] = String(day).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("tr-TR", opts);
}

export function DailyChart({ daily }: { daily: Day[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [tipLeft, setTipLeft] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const W = Math.max(280, width);
  const H = W < 520 ? 180 : 220;
  const m = { l: 36, r: 4, t: 8, b: 26 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const peak = Math.max(0, ...daily.map((d) => Math.max(d.incoming, d.outgoing)));
  const { max, step } = niceMax(peak);
  const y = (v: number) => m.t + ph - (v / max) * ph;
  const n = Math.max(1, daily.length);
  const gw = pw / n;
  const bw = Math.max(2, Math.min(14, (gw - 6) / 2 - 1));
  const every = n <= 8 ? 1 : Math.ceil(n / 6);

  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);

  const barPath = (x: number, v: number) => {
    const top = y(v);
    const h = m.t + ph - top;
    const r = Math.min(3, bw / 2, h);
    return `M${x},${m.t + ph} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${m.t + ph} Z`;
  };

  // İpucu konumu: ölçüldükten sonra kenarlara taşmadan ortala
  useEffect(() => {
    if (hover === null || !tipRef.current) return;
    const tw = tipRef.current.offsetWidth;
    const cx = m.l + gw * hover + gw / 2;
    setTipLeft(Math.max(0, Math.min(W - tw, cx - tw / 2)));
  }, [hover, W, gw, m.l]);

  const hd = hover !== null ? daily[hover] : undefined;
  return (
    <div className="chart-wrap">
      <div className="chart-host" ref={hostRef}>
        {width > 0 && (
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chart" role="img" aria-label={`Günlük gelen ve giden mesaj, ${daily.length} gün`}>
            {ticks.map((v) => (
              <g key={`t${v}`}>
                <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? "axis-base" : "grid"} />
                <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="tick">{nf.format(v)}</text>
              </g>
            ))}
            {daily.map((d, i) => {
              const cx = m.l + gw * i + gw / 2;
              return (
                <g key={d.day} className={hover === i ? "day hover" : "day"}>
                  {d.incoming > 0 && <path d={barPath(cx - bw - 1, d.incoming)} className="bar bar-in" />}
                  {d.outgoing > 0 && <path d={barPath(cx + 1, d.outgoing)} className="bar bar-out" />}
                  <rect x={m.l + gw * i} y={m.t} width={gw} height={ph} className="hit" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                </g>
              );
            })}
            {daily.map((d, i) => {
              const last = i === n - 1;
              if (!(i % every === 0 || (last && n <= 8))) return null;
              const cx = m.l + gw * i + gw / 2;
              const label = n <= 8 ? fmtDay(d.day, { weekday: "short", day: "numeric" }) : fmtDay(d.day, { day: "numeric", month: "short" });
              const start = i === 0 && n > 8;
              return (
                <text key={`x${d.day}`} x={start ? m.l + gw * i + 2 : cx} y={H - 8} textAnchor={start ? "start" : "middle"} className="tick">{label}</text>
              );
            })}
          </svg>
        )}
      </div>
      {hd && (
        <div ref={tipRef} className="chart-tip" role="status" style={{ left: tipLeft, top: 0 }}>
          <strong>{fmtDay(hd.day, { weekday: "long", day: "numeric", month: "long" })}</strong>
          <span><span className="swatch swatch-in" />Gelen {nf.format(hd.incoming)}</span>
          <span><span className="swatch swatch-out" />Giden {nf.format(hd.outgoing)}</span>
        </div>
      )}
    </div>
  );
}
