// 미리보기용 예시 데이터 (모든 이름·번호는 가상의 예시)
export const DEMO_USER_ID = 'demo-admin'
const KIM = 'demo-kim', PARK = 'demo-park'

const day = (n, h = 10, m = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d }
const iso = (n, h, m) => day(n, h, m).toISOString()
const date = (n) => day(n).toLocaleDateString('sv-SE')

function photo(label, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#dfe6ee"/>
<rect x="0" y="210" width="400" height="90" fill="#9aa5b1"/><path d="M60 200 L95 140 Q105 125 125 125 L270 125 Q292 125 305 140 L345 185 L350 200 Z" fill="${color}"/>
<rect x="55" y="190" width="300" height="35" rx="10" fill="${color}"/><circle cx="120" cy="228" r="26" fill="#222"/><circle cx="290" cy="228" r="26" fill="#222"/>
<circle cx="120" cy="228" r="11" fill="#999"/><circle cx="290" cy="228" r="11" fill="#999"/><path d="M110 135 L140 135 L140 175 L95 175 Z M150 135 L250 135 L250 175 L150 175 Z" fill="#bcd3ea"/>
<path d="M300 165 l18 -12 l-6 18 l20 -6 l-14 16 l16 4 l-22 6" fill="none" stroke="#c0392b" stroke-width="5"/>
<rect x="10" y="10" width="${label.length * 17 + 20}" height="34" rx="6" fill="rgba(0,0,0,.55)"/><text x="20" y="34" font-size="18" fill="#fff" font-family="sans-serif">${label}</text></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

export function seed() {
  const ym = date(0).slice(0, 7).replace('-', '')
  const no = (n) => `MB-${ym}-${String(n).padStart(4, '0')}`
  const profiles = [
    { id: DEMO_USER_ID, email: 'demo@mobiling.kr', name: '이수환', role: 'admin', phone: '010-0000-0000', license_no: '예시-0001', active: true, created_at: iso(-30) },
    { id: KIM, email: 'kim@example.com', name: '김사정', role: 'adjuster', phone: '010-1111-2222', license_no: '예시-0002', active: true, created_at: iso(-20) },
    { id: PARK, email: 'park@example.com', name: '박현장', role: 'adjuster', phone: '010-3333-4444', license_no: null, active: true, created_at: iso(-10) },
  ]
  const tpl = { report_title: '손해사정서', report_recipient: null, report_show_vehicles: true, report_show_items: true, report_show_adjust_reason: true, report_show_photos: false, report_note: null }
  const insurers = ['삼성화재', '현대해상', 'DB손해보험', 'KB손해보험', '메리츠화재', '한화손해보험', '롯데손해보험', '흥국화재']
    .map((name, i) => ({ id: i + 1, name, contact_name: null, phone: null, email: null, memo: null, base_fee: 150000, ...tpl, created_at: iso(-60) }))
  insurers[0] = { ...insurers[0], report_recipient: '대물보상팀장', report_show_photos: true, report_note: '본 사정서는 피보험자 및 피해자에게 사정 결과를 통지하였음.' }
  const repair_shops = [
    { id: 1, name: '한빛자동차공업사', biz_no: '000-00-00001', owner_name: '최대표', phone: '031-000-0001', address: '경기 화성시 (예시)', labor_rate: 52000, memo: null },
    { id: 2, name: '스마트카정비', biz_no: '000-00-00002', owner_name: '정대표', phone: '02-000-0002', address: '서울 구로구 (예시)', labor_rate: 55000, memo: null },
    { id: 3, name: '오토메디 1급공업사', biz_no: '000-00-00003', owner_name: '한대표', phone: '032-000-0003', address: '인천 남동구 (예시)', labor_rate: 50000, memo: null },
  ]
  const C = (id, o) => ({
    id, claim_no: no(id), insurer_claim_no: `2026-${100000 + id * 37}`, coverage: '대물', accident_place: '경기 수원시 영통구 (예시)',
    accident_desc: '교차로에서 신호 대기 중 후방 차량이 추돌함 (예시)', insured_phone: null, victim_phone: null, fault_ratio: 100,
    memo: null, created_by: DEMO_USER_ID, received_at: date(-id), accident_at: iso(-id - 1, 18), updated_at: iso(0), created_at: iso(-id), ...o,
  })
  const claims = [
    C(1, { insurer_id: 1, status: '견적검토', assigned_to: KIM, insured_name: '홍길동', victim_name: '김민수', due_date: date(1) }),
    C(2, { insurer_id: 2, status: '현장조사', assigned_to: PARK, insured_name: '이영희', victim_name: '박철수', due_date: date(5), coverage: '자차' }),
    C(3, { insurer_id: 1, status: '사정완료', assigned_to: DEMO_USER_ID, insured_name: '최준호', victim_name: '정다은', due_date: date(-1), fault_ratio: 80 }),
    C(4, { insurer_id: 3, status: '배정', assigned_to: KIM, insured_name: '강서연', victim_name: '윤도현', due_date: date(9) }),
    C(5, { insurer_id: 4, status: '접수', assigned_to: null, insured_name: '오세훈', victim_name: '임하늘', due_date: date(12) }),
    C(6, { insurer_id: 5, status: '보고서제출', assigned_to: PARK, insured_name: '한지민', victim_name: '송재원', due_date: date(-3), coverage: '자차' }),
    C(7, { insurer_id: 2, status: '종결', assigned_to: KIM, insured_name: '배수지', victim_name: '조인성', due_date: date(-10) }),
    C(8, { insurer_id: 6, status: '현장조사', assigned_to: DEMO_USER_ID, insured_name: '신동엽', victim_name: '유재석', due_date: date(0) }),
  ]
  const V = (id, claim_id, plate_no, maker, model, shop, o = {}) => ({ id, claim_id, party: '피해차량', plate_no, maker, model, model_year: 2021, vin: null, mileage: 48000, owner_name: null, repair_shop_id: shop, in_date: date(-claim_id + 1), out_date: null, created_at: iso(-claim_id), ...o })
  const vehicles = [
    V(1, 1, '12가3456', '현대', '그랜저', 1), V(2, 2, '34나5678', '기아', 'K5', 2), V(3, 3, '56다7890', '현대', '아반떼', 1, { out_date: date(-1) }),
    V(4, 4, '78라1234', '제네시스', 'G80', 3), V(5, 5, '90마5678', '기아', '쏘렌토', null), V(6, 6, '11바2233', '쉐보레', '트래버스', 2, { out_date: date(-4) }),
    V(7, 7, '44사5566', '현대', '싼타페', 1, { out_date: date(-12) }), V(8, 8, '77아8899', '기아', '카니발', 3),
  ]
  const estimates = [
    { id: 1, claim_id: 1, vehicle_id: 1, repair_shop_id: 1, version: 1, estimate_date: date(-1), status: '검토중', memo: null, created_at: iso(-1) },
    { id: 2, claim_id: 3, vehicle_id: 3, repair_shop_id: 1, version: 1, estimate_date: date(-3), status: '검토완료', memo: '도장 범위 축소 협의 완료', created_at: iso(-3) },
    { id: 3, claim_id: 6, vehicle_id: 6, repair_shop_id: 2, version: 1, estimate_date: date(-7), status: '검토완료', memo: null, created_at: iso(-7) },
    { id: 4, claim_id: 7, vehicle_id: 7, repair_shop_id: 1, version: 1, estimate_date: date(-14), status: '검토완료', memo: null, created_at: iso(-14) },
  ]
  let iid = 0
  const I = (estimate_id, category, item_name, operation, qty, unit_price, approved, reason = null) =>
    ({ id: ++iid, estimate_id, seq: iid, category, item_name, operation, qty, unit_price, claimed_amount: Math.round(qty * unit_price), approved_amount: approved, adjust_reason: reason, created_at: iso(-1) })
  const estimate_items = [
    I(1, '부품', '리어범퍼', '교환', 1, 420000, 420000), I(1, '부품', '리어범퍼 레일', '교환', 1, 38000, null), I(1, '공임', '리어범퍼 탈부착', '탈착', 1, 65000, null),
    I(1, '도장', '리어범퍼 도장', '도장', 1, 280000, null), I(1, '도장', '트렁크 리드 부분도장', '도장', 1, 190000, null),
    I(2, '부품', '프론트범퍼', '교환', 1, 380000, 380000), I(2, '부품', '헤드램프(좌)', '교환', 1, 610000, 520000, '동급 재생품 단가 적용'),
    I(2, '공임', '범퍼·램프 탈부착', '탈착', 1, 90000, 90000), I(2, '도장', '프론트범퍼·휀더 도장', '도장', 1, 450000, 320000, '휀더 도장 범위 축소 (부분도장)'),
    I(3, '부품', '도어(우측 앞)', '교환', 1, 520000, 520000), I(3, '판금', '도어(우측 뒤)', '판금', 1, 180000, 150000, '판금 시간 과다 청구'),
    I(3, '도장', '도어 2판 도장', '도장', 1, 400000, 400000),
    I(4, '부품', '테일게이트', '교환', 1, 690000, 690000), I(4, '도장', '테일게이트 도장', '도장', 1, 250000, 250000), I(4, '기타', '렌터카 대차 비용', '기타', 3, 80000, 160000, '적정 수리기간 2일 인정'),
  ]
  const A = (claim_id, cl, ap, fault, opinion, status, issued) => ({ id: claim_id, claim_id, claimed_total: cl, approved_total: ap, depreciation: 0, deductible: 0, fault_ratio: fault, payable_amount: Math.round(ap * fault / 100), opinion, status, issued_at: issued, author_id: DEMO_USER_ID, created_at: iso(-2), updated_at: iso(-1) })
  const assessments = [
    A(3, 1530000, 1310000, 80, '1. 사고 개요: 후방 추돌 사고로 전면부 손상 (예시)\n2. 헤드램프는 동급 재생품 단가 적용\n3. 휀더 도장은 부분도장으로 범위 축소\n4. 결론: 인정 수리비의 80% 지급 사정', '확정', date(-1)),
    A(6, 1100000, 1070000, 100, '도어 판금 시간 일부 조정 후 인정 (예시)', '확정', date(-4)),
    A(7, 1180000, 1100000, 100, '대차 기간 적정 일수만 인정 (예시)', '확정', date(-11)),
  ]
  const F = (claim_id, base, extra, exp, status, inv, paid) => {
    const supply = base + extra + exp
    return { id: claim_id, claim_id, base_fee: base, extra_fee: extra, expense: exp, supply_amount: supply, vat: Math.round(supply * 0.1), status, invoice_no: inv ? `INV-${claim_id}` : null, invoiced_at: inv, paid_at: paid, paid_amount: paid ? Math.round(supply * 1.1) : null, memo: null, created_at: iso(-3) }
  }
  const fees = [F(6, 150000, 30000, 12000, '청구', date(-3), null), F(7, 150000, 0, 8000, '입금완료', date(-10), date(-2))]
  const S = (id, claim_id, adjuster_id, kind, n, h, m, location, done = false) => ({ id, claim_id, adjuster_id, kind, scheduled_at: iso(n, h, m), location, memo: null, done, created_at: iso(-2) })
  const schedules = [
    S(1, 2, PARK, '현장조사', 0, 10, 0, '스마트카정비'), S(2, 8, DEMO_USER_ID, '현장조사', 0, 14, 0, '오토메디 1급공업사'),
    S(3, 1, KIM, '입고확인', 0, 14, 30, '한빛자동차공업사'), S(4, 4, KIM, '면담', 1, 11, 0, '피해자 자택 (예시)'),
    S(5, 3, DEMO_USER_ID, '출고확인', 1, 16, 0, '한빛자동차공업사'), S(6, 6, PARK, '면담', -1, 15, 0, '사무실', true),
    S(7, 2, PARK, '입고확인', 2, 9, 30, '스마트카정비'), S(8, null, DEMO_USER_ID, '기타', 3, 17, 0, '보험사 정기 미팅'),
    S(9, 4, KIM, '현장조사', 4, 13, 0, '오토메디 1급공업사'),
  ]
  const order = ['접수', '배정', '현장조사', '견적검토', '사정완료', '보고서제출', '종결']
  let hid = 0
  const claim_history = claims.flatMap((c) => {
    const upto = order.indexOf(c.status)
    return order.slice(0, upto + 1).map((s, i) => ({ id: ++hid, claim_id: c.id, from_status: i ? order[i - 1] : null, to_status: s, note: i ? null : '사건 접수', changed_by: DEMO_USER_ID, changed_at: iso(-c.id + i * 0.3) }))
  })
  const _photos = {
    'demo/1.svg': photo('사고 현장', '#3b5b8c'), 'demo/2.svg': photo('후면 손상', '#3b5b8c'), 'demo/3.svg': photo('전면 손상', '#8c3b3b'), 'demo/4.svg': photo('수리 후', '#8c3b3b'),
  }
  const attachments = [
    { id: 1, claim_id: 1, category: '사고사진', file_path: 'demo/1.svg', file_name: '사고현장.jpg', mime_type: 'image/svg+xml', size_bytes: 820000, uploaded_by: KIM, created_at: iso(-1) },
    { id: 2, claim_id: 1, category: '손상사진', file_path: 'demo/2.svg', file_name: '후면.jpg', mime_type: 'image/svg+xml', size_bytes: 910000, uploaded_by: KIM, created_at: iso(-1) },
    { id: 3, claim_id: 3, category: '손상사진', file_path: 'demo/3.svg', file_name: '전면.jpg', mime_type: 'image/svg+xml', size_bytes: 760000, uploaded_by: DEMO_USER_ID, created_at: iso(-3) },
    { id: 4, claim_id: 3, category: '수리후사진', file_path: 'demo/4.svg', file_name: '수리후.jpg', mime_type: 'image/svg+xml', size_bytes: 700000, uploaded_by: DEMO_USER_ID, created_at: iso(-1) },
    { id: 5, claim_id: 1, category: '견적서', file_path: 'demo/estimate.pdf', file_name: '한빛공업사_견적서.pdf', mime_type: 'application/pdf', size_bytes: 240000, uploaded_by: KIM, created_at: iso(-1) },
  ]
  const notifications = [
    { id: 1, user_id: DEMO_USER_ID, claim_id: 8, kind: '배정', message: `${no(8)} 사건이 배정되었습니다 (처리기한 오늘)`, read_at: null, created_at: iso(-1) },
    { id: 2, user_id: DEMO_USER_ID, claim_id: 6, kind: '진행', message: `${no(6)} 사건이 '보고서제출' 단계가 되었습니다`, read_at: null, created_at: iso(-3) },
  ]
  const app_settings = [{ id: 1, company_name: '모빌링손해사정 주식회사', ceo_name: '이수환', biz_no: null, address: null, phone: null, email: null, report_footer: '위와 같이 손해사정 결과를 보고합니다.', default_due_days: 14 }]
  return { profiles, insurers, repair_shops, claims, vehicles, estimates, estimate_items, assessments, fees, schedules, claim_history, attachments, notifications, app_settings, _photos }
}
