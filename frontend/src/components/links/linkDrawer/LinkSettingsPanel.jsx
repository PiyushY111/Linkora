import { Save } from 'lucide-react';
import EditBasicsFields from './EditBasicsFields';
import PasswordSetting from './PasswordSetting';
import ClickLimitSetting from './ClickLimitSetting';
import ExpirySetting from './ExpirySetting';
import RoutingFields from './RoutingFields';
import LinkSettingsSummary from './LinkSettingsSummary';

/** The settings card: a read-only summary, or the edit form. */
export default function LinkSettingsPanel({ link, editor, isUpdating, isQuotaFull, isExpired }) {
  const { isEditing, setIsEditing, handleSaveEdit } = editor;

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-paper-400">
          Settings, Security & Routing
        </span>
        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="text-xs text-accent-400 hover:underline font-medium"
        >
          {isEditing ? 'Cancel' : 'Edit Details'}
        </button>
      </div>

      {isEditing ? (
        <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
          <EditBasicsFields editor={editor} />
          <PasswordSetting link={link} editor={editor} />
          <ClickLimitSetting link={link} editor={editor} />
          <ExpirySetting link={link} editor={editor} />
          <RoutingFields editor={editor} />

          <button
            type="submit"
            disabled={isUpdating}
            className="btn-primary btn-sm w-full mt-2"
          >
            <Save size={13} />
            <span>Save Changes</span>
          </button>
        </form>
      ) : (
        <LinkSettingsSummary link={link} isQuotaFull={isQuotaFull} isExpired={isExpired} />
      )}
    </div>
  );
}
