import { useEffect, useState } from 'react'
import { supabase } from './lib'

const COLORS = {
  접수: '#64748b', 배정: '#2563eb', 현장조사: '#7c3aed', 견적검토: '#d97706',
  사정완료: '#059669', 보고서제출: '#0891b2', 종결: '#334155', 취소: '#b91c1c',
}
export const StatusBadge = ({ s }) => (
  <span className="badge" style={{ background: COLORS[s] || '#64748b' }}>{s}</span>
)

// 참조 데이터(보험사·정비공장·사용자) 공용 로더
export function useRefs() {
  const [refs, setRefs] = useState({ insurers: [], shops: [], users: [] })
  const load = () =>
    Promise.all([
      supabase.from('insurers').select('id,name').order('name'),
      supabase.from('repair_shops').select('id,name,labor_rate').order('name'),
      supabase.from('profiles').select('id,name,role,active').order('name'),
    ]).then(([a, b, c]) => setRefs({ insurers: a.data || [], shops: b.data || [], users: (c.data || []).filter((u) => u.active) }))
  useEffect(() => { load() }, [])
  return [refs, load]
}

export function Field({ label, children, wide }) {
  return <label className={wide ? 'wide' : ''}>{label}{children}</label>
}

export function Select({ value, onChange, options, empty = '선택' }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {empty !== false && <option value="">{empty}</option>}
      {options.map((o) =>
        typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
      )}
    </select>
  )
}

export function useToast() {
  const [t, setT] = useState('')
  const show = (m) => { setT(m); setTimeout(() => setT(''), 2500) }
  const el = t ? <div className="toast">{t}</div> : null
  return [show, el]
}
