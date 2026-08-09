import type { ActiveUsersSummary } from '@codeverse-gp/plugin-adoption-analytics-common';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, chartPalette, useAxisStyle } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { monoFont } from './tokens';

type Props = {
  data: ActiveUsersSummary;
};

export function DauChart({ data }: Props) {
  const axisStyle = useAxisStyle();
  const newTotal = data.points.reduce((sum, p) => sum + p.newUsers, 0);
  return (
    <ChartCard
      title="Daily Active Users"
      subtitle={`${data.points.length} days · ${newTotal} new`}
    >
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart
          data={data.points}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="dauGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={chartPalette.blue}
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor={chartPalette.blue}
                stopOpacity={0}
              />
            </linearGradient>
            <linearGradient id="dauNewGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={chartPalette.teal}
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor={chartPalette.teal}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={axisStyle.axisLine.stroke}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={axisStyle.tick}
            axisLine={axisStyle.axisLine}
            tickLine={axisStyle.tickLine}
            tickFormatter={compactDate}
            minTickGap={20}
          />
          <YAxis
            tick={axisStyle.tick}
            axisLine={axisStyle.axisLine}
            tickLine={axisStyle.tickLine}
            allowDecimals={false}
            width={36}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            wrapperStyle={{ fontFamily: monoFont, fontSize: 11 }}
            iconType="square"
          />
          {/* Stacked so the two bands still add up to total DAU — the
              split answers "is growth new sign-ups or repeat usage?"
              without losing the headline number. */}
          <Area
            type="monotone"
            dataKey="returningUsers"
            name="Returning"
            stackId="dau"
            stroke={chartPalette.blue}
            strokeWidth={2}
            fill="url(#dauGradient)"
            // Always draw dots so a single-day spike stays visible even
            // when the range compresses each day to just a few pixels
            // (30d/90d). Without this, sparse activity turns into an
            // invisible vertical tick.
            dot={{ r: 2, strokeWidth: 0, fill: chartPalette.blue }}
            activeDot={{ r: 4 }}
          />
          <Area
            type="monotone"
            dataKey="newUsers"
            name="New"
            stackId="dau"
            stroke={chartPalette.teal}
            strokeWidth={2}
            fill="url(#dauNewGradient)"
            dot={{ r: 2, strokeWidth: 0, fill: chartPalette.teal }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function compactDate(iso: string): string {
  // Renders `07-23` — enough context inside a 30d window without wasted pixels.
  return iso.slice(5);
}
