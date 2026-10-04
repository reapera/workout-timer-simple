"use client";

import { useEffect, useRef, useState } from "react";

import { shortDate } from "@/lib/training/format";
import { daysBetween } from "@/lib/training/schedule";

/**
 * Small, dependency-free SVG charts for the Progress page. Thin marks, a
 * recessive grid, selective labels (first and last), a hover/keyboard readout,
 * and a table twin for every chart so no value is hover-only.
 */

const trim = (value: number) => String(Math.round(value * 100) / 100);

function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.max(160, Math.floor(element.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Three or four round-numbered ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  let low = min;
  let high = max;
  if (low === high) {
    const pad = Math.abs(low) * 0.1 || 1;
    low -= pad;
    high += pad;
  }
  const raw = (high - low) / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((multiple) => multiple * magnitude).find((candidate) => candidate >= raw) ?? raw;
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 1000; value += step) ticks.push(Number(value.toFixed(6)));
  return ticks;
}

function Tooltip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  const tooltipWidth = 132;
  const left = Math.min(Math.max(0, x - tooltipWidth / 2), Math.max(0, width - tooltipWidth));
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 rounded-lg border border-white/10 bg-[var(--color-ink)]/95 px-2.5 py-1.5 text-xs shadow-lg"
      style={{ left, width: tooltipWidth }}
      role="status"
    >
      {children}
    </div>
  );
}

