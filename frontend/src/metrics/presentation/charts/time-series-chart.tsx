"use client";

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatValue, toRows, type Series, type Unit } from "@/metrics/domain/series";

// Палитра серий — акценты сайта, начиная с фирменного cyan.
const COLORS = ["#67e8f9", "#a78bfa", "#fbbf24", "#34d399", "#fb7185", "#60a5fa"];

const AXIS = { stroke: "transparent", tick: { fill: "#a3a3a3", fontSize: 11 } } as const;

function clockOf(t: number): string {
  return new Date(t * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function TimeSeriesChart({ series, unit }: { series: Series[]; unit: Unit }) {
  const rows = toRows(series);
  return (
    <ResponsiveContainer width="100%" height={224}>
      <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
        <XAxis dataKey="t" tickFormatter={clockOf} minTickGap={48} tickLine={false} {...AXIS} />
        <YAxis
          width={56}
          tickFormatter={(v: number) => formatValue(v, unit)}
          tickLine={false}
          {...AXIS}
        />
        <Tooltip
          contentStyle={{
            background: "#0c0d10",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: "#a3a3a3" }}
          labelFormatter={(t) => clockOf(Number(t))}
          formatter={(v, name) => [formatValue(Number(v), unit), String(name)]}
        />
        {series.length > 1 && (
          <Legend
            iconType="plainline"
            wrapperStyle={{ fontSize: 11, color: "#a3a3a3", paddingTop: 8 }}
          />
        )}
        {series.map((s, i) => (
          <Line
            key={s.label}
            type="monotone"
            dataKey={s.label}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
