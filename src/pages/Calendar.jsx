import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, SCHEDULE_KINDS, toLocalInput, fromLocalInput } from '../lib'
import { Field, Select } from '../ui'
import { useAuth } from '../App'

export const KIND_COLORS = {
  현장조사: '#2563eb', 입고확인: '#ea7a12', 출고확인: '#0f9a63', 면담: '#7c3aed', 기타: '#64748b',
}
const START_H = 7, END_H = 21, ROW = 56 // 시간당 56px
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const same = (a, b) => sod(a).getTime() === sod(b).getTime()
const hm = (d) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

function viewRange(mode, cursor) {
  const c = sod(cursor)
  if (mode === 'day') return { start: c, days: 1 }
  if (mode === '3day') return { start: c, days: 3 }
  if (mode === 'week') return { start: addDays(c, -c.getDay()), days: 7 }
  const first = new Date(c.getFullYear(), c.getMonth(), 1)
  const start = addDays(first, -first.getDay())
  const last = new Date(c.getFullYear(), c.getMonth() + 1, 0)
  const days = Math.ceil((last - start) / 86400000 + 1 + (6 - last.getDay()))
  return { start, days }
}

// 겹치는 일정은 나란히 배치 (일정 길이는 1시간으로 본다)
function layout(events) {
  const sorted = [...events].sort((a, b) => a.t - b.t)
  const out = []
  let group = [], groupEnd = 0
  const flush = () => {
    const cols = []
    for (const e of group) {
      let i = cols.findIndex((end) => end <= e.t)
      if (i < 0) { i = cols.length; cols.push(0) }
      cols[i] = e.t + 3600000
      e.col = i
    }
    for (const e of group) out.push({ ...e, cols: cols.length })
    group = []
  }
  for (const e of sorted) {
    if (group.length && e.t >= groupEnd) flush()
    group.push(e); groupEnd = Math.max(groupEnd, e.t + 3600000)
  }
  if (group.length) flush()
  return out
}

