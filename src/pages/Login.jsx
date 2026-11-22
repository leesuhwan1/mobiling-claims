import { useState } from 'react'
import { supabase } from '../lib'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [f, setF] = useState({ email: '', password: '', name: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const on = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password })
      if (error) setMsg(error.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 올바르지 않습니다.' : error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: f.email, password: f.password,
        options: { data: { name: f.name }, emailRedirectTo: window.location.origin },
      })
      if (error) setMsg(error.message)
      else if (!data.session) setMsg('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요.')
    }
    setBusy(false)
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h1>모빌링손해사정</h1>
        <p className="muted">차량 손해사정 업무시스템</p>
        {mode === 'signup' && (
          <label>이름<input required value={f.name} onChange={on('name')} /></label>
        )}
        <label>이메일<input type="email" required value={f.email} onChange={on('email')} /></label>
        <label>비밀번호<input type="password" required minLength={6} value={f.password} onChange={on('password')} /></label>
        {msg && <p className="msg">{msg}</p>}
        <button className="primary" disabled={busy}>{mode === 'login' ? '로그인' : '가입하기'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg('') }}>
          {mode === 'login' ? '계정이 없으신가요? 가입' : '로그인으로 돌아가기'}
        </button>
        {mode === 'signup' && <p className="muted small">첫 번째 가입자는 관리자 권한을 갖습니다.</p>}
      </form>
    </div>
  )
}
