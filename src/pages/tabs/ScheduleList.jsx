import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, SCHEDULE_KINDS, fmtDateTime, fromLocalInput, clean } from '../../lib'
import { Field, Select } from '../../ui'
import { useAuth } from '../../App'

// claimId 가 있으면 해당 사건 일정만, 없으면 전체 일정 (filter: 'mine' | 'all', range)
export default function ScheduleList({ claimId, refs, toast, mineOnly, from, to, showDone = true }) {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(null)

  const load = () => {
    let q = supabase.from('schedules').select('*, claims(claim_no), profiles:profiles!schedules_adjuster_id_fkey(name)').order('scheduled_at')
    if (claimId) q = q.eq('claim_id', claimId)
    if (mineOnly) q = q.eq('adjuster_id', profile?.id)
    if (from) q = q.gte('scheduled_at', from)
    if (to) q = q.lt('scheduled_at', to)
    if (!showDone) q = q.eq('done', false)
    q.then(({ data }) => setRows(data || []))
  }
  useEffect(() => { load() }, [claimId, mineOnly, from, to, showDone])

  async function save(e) {
    e.preventDefault()
    const payload = clean({ ...form, claim_id: claimId || form.claim_id || null, scheduled_at: fromLocalInput(form.scheduled_at) })
    const r = await supabase.from('schedules').insert(payload)
    if (r.error) return toast(r.error.message)
    setForm(null); load(); toast('일정이 등록되었습니다')
  }
  async function toggle(s) {
    await supabase.from('schedules').update({ done: !s.done }).eq('id', s.id); load()
  }
  async function del(s) {
    if (!confirm('일정을 삭제할까요?')) return
    const r = await supabase.from('schedules').delete().eq('id', s.id)
    if (r.error) return toast(r.error.message)
    load()
  }

  return (
    <div className="card">
      <div className="head">
        <h3>일정</h3>
        <button onClick={() => setForm({ kind: '현장조사', scheduled_at: '', adjuster_id: profile?.id || '', location: '', memo: '', claim_id: '' })}>+ 일정 등록</button>
      </div>
      {form && (
        <form className="subform" onSubmit={save}>
          <div className="form">
            <Field label="구분"><Select value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={SCHEDULE_KINDS} empty={false} /></Field>
            <Field label="일시"><input required type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></Field>
            <Field label="담당자"><Select value={form.adjuster_id} onChange={(v) => setForm({ ...form, adjuster_id: v })} options={refs.users.map((u) => ({ value: u.id, label: u.name }))} /></Field>
            {!claimId && <ClaimPicker value={form.claim_id} onChange={(v) => setForm({ ...form, claim_id: v })} />}
            <Field label="장소"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
            <Field label="메모" wide><input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></Field>
          </div>
          <button className="primary">등록</button> <button type="button" onClick={() => setForm(null)}>취소</button>
        </form>
      )}
      <table>
        <thead><tr><th>완료</th><th>일시</th><th>구분</th>{!claimId && <th>사건</th>}<th>담당</th><th>장소</th><th>메모</th><th></th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className={s.done ? 'done' : ''}>
              <td><input type="checkbox" checked={s.done} onChange={() => toggle(s)} /></td>
              <td className="nowrap">{fmtDateTime(s.scheduled_at)}</td>
              <td><span className="tag">{s.kind}</span></td>
              {!claimId && <td>{s.claim_id ? <Link to={`/claims/${s.claim_id}`}>{s.claims?.claim_no}</Link> : '-'}</td>}
              <td>{s.profiles?.name || '-'}</td><td>{s.location || '-'}</td><td>{s.memo || ''}</td>
              <td><button className="link danger" onClick={() => del(s)}>삭제</button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">일정이 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function ClaimPicker({ value, onChange }) {
  const [opts, setOpts] = useState([])
  useEffect(() => {
    supabase.from('claims').select('id, claim_no, insured_name, victim_name').not('status', 'in', '("종결","취소")').order('id', { ascending: false }).limit(300)
      .then(({ data }) => setOpts(data || []))
  }, [])
  return (
    <Field label="사건">
      <Select value={value} onChange={onChange} empty="사건 없음"
        options={opts.map((c) => ({ value: c.id, label: `${c.claim_no} ${c.victim_name || c.insured_name || ''}` }))} />
    </Field>
  )
}
