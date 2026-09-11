import { appUrl } from '../app-url';
import { useState, type FormEvent } from 'react';
import type { ApiClient } from '../services/api';
export function AuthModal({
  onSuccess,
  onApi,
  onClose,
  onPractice,
}: {
  onSuccess: () => void;
  onApi: ApiClient;
  onClose: () => void;
  onPractice: () => void;
}) {
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onApi(register ? 'register' : 'login', { username, password });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-shade">
      <section role="dialog" aria-modal="true" aria-labelledby="auth-title" className="auth-card">
        <button className="modal-close" onClick={onClose} aria-label="关闭登录">
          ×
        </button>
        <aside className="auth-art" aria-hidden="true">
          <img src={appUrl('/assets/pilot-asuka.png')} alt="" />
          <span>NERV / PERSONNEL DIVISION</span>
          <h2>
            人类的未来
            <br />
            在这里并肩。
          </h2>
          <small>01 / PILOT AUTHENTICATION</small>
        </aside>
        <span className="eyebrow">DAWN / PILOT AUTHENTICATION</span>
        <h1 id="auth-title">{register ? '建立驾驶员档案' : '欢迎归队'}</h1>
        <div className="auth-tabs">
          <button className={!register ? 'active' : ''} onClick={() => setRegister(false)}>
            登录
          </button>
          <button className={register ? 'active' : ''} onClick={() => setRegister(true)}>
            注册
          </button>
        </div>
        <form onSubmit={submit}>
          <label>
            驾驶员代号
            <input
              autoFocus
              autoComplete="username"
              minLength={3}
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="输入你的代号"
            />
          </label>
          <label>
            密码
            <input
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="至少 8 位"
            />
          </label>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button className="primary" disabled={busy}>
            {busy ? '正在建立连接…' : register ? '创建档案并进入' : '连接档案'}
          </button>
        </form>
        <button className="text-button" onClick={onPractice}>
          暂不登录，进入模拟训练
        </button>
      </section>
    </div>
  );
}