export default function Calendar({ refs, toast }) {
  const { profile } = useAuth()
  const [mode, setMode] = useState(() => (window.innerWidth < 700 ? 'day' : 'week'))
  const [cursor, setCursor] = useState(new Date())
  const [rows, setRows] = useState([])
  const [hidden, setHidden] = useState([])
  const [mine, setMine] = useState(false)
  const [showDone, setShowDone] = useState(true)
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null)
  const [claims, setClaims] = useState([])

  const { start, days } = useMemo(() => viewRange(mode, cursor), [mode, cursor])
  const end = addDays(start, days)

  const load = () => {
    let q = supabase.from('schedules').select('*, claims(claim_no, victim_name), profiles:profiles!schedules_adjuster_id_fkey(name)')
      .gte('scheduled_at', start.toISOString()).lt('scheduled_at', end.toISOString()).order('scheduled_at')
    if (mine) q = q.eq('adjuster_id', profile?.id)
    q.then(({ data }) => setRows(data || []))
  }
  useEffect(() => { load() }, [start.getTime(), days, mine])
  useEffect(() => {
    supabase.from('claims').select('id, claim_no, victim_name, insured_name').not('status', 'in', '("종결","취소")')
      .order('id', { ascending: false }).limit(300).then(({ data }) => setClaims(data || []))
  }, [])

  const events = rows.filter((r) => !hidden.includes(r.kind) && (showDone || !r.done))
    .map((r) => ({ ...r, d: new Date(r.scheduled_at), t: new Date(r.scheduled_at).getTime() }))

  const move = (dir) => {
    if (dir === 0) return setCursor(new Date())
    const n = mode === 'day' ? 1 : mode === '3day' ? 3 : mode === 'week' ? 7 : 0
    if (n) setCursor(addDays(cursor, n * dir))
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1))
  }
  const title = mode === 'month'
    ? `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`
    : days === 1
      ? `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 (${DAYS[start.getDay()]})`
      : `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 – ${addDays(start, days - 1).getMonth() + 1}월 ${addDays(start, days - 1).getDate()}일`

  const openNew = (date, hour) => {
    const d = new Date(date); d.setHours(hour ?? 10, 0, 0, 0)
    setDetail(null)
    setForm({ kind: '현장조사', scheduled_at: toLocalInput(d), adjuster_id: profile?.id || '', claim_id: '', location: '', memo: '' })
  }
  async function save(e) {
    e.preventDefault()
    const { id, ...rest } = form
    const payload = {
      kind: rest.kind, scheduled_at: fromLocalInput(rest.scheduled_at), adjuster_id: rest.adjuster_id || null,
      claim_id: rest.claim_id || null, location: rest.location || null, memo: rest.memo || null,
    }
    const r = id ? await supabase.from('schedules').update(payload).eq('id', id) : await supabase.from('schedules').insert(payload)
    if (r.error) return toast(r.error.message)
    setForm(null); load(); toast(id ? '일정이 수정되었습니다' : '일정이 등록되었습니다')
  }
  async function toggleDone(s) {
    await supabase.from('schedules').update({ done: !s.done }).eq('id', s.id)
    setDetail({ ...s, done: !s.done }); load()
  }
  async function del(s) {
    if (!confirm('이 일정을 삭제할까요?')) return
    const r = await supabase.from('schedules').delete().eq('id', s.id)
    if (r.error) return toast(r.error.message)
    setDetail(null); load()
  }

  const dayList = Array.from({ length: mode === 'month' ? 0 : days }, (_, i) => addDays(start, i))
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i)
  const now = new Date()
  const label = (s) => `${s.claims?.claim_no ? s.claims.claim_no + ' ' : ''}${s.claims?.victim_name || s.location || s.memo || ''}`

  return (
    <div className="cal">
      <div className="cal-bar">
        <button className="primary" onClick={() => openNew(same(cursor, now) ? now : cursor, same(cursor, now) ? Math.min(now.getHours() + 1, END_H - 1) : 10)}>+ 새 일정</button>
        <div className="actions">
          <button onClick={() => move(-1)} aria-label="이전">◀</button>
          <button onClick={() => move(0)}>오늘</button>
          <button onClick={() => move(1)} aria-label="다음">▶</button>
        </div>
        <b className="cal-title">{title}</b>
        <div className="seg">
          {[['day', '일'], ['3day', '3일'], ['week', '주'], ['month', '월']].map(([k, l]) => (
            <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="cal-lanes">
        <span className="muted small">업무 구분</span>
        {SCHEDULE_KINDS.map((k, i) => (
          <button key={k} className={`lane ${hidden.includes(k) ? 'off' : ''}`} style={{ '--c': KIND_COLORS[k] }}
            onClick={() => setHidden(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k])}>
            {i + 1} {k}
          </button>
        ))}
        <label className="inline small"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> 내 일정만</label>
        <label className="inline small"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> 완료 포함</label>
      </div>

      {mode !== 'month' ? (
        <div className="cal-grid card" style={{ '--n': days }}>
          <div className="cal-head">
            <div />
            {dayList.map((d) => (
              <div key={d} className={`cal-dh ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}`}>
                <small>{d.getMonth() + 1}월 {DAYS[d.getDay()]}</small>
                <b className={same(d, now) ? 'today' : ''}>{d.getDate()}</b>
              </div>
            ))}
          </div>
          <div className="cal-body" style={{ height: hours.length * ROW }}>
            <div className="cal-hours">{hours.map((h) => <div key={h} style={{ height: ROW }}>{h}시</div>)}</div>
            {dayList.map((d) => {
              const evs = layout(events.filter((e) => same(e.d, d)))
              return (
                <div key={d} className={`cal-col ${same(d, now) ? 'is-today' : ''}`}>
                  {hours.map((h) => <div key={h} className="cal-slot" style={{ height: ROW }} onClick={() => openNew(d, h)} />)}
                  {same(d, now) && now.getHours() >= START_H && now.getHours() < END_H && (
                    <div className="cal-now" style={{ top: (now.getHours() - START_H + now.getMinutes() / 60) * ROW }} />
                  )}
                  {evs.map((e) => {
                    const h = Math.min(Math.max(e.d.getHours() + e.d.getMinutes() / 60, START_H), END_H - 1)
                    return (
                      <button key={e.id} className={`cal-ev ${e.done ? 'done' : ''}`}
                        style={{ top: (h - START_H) * ROW + 1, height: ROW - 3, left: `${(e.col / e.cols) * 100}%`, width: `calc(${100 / e.cols}% - 3px)`, '--c': KIND_COLORS[e.kind] }}
                        onClick={(ev) => { ev.stopPropagation(); setForm(null); setDetail(e) }}>
                        <b>{hm(e.d)} {e.kind}</b>
                        <span>{label(e)}</span>
                        {e.profiles?.name && <span className="who">{e.profiles.name}</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
          {events.some((e) => e.d.getHours() < START_H || e.d.getHours() >= END_H) && (
            <p className="muted small" style={{ padding: '6px 10px' }}>{START_H}시 이전·{END_H}시 이후 일정은 맨 위·아래 칸에 표시됩니다.</p>
          )}
        </div>
      ) : (
        <div className="cal-month card">
          {DAYS.map((d, i) => <div key={d} className={`cal-mh ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{d}</div>)}
          {Array.from({ length: days }, (_, i) => addDays(start, i)).map((d) => {
            const evs = events.filter((e) => same(e.d, d))
            const other = d.getMonth() !== cursor.getMonth()
            return (
              <div key={d} className={`cal-cell ${other ? 'other' : ''}`} onClick={() => openNew(d, 10)}>
                <span className={`num ${same(d, now) ? 'today' : ''} ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}`}
                  onClick={(ev) => { ev.stopPropagation(); setCursor(d); setMode('day') }}>{d.getDate()}</span>
                {evs.slice(0, 3).map((e) => (
                  <button key={e.id} className={`cal-chip ${e.done ? 'done' : ''}`} style={{ '--c': KIND_COLORS[e.kind] }}
                    onClick={(ev) => { ev.stopPropagation(); setForm(null); setDetail(e) }}>
                    {hm(e.d)} {e.kind} {e.claims?.claim_no ? '· ' + e.claims.claim_no.slice(-4) : ''}
                  </button>
                ))}
                {evs.length > 3 && <button className="cal-more" onClick={(ev) => { ev.stopPropagation(); setCursor(d); setMode('day') }}>+{evs.length - 3}건 더</button>}
              </div>
            )
          })}
        </div>
      )}

      {detail && (
        <div className="cal-pop card">
          <div className="head">
            <span className="lane" style={{ '--c': KIND_COLORS[detail.kind] }}>{detail.kind}</span>
            <button className="link" onClick={() => setDetail(null)}>닫기 ✕</button>
          </div>
          <h3>{new Date(detail.scheduled_at).toLocaleString('ko-KR', { dateStyle: 'full', timeStyle: 'short' })}</h3>
          <dl>
            <dt>사건</dt><dd>{detail.claim_id ? <Link to={`/claims/${detail.claim_id}`}>{detail.claims?.claim_no} {detail.claims?.victim_name || ''}</Link> : '-'}</dd>
            <dt>담당</dt><dd>{detail.profiles?.name || '-'}</dd>
            <dt>장소</dt><dd>{detail.location || '-'}</dd>
            <dt>메모</dt><dd>{detail.memo || '-'}</dd>
            <dt>상태</dt><dd>{detail.done ? '완료' : '예정'}</dd>
          </dl>
          <div className="actions">
            <button className="primary" onClick={() => toggleDone(detail)}>{detail.done ? '예정으로 되돌리기' : '완료 처리'}</button>
            <button onClick={() => { setForm({ id: detail.id, kind: detail.kind, scheduled_at: toLocalInput(detail.scheduled_at), adjuster_id: detail.adjuster_id || '', claim_id: detail.claim_id || '', location: detail.location || '', memo: detail.memo || '' }); setDetail(null) }}>수정</button>
            <button className="danger" onClick={() => del(detail)}>삭제</button>
          </div>
        </div>
      )}

      {form && (
        <form className="cal-pop card" onSubmit={save}>
          <div className="head"><h3>{form.id ? '일정 수정' : '새 일정'}</h3><button type="button" className="link" onClick={() => setForm(null)}>닫기 ✕</button></div>
          <div className="form">
            <Field label="구분"><Select value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={SCHEDULE_KINDS} empty={false} /></Field>
            <Field label="일시"><input required type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></Field>
            <Field label="담당자"><Select value={form.adjuster_id} onChange={(v) => setForm({ ...form, adjuster_id: v })} options={refs.users.map((u) => ({ value: u.id, label: u.name }))} /></Field>
            <Field label="사건"><Select value={form.claim_id} onChange={(v) => setForm({ ...form, claim_id: v })} empty="사건 없음"
              options={claims.map((c) => ({ value: c.id, label: `${c.claim_no} ${c.victim_name || c.insured_name || ''}` }))} /></Field>
            <Field label="장소" wide><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="예: ○○공업사 (경기 화성시 …)" /></Field>
            <Field label="메모" wide><input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></Field>
          </div>
          <button className="primary">{form.id ? '수정 저장' : '등록'}</button>
        </form>
      )}
    </div>
  )
}
