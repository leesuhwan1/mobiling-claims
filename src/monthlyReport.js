import { supabase } from './lib'
import { exportXlsx } from './excel'

// 월별·보험사별·담당자별 실적을 엑셀로 내보낸다. year: '2026'
export async function exportMonthlyReport(year) {
  const from = `${year}-01-01`, to = `${Number(year) + 1}-01-01`
  const [c, a, f] = await Promise.all([
    supabase.from('claims').select('id, received_at, status, insurers(name), profiles:profiles!claims_assigned_to_fkey(name)').gte('received_at', from).lt('received_at', to),
    supabase.from('assessments').select('claim_id, issued_at, claimed_total, approved_total, payable_amount, claims(insurers(name), profiles:profiles!claims_assigned_to_fkey(name))')
      .eq('status', '확정').gte('issued_at', from).lt('issued_at', to),
    supabase.from('fees').select('supply_amount, vat, invoiced_at, paid_at, paid_amount, status, claims(insurers(name), profiles:profiles!claims_assigned_to_fkey(name))'),
  ])
  const claims = c.data || [], asm = a.data || [], fees = f.data || []
  const inYear = (d) => d && d >= from && d < to
  const mon = (d) => Number(d.slice(5, 7))
  const pct = (cl, ap) => (cl ? Math.round(((cl - ap) / cl) * 1000) / 10 : 0)

  const blank = () => ({ recv: 0, closed: 0, done: 0, cl: 0, ap: 0, pay: 0, billed: 0, paid: 0 })
  const add = (map, key) => (map[key] ||= blank())
  const months = {}, byIns = {}, byAdj = {}
  for (let m = 1; m <= 12; m++) months[m] = blank()

  for (const x of claims) {
    const keys = [[months, mon(x.received_at)], [byIns, x.insurers?.name || '미지정'], [byAdj, x.profiles?.name || '미배정']]
    for (const [map, k] of keys) { const r = add(map, k); r.recv++; if (x.status === '종결') r.closed++ }
  }
  for (const x of asm) {
    const keys = [[months, mon(x.issued_at)], [byIns, x.claims?.insurers?.name || '미지정'], [byAdj, x.claims?.profiles?.name || '미배정']]
    for (const [map, k] of keys) { const r = add(map, k); r.done++; r.cl += x.claimed_total; r.ap += x.approved_total; r.pay += x.payable_amount }
  }
  for (const x of fees) {
    const total = x.supply_amount + x.vat
    const owner = [[byIns, x.claims?.insurers?.name || '미지정'], [byAdj, x.claims?.profiles?.name || '미배정']]
    if (inYear(x.invoiced_at) && x.status !== '미청구') {
      add(months, mon(x.invoiced_at)).billed += total
      for (const [map, k] of owner) add(map, k).billed += total
    }
    if (inYear(x.paid_at) && x.status === '입금완료') {
      const p = x.paid_amount ?? total
      add(months, mon(x.paid_at)).paid += p
      for (const [map, k] of owner) add(map, k).paid += p
    }
  }

  const cols = (first) => [first, '접수 건수', '종결 건수', '사정 확정 건수', '청구 수리비', '인정 수리비', '삭감액', '삭감률(%)', '지급액', '수수료 청구액', '수수료 입금액']
  const line = (k, r) => [k, r.recv, r.closed, r.done, r.cl, r.ap, r.cl - r.ap, pct(r.cl, r.ap), r.pay, r.billed, r.paid]
  const money = [4, 5, 6, 8, 9, 10]
  const total = Object.values(months).reduce((t, r) => { for (const k in t) t[k] += r[k]; return t }, blank())
  const sorted = (m) => Object.entries(m).sort((x, y) => y[1].recv - x[1].recv || y[1].ap - x[1].ap)

  await exportXlsx(`월별실적_${year}.xlsx`, [
    { name: '월별 실적', columns: cols('월'), rows: [...Object.entries(months).map(([m, r]) => line(`${m}월`, r)), line('합계', total)], money },
    { name: '보험사별', columns: cols('보험사'), rows: sorted(byIns).map(([k, r]) => line(k, r)), money },
    { name: '담당자별', columns: cols('담당자'), rows: sorted(byAdj).map(([k, r]) => line(k, r)), money },
  ])
}
