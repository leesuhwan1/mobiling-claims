// AOS 등 수리비 견적서(엑셀·CSV·PDF)를 읽어 견적 항목으로 바꾼다.
// 견적서마다 양식이 조금씩 달라서 머리글 이름으로 열을 찾고, 못 찾으면 줄 단위로 추정한다.
// 결과는 반드시 사람이 미리보기에서 확인한 뒤 반영한다.

const NUM = /^-?[\d,]+(\.\d+)?$/
const toNum = (s) => {
  if (s == null || s === '') return null
  if (typeof s === 'number') return s
  const t = String(s).replace(/[,\s원]/g, '')
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null
}
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

const HEAD = {
  name: ['부품명', '품명', '작업명', '작업내용', '작업항목', '수리내역', '항목명', '항목', '내역', '명칭', '부품/작업'],
  code: ['부품번호', '품번', '부품코드', '코드'],
  op: ['작업구분', '수리방법', '작업방법', '수리구분', '작업'],
  qty: ['수량', '개수', '수 량'],
  hours: ['작업시간', '표준시간', '시간', '공수'],
  unit: ['단가', '부품단가', '단 가', '가격', '시간당공임'],
  amount: ['금액', '청구금액', '견적금액', '부품금액', '공임금액', '도장금액', '합계금액', '공임', '금 액'],
  cat: ['구분', '분류', '항목구분'],
}
const SKIP = /(소\s*계|합\s*계|총\s*계|총\s*액|부가세|부가가치세|공급가액|할인|절사|면책|자기부담|^계$|페이지|page)/i
const SECTION = [[/도장|칠/, '도장'], [/공임|작업내역|기술료/, '공임'], [/부품/, '부품']]
const OPS = [[/교환|교체/, '교환'], [/탈착|탈부착|분해|조립/, '탈착'], [/판금|덴트/, '판금'], [/도장|칠|보수도장/, '도장'], [/수리|보수|용접/, '수리']]

export function guessOp(text) {
  for (const [re, op] of OPS) if (re.test(text)) return op
  return null
}
export function guessCategory(name, op, section) {
  if (/도장|칠/.test(name) || op === '도장') return '도장'
  if (section === '도장') return '도장'
  if (section === '공임' || /공임|탈착|탈부착|판금|조정|점검|진단|얼라인|교환작업/.test(name) || op === '탈착' || op === '판금') return '공임'
  if (/렌트|대차|견인|폐기|부대|기타/.test(name)) return '기타'
  return section || '부품'
}

function findHeader(cells) {
  const map = {}
  cells.forEach((c, i) => {
    const t = clean(c).replace(/\s/g, '')
    if (!t || t.length > 12) return
    for (const [k, words] of Object.entries(HEAD)) {
      if (map[k] != null) continue
      if (words.some((w) => t === w.replace(/\s/g, '') || (w.length >= 3 && t.includes(w.replace(/\s/g, ''))))) { map[k] = i; break }
    }
  })
  return map.name != null && (map.amount != null || map.unit != null) ? map : null
}

function makeRow({ name, code, opText, qty, hours, unit, amount, section, catText }) {
  name = clean(name)
  if (!name || SKIP.test(name) || name.length < 2) return null
  if (amount == null && unit == null) return null
  let op = guessOp(`${opText || ''} ${name}`) || null
  let category = ['부품', '공임', '도장', '기타'].find((c) => clean(catText).includes(c)) || guessCategory(name, op, section)
  if (!op && category === '부품') op = '교환'
  qty = qty ?? 1
  if (amount == null) amount = Math.round((qty || 1) * (unit || 0))
  if (unit == null) unit = qty ? Math.round(amount / qty) : amount
  if (!amount) return null
  return {
    include: true, category, item_name: code ? `${name} (${code})` : name, operation: op,
    qty: Number(qty) || 1, unit_price: Math.round(unit), claimed_amount: Math.round(amount), hours: hours ?? null,
  }
}

// 2차원 표(엑셀·CSV·PDF 줄 묶음)에서 항목 추출
export function parseGrid(grid) {
  const rows = []
  let map = null, section = null
  for (const raw of grid) {
    const cells = raw.map((c) => (c && typeof c === 'object' ? c.result ?? c.text ?? c.richText?.map((r) => r.text).join('') ?? '' : c))
    const nonEmpty = cells.filter((c) => clean(c) !== '')
    if (!nonEmpty.length) continue
    const h = findHeader(cells)
    if (h) { map = h; continue }
    const joined = nonEmpty.map(clean).join(' ')
    if (nonEmpty.length <= 2 && joined.length <= 20) {
      const s = SECTION.find(([re]) => re.test(joined)); if (s && !nonEmpty.some((c) => toNum(c) > 0)) { section = s[1]; continue }
    }
    if (!map) continue
    const g = (k) => (map[k] != null ? cells[map[k]] : null)
    const r = makeRow({
      name: g('name'), code: clean(g('code')), opText: clean(g('op')), qty: toNum(g('qty')), hours: toNum(g('hours')),
      unit: toNum(g('unit')), amount: toNum(g('amount')), section, catText: g('cat'),
    })
    if (r) rows.push(r)
  }
  return rows
}

