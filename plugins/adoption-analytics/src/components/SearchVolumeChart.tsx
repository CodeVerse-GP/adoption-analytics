import type { SearchVolumePoint } from '@codeverse-gp/plugin-adoption-analytics-common';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, chartPalette, useAxisStyle } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { monoFont } from './tokens';

type Props = {
  data: SearchVolumePoint[];
  total: number;
};

/**
 * Renders per-day search volume as bars, with a secondary line showing
 * distinct searchers per day so both totals and reach are visible.
 */
export function SearchVolumeChart({ data, total }: Props) {
  const axisStyle = useAxisStyle();
  return (
    <ChartCard
      title="Search Volume"
      subtitle={`${total.toLocaleString()} searches`}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
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
          <Tooltip
            cursor={{ fill: axisStyle.cursorFill }}
            content={<ChartTooltip />}
          />
          <Legend
            wrapperStyle={{ fontFamily: monoFont, fontSize: 11 }}
            iconType="square"
          />
          <Bar
            dataKey="searches"
            name="Searches"
            fill={chartPalette.violet}
            radius={[3, 3, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="users"
            name="Unique searchers"
            stroke={chartPalette.teal}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function compactDate(iso: string): string {
  return iso.slice(5);
}
