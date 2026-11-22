import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase, STATUSES, COVERAGES, clean, toLocalInput, fromLocalInput, fmtDate, fmtDateTime } from '../lib'
import { Field, Select, StatusBadge, useRefs, useToast } from '../ui'
import { useAuth } from '../App'
import Vehicles from './tabs/Vehicles'
import Estimates from './tabs/Estimates'
import Assessment from './tabs/Assessment'
import ScheduleList from './tabs/ScheduleList'

const TABS = ['기본정보', '차량', '견적검토', '손해사정서', '일정', '처리이력']

export default function ClaimDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { isAdmin } = useAuth()
  const [refs, reloadRefs] = useRefs()
  const [claim, setClaim] = useState(null)
  const [tab, setTab] = useState('기본정보')
  const [toast, toastEl] = useToast()

  const load = useCallback(() =>
    supabase.from('claims').select('*, insurers(name), profiles:profiles!claims_assigned_to_fkey(name)').eq('id', id).single()
      .then(({ data }) => setClaim(data)), [id])
  useEffect(() => { load() }, [load])

  async function changeStatus(status) {
    const { error } = await supabase.from('claims').update({ status }).eq('id', id)
    if (error) return toast(error.message)
    toast(`상태가 '${status}'(으)로 변경되었습니다`); load()
  }
  async function remove() {
    if (!confirm('이 사건과 관련 차량·견적·사정서·일정이 모두 삭제됩니다. 삭제할까요?')) return
    const { error } = await supabase.from('claims').delete().eq('id', id)
    if (error) return toast(error.message)
    nav('/claims')
  }

  if (!claim) return <p className="muted">불러오는 중…</p>
  const idx = STATUSES.indexOf(claim.status)
  const next = idx >= 0 && idx < 6 ? STATUSES[idx + 1] : null

  return (
    <div>
      {toastEl}
      <div className="head">
        <div>
          <Link to="/claims" className="muted small">← 사건목록</Link>
          <h2>{claim.claim_no} <StatusBadge s={claim.status} /></h2>
          <p className="muted">{claim.insurers?.name || '보험사 미지정'} · {claim.coverage} · 담당 {claim.profiles?.name || '미배정'} · 접수 {fmtDate(claim.received_at)}</p>
        </div>
        <div className="actions">
          {next && <button className="primary" onClick={() => changeStatus(next)}>다음 단계: {next} →</button>}
          <Select value={claim.status} onChange={changeStatus} options={STATUSES} empty={false} />
          <Link className="btn" to={`/claims/${id}/report`} target="_blank">사정서 출력</Link>
          {isAdmin && <button className="danger" onClick={remove}>삭제</button>}
        </div>
      </div>
      <div className="tabs">
        {TABS.map((t) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === '기본정보' && <Info claim={claim} refs={refs} onSaved={() => { toast('저장되었습니다'); load() }} />}
      {tab === '차량' && <Vehicles claimId={id} refs={refs} toast={toast} />}
      {tab === '견적검토' && <Estimates claim={claim} refs={refs} toast={toast} reloadRefs={reloadRefs} />}
      {tab === '손해사정서' && <Assessment claim={claim} toast={toast} onStatus={load} />}
      {tab === '일정' && <ScheduleList claimId={id} refs={refs} toast={toast} />}
      {tab === '처리이력' && <History claimId={id} />}
    </div>
  )
}

const FIELDS = ['insurer_id', 'insurer_claim_no', 'coverage', 'accident_at', 'accident_place', 'accident_desc', 'insured_name',
  'insured_phone', 'victim_name', 'victim_phone', 'fault_ratio', 'assigned_to', 'due_date', 'memo']

function Info({ claim, refs, onSaved }) {
  const init = Object.fromEntries(FIELDS.map((k) => [k, claim[k] ?? '']))
  init.accident_at = toLocalInput(claim.accident_at)
  const [f, setF] = useState(init)
  const [err, setErr] = useState('')
  const on = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e })

  async function save(e) {
    e.preventDefault()
    const payload = clean({ ...f, accident_at: fromLocalInput(f.accident_at) })
    if (payload.assigned_to && claim.status === '접수') payload.status = '배정'
    const { error } = await supabase.from('claims').update(payload).eq('id', claim.id)
    if (error) setErr(error.message); else { setErr(''); onSaved() }
  }

  return (
    <form className="card" onSubmit={save}>
      {err && <p className="msg">{err}</p>}
      <div className="form">
        <Field label="보험사"><Select value={f.insurer_id} onChange={on('insurer_id')} options={refs.insurers.map((i) => ({ value: i.id, label: i.name }))} /></Field>
        <Field label="보험사 사고접수번호"><input value={f.insurer_claim_no} onChange={on('insurer_claim_no')} /></Field>
        <Field label="담보 종목"><Select value={f.coverage} onChange={on('coverage')} options={COVERAGES} empty={false} /></Field>
        <Field label="담당 손해사정사"><Select value={f.assigned_to} onChange={on('assigned_to')} options={refs.users.map((u) => ({ value: u.id, label: u.name }))} empty="미배정" /></Field>
        <Field label="처리기한"><input type="date" value={f.due_date} onChange={on('due_date')} /></Field>
        <Field label="사고일시"><input type="datetime-local" value={f.accident_at} onChange={on('accident_at')} /></Field>
        <Field label="사고장소"><input value={f.accident_place} onChange={on('accident_place')} /></Field>
        <Field label="피보험자 과실(%)"><input type="number" min="0" max="100" value={f.fault_ratio} onChange={on('fault_ratio')} /></Field>
        <Field label="사고경위" wide><textarea rows={3} value={f.accident_desc} onChange={on('accident_desc')} /></Field>
        <Field label="피보험자"><input value={f.insured_name} onChange={on('insured_name')} /></Field>
        <Field label="피보험자 연락처"><input value={f.insured_phone} onChange={on('insured_phone')} /></Field>
        <Field label="피해자"><input value={f.victim_name} onChange={on('victim_name')} /></Field>
        <Field label="피해자 연락처"><input value={f.victim_phone} onChange={on('victim_phone')} /></Field>
        <Field label="메모" wide><textarea rows={2} value={f.memo} onChange={on('memo')} /></Field>
      </div>
      <button className="primary">저장</button>
    </form>
  )
}

function History({ claimId }) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    supabase.from('claim_history').select('*, profiles:profiles!claim_history_changed_by_fkey(name)').eq('claim_id', claimId).order('changed_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [claimId])
  return (
    <div className="card">
      <table>
        <thead><tr><th>일시</th><th>변경</th><th>내용</th><th>처리자</th></tr></thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id}>
              <td>{fmtDateTime(h.changed_at)}</td>
              <td>{h.from_status && h.from_status !== h.to_status ? `${h.from_status} → ` : ''}{h.to_status}</td>
              <td>{h.note || '상태 변경'}</td>
              <td>{h.profiles?.name || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
