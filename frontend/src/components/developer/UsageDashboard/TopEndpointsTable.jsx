const METHOD_COLORS = {
  GET: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  POST: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  PATCH: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  DELETE: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const TopEndpointsTable = ({ endpoints }) => {
  if (endpoints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-700 py-10 text-center">
        <p className="text-sm font-medium text-paper-300">No endpoint activity yet</p>
        <p className="mt-0.5 text-xs text-paper-500">Your most-called endpoints will be ranked here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-ink-700 bg-ink-950/60 font-semibold uppercase tracking-wider text-paper-400">
            <th className="px-4 py-3">Method</th>
            <th className="px-4 py-3">Endpoint</th>
            <th className="px-4 py-3 text-right">Requests</th>
            <th className="px-4 py-3 text-right">Errors</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800">
          {endpoints.map(({ method, endpoint, count, errorCount }) => (
            <tr key={`${method} ${endpoint}`} className="transition-colors hover:bg-ink-800/40">
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    METHOD_COLORS[method] || 'border-ink-700 bg-ink-800 text-paper-300'
                  }`}
                >
                  {method}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-paper-200 break-all">{endpoint}</td>
              <td className="px-4 py-3 text-right font-mono text-paper-100">{count.toLocaleString()}</td>
              <td className={`px-4 py-3 text-right font-mono ${errorCount > 0 ? 'text-rose-400' : 'text-paper-500'}`}>
                {errorCount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TopEndpointsTable;
