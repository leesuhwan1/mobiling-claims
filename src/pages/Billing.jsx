import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, won, fmtDate } from '../lib'
import { Select, useRefs, useToast } from '../ui'
import { FEE_STATUSES } from './tabs/Fee'
import { exportXlsx } from '../excel'

const today = () => new Date().toLocaleDateString('sv-SE')
const total = (f) => f.supply_amount + f.vat

export default function Billing() {
  const [refs] = useRefs()
  const [toast, toastEl] = useToast()
  const [fees, setFees] = useState([])
  const [pending, setPending] = useState([])
  const [status, setStatus] = useState('')
  const [insurer, setInsurer] = useState('')
  const [month, setMonth] = useState('')
  const [sel, setSel] = useState([])

  const load = async () => {
    const [f, c] = await Promise.all([
      supabase.from('fees').select('*, claims(id, claim_no, insurer_id, insurer_claim_no, coverage, status, victim_name, insured_name, insurers(name))').order('id', { ascending: false }),
      supabase.from('claims').select('id, claim_no, status, insurer_id, insurers(name), victim_name, insured_name, fees(id)')
        .in('status', ['사정완료', '보고서제출', '종결']).order('id', { ascending: false }),
    ])
    setFees(f.data || [])
    setPending((c.data || []).filter((x) => !x.fees || (Array.isArray(x.fees) ? x.fees.length === 0 : !x.fees.id)))
    setSel([])
  }
  useEffect(() => { load() }, [])

  const rows = useMemo(() => fees.filter((f) =>
    (!status || f.status === status) &&
    (!insurer || String(f.claims?.insurer_id) === insurer) &&
    (!month || (f.invoiced_at || '').startsWith(month) || (f.paid_at || '').startsWith(month))
  ), [fees, status, insurer, month])

  const thisMonth = today().slice(0, 7)
  const sum = (xs) => xs.reduce((a, f) => a + total(f), 0)
  const unbilled = fees.filter((f) => f.status === '미청구')
  const billed = fees.filter((f) => f.status === '청구')
  const paidMonth = fees.filter((f) => f.status === '입금완료' && (f.paid_at || '').startsWith(thisMonth))

  async function bulk(next) {
    if (!sel.length) return toast('선택된 건이 없습니다')
    const targets = fees.filter((f) => sel.includes(f.id))
    for (const f of targets) {
      const patch = next === '청구'
        ? { status: '청구', invoiced_at: f.invoiced_at || today() }
        : { status: '입금완료', paid_at: f.paid_at || today(), paid_amount: f.paid_amount ?? total(f) }
      const { error } = await supabase.from('fees').update(patch).eq('id', f.id)
      if (error) return toast(error.message)
    }
    toast(`${targets.length}건을 '${next === '청구' ? '청구' : '입금완료'}' 처리했습니다`); load()
  }

  function download() {
    exportXlsx(`수수료청구_${month || '전체'}_${today()}.xlsx`, [{
      name: '수수료 청구',
      columns: ['접수번호', '보험사', '보험사 사고번호', '종목', '피해자', '기본수수료', '일비·출장비', '실비', '공급가액', '부가세', '청구합계', '상태', '청구서번호', '청구일', '입금일', '입금액', '메모'],
      rows: rows.map((f) => [f.claims?.claim_no, f.claims?.insurers?.name, f.claims?.insurer_claim_no, f.claims?.coverage, f.claims?.victim_name,
        f.base_fee, f.extra_fee, f.expense, f.supply_amount, f.vat, total(f), f.status, f.invoice_no, f.invoiced_at, f.paid_at, f.paid_amount, f.memo]),
      money: [5, 6, 7, 8, 9, 10, 15],
    }])
  }

  const allOn = rows.length > 0 && rows.every((r) => sel.includes(r.id))
  return (
    <div>
      {toastEl}
      <div className="head"><h2>청구관리</h2><button onClick={download}>엑셀 내려받기</button></div>
      <div className="tiles">
        <div className="tile warn"><span>수수료 미등록 (사정완료 이후)</span><b>{pending.length}건</b><small>사건 상세 › 수수료 탭에서 등록</small></div>
        <div className="tile"><span>미청구</span><b>{won(sum(unbilled))}원</b><small>{unbilled.length}건</small></div>
        <div className="tile"><span>청구 후 미입금</span><b>{won(sum(billed))}원</b><small>{billed.length}건</small></div>
        <div className="tile"><span>이번 달 입금</span><b>{won(paidMonth.reduce((a, f) => a + (f.paid_amount ?? total(f)), 0))}원</b><small>{paidMonth.length}건</small></div>
      </div>

      {pending.length > 0 && (
        <section className="card">
          <h3>수수료 등록이 필요한 사건</h3>
          <div className="chips">
            {pending.slice(0, 30).map((c) => (
              <Link key={c.id} className="chip" to={`/claims/${c.id}?tab=수수료`}>
                <b>{c.claim_no}</b><span>{c.insurers?.name || '-'} · {c.victim_name || c.insured_name || ''}</span><span className="muted">{c.status}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="filters card">
        <Select value={status} onChange={setStatus} options={FEE_STATUSES} empty="전체 상태" />
        <Select value={insurer} onChange={setInsurer} options={refs.insurers.map((i) => ({ value: String(i.id), label: i.name }))} empty="전체 보험사" />
        <label className="inline">청구·입금 월 <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 160 }} /></label>
        <span className="muted small">선택 {sel.length}건</span>
        <button onClick={() => bulk('청구')}>선택 청구 처리</button>
        <button onClick={() => bulk('입금')}>선택 입금 확인</button>
      </div>

      <div className="card scroll">
        <table>
          <thead><tr>
            <th><input type="checkbox" checked={allOn} onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])} /></th>
            <th>접수번호</th><th>보험사</th><th>피해자</th><th className="num">공급가액</th><th className="num">부가세</th><th className="num">합계</th>
            <th>상태</th><th>청구일</th><th>입금일</th><th className="num">입금액</th>
          </tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td><input type="checkbox" checked={sel.includes(f.id)} onChange={(e) => setSel(e.target.checked ? [...sel, f.id] : sel.filter((x) => x !== f.id))} /></td>
                <td><Link to={`/claims/${f.claim_id}?tab=수수료`}>{f.claims?.claim_no}</Link></td>
                <td>{f.claims?.insurers?.name || '-'}</td>
                <td>{f.claims?.victim_name || f.claims?.insured_name || '-'}</td>
                <td className="num">{won(f.supply_amount)}</td><td className="num">{won(f.vat)}</td><td className="num"><b>{won(total(f))}</b></td>
                <td><span className={`tag ${f.status === '입금완료' ? 'okc' : ''}`}>{f.status}</span></td>
                <td>{fmtDate(f.invoiced_at)}</td><td>{fmtDate(f.paid_at)}</td>
                <td className={`num ${f.paid_amount != null && f.paid_amount !== total(f) ? 'danger' : ''}`}>{won(f.paid_amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="muted">조건에 맞는 수수료 내역이 없습니다.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr><td colSpan={4}><b>합계 {rows.length}건</b></td>
              <td className="num">{won(rows.reduce((a, f) => a + f.supply_amount, 0))}</td>
              <td className="num">{won(rows.reduce((a, f) => a + f.vat, 0))}</td>
              <td className="num"><b>{won(sum(rows))}</b></td><td colSpan={3}></td>
              <td className="num">{won(rows.reduce((a, f) => a + (f.paid_amount || 0), 0))}</td></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
