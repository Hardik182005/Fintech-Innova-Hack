"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/data/states";
import { dateOf, money, moneyCompact } from "@/lib/format";
import type { ExposurePoint } from "@/lib/types";

/**
 * Approved, drawn and repaid over time.
 *
 * Values stay in integer minor units all the way into the chart and are
 * formatted only at the axis and the tooltip, so the same division-by-100 rule
 * that governs every other figure on the product governs this one too.
 */

const SERIES = [
  { key: "approved_minor", label: "Approved", colour: "var(--color-info)" },
  { key: "utilized_minor", label: "Drawn", colour: "var(--color-caution)" },
  { key: "repaid_minor", label: "Repaid", colour: "var(--color-positive)" },
] as const;

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number; color?: string }[];
  label?: string;
}) {
  if (active !== true || payload === undefined || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-ink">{dateOf(label)}</p>
      <dl className="space-y-0.5">
        {payload.map((entry) => {
          const series = SERIES.find((s) => s.key === entry.dataKey);
          return (
            <div key={String(entry.dataKey)} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: entry.color }}
              />
              <dt className="text-muted">{series?.label ?? String(entry.dataKey)}</dt>
              <dd className="tnum ml-auto pl-4 font-medium text-ink">{money(entry.value ?? null)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function ExposureChart({ data }: { data: ExposurePoint[] }) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="No exposure history yet"
        body="Once credit is approved and drawn, the daily position will be plotted here."
      />
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {SERIES.map((series) => (
              <linearGradient key={series.key} id={`fill-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series.colour} stopOpacity={0.18} />
                <stop offset="100%" stopColor={series.colour} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--color-line-soft)" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--color-faint)" }}
            tickFormatter={(value: string) => dateOf(value).slice(0, 6)}
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fontSize: 11, fill: "var(--color-faint)" }}
            tickFormatter={(value: number) => moneyCompact(value)}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--color-line)" }} />
          <Legend
            iconType="circle"
            iconSize={7}
            formatter={(value: string) => (
              <span className="text-xs text-muted">
                {SERIES.find((s) => s.key === value)?.label ?? value}
              </span>
            )}
          />
          {SERIES.map((series) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              stroke={series.colour}
              strokeWidth={1.75}
              fill={`url(#fill-${series.key})`}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
