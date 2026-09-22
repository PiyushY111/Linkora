const StatCard = ({ label, value, icon: Icon, accent = false }) => (
  <div className="panel p-5">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-paper-500">{label}</p>
        <p className={`mt-2 text-3xl font-bold tabular-nums ${accent ? 'text-accent-400' : 'text-paper-100'}`}>
          {value}
        </p>
      </div>
      {Icon && (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-800 ring-1 ring-ink-600">
          <Icon size={17} className="text-paper-300" />
        </div>
      )}
    </div>
  </div>
);

export default StatCard;
