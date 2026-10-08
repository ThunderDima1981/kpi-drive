import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatPercent, peopleLabel, zoneOf, ZONES, type ZoneKey } from '../lib/format.ts'

const tick = { fill: '#5c6b82', fontSize: 12 }
const tooltipStyle = {
  background: '#fffcf7',
  border: '1px solid #e3d9c8',
  borderRadius: 12,
  fontSize: 13,
  color: '#172033',
}

export function ZoneChart({ counts, teamSize }: { counts: Record<ZoneKey, number>; teamSize: number }) {
  const data = (Object.keys(ZONES) as ZoneKey[]).map((key) => ({
    key,
    label: ZONES[key].range,
    count: counts[key],
    color: ZONES[key].color,
  }))

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e3d9c8" />
          <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
          <YAxis
            allowDecimals={false}
            domain={[0, Math.max(teamSize, 1)]}
            tick={tick}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ fill: 'rgba(23,32,51,0.04)' }}
            contentStyle={tooltipStyle}
            formatter={(value) => [peopleLabel(Number(value)), 'В зоне']}
          />
          <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={52}>
            {data.map((item) => (
              <Cell key={item.key} fill={item.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TeamKrChart({ rows }: { rows: { id: string; name: string; kr: number }[] }) {
  return (
    <div style={{ height: Math.max(220, rows.length * 52) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="#e3d9c8" />
          <XAxis type="number" domain={[0, 130]} tick={tick} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={118}
            tick={{ fill: '#172033', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine x={80} stroke="#b45309" strokeDasharray="4 4" />
          <ReferenceLine x={100} stroke="#157a4b" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ fill: 'rgba(23,32,51,0.04)' }}
            contentStyle={tooltipStyle}
            formatter={(value) => [formatPercent(Number(value)), 'КР']}
          />
          <Bar dataKey="kr" radius={[0, 8, 8, 0]} barSize={14}>
            {rows.map((row) => (
              <Cell key={row.id} fill={ZONES[zoneOf(row.kr)].color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
