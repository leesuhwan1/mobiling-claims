import { useEffect, useState } from 'react'
import { supabase, won, toInt } from '../lib'
import { useToast } from '../ui'
import { useAuth } from '../App'

// [key, label, {req, type: text|num|bool|area, tpl: 양식 섹션(목록에 표시 안 함), def}]
const CONF = {
  insurers: {
    title: '보험사',
    cols: [
      ['name', '보험사명', { req: true }], ['contact_name', '담당자'], ['phone', '연락처'], ['email', '이메일'],
      ['base_fee', '기본 수수료(원)', { type: 'num' }], ['memo', '메모'],
      ['report_title', '사정서 제목', { tpl: true, def: '손해사정서' }],
      ['report_recipient', '수신 부서·직함 (예: 대물보상팀장)', { tpl: true }],
      ['report_show_vehicles', '차량 및 수리 내역 표시', { tpl: true, type: 'bool', def: true }],
      ['report_show_items', '견적 항목별 검토 내역 표시', { tpl: true, type: 'bool', def: true }],
      ['report_show_adjust_reason', '조정사유 열 표시', { tpl: true, type: 'bool', def: true }],
      ['report_show_photos', '사진 자료 첨부 (사고·손상·수리후 사진)', { tpl: true, type: 'bool', def: false }],
      ['report_note', '보험사 요청 문구 (사정 의견 아래 표시)', { tpl: true, type: 'area' }],
    ],
  },
  repair_shops: {
    title: '정비공장',
    cols: [['name', '공장명', { req: true }], ['biz_no', '사업자번호'], ['owner_name', '대표자'], ['phone', '연락처'], ['address', '주소'],
      ['labor_rate', '시간당 공임(원)', { type: 'num' }], ['memo', '메모']],
  },
}

export default function Masters() {
  const [tab, setTab] = useState('repair_shops')
  const [toast, toastEl] = useToast()
  return (
    <div>
      {toastEl}
      <h2>보험사·정비공장</h2>
      <div className="tabs">
        {Object.entries(CONF).map(([k, c]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{c.title}</button>)}
      </div>
      <MasterTable key={tab} table={tab} conf={CONF[tab]} toast={toast} />
    </div>
  )
}

function Input({ col, value, onChange }) {
  const [k, l, o = {}] = col
  if (o.type === 'bool') return (
    <label className="inline check" key={k}><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {l}</label>
  )
  if (o.type === 'area') return <label className="wide" key={k}>{l}<textarea rows={2} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></label>
  return <label key={k}>{l}<input required={o.req} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></label>
}

function MasterTable({ table, conf, toast }) {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [edit, setEdit] = useState(null)
  const [q, setQ] = useState('')
  const load = () => supabase.from(table).select('*').order('name').then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [table])

  const main = conf.cols.filter(([, , o = {}]) => !o.tpl)
  const tpl = conf.cols.filter(([, , o = {}]) => o.tpl)

  async function save(e) {
    e.preventDefault()
    const payload = {}
    for (const [k, , o = {}] of conf.cols) {
      const v = edit[k]
      if (o.type === 'bool') payload[k] = !!v
      else if (o.type === 'num') payload[k] = toInt(v)
      else payload[k] = v === '' || v == null ? (o.def ?? null) : v
    }
    const r = edit.id ? await supabase.from(table).update(payload).eq('id', edit.id) : await supabase.from(table).insert(payload)
    if (r.error) return toast(r.error.code === '23505' ? '이미 등록된 이름입니다' : r.error.message)
    setEdit(null); load(); toast('저장되었습니다')
  }
  async function del(row) {
    if (!confirm(`${row.name}을(를) 삭제할까요?`)) return
    const r = await supabase.from(table).delete().eq('id', row.id)
    if (r.error) return toast(r.error.code === '23503' ? '사건에서 사용 중이라 삭제할 수 없습니다' : r.error.message)
    load()
  }
  const blank = () => Object.fromEntries(conf.cols.map(([k, , o = {}]) => [k, o.def ?? '']))
  const set = (k) => (v) => setEdit({ ...edit, [k]: v })

  const shown = rows.filter((r) => !q || main.some(([k]) => String(r[k] ?? '').includes(q)))
  return (
    <div className="card">
      <div className="head">
        <input placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
        <button onClick={() => setEdit(blank())}>+ {conf.title} 등록</button>
      </div>
      {edit && (
        <form className="subform" onSubmit={save}>
          <div className="form">{main.map((c) => <Input key={c[0]} col={c} value={edit[c[0]]} onChange={set(c[0])} />)}</div>
          {tpl.length > 0 && <>
            <h3 style={{ marginTop: 6 }}>사정서 양식</h3>
            <p className="muted small">이 보험사 사건의 손해사정서를 출력할 때 적용됩니다.</p>
            <div className="form">{tpl.map((c) => <Input key={c[0]} col={c} value={edit[c[0]]} onChange={set(c[0])} />)}</div>
          </>}
          <button className="primary">저장</button> <button type="button" onClick={() => setEdit(null)}>취소</button>
        </form>
      )}
      <table>
        <thead><tr>{main.map(([k, l]) => <th key={k}>{l}</th>)}{tpl.length > 0 && <th>사정서 양식</th>}<th></th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              {main.map(([k, , o = {}]) => <td key={k} className={o.type === 'num' ? 'num' : ''}>{o.type === 'num' ? won(r[k]) : r[k] || '-'}</td>)}
              {tpl.length > 0 && <td className="small">{r.report_title}{r.report_show_photos ? ' · 사진' : ''}{!r.report_show_items ? ' · 항목생략' : ''}</td>}
              <td className="nowrap">
                <button className="link" onClick={() => setEdit({ ...blank(), ...r })}>수정</button>
                {isAdmin && <button className="link danger" onClick={() => del(r)}>삭제</button>}
              </td>
            </tr>
          ))}
          {shown.length === 0 && <tr><td colSpan={main.length + 2} className="muted">등록된 {conf.title}이(가) 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
