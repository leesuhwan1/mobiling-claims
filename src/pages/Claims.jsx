import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, STATUSES, COVERAGES, fmtDate } from '../lib'
import { StatusBadge, useRefs, Select } from '../ui'
import { useAuth } from '../App'
import { exportXlsx } from '../excel'

export default function Claims() {
  const [params, setParams] = useSearchParams()
  const { profile } = useAuth()
  const [refs] = useRefs()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const status = params.get('status') || ''
  const insurer = params.get('insurer') || ''
  const assignee = params.get('assignee') || ''
  const coverage = params.get('coverage') || ''
  const [q, setQ] = useState(params.get('q') || '')

  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p) }

  useEffect(() => {
    setLoading(true)
    let query = supabase.from('claims')
      .select('id, claim_no, insurer_claim_no, coverage, status, accident_at, insured_name, victim_name, received_at, due_date, accident_place, insurers(name), profiles:profiles!claims_assigned_to_fkey(name), vehicles(plate_no), assessments(claimed_total, approved_total, payable_amount, status)')
      .order('id', { ascending: false }).limit(500)
    if (status) query = query.eq('status', status)
    if (insurer) query = query.eq('insurer_id', insurer)
    if (coverage) query = query.eq('coverage', coverage)
    if (assignee === 'me') query = query.eq('assigned_to', profile?.id)
    else if (assignee === 'none') query = query.is('assigned_to', null)
    else if (assignee) query = query.eq('assigned_to', assignee)
    const term = params.get('q')
    if (term) {
      const t = term.replace(/[,()]/g, ' ')
      query = query.or(`claim_no.ilike.%${t}%,insurer_claim_no.ilike.%${t}%,insured_name.ilike.%${t}%,victim_name.ilike.%${t}%`)
    }
    query.then(({ data }) => { setRows(data || []); setLoading(false) })
  }, [params, profile?.id])

  const today = new Date().toISOString().slice(0, 10)
  const asmt = (c) => (Array.isArray(c.assessments) ? c.assessments[0] : c.assessments) || {}

  function download() {
    exportXlsx(`사건목록_${today}.xlsx`, [{
      name: '사건목록',
      columns: ['접수번호', '접수일', '보험사', '보험사 사고번호', '종목', '사고일', '사고장소', '피보험자', '피해자', '차량번호', '담당자', '상태', '처리기한', '청구 수리비', '인정 수리비', '지급액', '사정서'],
      rows: rows.map((c) => {
        const a = asmt(c)
        return [c.claim_no, c.received_at, c.insurers?.name, c.insurer_claim_no, c.coverage, c.accident_at ? fmtDate(c.accident_at) : null,
          c.accident_place, c.insured_name, c.victim_name, c.vehicles?.map((v) => v.plate_no).join(', '), c.profiles?.name, c.status,
          c.due_date, a.claimed_total ?? null, a.approved_total ?? null, a.payable_amount ?? null, a.status || '미작성']
      }),
      money: [13, 14, 15],
    }])
  }

  return (
    <div>
      <div className="head">
        <h2>사건관리</h2>
        <div className="actions">
          <button onClick={download} disabled={!rows.length}>엑셀 내려받기</button>
          <Link className="btn primary" to="/claims/new">+ 사고접수</Link>
        </div>
      </div>
      <div className="filters card">
        <form onSubmit={(e) => { e.preventDefault(); set('q', q.trim()) }}>
          <input placeholder="접수번호·보험사 사고번호·성명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <Select value={status} onChange={(v) => set('status', v)} options={STATUSES} empty="전체 상태" />
        <Select value={coverage} onChange={(v) => set('coverage', v)} options={COVERAGES} empty="전체 종목" />
        <Select value={insurer} onChange={(v) => set('insurer', v)} options={refs.insurers.map((i) => ({ value: String(i.id), label: i.name }))} empty="전체 보험사" />
        <Select value={assignee} onChange={(v) => set('assignee', v)}
          options={[{ value: 'me', label: '내 담당' }, { value: 'none', label: '미배정' }, ...refs.users.map((u) => ({ value: u.id, label: u.name }))]}
          empty="전체 담당자" />
      </div>
      <div className="card">
        {loading ? <p className="muted">불러오는 중…</p> : rows.length === 0 ? <p className="muted">조건에 맞는 사건이 없습니다.</p> : (
          <table>
            <thead><tr><th>접수번호</th><th>보험사 / 사고번호</th><th>종목</th><th>사고일</th><th>피보험자</th><th>피해자</th><th>차량번호</th><th>담당</th><th>상태</th><th>처리기한</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/claims/${c.id}`}>{c.claim_no}</Link></td>
                  <td>{c.insurers?.name || '-'}<div className="muted small">{c.insurer_claim_no}</div></td>
                  <td>{c.coverage}</td>
                  <td>{fmtDate(c.accident_at)}</td>
                  <td>{c.insured_name || '-'}</td>
                  <td>{c.victim_name || '-'}</td>
                  <td>{c.vehicles?.map((v) => v.plate_no).join(', ') || '-'}</td>
                  <td>{c.profiles?.name || <span className="muted">미배정</span>}</td>
                  <td><StatusBadge s={c.status} /></td>
                  <td className={c.due_date && c.due_date < today && !['종결', '취소'].includes(c.status) ? 'danger' : ''}>{fmtDate(c.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">{rows.length}건</p>
      </div>
    </div>
  )
}
