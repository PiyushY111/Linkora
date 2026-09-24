import { useState } from 'react';
import toast from 'react-hot-toast';
import { authService, analyticsService } from '../../../services';

/** Account JSON export, analytics CSV export, and account deletion. */
export default function useAccountData({ confirm, user, logout }) {
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Export Account Data (JSON)
  const handleExportJson = async () => {
    setIsExportingJson(true);
    try {
      const data = await authService.exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `linkora-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Account JSON archive exported');
    } catch {
      toast.error('Failed to export account data');
    } finally {
      setIsExportingJson(false);
    }
  };

  // Export Analytics (CSV)
  const handleExportCsv = async () => {
    setIsExportingCsv(true);
    try {
      const blobData = await analyticsService.exportAnalytics();
      const url = window.URL.createObjectURL(new Blob([blobData]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `linkora-clicks-stream-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Analytics CSV export downloaded');
    } catch {
      toast.error('Failed to export analytics CSV');
    } finally {
      setIsExportingCsv(false);
    }
  };

  // Delete Account Handler
  const handleDeleteAccount = async () => {
    const confirmed = await confirm({
      title: 'Permanently Delete Your Account',
      message:
        'This action is irreversible. All of your short links, redirect configurations, webhooks, and analytics history will be permanently deleted from our servers.',
      confirmText: 'Delete Everything Permanently',
      cancelText: 'Keep My Account',
      variant: 'danger',
      detail: `Account: ${user?.email}`,
    });
    if (!confirmed) return;

    setIsDeletingAccount(true);
    try {
      await authService.deleteAccount();
      toast.success('Account deleted successfully');
      logout();
      window.location.href = '/register';
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete account');
      setIsDeletingAccount(false);
    }
  };

  return { isExportingJson, isExportingCsv, isDeletingAccount, handleExportJson, handleExportCsv, handleDeleteAccount };
}
