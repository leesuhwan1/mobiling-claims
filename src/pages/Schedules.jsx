import { useMemo, useState } from 'react'
import { useRefs, useToast } from '../ui'
import ScheduleList from './tabs/ScheduleList'

export default function Schedules() {
  const [refs] = useRefs()
  const [toast, toastEl] = useToast()
  const [mine, setMine] = useState(false)
  const [range, setRange] = useState('week')
  const [showDone, setShowDone] = useState(false)

  const { from, to } = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    const e = new Date(d)
    if (range === 'today') e.setDate(e.getDate() + 1)
    else if (range === 'week') e.setDate(e.getDate() + 7)
    else if (range === 'month') e.setMonth(e.getMonth() + 1)
    else return { from: null, to: null }
    return { from: d.toISOString(), to: e.toISOString() }
  }, [range])

  return (
    <div>
      {toastEl}
      <h2>일정</h2>
      <div className="filters card">
        <div className="seg">
          {[['today', '오늘'], ['week', '7일'], ['month', '1개월'], ['all', '전체']].map(([k, l]) => (
            <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>
          ))}
        </div>
        <label className="inline"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> 내 일정만</label>
        <label className="inline"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> 완료 포함</label>
      </div>
      <ScheduleList refs={refs} toast={toast} mineOnly={mine} from={from} to={to} showDone={showDone} />
    </div>
  )
}
