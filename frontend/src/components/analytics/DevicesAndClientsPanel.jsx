import { useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Laptop,
  Smartphone,
  Tablet,
  Monitor,
  Chrome,
  Globe,
  Cpu,
} from 'lucide-react';

const PALETTE = ['#C6FF3D', '#6E9BFF', '#FFB84D', '#A78BFA', '#34D399', '#F472B6'];

const DeviceIcon = ({ type }) => {
  const t = (type || '').toLowerCase();
  if (t === 'mobile') return <Smartphone size={14} className="text-paper-300" />;
  if (t === 'tablet') return <Tablet size={14} className="text-paper-300" />;
  if (t === 'desktop') return <Laptop size={14} className="text-paper-300" />;
  return <Monitor size={14} className="text-paper-300" />;
};

const CustomPieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-850 px-3 py-1.5 shadow-xl text-xs backdrop-blur-md">
      <span className="font-semibold text-paper-200 capitalize">{data.name}</span>
      <span className="font-mono ml-2 font-bold text-accent-400">
        {data.value.toLocaleString()} clicks
      </span>
    </div>
  );
};

export default function DevicesAndClientsPanel({
  devices = [],
  operatingSystems = [],
  browsers = [],
  totalClicks = 0,
}) {
  const [activeTab, setActiveTab] = useState('devices'); // 'devices' | 'os' | 'browsers'

  const activeList = useMemo(() => {
    if (activeTab === 'devices') return devices || [];
    if (activeTab === 'os') return operatingSystems || [];
    return browsers || [];
  }, [activeTab, devices, operatingSystems, browsers]);

  const maxClicks = useMemo(() => {
    if (!activeList || activeList.length === 0) return 1;
    return Math.max(...activeList.map((i) => i.clicks), 1);
  }, [activeList]);

  // Donut chart data for devices
  const pieData = useMemo(() => {
    if (!devices || devices.length === 0) return [];
    return devices.map((d) => ({
      name: d.device || 'Other',
      value: d.clicks,
    }));
  }, [devices]);

  return (
    <div className="panel p-5 flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/60 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Monitor size={16} className="text-accent-400" />
            <h3 className="text-sm font-semibold tracking-tight text-paper-100">
              Clients & Devices
            </h3>
          </div>

          <div className="inline-flex rounded-lg bg-ink-800 p-0.5 border border-ink-700 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('devices')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'devices'
                  ? 'bg-accent-400 text-ink-950 font-semibold shadow-sm'
                  : 'text-paper-400 hover:text-paper-200'
              }`}
            >
              Devices
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('os')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'os'
                  ? 'bg-accent-400 text-ink-950 font-semibold shadow-sm'
                  : 'text-paper-400 hover:text-paper-200'
              }`}
            >
              OS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('browsers')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'browsers'
                  ? 'bg-accent-400 text-ink-950 font-semibold shadow-sm'
                  : 'text-paper-400 hover:text-paper-200'
              }`}
            >
              Browsers
            </button>
          </div>
        </div>

        {(!activeList || activeList.length === 0) ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-paper-500 ring-1 ring-ink-700 mb-2">
              <Cpu size={18} />
            </div>
            <p className="text-xs font-medium text-paper-300">No client data recorded</p>
            <p className="mt-1 text-[11px] text-paper-500">
              User-Agent headers will be parsed into device models and engines.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeTab === 'devices' && pieData.length > 0 && (
              <div className="flex items-center justify-center h-28 w-full mb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<CustomPieTooltip />} />
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={32}
                      outerRadius={50}
                      paddingAngle={3}
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={index}
                          fill={PALETTE[index % PALETTE.length]}
                          stroke="#18181B"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="space-y-3">
              {activeList.slice(0, 6).map((item, idx) => {
                const label = item.device || item.os || item.browser || 'Unknown';
                const barWidth = Math.max(Math.round((item.clicks / maxClicks) * 100), 4);
                const percentage = totalClicks > 0 ? Math.round((item.clicks / totalClicks) * 100) : 0;
                const dotColor = PALETTE[idx % PALETTE.length];

                return (
                  <div key={idx} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        {activeTab === 'devices' ? (
                          <DeviceIcon type={label} />
                        ) : activeTab === 'browsers' ? (
                          <Chrome size={13} className="text-paper-400" />
                        ) : (
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: dotColor }}
                          />
                        )}
                        <span className="truncate font-medium capitalize text-paper-200 group-hover:text-paper-100 transition-colors">
                          {label}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-xs font-semibold text-paper-100 tabular-nums">
                          {item.clicks.toLocaleString()}
                        </span>
                        <span className="font-mono text-[11px] text-paper-500 w-8 text-right tabular-nums">
                          {percentage}%
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 w-full rounded-full bg-ink-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${barWidth}%`, backgroundColor: dotColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
