import { useEffect, useState } from 'react'
import { supabase, ROLES } from '../lib'
import { Field, useToast } from '../ui'
import { useAuth } from '../App'

export default function Settings() {
  const [toast, toastEl] = useToast()
  return (
    <div>
      {toastEl}
      <h2>설정</h2>
      <div className="grid2">
        <MyInfo toast={toast} />
        <Password toast={toast} />
      </div>
      <Company toast={toast} />
    </div>
  )
}

function MyInfo({ toast }) {
  const { profile, setProfile, session } = useAuth()
  const [f, setF] = useState({ name: profile?.name || '', phone: profile?.phone || '', license_no: profile?.license_no || '' })
  async function save(e) {
    e.preventDefault()
    if (!f.name.trim()) return toast('이름을 입력하세요')
    const patch = { name: f.name.trim(), phone: f.phone || null, license_no: f.license_no || null }
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', profile.id).select().single()
    if (error) return toast(error.message)
    setProfile(data); toast('내 정보가 저장되었습니다')
  }
  return (
    <form className="card" onSubmit={save}>
      <h3>내 정보</h3>
      <div className="form">
        <Field label="이메일"><input value={session.user.email} disabled /></Field>
        <Field label="권한"><input value={ROLES[profile?.role] || ''} disabled /></Field>
        <Field label="이름"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="연락처"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="손해사정사 등록번호" wide><input value={f.license_no} onChange={(e) => setF({ ...f, license_no: e.target.value })} placeholder="손해사정서 서명란에 표시됩니다" /></Field>
      </div>
      <button className="primary">저장</button>
    </form>
  )
}

function Password({ toast }) {
  const [p, setP] = useState({ a: '', b: '' })
  async function save(e) {
    e.preventDefault()
    if (p.a.length < 6) return toast('비밀번호는 6자 이상이어야 합니다')
    if (p.a !== p.b) return toast('두 비밀번호가 일치하지 않습니다')
    const { error } = await supabase.auth.updateUser({ password: p.a })
    if (error) return toast(error.message)
    setP({ a: '', b: '' }); toast('비밀번호가 변경되었습니다')
  }
  return (
    <form className="card" onSubmit={save}>
      <h3>비밀번호 변경</h3>
      <div className="form">
        <Field label="새 비밀번호"><input type="password" value={p.a} onChange={(e) => setP({ ...p, a: e.target.value })} /></Field>
        <Field label="새 비밀번호 확인"><input type="password" value={p.b} onChange={(e) => setP({ ...p, b: e.target.value })} /></Field>
      </div>
      <button className="primary">변경</button>
    </form>
  )
}

const COMPANY = [
  ['company_name', '회사명 (사정서 하단 표시)'], ['ceo_name', '대표자'], ['biz_no', '사업자등록번호'],
  ['phone', '대표 전화'], ['email', '대표 이메일'], ['address', '주소'],
]

function Company({ toast }) {
  const { isAdmin } = useAuth()
  const [f, setF] = useState(null)
  useEffect(() => {
    supabase.from('app_settings').select('*').eq('id', 1).single().then(({ data }) => setF(data))
  }, [])
  async function save(e) {
    e.preventDefault()
    if (!f.company_name?.trim()) return toast('회사명을 입력하세요')
    const { id: _i, updated_at: _u, ...rest } = f
    const patch = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]))
    patch.company_name = f.company_name.trim()
    patch.default_due_days = Number(f.default_due_days) || 0
    const { error } = await supabase.from('app_settings').update(patch).eq('id', 1)
    if (error) return toast(error.message)
    toast('회사 설정이 저장되었습니다')
  }
  if (!f) return null
  return (
    <form className="card" onSubmit={save}>
      <div className="head">
        <h3>회사 정보 · 업무 기본값</h3>
        {!isAdmin && <span className="muted small">관리자만 수정할 수 있습니다</span>}
      </div>
      <div className="form">
        {COMPANY.map(([k, l]) => (
          <Field key={k} label={l} wide={k === 'address'}>
            <input disabled={!isAdmin} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </Field>
        ))}
        <Field label="기본 처리기한 (접수일로부터 일수)">
          <input type="number" min="0" max="365" disabled={!isAdmin} value={f.default_due_days} onChange={(e) => setF({ ...f, default_due_days: e.target.value })} />
        </Field>
        <Field label="사정서 결문" wide>
          <input disabled={!isAdmin} value={f.report_footer || ''} onChange={(e) => setF({ ...f, report_footer: e.target.value })} />
        </Field>
      </div>
      {isAdmin && <button className="primary">저장</button>}
    </form>
  )
}