// 머리글이 없거나 PDF처럼 열이 흐트러진 경우: 한 줄 = 이름 + 숫자들 로 추정
export function parseLines(lines) {
  const rows = []
  let section = null
  for (const line of lines) {
    const text = clean(line)
    if (!text) continue
    if (text.length <= 16 && !/\d{3,}/.test(text)) {
      const s = SECTION.find(([re]) => re.test(text)); if (s) { section = s[1]; continue }
    }
    if (SKIP.test(text)) continue
    const tokens = text.split(' ')
    const nums = [], words = []
    tokens.forEach((t) => (NUM.test(t) ? nums.push(toNum(t)) : words.push(t)))
    if (!nums.length || !words.some((w) => /[가-힣A-Za-z]{2,}/.test(w))) continue
    const amount = nums[nums.length - 1]
    if (amount < 100) continue
    let qty = 1, unit = null
    if (nums.length >= 3) { qty = nums.find((n) => n > 0 && n <= 50) ?? 1; unit = nums[nums.length - 2] }
    else if (nums.length === 2) { if (nums[0] <= 50) qty = nums[0]; else unit = nums[0] }
    const code = words.find((w) => /^[0-9A-Z]{5,}[-0-9A-Z]*$/.test(w) && /\d/.test(w))
    const opWord = words.find((w) => guessOp(w))
    const name = words.filter((w) => w !== code && !/^\d+$/.test(w)).join(' ').replace(/^\d+[.)]?\s*/, '')
    const r = makeRow({ name, code, opText: opWord, qty, unit: unit && Math.abs(unit * qty - amount) / amount < 0.05 ? unit : null, amount, section })
    if (r) rows.push(r)
  }
  return rows
}

function findMeta(text) {
  const plate = text.match(/\d{2,3}\s?[가-힣]\s?\d{4}/)?.[0]?.replace(/\s/g, '') || null
  // 견적 합계 후보: '합계/총계/총액' 근처의 가장 큰 금액
  const totals = []
  for (const m of text.matchAll(/(총\s*계|합\s*계|총\s*액|수리비\s*합계|견적\s*합계|공급가액)[^\d]{0,20}([\d,]{4,})/g)) {
    const v = toNum(m[2]); if (v && !totals.includes(v)) totals.push(v)
  }
  const total = totals.length ? Math.max(...totals) : null
  const shop = text.match(/([가-힣A-Za-z0-9]+(공업사|정비|모터스|카센터|자동차))/)?.[1] || null
  return { plate, total, totals, shop }
}

async function readXlsx(file) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const grid = [], texts = []
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values.slice(1).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))
      grid.push(vals); texts.push(vals.map((v) => (v && typeof v === 'object' ? v.result ?? v.text ?? '' : v ?? '')).join(' '))
    })
  })
  return { grid, text: texts.join('\n') }
}

async function readCsv(file) {
  const buf = await file.arrayBuffer()
  let text = new TextDecoder('utf-8').decode(buf)
  if ((text.match(/�/g) || []).length > 3) text = new TextDecoder('euc-kr').decode(buf)
  const sep = text.split('\n')[0].includes('\t') ? '\t' : ','
  const grid = text.split(/\r?\n/).map((line) => {
    const out = []; let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
      else if (ch === sep && !q) { out.push(cur); cur = '' } else cur += ch
    }
    out.push(cur); return out
  })
  return { grid, text }
}

async function readPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const grid = [], lines = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const { items } = await page.getTextContent()
    // 같은 높이(y)의 글자를 한 줄로 묶고, x 간격이 넓으면 칸을 나눈다
    const rowsByY = []
    for (const it of items) {
      if (!it.str?.trim()) continue
      const [x, y] = [it.transform[4], it.transform[5]]
      let r = rowsByY.find((r) => Math.abs(r.y - y) < 3)
      if (!r) { r = { y, parts: [] }; rowsByY.push(r) }
      r.parts.push({ x, w: it.width, s: it.str })
    }
    rowsByY.sort((a, b) => b.y - a.y)
    for (const r of rowsByY) {
      r.parts.sort((a, b) => a.x - b.x)
      const cells = []; let last = null
      for (const pt of r.parts) {
        if (last && pt.x - (last.x + last.w) < 6) cells[cells.length - 1] += pt.s
        else cells.push(pt.s)
        last = pt
      }
      grid.push(cells.map((c) => c.trim())); lines.push(cells.map((c) => c.trim()).join(' '))
    }
  }
  return { grid, text: lines.join('\n'), lines }
}

export async function parseEstimateFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  let src
  if (ext === 'xlsx') src = await readXlsx(file)
  else if (ext === 'csv' || ext === 'txt' || ext === 'tsv') src = await readCsv(file)
  else if (ext === 'pdf') src = await readPdf(file)
  else if (ext === 'xls') throw new Error('예전 엑셀 형식(.xls)은 읽을 수 없습니다. 엑셀에서 열어 "다른 이름으로 저장 → .xlsx"로 저장한 뒤 올려 주세요.')
  else throw new Error('엑셀(.xlsx), CSV, PDF 파일만 불러올 수 있습니다.')

  let rows = parseGrid(src.grid), method = '머리글 인식'
  if (rows.length < 2) {
    const alt = parseLines(src.lines || src.grid.map((r) => r.map((c) => (c && typeof c === 'object' ? c.result ?? '' : c ?? '')).join(' ')))
    if (alt.length > rows.length) { rows = alt; method = '줄 단위 추정' }
  }
  const meta = findMeta(src.text)
  if (ext === 'pdf' && !src.text.trim()) throw new Error('글자를 읽을 수 없는 PDF입니다 (스캔 이미지). AOS에서 엑셀로 내려받거나 텍스트 PDF로 저장해 주세요.')
  return { rows, meta, method }
}
