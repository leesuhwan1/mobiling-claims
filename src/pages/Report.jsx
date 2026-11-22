import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, won, fmtDate, fmtDateTime, calcPayable } from '../lib'

// 보험사에 양식 설정이 없을 때의 기본값
const DEFAULT_TPL = {
  report_title: '손해사정서', report_recipient: null, report_show_vehicles: true, report_show_items: true,
  report_show_adjust_reason: true, report_show_photos: false, report_note: null,
}
const spaced = (t) => (t.length <= 6 ? t.split('').join(' ') : t)

export default function Report() {
  const { id } = useParams()
  const [d, setD] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('claims').select('*, insurers(*), assignee:profiles!claims_assigned_to_fkey(name, license_no, phone)').eq('id', id).single(),
      supabase.from('vehicles').select('*, repair_shops(name)').eq('claim_id', id).order('id'),
      supabase.from('estimates').select('*, vehicles(plate_no), repair_shops(name), estimate_items(*)').eq('claim_id', id).order('id'),
      supabase.from('assessments').select('*').eq('claim_id', id).maybeSingle(),
      supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('attachments').select('file_path, file_name, category, mime_type').eq('claim_id', id)
        .in('category', ['사고사진', '손상사진', '수리후사진']).order('category').order('created_at'),
    ]).then(async ([c, v, e, a, s, ph]) => {
      const tpl = { ...DEFAULT_TPL, ...(c.data?.insurers || {}) }
      let photos = []
      const imgs = (ph.data || []).filter((p) => p.mime_type?.startsWith('image/'))
      if (tpl.report_show_photos && imgs.length) {
        const { data } = await supabase.storage.from('claim-files').createSignedUrls(imgs.map((p) => p.file_path), 3600)
        const m = Object.fromEntries((data || []).map((x) => [x.path, x.signedUrl]))
        photos = imgs.map((p) => ({ ...p, url: m[p.file_path] })).filter((p) => p.url)
      }
      setD({ claim: c.data, vehicles: v.data || [], estimates: e.data || [], a: a.data, co: s.data || {}, tpl, photos })
    })
  }, [id])

  if (!d) return <div className="center muted">불러오는 중…</div>
  if (!d.claim) return <div className="center muted">사건을 찾을 수 없습니다.</div>
  const { claim: c, vehicles, estimates, a, co, tpl, photos } = d
  const items = estimates.flatMap((e) => e.estimate_items)
  const claimed = a?.claimed_total ?? items.reduce((s, i) => s + i.claimed_amount, 0)
  const approved = a?.approved_total ?? items.reduce((s, i) => s + (i.approved_amount ?? 0), 0)
  const payable = a ? a.payable_amount : calcPayable({ approved_total: approved })
  let n = 0
  const sec = (t) => <h2>{++n}. {t}</h2>
  const reason = tpl.report_show_adjust_reason

  return (
    <div className="report">
      <div className="noprint bar-top">
        <button className="primary" onClick={() => window.print()}>인쇄 / PDF 저장</button>
        {a?.status !== '확정' && <span className="msg">아직 확정되지 않은 사정서입니다 (초안)</span>}
        <span className="muted small">양식: {c.insurers?.name ? `${c.insurers.name} 설정` : '기본'}</span>
      </div>
      <div className="paper">
        {a?.status !== '확정' && <div className="draft">초안</div>}
        <h1>{spaced(tpl.report_title || '손해사정서')}</h1>
        <table className="kv">
          <tbody>
            <tr><th>수 신</th><td>{c.insurers?.name || '-'} {tpl.report_recipient || ''} 귀중</td><th>접수번호</th><td>{c.claim_no}</td></tr>
            <tr><th>보험사 사고번호</th><td>{c.insurer_claim_no || '-'}</td><th>담보</th><td>{c.coverage}</td></tr>
            <tr><th>피보험자</th><td>{c.insured_name || '-'}</td><th>피해자</th><td>{c.victim_name || '-'}</td></tr>
            <tr><th>사고일시</th><td>{fmtDateTime(c.accident_at)}</td><th>사고장소</th><td>{c.accident_place || '-'}</td></tr>
            <tr><th>사고경위</th><td colSpan={3} className="pre">{c.accident_desc || '-'}</td></tr>
          </tbody>
        </table>

        {tpl.report_show_vehicles && <>
          {sec('차량 및 수리 내역')}
          <table className="grid">
            <thead><tr><th>구분</th><th>차량번호</th><th>차종</th><th>연식</th><th>정비공장</th><th>입고일</th><th>출고일</th></tr></thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}><td>{v.party}</td><td>{v.plate_no}</td><td>{[v.maker, v.model].filter(Boolean).join(' ')}</td><td>{v.model_year || ''}</td>
                  <td>{v.repair_shops?.name || ''}</td><td>{fmtDate(v.in_date)}</td><td>{fmtDate(v.out_date)}</td></tr>
              ))}
              {vehicles.length === 0 && <tr><td colSpan={7}>-</td></tr>}
            </tbody>
          </table>
        </>}

        {sec('손해액 산정')}
        <table className="kv money">
          <tbody>
            <tr><th>청구 수리비</th><td>{won(claimed)} 원</td></tr>
            <tr><th>인정 수리비 (A)</th><td>{won(approved)} 원</td></tr>
            <tr><th>감가·공제 (B)</th><td>{won(a?.depreciation ?? 0)} 원</td></tr>
            <tr><th>책임비율 (C)</th><td>{a?.fault_ratio ?? 100} %</td></tr>
            <tr><th>자기부담금 (D)</th><td>{won(a?.deductible ?? 0)} 원</td></tr>
            <tr className="total"><th>지급액 (A−B)×C−D</th><td>{won(payable)} 원</td></tr>
          </tbody>
        </table>

        {tpl.report_show_items && <>
          {sec('견적 검토 내역')}
          {estimates.map((e) => {
            const ec = e.estimate_items.reduce((s, i) => s + i.claimed_amount, 0)
            const ea = e.estimate_items.reduce((s, i) => s + (i.approved_amount ?? 0), 0)
            return (
              <div key={e.id} className="est">
                <p><b>{e.vehicles?.plate_no || ''} {e.version}차 견적</b> · {e.repair_shops?.name || ''} · {fmtDate(e.estimate_date)}</p>
                <table className="grid">
                  <thead><tr><th>구분</th><th>품명/작업</th><th>작업</th><th>수량</th><th>청구금액</th><th>인정금액</th>{reason && <th>조정사유</th>}</tr></thead>
                  <tbody>
                    {[...e.estimate_items].sort((x, y) => x.seq - y.seq).map((i) => (
                      <tr key={i.id}><td>{i.category}</td><td>{i.item_name}</td><td>{i.operation || ''}</td><td className="r">{i.qty}</td>
                        <td className="r">{won(i.claimed_amount)}</td><td className="r">{won(i.approved_amount)}</td>{reason && <td>{i.adjust_reason || ''}</td>}</tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={4}>소계</td><td className="r">{won(ec)}</td><td className="r">{won(ea)}</td>{reason && <td>삭감 {won(ec - ea)}</td>}</tr></tfoot>
                </table>
              </div>
            )
          })}
          {estimates.length === 0 && <p>-</p>}
        </>}

        {tpl.report_show_photos && photos.length > 0 && <>
          {sec('사진 자료')}
          <div className="rphotos">
            {photos.map((p) => (
              <figure key={p.file_path}><img src={p.url} alt={p.file_name} /><figcaption>{p.category}</figcaption></figure>
            ))}
          </div>
        </>}

        {sec('사정 의견')}
        <div className="pre opinion">{a?.opinion || '-'}</div>

        {tpl.report_note && <p className="pre rnote">{tpl.report_note}</p>}

        <div className="sign">
          <p>{co.report_footer || '위와 같이 손해사정 결과를 보고합니다.'}</p>
          <p>{fmtDate(a?.issued_at || new Date())}</p>
          <p className="co">{co.company_name || '모빌링손해사정 주식회사'}</p>
          {(co.address || co.phone) && <p className="small">{[co.address, co.phone && `Tel ${co.phone}`].filter(Boolean).join(' · ')}</p>}
          <p>담당 손해사정사 {c.assignee?.name || '__________'} {c.assignee?.license_no && `(등록번호 ${c.assignee.license_no})`} (인)</p>
        </div>
      </div>
    </div>
  )
}
