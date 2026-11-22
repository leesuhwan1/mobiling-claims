import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, won, toInt, calcPayable, STATUSES, fmtDate } from '../../lib'
import { Field } from '../../ui'

export default function Assessment({ claim, toast, onStatus }) {
  const [a, setA] = useState(null)
  const [totals, setTotals] = useState({ claimed: 0, approved: 0, pending: 0, estimates: 0, open: 0 })

  useEffect(() => {
    Promise.all([
      supabase.from('assessments').select('*').eq('claim_id', claim.id).maybeSingle(),
      supabase.from('estimates').select('status, estimate_items(claimed_amount, approved_amount)').eq('claim_id', claim.id),
    ]).then(([as, es]) => {
      const items = (es.data || []).flatMap((e) => e.estimate_items)
      const t = {
        claimed: items.reduce((s, i) => s + i.claimed_amount, 0),
        approved: items.reduce((s, i) => s + (i.approved_amount ?? 0), 0),
        pending: items.filter((i) => i.approved_amount == null).length,
        estimates: es.data?.length || 0,
        open: (es.data || []).filter((e) => e.status !== '검토완료').length,
      }
      setTotals(t)
      setA(as.data || {
        claimed_total: t.claimed, approved_total: t.approved, depreciation: 0, deductible: 0,
        fault_ratio: claim.coverage === '대물' && claim.fault_ratio != null ? claim.fault_ratio : 100,
        opinion: '', status: '작성중', issued_at: null,
      })
    })
  }, [claim.id])

  if (!a) return null
  const locked = a.status === '확정'
  const payable = calcPayable(a)
  const on = (k) => (e) => setA({ ...a, [k]: e.target.value })
  const syncTotals = () => setA({ ...a, claimed_total: totals.claimed, approved_total: totals.approved })
  const outOfSync = a.claimed_total !== totals.claimed || a.approved_total !== totals.approved

  async function save(status) {
    const payload = {
      claim_id: claim.id,
      claimed_total: toInt(a.claimed_total) || 0, approved_total: toInt(a.approved_total) || 0,
      depreciation: toInt(a.depreciation) || 0, deductible: toInt(a.deductible) || 0,
      fault_ratio: a.fault_ratio === '' ? null : Number(a.fault_ratio),
      payable_amount: payable, opinion: a.opinion || null, status,
      issued_at: status === '확정' ? (a.issued_at || new Date().toISOString().slice(0, 10)) : null,
    }
    const { data, error } = await supabase.from('assessments').upsert(payload, { onConflict: 'claim_id' }).select().single()
    if (error) return toast(error.message)
    setA(data)
    if (status === '확정' && STATUSES.indexOf(claim.status) < STATUSES.indexOf('사정완료')) {
      await supabase.from('claims').update({ status: '사정완료' }).eq('id', claim.id)
      onStatus()
    }
    toast(status === '확정' ? '손해사정서가 확정되었습니다' : '저장되었습니다')
  }

  function confirmIt() {
    if (totals.pending) return toast(`미검토 견적 항목 ${totals.pending}건이 있습니다`)
    if (!a.opinion?.trim()) return toast('사정 의견을 입력하세요')
    if (confirm('손해사정서를 확정할까요? 확정 후에는 확정 해제 후에만 수정할 수 있습니다.')) save('확정')
  }

  return (
    <div className="grid2">
      <section className="card">
        <div className="head">
          <h3>손해액 산정 <span className={locked ? 'ok small' : 'muted small'}>{a.status}{locked && ` · ${fmtDate(a.issued_at)}`}</span></h3>
          {!locked && outOfSync && <button onClick={syncTotals}>견적검토 금액 불러오기</button>}
        </div>
        <p className="muted small">견적서 {totals.estimates}건 (검토중 {totals.open}건) · 청구 {won(totals.claimed)}원 · 인정 {won(totals.approved)}원{totals.pending > 0 && ` · 미검토 ${totals.pending}항목`}</p>
        <table className="calc">
          <tbody>
            <tr><th>청구 수리비</th><td><input className="num" disabled={locked} value={a.claimed_total} onChange={on('claimed_total')} /></td></tr>
            <tr><th>인정 수리비 (A)</th><td><input className="num" disabled={locked} value={a.approved_total} onChange={on('approved_total')} /></td></tr>
            <tr><th>감가·공제 (B)</th><td><input className="num" disabled={locked} value={a.depreciation} onChange={on('depreciation')} /></td></tr>
            <tr><th>책임비율 % (C)</th><td><input className="num" type="number" min="0" max="100" disabled={locked} value={a.fault_ratio ?? ''} onChange={on('fault_ratio')} /></td></tr>
            <tr><th>자기부담금 (D)</th><td><input className="num" disabled={locked} value={a.deductible} onChange={on('deductible')} /></td></tr>
            <tr className="total"><th>지급액 = (A−B)×C − D</th><td className="num"><b>{won(payable)}원</b></td></tr>
          </tbody>
        </table>
        <p className="muted small">삭감액 {won((toInt(a.claimed_total) || 0) - (toInt(a.approved_total) || 0))}원 · 대물 사건은 사고접수 시 입력한 피보험자 과실을 책임비율 기본값으로 씁니다.</p>
      </section>
      <section className="card">
        <h3>사정 의견</h3>
        <Field label="" wide>
          <textarea rows={12} disabled={locked} value={a.opinion || ''} onChange={on('opinion')}
            placeholder={'1. 사고 개요\n2. 손상 부위 및 수리 범위의 적정성\n3. 조정 내역(부품 단가·공임 시간·도장 범위)\n4. 결론'} />
        </Field>
        <div className="actions">
          {!locked && <><button onClick={() => save('작성중')}>임시저장</button><button className="primary" onClick={confirmIt}>확정</button></>}
          {locked && <button onClick={() => save('작성중')}>확정 해제</button>}
          <Link className="btn" to={`/claims/${claim.id}/report`} target="_blank">출력 미리보기</Link>
        </div>
      </section>
    </div>
  )
}
