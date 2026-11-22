import { createClient } from '@supabase/supabase-js'
import { createMockClient } from './demo/mockSupabase'

// VITE_DEMO=1 로 빌드하면 예시 데이터로 동작하는 미리보기 버전이 된다 (npm run build:demo)
export const IS_DEMO = import.meta.env.VITE_DEMO === '1'
export const supabase = IS_DEMO
  ? createMockClient()
  : createClient(
    import.meta.env.VITE_SUPABASE_URL || 'https://wbqbkacwtzegzbcbegjj.supabase.co',
    import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_L-CArSlu3HqCchMg8AVTAw_moaoMtD9'
  )
if (IS_DEMO && typeof window !== 'undefined') {
  // 미리보기 창(샌드박스)은 confirm 대화상자를 막으므로 항상 '예'로 처리
  window.confirm = () => true
}

export const STATUSES = ['접수', '배정', '현장조사', '견적검토', '사정완료', '보고서제출', '종결', '취소']
export const OPEN_STATUSES = STATUSES.filter((s) => !['종결', '취소'].includes(s))
export const COVERAGES = ['대물', '자차', '자손', '대인', '기타']
export const ITEM_CATEGORIES = ['부품', '공임', '도장', '기타']
export const OPERATIONS = ['교환', '판금', '탈착', '수리', '도장', '기타']
export const SCHEDULE_KINDS = ['현장조사', '입고확인', '출고확인', '면담', '기타']
export const ROLES = { admin: '관리자', adjuster: '손해사정사', staff: '사무직원' }

export const won = (n) => (n == null || n === '' ? '-' : Number(n).toLocaleString('ko-KR'))
export const toInt = (v) => (v === '' || v == null ? null : Math.round(Number(String(v).replace(/,/g, ''))))
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('ko-KR') : '-')
export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-'
// datetime-local input <-> ISO
export const toLocalInput = (d) => {
  if (!d) return ''
  const t = new Date(d)
  t.setMinutes(t.getMinutes() - t.getTimezoneOffset())
  return t.toISOString().slice(0, 16)
}
export const fromLocalInput = (s) => (s ? new Date(s).toISOString() : null)

// 빈 문자열은 null 로
export const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === '' ? null : v]))

export function calcPayable({ approved_total = 0, depreciation = 0, deductible = 0, fault_ratio }) {
  const ratio = fault_ratio == null || fault_ratio === '' ? 100 : Number(fault_ratio)
  const base = Math.max(0, Number(approved_total) - Number(depreciation || 0))
  return Math.max(0, Math.round((base * ratio) / 100) - Number(deductible || 0))
}
