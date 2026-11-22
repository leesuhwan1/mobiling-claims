// 엑셀(.xlsx) 내보내기 공용 함수. exceljs는 용량이 커서 버튼을 누를 때만 불러온다.
// sheets: [{ name, columns: [헤더...], rows: [[...]], money?: [열 index], widths?: [..] }]
export async function exportXlsx(filename, sheets) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = '모빌링손해사정 업무시스템'
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.addRow(s.columns)
    for (const r of s.rows) ws.addRow(r.map((v) => (v === undefined ? null : v)))
    const head = ws.getRow(1)
    head.font = { bold: true }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } }
    head.alignment = { vertical: 'middle' }
    s.columns.forEach((h, i) => {
      const col = ws.getColumn(i + 1)
      if (s.money?.includes(i)) col.numFmt = '#,##0'
      const longest = Math.max(String(h).length * 2, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? '').length * 1.4))
      col.width = s.widths?.[i] ?? Math.min(50, Math.max(8, Math.ceil(longest) + 2))
    })
    if (s.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } }
  }
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
