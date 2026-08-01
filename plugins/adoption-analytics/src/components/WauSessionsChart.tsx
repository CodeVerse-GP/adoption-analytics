import type { WauSessionsBucket } from '@codeverse-gp/plugin-adoption-analytics-common';
import {
  Bar,
  BarChart,
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
  data: WauSessionsBucket[];
};

export function WauSessionsChart({ data }: Props) {
  const axisStyle = useAxisStyle();
  return (
    <ChartCard
      title="Weekly Active Users & Sessions"
      subtitle={`${data.length} weeks`}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          barCategoryGap={16}
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
            tickFormatter={weekLabel}
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
            dataKey="wau"
            name="WAU"
            fill={chartPalette.violet}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="sessions"
            name="Sessions"
            fill={chartPalette.teal}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function weekLabel(iso: string): string {
  return `w/${iso.slice(5)}`;
}
