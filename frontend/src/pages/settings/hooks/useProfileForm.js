import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { authService } from '../../../services';

/** Name, bio and avatar colour, hydrated from `user`. */
export default function useProfileForm(user, setUser) {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarColor, setAvatarColor] = useState('accent');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setBio(user.bio || '');
      setAvatarColor(user.avatarColor || 'accent');
    }
  }, [user]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await authService.updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        avatarColor,
      });
      setUser(res.user);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  return { name, setName, bio, setBio, avatarColor, setAvatarColor, isSavingProfile, handleSaveProfile };
}
