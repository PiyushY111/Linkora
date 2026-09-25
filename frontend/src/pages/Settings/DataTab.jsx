import { AlertTriangle, Download, Trash2, FileSpreadsheet } from 'lucide-react';
import SettingsTabPanel from './SettingsTabPanel';

function ExportCard({ icon, title, description, buttonIcon, buttonLabel, busyLabel, isBusy, onClick }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-950 p-5 flex flex-col justify-between">
      <div>
        <div className="text-sm font-semibold text-paper-100 flex items-center gap-2">
          {icon}
          <span>{title}</span>
        </div>
        <p className="mt-1 text-xs text-paper-400 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="btn-secondary btn-sm mt-4 self-start flex items-center gap-1.5"
        disabled={isBusy}
      >
        {buttonIcon}
        <span>{isBusy ? busyLabel : buttonLabel}</span>
      </button>
    </div>
  );
}

export default function DataTab({ account }) {
  const { isExportingJson, isExportingCsv, isDeletingAccount, handleExportJson, handleExportCsv, openDeleteModal } =
    account;

  return (
    <SettingsTabPanel>
      {/* Data Export Card */}
      <div className="panel p-6">
        <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
          <Download size={18} className="text-accent-400" />
          <span>Export Personal Data</span>
        </h2>
        <p className="mt-1 text-xs text-paper-500">
          Download your account records, shortened URLs, and click streams for backup or offline analysis.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* JSON Export */}
          <ExportCard
            icon={<Download size={16} className="text-accent-400" />}
            title="Account Archive (JSON)"
            description="Contains your profile settings, all short links with destinations, tags, webhooks, and active API keys."
            buttonIcon={<Download size={13} />}
            buttonLabel="Download JSON Archive"
            busyLabel="Preparing..."
            isBusy={isExportingJson}
            onClick={handleExportJson}
          />

          {/* CSV Analytics Export */}
          <ExportCard
            icon={<FileSpreadsheet size={16} className="text-emerald-400" />}
            title="Raw Click Telemetry (CSV)"
            description="Download individual click events including timestamps, referrers, device models, and geo country codes."
            buttonIcon={<FileSpreadsheet size={13} />}
            buttonLabel="Download CSV Stream"
            busyLabel="Exporting..."
            isBusy={isExportingCsv}
            onClick={handleExportCsv}
          />
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6">
        <h2 className="text-base font-semibold text-rose-400 flex items-center gap-2">
          <AlertTriangle size={18} />
          <span>Danger Zone</span>
        </h2>
        <p className="mt-1 text-xs text-paper-400">Irreversible actions that affect your entire account and all shortened URLs.</p>

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-rose-500/20 pt-4">
          <div>
            <h3 className="text-sm font-semibold text-paper-100">Delete Account & Resources</h3>
            <p className="mt-0.5 text-xs text-paper-400">
              Permanently delete your profile and cascade delete all short links, webhooks, and API keys.
            </p>
          </div>
          <button
            type="button"
            onClick={openDeleteModal}
            className="btn bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40 text-xs px-4 py-2 self-start sm:self-center"
            disabled={isDeletingAccount}
          >
            <Trash2 size={14} className="mr-1" />
            <span>{isDeletingAccount ? 'Deleting...' : 'Delete Account'}</span>
          </button>
        </div>
      </div>
    </SettingsTabPanel>
  );
}
