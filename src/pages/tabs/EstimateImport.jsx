import { useRef, useState } from 'react'
import { supabase, won, toInt, ITEM_CATEGORIES, OPERATIONS } from '../../lib'
import { Field, Select } from '../../ui'
import { parseEstimateFile } from '../../estimateImport'

// AOS 견적서(엑셀·CSV·PDF) 불러오기: 파일 → 자동 인식 → 미리보기 확인·수정 → 견적서로 반영
export default function EstimateImport({ claim, vehicles, shops, estimates, onDone, onClose, toast }) {
  const input = useRef()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState(null)
  const [rows, setRows] = useState([])
  const [target, setTarget] = useState({ mode: 'new', estimate_id: '', vehicle_id: vehicles[0]?.id || '', repair_shop_id: vehicles[0]?.repair_shop_id || '', estimate_date: new Date().toLocaleDateString('sv-SE') })
  const [keepFile, setKeepFile] = useState(true)

  async function pick(f) {
    if (!f) return
    setFile(f); setErr(''); setRes(null); setBusy(true)
    try {
      const r = await parseEstimateFile(f)
      setRes(r); setRows(r.rows.map((x, i) => ({ ...x, _k: i })))
      // 견적서의 차량번호·정비공장으로 대상 자동 선택
      const car = r.meta.plate && vehicles.find((v) => v.plate_no?.replace(/\s/g, '') === r.meta.plate)
      const shop = r.meta.shop && shops.find((s) => s.name.includes(r.meta.shop) || r.meta.shop.includes(s.name))
      setTarget((t) => ({ ...t, vehicle_id: car?.id || t.vehicle_id, repair_shop_id: shop?.id || car?.repair_shop_id || t.repair_shop_id }))
      if (!r.rows.length) setErr('항목을 찾지 못했습니다. 견적서 양식이 예상과 다를 수 있습니다. 샘플 파일을 전달해 주시면 이 양식에 맞게 맞춰 드립니다.')
    } catch (e) {
      setErr(e.message || '파일을 읽지 못했습니다')
    }
    setBusy(false)
  }

  const upd = (k, f, v) => setRows(rows.map((r) => {
    if (r._k !== k) return r
    const n = { ...r, [f]: v }
    if (f === 'qty' || f === 'unit_price') n.claimed_amount = Math.round(Number(n.qty || 0) * (toInt(n.unit_price) || 0))
    return n
  }))
  const chosen = rows.filter((r) => r.include && r.item_name)
  const sum = chosen.reduce((a, r) => a + (toInt(r.claimed_amount) || 0), 0)
  // 견적서에 적힌 합계(공급가액·합계·총계) 중 반영 합계와 같은 것이 있으면 일치, 없으면 가장 가까운 값과 비교
  const totals = res?.meta?.totals || []
  const docTotal = totals.length ? totals.reduce((a, b) => (Math.abs(b - sum) < Math.abs(a - sum) ? b : a)) : null
  const diff = docTotal != null ? sum - docTotal : null
  const sumBy = (c) => chosen.filter((r) => r.category === c).reduce((a, r) => a + (toInt(r.claimed_amount) || 0), 0)

  async function apply() {
    if (!chosen.length) return toast('반영할 항목이 없습니다')
    setBusy(true)
    let estimateId = target.estimate_id
    if (target.mode === 'new') {
      const same = estimates.filter((x) => String(x.vehicle_id) === String(target.vehicle_id))
      const { data, error } = await supabase.from('estimates').insert({
        claim_id: claim.id, vehicle_id: target.vehicle_id || null, repair_shop_id: target.repair_shop_id || null,
        estimate_date: target.estimate_date || null, version: same.length + 1, memo: `견적서 불러오기: ${file.name}`,
      }).select('id').single()
      if (error) { setBusy(false); return toast(error.message) }
      estimateId = data.id
    }
    if (!estimateId) { setBusy(false); return toast('추가할 견적서를 선택하세요') }
    const { data: existing } = await supabase.from('estimate_items').select('seq').eq('estimate_id', estimateId)
    const start = Math.max(0, ...(existing || []).map((x) => x.seq || 0))
    const items = chosen.map((r, i) => ({
      estimate_id: estimateId, seq: start + i + 1, category: r.category, item_name: r.item_name.slice(0, 200),
      operation: r.operation || null, qty: Number(r.qty) || 1, unit_price: toInt(r.unit_price) || 0,
      claimed_amount: toInt(r.claimed_amount) || 0, approved_amount: null, adjust_reason: null,
    }))
    const { error } = await supabase.from('estimate_items').insert(items)
    if (error) { setBusy(false); return toast(error.message) }
    if (keepFile) {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${claim.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const up = await supabase.storage.from('claim-files').upload(path, file, { contentType: file.type || undefined })
      if (!up.error) await supabase.from('attachments').insert({ claim_id: claim.id, category: '견적서', file_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size, memo: '견적서 불러오기 원본' })
    }
    if (['접수', '배정', '현장조사'].includes(claim.status)) await supabase.from('claims').update({ status: '견적검토' }).eq('id', claim.id)
    setBusy(false)
    toast(`${items.length}개 항목을 불러왔습니다. 인정금액을 검토하세요.`)
    onDone(estimateId)
  }

  return (
    <div className="card import">
      <div className="head">
        <h3>견적서 불러오기 <span className="muted small">AOS 견적서 등 · 엑셀(.xlsx) · CSV · PDF</span></h3>
        <button className="link" onClick={onClose}>닫기 ✕</button>
      </div>

      <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}>
        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => input.current.click()}>{busy ? '읽는 중…' : '파일 선택'}</button>
          <span>{file ? file.name : '견적서 파일을 끌어다 놓거나 선택하세요'}</span>
          <input ref={input} type="file" hidden accept=".xlsx,.xls,.csv,.tsv,.txt,.pdf" onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }} />
        </div>
      </div>
      {err && <p className="msg">{err}</p>}

      {res && rows.length > 0 && <>
        <div className="import-sum">
          <div><span>인식 항목</span><b>{rows.length}개</b><small>{res.method}</small></div>
          <div><span>부품</span><b>{won(sumBy('부품'))}</b></div>
          <div><span>공임</span><b>{won(sumBy('공임'))}</b></div>
          <div><span>도장</span><b>{won(sumBy('도장'))}</b></div>
          <div><span>반영 합계</span><b>{won(sum)}</b><small>{chosen.length}개 선택</small></div>
          <div className={diff ? 'bad' : docTotal ? 'good' : ''}>
            <span>견적서 합계</span><b>{docTotal ? won(docTotal) : '찾지 못함'}</b>
            <small>{docTotal == null ? '직접 대조해 주세요' : diff ? `차이 ${won(diff)} — 빠진 줄이나 잘못 읽은 금액 확인` : '반영 합계와 일치'}</small>
          </div>
        </div>
        <p className="muted small">자동 인식 결과입니다. 구분·작업·금액이 틀린 줄은 고치고, 합계·메모 같은 불필요한 줄은 체크를 해제한 뒤 반영하세요.
          {res.meta.plate && <> 견적서 차량번호: <b>{res.meta.plate}</b>.</>}</p>
        {res.meta.plate && vehicles.length > 0 && !vehicles.some((v) => v.plate_no?.replace(/\s/g, '') === res.meta.plate) && (
          <p className="msg">견적서의 차량번호 {res.meta.plate}가 이 사건에 등록된 차량({vehicles.map((v) => v.plate_no).join(', ')})과 다릅니다. 다른 사건의 견적서가 아닌지 확인하세요.</p>
        )}

        <div className="scroll">
          <table className="items">
            <thead><tr><th><input type="checkbox" checked={rows.every((r) => r.include)} onChange={(e) => setRows(rows.map((r) => ({ ...r, include: e.target.checked })))} /></th>
              <th>구분</th><th>품명/작업내용</th><th>작업</th><th>수량</th><th>단가</th><th>청구금액</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._k} className={r.include ? '' : 'off'}>
                  <td><input type="checkbox" checked={r.include} onChange={(e) => upd(r._k, 'include', e.target.checked)} /></td>
                  <td><Select value={r.category} onChange={(v) => upd(r._k, 'category', v)} options={ITEM_CATEGORIES} empty={false} /></td>
                  <td><input value={r.item_name} onChange={(e) => upd(r._k, 'item_name', e.target.value)} /></td>
                  <td><Select value={r.operation} onChange={(v) => upd(r._k, 'operation', v)} options={OPERATIONS} empty="-" /></td>
                  <td><input className="num s" value={r.qty} onChange={(e) => upd(r._k, 'qty', e.target.value)} /></td>
                  <td><input className="num" value={r.unit_price} onChange={(e) => upd(r._k, 'unit_price', e.target.value)} /></td>
                  <td><input className="num" value={r.claimed_amount} onChange={(e) => upd(r._k, 'claimed_amount', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="subform">
          <div className="form">
            <Field label="반영 방법">
              <Select value={target.mode} onChange={(v) => setTarget({ ...target, mode: v })} empty={false}
                options={[{ value: 'new', label: '새 견적서로 등록' }, ...(estimates.length ? [{ value: 'append', label: '기존 견적서에 추가' }] : [])]} />
            </Field>
            {target.mode === 'new' ? <>
              <Field label="차량"><Select value={target.vehicle_id} onChange={(v) => setTarget({ ...target, vehicle_id: v, repair_shop_id: vehicles.find((x) => String(x.id) === v)?.repair_shop_id || target.repair_shop_id })} options={vehicles.map((v) => ({ value: v.id, label: v.plate_no }))} /></Field>
              <Field label="정비공장"><Select value={target.repair_shop_id} onChange={(v) => setTarget({ ...target, repair_shop_id: v })} options={shops.map((s) => ({ value: s.id, label: s.name }))} /></Field>
              <Field label="견적일"><input type="date" value={target.estimate_date} onChange={(e) => setTarget({ ...target, estimate_date: e.target.value })} /></Field>
            </> : (
              <Field label="추가할 견적서"><Select value={target.estimate_id} onChange={(v) => setTarget({ ...target, estimate_id: v })}
                options={estimates.map((e) => ({ value: e.id, label: `${e.vehicles?.plate_no || '차량 미지정'} ${e.version}차` }))} /></Field>
            )}
          </div>
          <label className="inline small"><input type="checkbox" checked={keepFile} onChange={(e) => setKeepFile(e.target.checked)} /> 원본 파일을 첨부파일(견적서)로 함께 보관</label>
          <div className="actions" style={{ marginTop: 10 }}>
            <button className="primary" disabled={busy || !chosen.length} onClick={apply}>{chosen.length}개 항목 반영</button>
            <button onClick={onClose}>취소</button>
          </div>
        </div>
      </>}
    </div>
  )
}
