import { useEffect, useState } from 'react'
import { supabase, ROLES, fmtDate } from '../lib'
import { useToast } from '../ui'
import { useAuth } from '../App'

export default function Users() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [toast, toastEl] = useToast()
  const load = () => supabase.from('profiles').select('*').order('created_at').then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])

  async function update(id, patch) {
    const r = await supabase.from('profiles').update(patch).eq('id', id)
    if (r.error) return toast(r.error.message)
    toast('변경되었습니다'); load()
  }

  return (
    <div>
      {toastEl}
      <h2>사용자 관리</h2>
      <p className="muted">새 직원은 로그인 화면에서 직접 가입한 뒤, 여기서 권한을 지정합니다.</p>
      <div className="card">
        <table>
          <thead><tr><th>이름</th><th>이메일</th><th>연락처</th><th>손해사정사 등록번호</th><th>권한</th><th>사용</th><th>가입일</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><input defaultValue={u.name} onBlur={(e) => e.target.value !== u.name && update(u.id, { name: e.target.value })} /></td>
                <td>{u.email}</td>
                <td><input defaultValue={u.phone || ''} onBlur={(e) => e.target.value !== (u.phone || '') && update(u.id, { phone: e.target.value || null })} /></td>
                <td><input defaultValue={u.license_no || ''} onBlur={(e) => e.target.value !== (u.license_no || '') && update(u.id, { license_no: e.target.value || null })} /></td>
                <td>
                  <select value={u.role} disabled={u.id === profile.id} onChange={(e) => update(u.id, { role: e.target.value })}>
                    {Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
                <td><input type="checkbox" checked={u.active} disabled={u.id === profile.id} onChange={(e) => update(u.id, { active: e.target.checked })} /></td>
                <td>{fmtDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
