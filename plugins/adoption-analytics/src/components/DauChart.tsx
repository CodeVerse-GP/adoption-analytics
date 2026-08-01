import type { ActiveUsersSummary } from '@codeverse-gp/plugin-adoption-analytics-common';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, chartPalette, useAxisStyle } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';

type Props = {
  data: ActiveUsersSummary;
};

export function DauChart({ data }: Props) {
  const axisStyle = useAxisStyle();
  return (
    <ChartCard
      title="Daily Active Users"
      subtitle={`${data.points.length} days`}
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
          <Area
            type="monotone"
            dataKey="activeUsers"
            name="Active users"
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
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function compactDate(iso: string): string {
  // Renders `07-23` — enough context inside a 30d window without wasted pixels.
  return iso.slice(5);
}
