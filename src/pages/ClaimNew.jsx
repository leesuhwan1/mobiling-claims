import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, COVERAGES, clean, fromLocalInput } from '../lib'
import { Field, Select, useRefs } from '../ui'

const empty = {
  insurer_id: '', insurer_claim_no: '', coverage: '대물', accident_at: '', accident_place: '', accident_desc: '',
  insured_name: '', insured_phone: '', victim_name: '', victim_phone: '', fault_ratio: '', assigned_to: '', due_date: '', memo: '',
}
const emptyCar = { party: '피해차량', plate_no: '', maker: '', model: '', model_year: '', owner_name: '', repair_shop_id: '' }

export default function ClaimNew() {
  const nav = useNavigate()
  const [refs] = useRefs()
  const [f, setF] = useState(empty)
  const [cars, setCars] = useState([{ ...emptyCar }])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase.from('app_settings').select('default_due_days').eq('id', 1).single().then(({ data }) => {
      if (!data?.default_due_days) return
      const d = new Date(); d.setDate(d.getDate() + data.default_due_days)
      setF((x) => (x.due_date ? x : { ...x, due_date: d.toLocaleDateString('sv-SE') }))
    })
  }, [])
  const on = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e })
  const onCar = (i, k) => (e) => setCars(cars.map((c, j) => (j === i ? { ...c, [k]: e?.target ? e.target.value : e } : c)))

  async function save(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const payload = clean({ ...f, accident_at: fromLocalInput(f.accident_at), status: f.assigned_to ? '배정' : '접수' })
    const { data, error } = await supabase.from('claims').insert(payload).select('id').single()
    if (error) { setErr(error.message); setBusy(false); return }
    const vs = cars.filter((c) => c.plate_no.trim()).map((c) => clean({ ...c, claim_id: data.id }))
    if (vs.length) {
      const r = await supabase.from('vehicles').insert(vs)
      if (r.error) setErr('사건은 저장되었으나 차량 저장 실패: ' + r.error.message)
    }
    nav(`/claims/${data.id}`)
  }

  return (
    <form onSubmit={save}>
      <div className="head"><h2>사고접수</h2><button className="primary" disabled={busy}>접수 저장</button></div>
      {err && <p className="msg">{err}</p>}
      <section className="card">
        <h3>의뢰 정보</h3>
        <div className="form">
          <Field label="보험사"><Select value={f.insurer_id} onChange={on('insurer_id')} options={refs.insurers.map((i) => ({ value: i.id, label: i.name }))} /></Field>
          <Field label="보험사 사고접수번호"><input value={f.insurer_claim_no} onChange={on('insurer_claim_no')} /></Field>
          <Field label="담보 종목"><Select value={f.coverage} onChange={on('coverage')} options={COVERAGES} empty={false} /></Field>
          <Field label="담당 손해사정사"><Select value={f.assigned_to} onChange={on('assigned_to')} options={refs.users.map((u) => ({ value: u.id, label: u.name }))} empty="미배정" /></Field>
          <Field label="처리기한"><input type="date" value={f.due_date} onChange={on('due_date')} /></Field>
        </div>
      </section>
      <section className="card">
        <h3>사고 내용</h3>
        <div className="form">
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
      </section>
      <section className="card">
        <div className="head"><h3>차량</h3><button type="button" onClick={() => setCars([...cars, { ...emptyCar }])}>+ 차량 추가</button></div>
        {cars.map((c, i) => (
          <div className="form carrow" key={i}>
            <Field label="구분"><Select value={c.party} onChange={onCar(i, 'party')} options={['피해차량', '피보험차량']} empty={false} /></Field>
            <Field label="차량번호"><input value={c.plate_no} onChange={onCar(i, 'plate_no')} placeholder="12가3456" /></Field>
            <Field label="제조사"><input value={c.maker} onChange={onCar(i, 'maker')} /></Field>
            <Field label="차종"><input value={c.model} onChange={onCar(i, 'model')} /></Field>
            <Field label="연식"><input type="number" value={c.model_year} onChange={onCar(i, 'model_year')} /></Field>
            <Field label="소유자"><input value={c.owner_name} onChange={onCar(i, 'owner_name')} /></Field>
            <Field label="입고 정비공장"><Select value={c.repair_shop_id} onChange={onCar(i, 'repair_shop_id')} options={refs.shops.map((s) => ({ value: s.id, label: s.name }))} /></Field>
            {cars.length > 1 && <button type="button" className="link danger" onClick={() => setCars(cars.filter((_, j) => j !== i))}>삭제</button>}
          </div>
        ))}
      </section>
    </form>
  )
}
