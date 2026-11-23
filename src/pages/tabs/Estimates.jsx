import { useEffect, useState } from 'react'
import { supabase, won, toInt, ITEM_CATEGORIES, OPERATIONS, fmtDate } from '../../lib'
import { Field, Select } from '../../ui'
import EstimateImport from './EstimateImport'

const newItem = (seq) => ({ _key: Math.random(), seq, category: '부품', item_name: '', operation: '교환', qty: 1, unit_price: 0, claimed_amount: 0, approved_amount: null, adjust_reason: '' })

export default function Estimates({ claim, refs, toast }) {
  const [list, setList] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [sel, setSel] = useState(null)
  const [creating, setCreating] = useState(null)
  const [importing, setImporting] = useState(false)

  const load = async (selectId) => {
    const [e, v] = await Promise.all([
      supabase.from('estimates').select('*, vehicles(plate_no), repair_shops(name), estimate_items(claimed_amount, approved_amount)')
        .eq('claim_id', claim.id).order('id'),
      supabase.from('vehicles').select('id, plate_no, repair_shop_id').eq('claim_id', claim.id),
    ])
    setList(e.data || []); setVehicles(v.data || [])
    if (selectId) setSel(selectId)
    else if (!sel && e.data?.length) setSel(e.data[e.data.length - 1].id)
  }
  useEffect(() => { load() }, [claim.id])

  async function create(ev) {
    ev.preventDefault()
    const sameCar = list.filter((x) => String(x.vehicle_id) === String(creating.vehicle_id))
    const payload = {
      claim_id: claim.id, vehicle_id: creating.vehicle_id || null, repair_shop_id: creating.repair_shop_id || null,
      estimate_date: creating.estimate_date || null, version: sameCar.length + 1,
    }
    const { data, error } = await supabase.from('estimates').insert(payload).select('id').single()
    if (error) return toast(error.message)
    setCreating(null); load(data.id)
    if (['접수', '배정', '현장조사'].includes(claim.status)) await supabase.from('claims').update({ status: '견적검토' }).eq('id', claim.id)
  }

  return (
    <div>
      <div className="card">
        <div className="head">
          <h3>견적서</h3>
          <div className="actions">
          <button className="primary" onClick={() => { setCreating(null); setImporting(true) }}>AOS 견적서 불러오기</button>
          <button onClick={() => setCreating({ vehicle_id: vehicles[0]?.id || '', repair_shop_id: vehicles[0]?.repair_shop_id || '', estimate_date: new Date().toISOString().slice(0, 10) })}>+ 직접 등록</button>
          </div>
        </div>
        {list.length === 0 && !creating && <p className="muted">등록된 견적서가 없습니다. 「AOS 견적서 불러오기」로 견적서 파일을 올리거나 직접 등록해 항목별 검토를 시작하세요.</p>}
        <div className="chips">
          {list.map((e) => {
            const c = e.estimate_items.reduce((a, i) => a + i.claimed_amount, 0)
            const ap = e.estimate_items.reduce((a, i) => a + (i.approved_amount ?? 0), 0)
            return (
              <button key={e.id} className={`chip ${sel === e.id ? 'on' : ''}`} onClick={() => setSel(e.id)}>
                <b>{e.vehicles?.plate_no || '차량 미지정'} · {e.version}차</b>
                <span>{e.repair_shops?.name || '-'} · {fmtDate(e.estimate_date)}</span>
                <span>청구 {won(c)} / 인정 {won(ap)}</span>
                <span className={e.status === '검토완료' ? 'ok' : 'muted'}>{e.status}</span>
              </button>
            )
          })}
        </div>
        {creating && (
          <form className="subform" onSubmit={create}>
            <div className="form">
              <Field label="차량"><Select value={creating.vehicle_id} onChange={(v) => setCreating({ ...creating, vehicle_id: v, repair_shop_id: vehicles.find((x) => String(x.id) === v)?.repair_shop_id || creating.repair_shop_id })} options={vehicles.map((v) => ({ value: v.id, label: v.plate_no }))} /></Field>
              <Field label="정비공장"><Select value={creating.repair_shop_id} onChange={(v) => setCreating({ ...creating, repair_shop_id: v })} options={refs.shops.map((s) => ({ value: s.id, label: s.name }))} /></Field>
              <Field label="견적일"><input type="date" value={creating.estimate_date} onChange={(e) => setCreating({ ...creating, estimate_date: e.target.value })} /></Field>
            </div>
            <button className="primary">등록</button> <button type="button" onClick={() => setCreating(null)}>취소</button>
          </form>
        )}
      </div>
      {importing && <EstimateImport claim={claim} vehicles={vehicles} shops={refs.shops} estimates={list} toast={toast}
        onClose={() => setImporting(false)} onDone={(id) => { setImporting(false); load(id) }} />}
      {sel && !importing && <ItemEditor key={sel} estimateId={sel} toast={toast} onSaved={() => load(sel)} onDeleted={() => { setSel(null); load() }} />}
    </div>
  )
}

