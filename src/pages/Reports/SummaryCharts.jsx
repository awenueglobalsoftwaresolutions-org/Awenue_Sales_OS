import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtDateTimeTz } from '../../lib/tz'

const C = { brand: '#5b5bd6', green: '#10b981', red: '#f87171', amber: '#f59e0b' }
const TOOLTIP_STYLE = {
  borderRadius: '12px',
  border: '1px solid #eceef3',
  boxShadow: '0 8px 24px -6px rgba(20,22,31,.12)',
  fontSize: '12px',
  padding: '8px 12px',
}

const WRAP = ({ title, children }) => (
  <section className="surface-card p-5">
    <h3 className="mb-3 text-sm font-semibold text-ink-900">{title}</h3>
    <div className="h-52">{children}</div>
  </section>
)

export default function SummaryCharts({ summary, tz }) {
  const days = (summary.by_day || []).slice(-31).map((d) => ({ name: d.day.slice(5), count: d.count }))
  const mods = (summary.by_module || []).slice(0, 10).map((m) => ({ name: m.module, count: m.count }))
  const hours = (summary.by_hour || []).map((h) => ({ name: `${h.hour}h`, count: h.count }))
  const statusData = [{ name: 'Success', value: summary.success || 0 }, { name: 'Failed', value: summary.failed || 0 }].filter((x) => x.value)
  const auth = (summary.auth_history || []).slice(0, 50)
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <WRAP title="Daily activity (last 31 days)">
        <ResponsiveContainer>
          <BarChart data={days} margin={{ bottom: 16 }}>
            <defs>
              <linearGradient id="auditDayGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5b5bd6" stopOpacity={1} />
                <stop offset="100%" stopColor="#818cf8" stopOpacity={0.75} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceef3" />
            <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} stroke="#6b7185" />
            <YAxis allowDecimals={false} fontSize={10} width={28} axisLine={false} tickLine={false} stroke="#6b7185" />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f6f7fa' }} />
            <Bar dataKey="count" fill="url(#auditDayGrad)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </WRAP>

      <WRAP title="Activity by module">
        <ResponsiveContainer>
          <BarChart data={mods} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eceef3" />
            <XAxis type="number" allowDecimals={false} fontSize={10} axisLine={false} tickLine={false} stroke="#6b7185" />
            <YAxis type="category" dataKey="name" width={80} fontSize={10} axisLine={false} tickLine={false} stroke="#3b4050" />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f6f7fa' }} />
            <Bar dataKey="count" fill={C.green} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </WRAP>

      <WRAP title="Activity by hour of day">
        <ResponsiveContainer>
          <BarChart data={hours} margin={{ bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceef3" />
            <XAxis dataKey="name" fontSize={9} interval={1} axisLine={false} tickLine={false} stroke="#6b7185" />
            <YAxis allowDecimals={false} fontSize={10} width={28} axisLine={false} tickLine={false} stroke="#6b7185" />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f6f7fa' }} />
            <Bar dataKey="count" fill={C.amber} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </WRAP>

      <WRAP title="Success vs failed">
        {statusData.length ? (
          <ResponsiveContainer>
            <PieChart>
              <Pie data={statusData} dataKey="value" innerRadius={42} outerRadius={72} paddingAngle={3} stroke="none">
                {statusData.map((e, i) => <Cell key={e.name} fill={[C.green, C.red][i]} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        ) : <p className="grid h-full place-items-center text-sm text-ink-500">No data yet</p>}
      </WRAP>

      <WRAP title="Recent sign-ins and logouts">
        <div className="h-full overflow-y-auto">
          {auth.length ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-ink-500">
                <tr><th className="pb-1.5 text-left">Time</th><th className="pb-1.5 text-left">Action</th><th className="pb-1.5 text-left">IP</th><th className="pb-1.5 text-left">Location</th></tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {auth.map((a, i) => (
                  <tr key={i}>
                    <td className="py-1.5">{fmtDateTimeTz(a.created_at, tz)}</td>
                    <td className={a.action === 'login_failed' ? 'font-medium text-red-600' : ''}>{a.action === 'login_failed' ? 'Failed' : a.action === 'logout' ? 'Logout' : 'Login'}</td>
                    <td className="font-mono text-ink-600">{a.ip_address || '—'}</td>
                    <td className="text-ink-600">{[a.city, a.country].filter(Boolean).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="grid h-full place-items-center text-sm text-ink-500">No sign-in history yet</p>}
        </div>
      </WRAP>
    </div>
  )
}
