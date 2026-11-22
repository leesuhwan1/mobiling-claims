import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, OPEN_STATUSES, fmtDateTime } from './lib'

// 사이드바 알림: DB 알림(배정·진행) + 내 담당 사건의 처리기한 임박/초과(화면에서 계산)
export default function Notifications({ userId }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [due, setDue] = useState([])

  const load = useCallback(async () => {
    if (!userId) return
    const soon = new Date(); soon.setDate(soon.getDate() + 2)
    const [n, c] = await Promise.all([
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('claims').select('id, claim_no, due_date, status, victim_name')
        .eq('assigned_to', userId).in('status', OPEN_STATUSES).not('due_date', 'is', null)
        .lte('due_date', soon.toLocaleDateString('sv-SE')).order('due_date'),
    ])
    setItems(n.data || []); setDue(c.data || [])
  }, [userId])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  const unread = items.filter((i) => !i.read_at)
  const count = unread.length + due.length
  const today = new Date().toLocaleDateString('sv-SE')

  async function go(n) {
    if (!n.read_at) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    setOpen(false); load()
    if (n.claim_id) nav(`/claims/${n.claim_id}`)
  }
  async function readAll() {
    if (!unread.length) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread.map((i) => i.id))
    load()
  }

  return (
    <div className="noti">
      <button className="noti-btn" onClick={() => { setOpen(!open); if (!open) load() }}>
        알림 {count > 0 && <span className="noti-count">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="noti-panel">
          <div className="head">
            <b>알림</b>
            <button className="link" onClick={readAll} disabled={!unread.length}>모두 읽음</button>
          </div>
          {due.length > 0 && (
            <div className="noti-sec">
              <small>처리기한 임박·초과 (내 담당)</small>
              {due.map((c) => (
                <button key={c.id} className="noti-item warn" onClick={() => { setOpen(false); nav(`/claims/${c.id}`) }}>
                  <b>{c.claim_no}</b> {c.victim_name || ''}
                  <span className={c.due_date < today ? 'danger' : ''}>
                    {c.due_date < today ? `기한 초과 (${c.due_date})` : c.due_date === today ? '오늘 마감' : `마감 ${c.due_date}`} · {c.status}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="noti-sec">
            {items.length === 0 && <p className="muted small">새 알림이 없습니다.</p>}
            {items.map((n) => (
              <button key={n.id} className={`noti-item ${n.read_at ? 'read' : ''}`} onClick={() => go(n)}>
                <span className="tag">{n.kind}</span> {n.message}
                <span className="muted">{fmtDateTime(n.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
