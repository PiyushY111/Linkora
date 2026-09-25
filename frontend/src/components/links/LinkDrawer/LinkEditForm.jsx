import { Save } from 'lucide-react';
import EditBasicsFields from './EditBasicsFields';
import EditAccessControls from './EditAccessControls';
import EditRoutingFields from './EditRoutingFields';

export default function LinkEditForm({ link, edit, isUpdating, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-2">
      <EditBasicsFields edit={edit} />
      <EditAccessControls link={link} edit={edit} />
      <EditRoutingFields edit={edit} />

      <button type="submit" disabled={isUpdating} className="btn-primary btn-sm w-full mt-2">
        <Save size={13} />
        <span>Save Changes</span>
      </button>
    </form>
  );
}
