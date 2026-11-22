import { useEffect, useState } from 'react'
import { supabase, won, toInt } from '../../lib'
import { Field, Select } from '../../ui'

export const FEE_STATUSES = ['미청구', '청구', '입금완료', '보류']
const today = () => new Date().toLocaleDateString('sv-SE')

export default function Fee({ claim, toast }) {
  const [f, setF] = useState(null)
  const [exists, setExists] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('fees').select('*').eq('claim_id', claim.id).maybeSingle(),
      claim.insurer_id ? supabase.from('insurers').select('base_fee').eq('id', claim.insurer_id).single() : Promise.resolve({ data: null }),
    ]).then(([fee, ins]) => {
      setExists(!!fee.data)
      setF(fee.data || {
        base_fee: ins.data?.base_fee ?? 0, extra_fee: 0, expense: 0, status: '미청구',
        invoice_no: '', invoiced_at: '', paid_at: '', paid_amount: '', memo: '',
      })
    })
  }, [claim.id, claim.insurer_id])

  if (!f) return null
  const supply = (toInt(f.base_fee) || 0) + (toInt(f.extra_fee) || 0) + (toInt(f.expense) || 0)
  const vat = Math.round(supply * 0.1)
  const total = supply + vat
  const on = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e })

  async function save(patch = {}) {
    const n = { ...f, ...patch }
    const payload = {
      claim_id: claim.id, base_fee: toInt(n.base_fee) || 0, extra_fee: toInt(n.extra_fee) || 0, expense: toInt(n.expense) || 0,
      status: n.status, invoice_no: n.invoice_no || null, invoiced_at: n.invoiced_at || null,
      paid_at: n.paid_at || null, paid_amount: n.paid_amount === '' || n.paid_amount == null ? null : toInt(n.paid_amount), memo: n.memo || null,
    }
    const { data, error } = await supabase.from('fees').upsert(payload, { onConflict: 'claim_id' }).select().single()
    if (error) return toast(error.message)
    setF(data); setExists(true); toast('수수료 정보가 저장되었습니다')
  }

  return (
    <div className="grid2">
      <section className="card">
        <h3>수수료 산정 {!exists && <span className="muted small">(미등록)</span>}</h3>
        <table className="calc">
          <tbody>
            <tr><th>기본 수수료</th><td><input className="num" value={f.base_fee} onChange={on('base_fee')} /></td></tr>
            <tr><th>일비·출장비</th><td><input className="num" value={f.extra_fee} onChange={on('extra_fee')} /></td></tr>
            <tr><th>교통비 등 실비</th><td><input className="num" value={f.expense} onChange={on('expense')} /></td></tr>
            <tr><th>공급가액</th><td className="num">{won(supply)}원</td></tr>
            <tr><th>부가세 (10%)</th><td className="num">{won(vat)}원</td></tr>
            <tr className="total"><th>청구 합계</th><td className="num"><b>{won(total)}원</b></td></tr>
          </tbody>
        </table>
        <p className="muted small">보험사 화면에 기본 수수료를 등록해 두면 처음 열 때 자동으로 채워집니다.</p>
      </section>
      <section className="card">
        <h3>청구·입금</h3>
        <div className="form">
          <Field label="상태"><Select value={f.status} onChange={on('status')} options={FEE_STATUSES} empty={false} /></Field>
          <Field label="청구서 번호"><input value={f.invoice_no || ''} onChange={on('invoice_no')} /></Field>
          <Field label="청구일"><input type="date" value={f.invoiced_at || ''} onChange={on('invoiced_at')} /></Field>
          <Field label="입금일"><input type="date" value={f.paid_at || ''} onChange={on('paid_at')} /></Field>
          <Field label="입금액"><input className="num" value={f.paid_amount ?? ''} onChange={on('paid_amount')} placeholder={won(total)} /></Field>
          <Field label="메모" wide><textarea rows={2} value={f.memo || ''} onChange={on('memo')} /></Field>
        </div>
        {f.paid_amount != null && f.paid_amount !== '' && toInt(f.paid_amount) !== total && (
          <p className="msg">입금액이 청구 합계와 {won(toInt(f.paid_amount) - total)}원 차이 납니다.</p>
        )}
        <div className="actions">
          <button className="primary" onClick={() => save()}>저장</button>
          {f.status === '미청구' && <button onClick={() => save({ status: '청구', invoiced_at: f.invoiced_at || today() })}>오늘 청구 처리</button>}
          {f.status === '청구' && <button onClick={() => save({ status: '입금완료', paid_at: f.paid_at || today(), paid_amount: f.paid_amount || total })}>입금 확인</button>}
        </div>
      </section>
    </div>
  )
}
