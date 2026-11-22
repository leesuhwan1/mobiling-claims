import { useEffect, useState } from 'react'
import { supabase, won, toInt, clean } from '../lib'
import { useToast } from '../ui'
import { useAuth } from '../App'

const CONF = {
  insurers: { title: '보험사', cols: [['name', '보험사명', true], ['contact_name', '담당자'], ['phone', '연락처'], ['email', '이메일'], ['memo', '메모']] },
  repair_shops: { title: '정비공장', cols: [['name', '공장명', true], ['biz_no', '사업자번호'], ['owner_name', '대표자'], ['phone', '연락처'], ['address', '주소'], ['labor_rate', '시간당 공임(원)', false, 'num'], ['memo', '메모']] },
}

export default function Masters() {
  const [tab, setTab] = useState('repair_shops')
  const [toast, toastEl] = useToast()
  return (
    <div>
      {toastEl}
      <h2>보험사·정비공장</h2>
      <div className="tabs">
        {Object.entries(CONF).map(([k, c]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{c.title}</button>)}
      </div>
      <MasterTable key={tab} table={tab} conf={CONF[tab]} toast={toast} />
    </div>
  )
}

function MasterTable({ table, conf, toast }) {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [edit, setEdit] = useState(null)
  const [q, setQ] = useState('')
  const load = () => supabase.from(table).select('*').order('name').then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [table])

  async function save(e) {
    e.preventDefault()
    const { id, created_at: _c, ...rest } = edit
    const payload = clean(rest)
    if ('labor_rate' in payload) payload.labor_rate = toInt(payload.labor_rate)
    const r = id ? await supabase.from(table).update(payload).eq('id', id) : await supabase.from(table).insert(payload)
    if (r.error) return toast(r.error.code === '23505' ? '이미 등록된 이름입니다' : r.error.message)
    setEdit(null); load(); toast('저장되었습니다')
  }
  async function del(row) {
    if (!confirm(`${row.name}을(를) 삭제할까요?`)) return
    const r = await supabase.from(table).delete().eq('id', row.id)
    if (r.error) return toast(r.error.code === '23503' ? '사건에서 사용 중이라 삭제할 수 없습니다' : r.error.message)
    load()
  }

  const shown = rows.filter((r) => !q || conf.cols.some(([k]) => String(r[k] ?? '').includes(q)))
  return (
    <div className="card">
      <div className="head">
        <input placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
        <button onClick={() => setEdit(Object.fromEntries(conf.cols.map(([k]) => [k, ''])))}>+ {conf.title} 등록</button>
      </div>
      {edit && (
        <form className="subform" onSubmit={save}>
          <div className="form">
            {conf.cols.map(([k, l, req]) => (
              <label key={k}>{l}<input required={req} value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></label>
            ))}
          </div>
          <button className="primary">저장</button> <button type="button" onClick={() => setEdit(null)}>취소</button>
        </form>
      )}
      <table>
        <thead><tr>{conf.cols.map(([k, l]) => <th key={k}>{l}</th>)}<th></th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              {conf.cols.map(([k, , , t]) => <td key={k} className={t}>{t === 'num' ? won(r[k]) : r[k] || '-'}</td>)}
              <td className="nowrap">
                <button className="link" onClick={() => setEdit({ ...r })}>수정</button>
                {isAdmin && <button className="link danger" onClick={() => del(r)}>삭제</button>}
              </td>
            </tr>
          ))}
          {shown.length === 0 && <tr><td colSpan={conf.cols.length + 1} className="muted">등록된 {conf.title}이(가) 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
