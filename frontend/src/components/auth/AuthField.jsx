import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function AuthField({ id, label, icon: Icon, hint, className = '', type = 'text', ...props }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className={`auth-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className={`auth-input-wrap${Icon ? ' has-icon' : ''}${isPassword ? ' has-toggle' : ''}`}>
        {Icon && <Icon className="auth-input-icon" size={17} aria-hidden="true" />}
        <input id={id} type={isPassword && visible ? 'text' : type} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
        {isPassword && <button type="button" className="auth-password-toggle" onClick={() => setVisible(!visible)} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
      </div>
      {hint && <p className="auth-field-hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}
