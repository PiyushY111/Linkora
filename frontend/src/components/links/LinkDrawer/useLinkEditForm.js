import { useState, useEffect } from 'react';
import { EMPTY_EDIT_FORM, formFromLink } from './linkDrawerHelpers';

/**
 * Edit-form state for the link drawer, reset whenever a different link is
 * shown. `tagInput` is deliberately not part of that reset.
 */
export default function useLinkEditForm(link) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_EDIT_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (link) {
      setForm(formFromLink(link));
      setShowPassword(false);
      setIsEditing(false);
    }
  }, [link]);

  const update = (changes) => setForm((prev) => ({ ...prev, ...changes }));
  const setField = (name, value) => update({ [name]: value });

  const handleAddTag = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.trim().replace(/^,+|,+$/g, '');
      if (val && !form.tags.includes(val)) {
        setField('tags', [...form.tags, val]);
        setTagInput('');
      }
    }
  };

  return {
    isEditing,
    setIsEditing,
    form,
    setField,
    showPassword,
    setShowPassword,
    tagInput,
    setTagInput,
    handleAddTag,
    removeTag: (t) => setField('tags', form.tags.filter((item) => item !== t)),
    removeMaxClicks: () => update({ removeMaxClicks: true, enableMaxClicks: false }),
    undoRemoveMaxClicks: () => update({ removeMaxClicks: false, enableMaxClicks: true }),
    toggleMaxClicks: () =>
      setForm((prev) => {
        const next = !prev.enableMaxClicks;
        return { ...prev, enableMaxClicks: next, maxClicks: next && !prev.maxClicks ? '50' : prev.maxClicks };
      }),
    removeExpiry: () => update({ removeExpiryDate: true, expiryDate: '' }),
    /** After a successful save: leave edit mode and clear the one-shot fields. */
    finishSave: () => {
      setIsEditing(false);
      update({ newPassword: '', removePassword: false, removeMaxClicks: false, removeExpiryDate: false });
    },
  };
}