function TableTwin({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <details className="mt-2 text-xs text-white/55">
      <summary className="cursor-pointer select-none text-white/45 hover:text-white/70">Show as table</summary>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-white/40">
            {head.map((cell) => (
              <th key={cell} className="py-1 pr-3 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tnum">
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-[var(--color-grid)]">
              {row.map((cell, column) => (
                <td key={column} className="py-1 pr-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/* ------------------------------------------------------------------ *
 * Line chart: one series over time
 * ------------------------------------------------------------------ */

export type LinePoint = { date: string; value: number; detail?: string };

export function LineChart({
  points,
  color,
  unit,
  label,
  height = 168,
}: {
  points: LinePoint[];
  color: string;
  unit: string;
  label: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  if (!points.length) return null;

  const pad = { left: 34, right: 52, top: 30, bottom: 22 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const values = points.map((point) => point.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const span = Math.max(1, daysBetween(points[0].date, points[points.length - 1].date));
  const x = (index: number) =>
    points.length === 1
      ? pad.left + plotWidth / 2
      : pad.left + (daysBetween(points[0].date, points[index].date) / span) * plotWidth;
  const y = (value: number) => pad.top + (1 - (value - yMin) / (yMax - yMin || 1)) * plotHeight;
  const format = (value: number) => `${trim(value)} ${unit}`;

  const line = points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${pad.top + plotHeight} L${x(0)},${pad.top + plotHeight} Z`;
  const last = points.length - 1;
  const showDots = points.length <= 24;

  const nearest = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return null;
    const px = clientX - box.left;
    let best = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(x(index) - px) < Math.abs(x(best) - px)) best = index;
    }
    return best;
  };

  return (
    <div>
      <div
        ref={ref}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        tabIndex={0}
        role="img"
        aria-label={`${label}: from ${format(points[0].value)} on ${shortDate(points[0].date)} to ${format(points[last].value)} on ${shortDate(points[last].date)}. Use arrow keys to read each session.`}
        onPointerMove={(event) => setActive(nearest(event.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(last)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setActive((current) => Math.max(0, (current ?? last) - 1));
          if (event.key === "ArrowRight") setActive((current) => Math.min(last, (current ?? last) + 1));
        }}
        style={{ touchAction: "pan-y" }}
      >
        <svg width={width} height={height} aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-grid)" strokeWidth="1" />
              <text x={pad.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="tnum" fontSize="10" fill="rgb(255 255 255 / 0.45)">
                {trim(tick)}
              </text>
            </g>
          ))}
          <text x={pad.left} y={height - 6} fontSize="10" fill="rgb(255 255 255 / 0.45)">
            {shortDate(points[0].date)}
          </text>
          {points.length > 1 && (
            <text x={width - pad.right} y={height - 6} textAnchor="end" fontSize="10" fill="rgb(255 255 255 / 0.45)">
              {shortDate(points[last].date)}
            </text>
          )}

          <path d={area} fill={color} opacity="0.1" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={pad.top - 4} y2={pad.top + plotHeight} stroke="rgb(255 255 255 / 0.35)" strokeWidth="1" />
          )}

          {points.map((point, index) =>
            showDots || index === last || index === active ? (
              <circle
                key={point.date + index}
                cx={x(index)}
                cy={y(point.value)}
                r={index === last || index === active ? 4.5 : 3}
                fill={color}
                stroke="var(--color-surface)"
                strokeWidth="2"
              />
            ) : null,
          )}

          <text x={x(last) + 8} y={y(points[last].value)} dy="0.32em" fontSize="11" fontWeight="600" fill="rgb(255 255 255 / 0.9)">
            {format(points[last].value)}
          </text>
        </svg>

        {active !== null && (
          <Tooltip x={x(active)} width={width}>
            <p className="font-semibold text-white">{format(points[active].value)}</p>
            <p className="text-white/55">{shortDate(points[active].date)}</p>
            {points[active].detail && <p className="text-white/55">{points[active].detail}</p>}
          </Tooltip>
        )}
      </div>
      <TableTwin
        caption={label}
        head={["Date", label]}
        rows={points.map((point) => [shortDate(point.date), point.detail ? `${format(point.value)} · ${point.detail}` : format(point.value)])}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Column chart: one value per bucket
 * ------------------------------------------------------------------ */

export type Column = { key: string; label: string; value: number; detail?: string };

export function ColumnChart({
  columns,
  color,
  unit,
  label,
  height = 168,
}: {
  columns: Column[];
  color: string;
  unit: string;
  label: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const pad = { left: 40, right: 8, top: 30, bottom: 22 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const ticks = niceTicks(0, Math.max(1, ...columns.map((column) => column.value)));
  const yMax = ticks[ticks.length - 1];
  const band = plotWidth / Math.max(1, columns.length);
  const barWidth = Math.min(24, Math.max(4, band - 2));
  const center = (index: number) => pad.left + band * index + band / 2;
  const y = (value: number) => pad.top + (1 - value / (yMax || 1)) * plotHeight;
  const format = (value: number) => `${Math.round(value).toLocaleString()} ${unit}`;
  const last = columns.length - 1;

  /** A column with a 4px rounded top and a square foot on the baseline. */
  const columnPath = (index: number, value: number) => {
    const left = center(index) - barWidth / 2;
    const top = y(value);
    const bottom = pad.top + plotHeight;
    const radius = Math.min(4, barWidth / 2, bottom - top);
    return `M${left},${bottom} V${top + radius} Q${left},${top} ${left + radius},${top} H${left + barWidth - radius} Q${left + barWidth},${top} ${left + barWidth},${top + radius} V${bottom} Z`;
  };

  return (
    <div>
      <div
        ref={ref}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        tabIndex={0}
        role="img"
        aria-label={`${label}, ${columns.length} weeks. Latest: ${format(columns[last]?.value ?? 0)}. Use arrow keys to read each week.`}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(last)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setActive((current) => Math.max(0, (current ?? last) - 1));
          if (event.key === "ArrowRight") setActive((current) => Math.min(last, (current ?? last) + 1));
        }}
        style={{ touchAction: "pan-y" }}
      >
        <svg width={width} height={height} aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--color-axis)" : "var(--color-grid)"} strokeWidth="1" />
              <text x={pad.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="tnum" fontSize="10" fill="rgb(255 255 255 / 0.45)">
                {tick >= 1000 ? `${trim(tick / 1000)}k` : trim(tick)}
              </text>
            </g>
          ))}
          {columns.map((column, index) => (
            <g key={column.key}>
              {column.value > 0 && (
                <path d={columnPath(index, column.value)} fill={color} opacity={active === null || active === index ? 1 : 0.55} />
              )}
              {(index === 0 || index === last || columns.length <= 5) && (
                <text x={center(index)} y={height - 6} textAnchor="middle" fontSize="10" fill="rgb(255 255 255 / 0.45)">
                  {column.label}
                </text>
              )}
              {/* The whole band is the hit target, not just the painted column. */}
              <rect
                x={pad.left + band * index}
                y={pad.top}
                width={band}
                height={plotHeight}
                fill="transparent"
                onPointerEnter={() => setActive(index)}
                onPointerDown={() => setActive(index)}
              />
            </g>
          ))}
          {columns[last] && columns[last].value > 0 && (
            <text x={center(last)} y={y(columns[last].value) - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="rgb(255 255 255 / 0.9)">
              {Math.round(columns[last].value).toLocaleString()}
            </text>
          )}
        </svg>

        {active !== null && columns[active] && (
          <Tooltip x={center(active)} width={width}>
            <p className="font-semibold text-white">{format(columns[active].value)}</p>
            <p className="text-white/55">{columns[active].label}</p>
            {columns[active].detail && <p className="text-white/55">{columns[active].detail}</p>}
          </Tooltip>
        )}
      </div>
      <TableTwin
        caption={label}
        head={["Week of", label]}
        rows={columns.map((column) => [column.label, column.detail ? `${format(column.value)} · ${column.detail}` : format(column.value)])}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sparkline: a trend glance inside a row
 * ------------------------------------------------------------------ */

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const width = 72;
  const height = 24;
  if (values.length < 2) return <div style={{ width, height }} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (index: number) => 3 + (index / (values.length - 1)) * (width - 6);
  const y = (value: number) => 3 + (1 - (value - min) / (max - min || 1)) * (height - 6);
  const path = values.map((value, index) => `${index ? "L" : "M"}${x(index)},${y(value)}`).join(" ");
  return (
    <svg width={width} height={height} aria-hidden="true" className="shrink-0">
      <path d={path} fill="none" stroke="rgb(255 255 255 / 0.3)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3" fill={color} />
    </svg>
  );
}
