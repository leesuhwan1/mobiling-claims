import { useEffect, useState } from 'react'
import { supabase, clean, fmtDate } from '../../lib'
import { Field, Select } from '../../ui'

const blank = { party: '피해차량', plate_no: '', maker: '', model: '', model_year: '', vin: '', mileage: '', owner_name: '', repair_shop_id: '', in_date: '', out_date: '' }

export default function Vehicles({ claimId, refs, toast }) {
  const [rows, setRows] = useState([])
  const [edit, setEdit] = useState(null) // null | {} (new) | row
  const load = () => supabase.from('vehicles').select('*, repair_shops(name)').eq('claim_id', claimId).order('id')
    .then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [claimId])

  async function save(e) {
    e.preventDefault()
    const { id, repair_shops: _r, created_at: _c, ...rest } = edit
    const payload = clean({ ...blank, ...rest, claim_id: claimId })
    const r = id ? await supabase.from('vehicles').update(payload).eq('id', id) : await supabase.from('vehicles').insert(payload)
    if (r.error) return toast(r.error.message)
    setEdit(null); load(); toast('차량 정보가 저장되었습니다')
  }
  async function del(v) {
    if (!confirm(`${v.plate_no} 차량을 삭제할까요?`)) return
    const r = await supabase.from('vehicles').delete().eq('id', v.id)
    if (r.error) return toast(r.error.message)
    load()
  }
  const on = (k) => (e) => setEdit({ ...edit, [k]: e?.target ? e.target.value : e })

  return (
    <div className="card">
      <div className="head"><h3>차량</h3><button onClick={() => setEdit({ ...blank })}>+ 차량 추가</button></div>
      <table>
        <thead><tr><th>구분</th><th>차량번호</th><th>차종</th><th>연식</th><th>주행거리</th><th>소유자</th><th>정비공장</th><th>입고/출고</th><th></th></tr></thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id}>
              <td>{v.party}</td><td><b>{v.plate_no}</b></td><td>{[v.maker, v.model].filter(Boolean).join(' ') || '-'}</td>
              <td>{v.model_year || '-'}</td><td>{v.mileage ? v.mileage.toLocaleString() + 'km' : '-'}</td>
              <td>{v.owner_name || '-'}</td><td>{v.repair_shops?.name || '-'}</td>
              <td>{fmtDate(v.in_date)} / {fmtDate(v.out_date)}</td>
              <td className="nowrap">
                <button className="link" onClick={() => setEdit({ ...v })}>수정</button>
                <button className="link danger" onClick={() => del(v)}>삭제</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9} className="muted">등록된 차량이 없습니다.</td></tr>}
        </tbody>
      </table>
      {edit && (
        <form className="subform" onSubmit={save}>
          <div className="form">
            <Field label="구분"><Select value={edit.party} onChange={on('party')} options={['피해차량', '피보험차량']} empty={false} /></Field>
            <Field label="차량번호"><input required value={edit.plate_no ?? ''} onChange={on('plate_no')} /></Field>
            <Field label="제조사"><input value={edit.maker ?? ''} onChange={on('maker')} /></Field>
            <Field label="차종"><input value={edit.model ?? ''} onChange={on('model')} /></Field>
            <Field label="연식"><input type="number" value={edit.model_year ?? ''} onChange={on('model_year')} /></Field>
            <Field label="차대번호"><input value={edit.vin ?? ''} onChange={on('vin')} /></Field>
            <Field label="주행거리(km)"><input type="number" value={edit.mileage ?? ''} onChange={on('mileage')} /></Field>
            <Field label="소유자"><input value={edit.owner_name ?? ''} onChange={on('owner_name')} /></Field>
            <Field label="정비공장"><Select value={edit.repair_shop_id} onChange={on('repair_shop_id')} options={refs.shops.map((s) => ({ value: s.id, label: s.name }))} /></Field>
            <Field label="입고일"><input type="date" value={edit.in_date ?? ''} onChange={on('in_date')} /></Field>
            <Field label="출고일"><input type="date" value={edit.out_date ?? ''} onChange={on('out_date')} /></Field>
          </div>
          <button className="primary">저장</button> <button type="button" onClick={() => setEdit(null)}>취소</button>
        </form>
      )}
    </div>
  )
}
