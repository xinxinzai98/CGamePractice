import { useState, type FormEvent } from 'react';
import type { ApiClient } from '../services/api';

export function PasswordForm({ onApi, onSuccess }: { onApi: ApiClient; onSuccess: () => void }) {
  const [open, setOpen] = useState(false),
    [currentPassword, setCurrentPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onApi('password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setOpen(false);
      onSuccess();
    } catch (error) {
      setError(error instanceof Error ? error.message : '修改密码失败');
    } finally {
      setBusy(false);
    }
  }
  if (!open) return <button onClick={() => setOpen(true)}>修改密码</button>;
  return (
    <form onSubmit={submit} aria-label="修改密码">
      <label>
        当前密码
        <input
          type="password"
          autoComplete="current-password"
          minLength={8}
          maxLength={72}
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </label>
      <label>
        新密码
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </label>
      <p className="muted">保存后，其他设备需使用新密码重新登录。</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? '正在保存…' : '保存新密码'}
      </button>
      <button type="button" disabled={busy} onClick={() => setOpen(false)}>
        取消
      </button>
    </form>
  );
}
