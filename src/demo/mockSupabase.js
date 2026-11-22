// 미리보기(데모)용 가짜 Supabase 클라이언트. 브라우저 메모리에만 저장되며 새로고침하면 처음 상태로 돌아간다.
import { seed, DEMO_USER_ID } from './seed'

const db = seed()
const ids = Object.fromEntries(Object.entries(db).filter(([, rows]) => Array.isArray(rows)).map(([t, rows]) => [t, Math.max(0, ...rows.map((r) => (typeof r.id === 'number' ? r.id : 0)))]))
const files = {} // storage path -> objectURL

// 관계 정의: [부모테이블, 대상테이블, 외래키 컬럼, 방향('one' = 부모.fk -> 대상.id, 'many'/'single' = 대상.fk -> 부모.id)]
const FK = {
  claims_assigned_to_fkey: ['assigned_to'], claims_created_by_fkey: ['created_by'],
  schedules_adjuster_id_fkey: ['adjuster_id'], claim_history_changed_by_fkey: ['changed_by'],
  attachments_uploaded_by_fkey: ['uploaded_by'],
}
const SINGULAR = { insurers: 'insurer', repair_shops: 'repair_shop', vehicles: 'vehicle', claims: 'claim', estimates: 'estimate', profiles: 'profile' }
const UNIQUE_CHILD = { assessments: 'claim_id', fees: 'claim_id' }

function resolve(parent, target, hint, row, fields) {
  const rows = db[target] || []
  if (hint && FK[hint]) {
    const col = FK[hint][0]
    return project(target, rows.find((r) => r.id === row[col]) || null, fields)
  }
  const up = `${SINGULAR[target] || target}_id`
  if (up in row || ['insurers', 'repair_shops', 'profiles'].includes(target)) {
    const col = parent === 'schedules' && target === 'profiles' ? 'adjuster_id' : up
    return project(target, rows.find((r) => r.id === row[col]) || null, fields)
  }
  const down = `${SINGULAR[parent] || parent}_id`
  const kids = rows.filter((r) => r[down] === row.id)
  if (UNIQUE_CHILD[target] === down) return project(target, kids[0] || null, fields)
  return kids.map((k) => project(target, k, fields))
}

// select 문자열 파싱: "*, insurers(name), assignee:profiles!claims_assigned_to_fkey(name)"
function parseSelect(s) {
  const out = []; let depth = 0, cur = ''
  for (const ch of s || '*') {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out.map((p) => {
    const m = p.match(/^(?:(\w+):)?(\w+)(?:!(\w+))?\((.*)\)$/s)
    if (!m) return { col: p }
    return { alias: m[1] || m[2], table: m[2], hint: m[3], fields: parseSelect(m[4]) }
  })
}
function project(table, row, fields) {
  if (!row) return null
  const out = { ...row }
  for (const f of fields || []) if (f.table) out[f.alias] = resolve(table, f.table, f.hint, row, f.fields)
  return out
}

const today = () => new Date().toISOString()
function fill(table, r) {
  const n = { ...r }
  if (n.id === undefined && table !== 'profiles' && table !== 'app_settings') n.id = ++ids[table]
  n.created_at ??= today()
  if (table === 'claims') {
    n.status ??= '접수'; n.coverage ??= '대물'; n.received_at ??= new Date().toLocaleDateString('sv-SE'); n.created_by ??= DEMO_USER_ID
    if (!n.claim_no) {
      const p = 'MB-' + new Date().toLocaleDateString('sv-SE').slice(0, 7).replace('-', '') + '-'
      const seq = Math.max(0, ...db.claims.filter((c) => c.claim_no.startsWith(p)).map((c) => Number(c.claim_no.slice(p.length)))) + 1
      n.claim_no = p + String(seq).padStart(4, '0')
    }
  }
  if (table === 'estimates') { n.status ??= '검토중'; n.version ??= 1 }
  if (table === 'assessments') { n.status ??= '작성중'; n.author_id ??= DEMO_USER_ID }
  if (table === 'fees') { n.status ??= '미청구'; n.base_fee ??= 0; n.extra_fee ??= 0; n.expense ??= 0 }
  if (table === 'schedules') n.done ??= false
  if (table === 'attachments') n.uploaded_by ??= DEMO_USER_ID
  return calc(table, n)
}
function calc(table, n) {
  if (table === 'fees') { n.supply_amount = (n.base_fee || 0) + (n.extra_fee || 0) + (n.expense || 0); n.vat = Math.round(n.supply_amount * 0.1) }
  return n
}
function history(before, after) {
  if (!before) db.claim_history.push({ id: ++ids.claim_history, claim_id: after.id, from_status: null, to_status: after.status, note: '사건 접수', changed_by: DEMO_USER_ID, changed_at: today() })
  else {
    if (before.status !== after.status) db.claim_history.push({ id: ++ids.claim_history, claim_id: after.id, from_status: before.status, to_status: after.status, changed_by: DEMO_USER_ID, changed_at: today() })
    if (before.assigned_to !== after.assigned_to) db.claim_history.push({ id: ++ids.claim_history, claim_id: after.id, from_status: after.status, to_status: after.status, note: '담당자 변경', changed_by: DEMO_USER_ID, changed_at: today() })
  }
}

const val = (v) => (v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : v)
const cmp = (a, b) => (a == null ? -1 : b == null ? 1 : typeof a === 'number' ? a - b : String(a).localeCompare(String(b)))
const like = (pat) => new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/\*/g, '.*') + '$', 'i')
const eq = (a, b) => String(a) === String(b)

