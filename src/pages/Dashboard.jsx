import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, STATUSES, OPEN_STATUSES, won, fmtDate, fmtDateTime } from '../lib'
import { useAuth } from '../App'
import { StatusBadge } from '../ui'
import { exportMonthlyReport } from '../monthlyReport'

export default function Dashboard() {
  const { profile } = useAuth()
  const [claims, setClaims] = useState([])
  const [schedules, setSchedules] = useState([])
  const [sums, setSums] = useState({ claimed: 0, approved: 0, payable: 0 })
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    supabase.from('claims')
      .select('id, claim_no, status, coverage, insured_name, victim_name, due_date, received_at, assigned_to, profiles:profiles!claims_assigned_to_fkey(name), insurers(name)')
      .order('received_at', { ascending: false })
      .then(({ data }) => setClaims(data || []))
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const end = new Date(now); end.setDate(end.getDate() + 7)
    supabase.from('schedules')
      .select('*, claims(claim_no), profiles:profiles!schedules_adjuster_id_fkey(name)')
      .eq('done', false).gte('scheduled_at', now.toISOString()).lt('scheduled_at', end.toISOString())
      .order('scheduled_at')
      .then(({ data }) => setSchedules(data || []))
    const month = new Date(); month.setDate(1)
    supabase.from('assessments').select('claimed_total, approved_total, payable_amount')
      .eq('status', '확정').gte('issued_at', month.toISOString().slice(0, 10))
      .then(({ data }) => setSums((data || []).reduce((a, r) => ({
        claimed: a.claimed + r.claimed_total, approved: a.approved + r.approved_total, payable: a.payable + r.payable_amount,
      }), { claimed: 0, approved: 0, payable: 0 })))
  }, [])

  const today = new Date().toISOString().slice(0, 10)
  const open = claims.filter((c) => OPEN_STATUSES.includes(c.status))
  const mine = open.filter((c) => c.assigned_to === profile?.id)
  const overdue = open.filter((c) => c.due_date && c.due_date < today)
  const unassigned = open.filter((c) => !c.assigned_to)
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, claims.filter((c) => c.status === s).length]))
  const byAdjuster = Object.entries(open.reduce((a, c) => {
    const k = c.profiles?.name || '미배정'; a[k] = (a[k] || 0) + 1; return a
  }, {})).sort((a, b) => b[1] - a[1])
  const cutRate = sums.claimed ? (1 - sums.approved / sums.claimed) * 100 : 0

  return (
    <div>
      <div className="head">
        <h2>대시보드</h2>
        <div className="actions">
          <select value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 'auto' }}>
            {[0, 1, 2].map((d) => { const y = String(new Date().getFullYear() - d); return <option key={y} value={y}>{y}년</option> })}
          </select>
          <button disabled={exporting} onClick={async () => { setExporting(true); try { await exportMonthlyReport(year) } finally { setExporting(false) } }}>
            {exporting ? '만드는 중…' : '월별 실적 엑셀'}
          </button>
        </div>
      </div>
      <div className="tiles">
        <Tile label="진행중 사건" value={open.length} />
        <Tile label="내 담당" value={mine.length} />
        <Tile label="미배정" value={unassigned.length} warn={unassigned.length > 0} />
        <Tile label="처리기한 초과" value={overdue.length} warn={overdue.length > 0} />
        <Tile label="이번 달 확정 인정액" value={won(sums.approved) + '원'} sub={`청구 ${won(sums.claimed)}원 · 삭감률 ${cutRate.toFixed(1)}%`} />
      </div>

      <div className="grid2">
        <section className="card">
          <h3>단계별 현황</h3>
          <div className="pipeline">
            {STATUSES.filter((s) => s !== '취소').map((s) => (
              <Link key={s} to={`/claims?status=${s}`} className="stage">
                <b>{byStatus[s]}</b><span>{s}</span>
              </Link>
            ))}
          </div>
          <h3 style={{ marginTop: 20 }}>담당자별 진행 건수</h3>
          {byAdjuster.length === 0 && <p className="muted">진행중인 사건이 없습니다.</p>}
          {byAdjuster.map(([name, n]) => (
            <div key={name} className="barrow">
              <span>{name}</span>
              <div className="bar"><i style={{ width: `${(n / byAdjuster[0][1]) * 100}%` }} /></div>
              <b>{n}</b>
            </div>
          ))}
        </section>

        <section className="card">
          <h3>7일 이내 일정</h3>
          {schedules.length === 0 && <p className="muted">예정된 일정이 없습니다.</p>}
          <ul className="list">
            {schedules.map((s) => (
              <li key={s.id}>
                <span className="tag">{s.kind}</span> {fmtDateTime(s.scheduled_at)}
                {s.claims && <> · <Link to={`/claims/${s.claim_id}`}>{s.claims.claim_no}</Link></>}
                <div className="muted small">{s.profiles?.name || '담당 미지정'} {s.location && `· ${s.location}`}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h3>처리기한 임박·초과 사건</h3>
        <ClaimMiniTable rows={open.filter((c) => c.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 10)} today={today} />
      </section>
    </div>
  )
}

function Tile({ label, value, sub, warn }) {
  return (
    <div className={`tile ${warn ? 'warn' : ''}`}>
      <span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}
    </div>
  )
}

function ClaimMiniTable({ rows, today }) {
  if (!rows.length) return <p className="muted">처리기한이 설정된 진행 사건이 없습니다.</p>
  return (
    <table>
      <thead><tr><th>접수번호</th><th>보험사</th><th>종목</th><th>피보험자/피해자</th><th>담당</th><th>상태</th><th>처리기한</th></tr></thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td><Link to={`/claims/${c.id}`}>{c.claim_no}</Link></td>
            <td>{c.insurers?.name || '-'}</td><td>{c.coverage}</td>
            <td>{c.insured_name || '-'} / {c.victim_name || '-'}</td>
            <td>{c.profiles?.name || <span className="muted">미배정</span>}</td>
            <td><StatusBadge s={c.status} /></td>
            <td className={c.due_date < today ? 'danger' : ''}>{fmtDate(c.due_date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
