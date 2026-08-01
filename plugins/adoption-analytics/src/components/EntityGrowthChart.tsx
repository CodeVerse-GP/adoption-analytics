import FormControl from '@material-ui/core/FormControl';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import { makeStyles } from '@material-ui/core/styles';
import type { EntityGrowthPoint } from '@codeverse-gp/plugin-adoption-analytics-common';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, chartPalette, useAxisStyle } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { analyticsColors, monoFont, uiFont } from './tokens';

const ALL_KINDS = '__all__';

// Rotation used when a kind/type doesn't have a preset color.
const PALETTE = [
  chartPalette.blue,
  chartPalette.teal,
  chartPalette.violet,
  chartPalette.amber,
  chartPalette.red,
  '#64748B',
  '#EC4899',
  '#22C55E',
] as const;

// Preferred colors for well-known kinds so the growth chart stays in
// sync with the "Entities by Kind" panel below it.
const KIND_COLORS: Record<string, string> = {
  Component: chartPalette.blue,
  API: chartPalette.teal,
  System: chartPalette.violet,
  Resource: chartPalette.amber,
  Group: chartPalette.red,
  User: '#64748B',
};

const useStyles = makeStyles(theme => ({
  select: {
    fontFamily: uiFont,
    fontSize: 12,
    color: analyticsColors(theme).text,
    minWidth: 140,
    '& .MuiSelect-select': {
      padding: '4px 24px 4px 10px',
    },
  },
}));

type Props = {
  data: EntityGrowthPoint[];
};

export function EntityGrowthChart({ data }: Props) {
  const classes = useStyles();
  const axisStyle = useAxisStyle();
  const [kindFilter, setKindFilter] = useState<string>(ALL_KINDS);

  const allKinds = useMemo(() => collectKinds(data), [data]);

  // When the filter changes the previously selected kind may no longer
  // exist in the current data (range switch). Fall back to `all` rather
  // than rendering an empty chart.
  const activeKind =
    kindFilter !== ALL_KINDS && allKinds.includes(kindFilter)
      ? kindFilter
      : ALL_KINDS;

  const { rows, series } = useMemo(
    () => buildSeries(data, allKinds, activeKind),
    [data, allKinds, activeKind],
  );

  // Recharts hides the line when there's only one point; force dots so
  // the very first snapshot is still visible right after startup.
  const showDots = data.length <= 1;

  const subtitle = `${data.length} snapshot${data.length === 1 ? '' : 's'}${
    activeKind === ALL_KINDS ? '' : ` · ${activeKind}`
  }`;

  return (
    <ChartCard
      title="Entity Catalog Growth"
      subtitle={subtitle}
      action={
        <FormControl>
          <Select
            className={classes.select}
            disableUnderline
            value={activeKind}
            onChange={e => setKindFilter(String(e.target.value))}
          >
            <MenuItem value={ALL_KINDS}>All kinds</MenuItem>
            {allKinds.map(kind => (
              <MenuItem key={kind} value={kind}>
                {kind}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      }
    >
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={rows}
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
          <Tooltip content={<ChartTooltip />} />
          <Legend
            wrapperStyle={{ fontFamily: monoFont, fontSize: 11 }}
            iconType="square"
          />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={showDots}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

type Series = { key: string; label: string; color?: string };

function buildSeries(
  data: EntityGrowthPoint[],
  allKinds: string[],
  activeKind: string,
): { rows: Array<Record<string, number | string>>; series: Series[] } {
  if (activeKind === ALL_KINDS) {
    // One line per kind (existing behaviour).
    const series: Series[] = allKinds.map(kind => ({
      key: kind,
      label: kind,
      color: KIND_COLORS[kind],
    }));
    const rows = data.map(p => ({
      date: p.date,
      ...Object.fromEntries(allKinds.map(k => [k, p.counts[k] ?? 0])),
    }));
    return { rows, series };
  }

  // One line per type within the selected kind.
  const typeSet = new Set<string>();
  for (const p of data) {
    const typeMap = p.countsByType?.[activeKind];
    if (typeMap) {
      // `Object.keys` returns strings; trim so a stray whitespace-only
      // spec.type (e.g. `' '`) collapses into the unknown bucket rather
      // than producing a legend entry with an invisible label.
      for (const t of Object.keys(typeMap)) typeSet.add(t.trim());
    }
  }

  // Order deterministically (unknown last) so colours stay stable across renders.
  const allTypes = [...typeSet].sort((a, b) => {
    if (a === '') return 1;
    if (b === '') return -1;
    return a.localeCompare(b);
  });

  // Drop any type that is zero across every snapshot in the window —
  // otherwise we render legend entries and lines like "unknown 0" that
  // never carry any information. Also collapses whitespace variants of
  // the same type into one series via trim on lookup.
  const totalsPerType = new Map<string, number>(allTypes.map(t => [t, 0]));
  for (const p of data) {
    const typeMap = p.countsByType?.[activeKind] ?? {};
    for (const [rawKey, val] of Object.entries(typeMap)) {
      const key = rawKey.trim();
      totalsPerType.set(key, (totalsPerType.get(key) ?? 0) + val);
    }
  }
  const types = allTypes.filter(t => (totalsPerType.get(t) ?? 0) > 0);

  const series: Series[] = types.map(t => ({
    key: `type::${t}`,
    label: t || 'unknown',
  }));
  const rows = data.map(p => {
    const typeMap = p.countsByType?.[activeKind] ?? {};
    // Sum any whitespace variants into the trimmed key we render.
    const merged: Record<string, number> = {};
    for (const [rawKey, val] of Object.entries(typeMap)) {
      const key = rawKey.trim();
      merged[key] = (merged[key] ?? 0) + val;
    }
    return {
      date: p.date,
      ...Object.fromEntries(types.map(t => [`type::${t}`, merged[t] ?? 0])),
    };
  });
  return { rows, series };
}

function collectKinds(data: EntityGrowthPoint[]): string[] {
  const seen = new Set<string>();
  for (const point of data) {
    for (const kind of Object.keys(point.counts)) {
      seen.add(kind);
    }
  }
  return [...seen].sort();
}

function compactDate(iso: string): string {
  return iso.slice(5);
}