class Query {
  constructor(table) { this.t = table; this.f = []; this.o = []; this.op = 'select'; this.sel = '*' }
  select(s = '*') { if (this.op === 'select') this.sel = s; else this.ret = s || '*'; return this }
  insert(rows) { this.op = 'insert'; this.data = Array.isArray(rows) ? rows : [rows]; return this }
  upsert(row, o = {}) { this.op = 'upsert'; this.data = Array.isArray(row) ? row : [row]; this.conflict = o.onConflict || 'id'; return this }
  update(p) { this.op = 'update'; this.data = p; return this }
  delete() { this.op = 'delete'; return this }
  eq(c, v) { this.f.push((r) => eq(r[c], v)); return this }
  neq(c, v) { this.f.push((r) => !eq(r[c], v)); return this }
  in(c, vs) { this.f.push((r) => vs.some((v) => eq(r[c], v))); return this }
  is(c, v) { this.f.push((r) => (v === null ? r[c] == null : r[c] === v)); return this }
  gte(c, v) { this.f.push((r) => r[c] != null && cmp(r[c], v) >= 0); return this }
  gt(c, v) { this.f.push((r) => r[c] != null && cmp(r[c], v) > 0); return this }
  lte(c, v) { this.f.push((r) => r[c] != null && cmp(r[c], v) <= 0); return this }
  lt(c, v) { this.f.push((r) => r[c] != null && cmp(r[c], v) < 0); return this }
  ilike(c, p) { this.f.push((r) => like(p).test(r[c] ?? '')); return this }
  not(c, op, v) {
    if (op === 'is') this.f.push((r) => (v === null ? r[c] != null : r[c] !== v))
    else if (op === 'in') { const vs = String(v).replace(/[()"]/g, '').split(','); this.f.push((r) => !vs.includes(String(r[c]))) }
    else this.f.push((r) => !eq(r[c], v))
    return this
  }
  or(expr) {
    const parts = expr.split(',').map((p) => { const [c, o, ...rest] = p.split('.'); return [c, o, rest.join('.')] })
    this.f.push((r) => parts.some(([c, o, v]) => (o === 'ilike' ? like(v).test(r[c] ?? '') : eq(r[c], val(v)))))
    return this
  }
  order(c, o = {}) { this.o.push([c, o.ascending !== false]); return this }
  limit(n) { this.lim = n; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybe'; return this }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej) }

  run() {
    const T = (db[this.t] ||= [])
    const match = (r) => this.f.every((f) => f(r))
    let rows = [], error = null
    if (this.op === 'select') rows = T.filter(match)
    else if (this.op === 'insert') {
      rows = this.data.map((d) => fill(this.t, d))
      if (this.t === 'insurers' && rows.some((r) => T.some((x) => x.name === r.name))) return { data: null, error: { code: '23505', message: '이미 등록된 이름입니다' } }
      T.push(...rows)
      if (this.t === 'claims') rows.forEach((r) => history(null, r))
    } else if (this.op === 'upsert') {
      rows = this.data.map((d) => {
        const ex = T.find((r) => eq(r[this.conflict], d[this.conflict]))
        if (ex) { Object.assign(ex, d, { updated_at: today() }); return calc(this.t, ex) }
        const n = fill(this.t, d); T.push(n); return n
      })
    } else if (this.op === 'update') {
      rows = T.filter(match).map((r) => {
        const before = { ...r }
        Object.assign(r, this.data, { updated_at: today() }); calc(this.t, r)
        if (this.t === 'claims') history(before, r)
        return r
      })
    } else if (this.op === 'delete') {
      rows = T.filter(match)
      db[this.t] = T.filter((r) => !match(r))
      if (this.t === 'claims') for (const t of ['vehicles', 'estimates', 'assessments', 'schedules', 'claim_history', 'attachments', 'fees', 'notifications']) db[t] = db[t].filter((r) => !rows.some((c) => c.id === r.claim_id))
      if (this.t === 'estimates') db.estimate_items = db.estimate_items.filter((i) => !rows.some((e) => e.id === i.estimate_id))
    }
    if (this.op !== 'select' && !this.ret && !this.one) return { data: null, error }
    const fields = parseSelect(this.op === 'select' ? this.sel : this.ret)
    for (const [c, asc] of [...this.o].reverse()) rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[c], b[c]))
    if (this.lim) rows = rows.slice(0, this.lim)
    const data = rows.map((r) => project(this.t, r, fields))
    if (this.one === 'single') return data.length === 1 ? { data: data[0], error } : { data: null, error: { message: '데이터를 찾을 수 없습니다' } }
    if (this.one === 'maybe') return { data: data[0] || null, error }
    return { data: JSON.parse(JSON.stringify(data)), error }
  }
}

const session = { user: { id: DEMO_USER_ID, email: 'demo@mobiling.kr' } }
const listeners = []

export function createMockClient() {
  return {
    from: (t) => new Query(t),
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb) => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } } },
      signOut: async () => { alertDemo(); return { error: null } },
      signInWithPassword: async () => ({ data: { session }, error: null }),
      signUp: async () => ({ data: { session }, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
    },
    storage: {
      from: () => ({
        upload: async (path, file) => { files[path] = URL.createObjectURL(file); return { data: { path }, error: null } },
        remove: async (paths) => { paths.forEach((p) => delete files[p]); return { error: null } },
        createSignedUrls: async (paths) => ({ data: paths.map((p) => ({ path: p, signedUrl: files[p] || db._photos?.[p] || null })), error: null }),
        createSignedUrl: async (p) => ({ data: { signedUrl: files[p] || db._photos?.[p] }, error: null }),
      }),
    },
  }
}
function alertDemo() { console.info('미리보기에서는 로그아웃할 수 없습니다') }