function ItemEditor({ estimateId, toast, onSaved, onDeleted }) {
  const [est, setEst] = useState(null)
  const [items, setItems] = useState([])
  const [removed, setRemoved] = useState([])
  const [paste, setPaste] = useState(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('estimates').select('*').eq('id', estimateId).single(),
      supabase.from('estimate_items').select('*').eq('estimate_id', estimateId).order('seq').order('id'),
    ]).then(([e, i]) => { setEst(e.data); setItems((i.data || []).map((x) => ({ ...x, _key: x.id }))) })
  }, [estimateId])

  const upd = (k, field, value) => {
    setDirty(true)
    setItems(items.map((it) => {
      if (it._key !== k) return it
      const n = { ...it, [field]: value }
      if (field === 'qty' || field === 'unit_price') n.claimed_amount = Math.round(Number(n.qty || 0) * Number(n.unit_price || 0))
      return n
    }))
  }
  const add = () => { setDirty(true); setItems([...items, newItem(items.length + 1)]) }
  const del = (it) => { setDirty(true); if (it.id) setRemoved([...removed, it.id]); setItems(items.filter((x) => x._key !== it._key)) }
  const approveAll = () => { setDirty(true); setItems(items.map((it) => (it.approved_amount == null ? { ...it, approved_amount: it.claimed_amount } : it))) }

  function importPaste() {
    // 엑셀에서 복사: 구분 / 품명 / 작업 / 수량 / 단가 (탭 구분). 구분 생략 가능.
    const rows = paste.split(/\r?\n/).map((l) => l.split('\t').map((s) => s.trim())).filter((r) => r.some(Boolean))
    const parsed = rows.map((r, i) => {
      let [cat, name, op, qty, price] = r
      if (!ITEM_CATEGORIES.includes(cat)) { [name, op, qty, price] = r; cat = '부품' }
      const q = Number(String(qty || 1).replace(/,/g, '')) || 1
      const p = toInt(price) || 0
      return { ...newItem(items.length + i + 1), category: cat, item_name: name || '', operation: OPERATIONS.includes(op) ? op : '기타', qty: q, unit_price: p, claimed_amount: Math.round(q * p) }
    })
    setItems([...items, ...parsed]); setPaste(null); setDirty(true)
    toast(`${parsed.length}개 항목을 추가했습니다`)
  }

  async function save(markDone) {
    if (removed.length) {
      const r = await supabase.from('estimate_items').delete().in('id', removed)
      if (r.error) return toast(r.error.message)
    }
    const rows = items.map((it, i) => {
      const { _key, created_at: _c, ...rest } = it
      return {
        ...rest, estimate_id: estimateId, seq: i + 1, qty: Number(rest.qty || 0),
        unit_price: toInt(rest.unit_price) || 0, claimed_amount: toInt(rest.claimed_amount) || 0,
        approved_amount: rest.approved_amount === '' ? null : toInt(rest.approved_amount),
        adjust_reason: rest.adjust_reason || null, operation: rest.operation || null,
      }
    }).filter((r) => r.item_name)
    const existing = rows.filter((r) => r.id)
    const fresh = rows.filter((r) => !r.id).map(({ id: _i, ...r }) => r)
    if (existing.length) { const r = await supabase.from('estimate_items').upsert(existing); if (r.error) return toast(r.error.message) }
    if (fresh.length) { const r = await supabase.from('estimate_items').insert(fresh); if (r.error) return toast(r.error.message) }
    const patch = { memo: est.memo || null }
    if (markDone !== undefined) patch.status = markDone ? '검토완료' : '검토중'
    await supabase.from('estimates').update(patch).eq('id', estimateId)
    const fresh2 = await supabase.from('estimate_items').select('*').eq('estimate_id', estimateId).order('seq')
    setItems((fresh2.data || []).map((x) => ({ ...x, _key: x.id }))); setRemoved([]); setDirty(false)
    if (markDone !== undefined) setEst({ ...est, status: patch.status })
    toast('견적 검토 내용이 저장되었습니다'); onSaved()
  }

  async function removeEstimate() {
    if (!confirm('이 견적서를 삭제할까요?')) return
    const r = await supabase.from('estimates').delete().eq('id', estimateId)
    if (r.error) return toast(r.error.message)
    onDeleted()
  }

  if (!est) return null
  const claimed = items.reduce((a, i) => a + (toInt(i.claimed_amount) || 0), 0)
  const approved = items.reduce((a, i) => a + (toInt(i.approved_amount) || 0), 0)
  const pending = items.filter((i) => i.approved_amount == null || i.approved_amount === '').length
  const byCat = ITEM_CATEGORIES.map((c) => {
    const xs = items.filter((i) => i.category === c)
    return [c, xs.reduce((a, i) => a + (toInt(i.claimed_amount) || 0), 0), xs.reduce((a, i) => a + (toInt(i.approved_amount) || 0), 0)]
  })

  return (
    <div className="card">
      <div className="head">
        <h3>항목별 검토 <span className={est.status === '검토완료' ? 'ok small' : 'muted small'}>{est.status}</span></h3>
        <div className="actions">
          <button onClick={() => setPaste('')}>엑셀 붙여넣기</button>
          <button onClick={approveAll}>미검토 항목 청구액대로 인정</button>
          <button className="link danger" onClick={removeEstimate}>견적서 삭제</button>
        </div>
      </div>
      {paste !== null && (
        <div className="subform">
          <p className="muted small">엑셀에서 <b>구분 · 품명 · 작업 · 수량 · 단가</b> 열을 복사해 붙여넣으세요. (구분 열은 생략 가능)</p>
          <textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'부품\t앞범퍼\t교환\t1\t320000\n공임\t앞범퍼 탈부착\t탈착\t1\t45000'} />
          <button className="primary" onClick={importPaste}>추가</button> <button onClick={() => setPaste(null)}>닫기</button>
        </div>
      )}
      <div className="scroll">
        <table className="items">
          <thead><tr><th>#</th><th>구분</th><th>품명/작업내용</th><th>작업</th><th>수량</th><th>단가</th><th>청구금액</th><th>인정금액</th><th>차액</th><th>조정사유</th><th></th></tr></thead>
          <tbody>
            {items.map((it, i) => {
              const diff = it.approved_amount == null || it.approved_amount === '' ? null : (toInt(it.claimed_amount) || 0) - (toInt(it.approved_amount) || 0)
              return (
                <tr key={it._key}>
                  <td>{i + 1}</td>
                  <td><Select value={it.category} onChange={(v) => upd(it._key, 'category', v)} options={ITEM_CATEGORIES} empty={false} /></td>
                  <td><input value={it.item_name} onChange={(e) => upd(it._key, 'item_name', e.target.value)} /></td>
                  <td><Select value={it.operation} onChange={(v) => upd(it._key, 'operation', v)} options={OPERATIONS} empty="-" /></td>
                  <td><input className="num s" type="number" step="0.1" value={it.qty} onChange={(e) => upd(it._key, 'qty', e.target.value)} /></td>
                  <td><input className="num" value={it.unit_price} onChange={(e) => upd(it._key, 'unit_price', e.target.value)} /></td>
                  <td><input className="num" value={it.claimed_amount} onChange={(e) => upd(it._key, 'claimed_amount', e.target.value)} /></td>
                  <td><input className={`num ${it.approved_amount == null || it.approved_amount === '' ? 'pending' : ''}`} value={it.approved_amount ?? ''} placeholder="미검토" onChange={(e) => upd(it._key, 'approved_amount', e.target.value)} /></td>
                  <td className={`num ${diff > 0 ? 'danger' : ''}`}>{diff == null ? '' : won(-diff)}</td>
                  <td><input value={it.adjust_reason || ''} onChange={(e) => upd(it._key, 'adjust_reason', e.target.value)} placeholder={diff > 0 ? '사유 입력' : ''} /></td>
                  <td><button className="link danger" onClick={() => del(it)}>✕</button></td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={6}><button onClick={add}>+ 항목 추가</button></td>
              <td className="num"><b>{won(claimed)}</b></td><td className="num"><b>{won(approved)}</b></td>
              <td className="num danger">{won(approved - claimed)}</td><td colSpan={2}>{pending > 0 && <span className="muted">미검토 {pending}건</span>}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className="catsum">
        {byCat.map(([c, a, b]) => <div key={c}><span>{c}</span><b>{won(a)}</b><small>인정 {won(b)}</small></div>)}
        {(() => {
          const done = items.filter((i) => i.approved_amount != null && i.approved_amount !== '')
          const c = done.reduce((a, i) => a + (toInt(i.claimed_amount) || 0), 0)
          const a = done.reduce((x, i) => x + (toInt(i.approved_amount) || 0), 0)
          return <div><span>삭감률</span><b>{c ? (((c - a) / c) * 100).toFixed(1) : '0.0'}%</b><small>검토한 {done.length}개 항목 기준</small></div>
        })()}
      </div>
      <Field label="검토 메모" wide><textarea rows={2} value={est.memo || ''} onChange={(e) => { setEst({ ...est, memo: e.target.value }); setDirty(true) }} /></Field>
      <div className="actions" style={{ marginTop: 12 }}>
        <button className="primary" onClick={() => save()} disabled={!dirty}>저장</button>
        {est.status === '검토중'
          ? <button onClick={() => (pending ? toast(`미검토 항목 ${pending}건이 남아 있습니다`) : save(true))}>검토완료 처리</button>
          : <button onClick={() => save(false)}>검토중으로 되돌리기</button>}
      </div>
    </div>
  )
}
