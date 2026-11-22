import { useEffect, useRef, useState } from 'react'
import { supabase, fmtDateTime } from '../../lib'
import { Select } from '../../ui'
import { useAuth } from '../../App'

export const ATTACH_CATEGORIES = ['사고사진', '손상사진', '수리후사진', '견적서', '차량등록증', '기타서류']
const BUCKET = 'claim-files'
const MAX = 20 * 1024 * 1024
const isImage = (m) => m?.startsWith('image/')
const size = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.ceil(b / 1024) + 'KB')

export default function Attachments({ claimId, toast }) {
  const { profile, isAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [urls, setUrls] = useState({})
  const [cat, setCat] = useState('손상사진')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(0)
  const [drag, setDrag] = useState(false)
  const [view, setView] = useState(null)
  const input = useRef()

  const load = async () => {
    const { data } = await supabase.from('attachments').select('*, profiles:profiles!attachments_uploaded_by_fkey(name)')
      .eq('claim_id', claimId).order('created_at', { ascending: false })
    setRows(data || [])
    const paths = (data || []).map((r) => r.file_path)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      setUrls(Object.fromEntries((signed || []).map((s) => [s.path, s.signedUrl])))
    }
  }
  useEffect(() => { load() }, [claimId])

  async function upload(files) {
    const list = [...files]
    const tooBig = list.filter((f) => f.size > MAX)
    if (tooBig.length) toast(`20MB를 넘는 파일 ${tooBig.length}개는 제외했습니다`)
    const ok = list.filter((f) => f.size <= MAX)
    if (!ok.length) return
    setBusy(ok.length)
    let fail = 0
    for (const f of ok) {
      const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${claimId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined })
      if (up.error) { fail++; continue }
      const ins = await supabase.from('attachments').insert({
        claim_id: claimId, category: cat, file_path: path, file_name: f.name, mime_type: f.type || null, size_bytes: f.size,
      })
      if (ins.error) { fail++; await supabase.storage.from(BUCKET).remove([path]) }
      setBusy((n) => n - 1)
    }
    setBusy(0)
    toast(fail ? `${ok.length - fail}개 업로드, ${fail}개 실패` : `${ok.length}개 파일을 올렸습니다`)
    load()
  }

  async function del(r) {
    if (!confirm(`${r.file_name} 파일을 삭제할까요?`)) return
    const { error } = await supabase.from('attachments').delete().eq('id', r.id)
    if (error) return toast(error.message)
    await supabase.storage.from(BUCKET).remove([r.file_path])
    load()
  }
  async function changeCat(r, c) {
    await supabase.from('attachments').update({ category: c }).eq('id', r.id); load()
  }
  async function download(r) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.file_path, 300, { download: r.file_name })
    if (error) return toast(error.message)
    window.location.href = data.signedUrl
  }

  const shown = rows.filter((r) => !filter || r.category === filter)
  const images = shown.filter((r) => isImage(r.mime_type))
  const docs = shown.filter((r) => !isImage(r.mime_type))
  const counts = Object.fromEntries(ATTACH_CATEGORIES.map((c) => [c, rows.filter((r) => r.category === c).length]))
  const canDelete = (r) => isAdmin || r.uploaded_by === profile?.id

  return (
    <div className="card">
      <div
        className={`drop ${drag ? 'on' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}
      >
        <div className="actions">
          <span>분류</span>
          <Select value={cat} onChange={setCat} options={ATTACH_CATEGORIES} empty={false} />
          <button className="primary" disabled={busy > 0} onClick={() => input.current.click()}>
            {busy > 0 ? `올리는 중… (${busy})` : '파일 선택'}
          </button>
          <input ref={input} type="file" multiple hidden accept="image/*,.pdf,.xlsx,.xls,.doc,.docx,.hwp,.zip"
            onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
        </div>
        <p className="muted small">사진·PDF·엑셀·한글 파일을 여기로 끌어다 놓아도 됩니다. (파일당 20MB까지, 휴대폰에서는 카메라 촬영도 가능)</p>
      </div>

      <div className="chips" style={{ margin: '14px 0' }}>
        <button className={`chip ${!filter ? 'on' : ''}`} onClick={() => setFilter('')}><b>전체 {rows.length}</b></button>
        {ATTACH_CATEGORIES.map((c) => counts[c] > 0 && (
          <button key={c} className={`chip ${filter === c ? 'on' : ''}`} onClick={() => setFilter(c)}><b>{c} {counts[c]}</b></button>
        ))}
      </div>

      {rows.length === 0 && <p className="muted">첨부된 파일이 없습니다.</p>}

      {images.length > 0 && (
        <div className="gallery">
          {images.map((r) => (
            <figure key={r.id}>
              <img src={urls[r.file_path]} alt={r.file_name} loading="lazy" onClick={() => setView(r)} />
              <figcaption>
                <Select value={r.category} onChange={(c) => changeCat(r, c)} options={ATTACH_CATEGORIES} empty={false} />
                <span className="muted small">{fmtDateTime(r.created_at)}</span>
                <span>
                  <button className="link" onClick={() => download(r)}>받기</button>
                  {canDelete(r) && <button className="link danger" onClick={() => del(r)}>삭제</button>}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {docs.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>분류</th><th>파일명</th><th>크기</th><th>올린 사람</th><th>일시</th><th></th></tr></thead>
          <tbody>
            {docs.map((r) => (
              <tr key={r.id}>
                <td><Select value={r.category} onChange={(c) => changeCat(r, c)} options={ATTACH_CATEGORIES} empty={false} /></td>
                <td><a href={urls[r.file_path]} target="_blank" rel="noreferrer">{r.file_name}</a></td>
                <td>{size(r.size_bytes || 0)}</td>
                <td>{r.profiles?.name || '-'}</td>
                <td>{fmtDateTime(r.created_at)}</td>
                <td className="nowrap">
                  <button className="link" onClick={() => download(r)}>받기</button>
                  {canDelete(r) && <button className="link danger" onClick={() => del(r)}>삭제</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view && (
        <div className="lightbox" onClick={() => setView(null)}>
          <img src={urls[view.file_path]} alt={view.file_name} />
          <p>{view.category} · {view.file_name} — 클릭하면 닫힙니다</p>
        </div>
      )}
    </div>
  )
}
