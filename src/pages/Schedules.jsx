import { useState } from 'react'
import { useRefs, useToast } from '../ui'
import ScheduleList from './tabs/ScheduleList'
import Calendar from './Calendar'

export default function Schedules() {
  const [refs] = useRefs()
  const [toast, toastEl] = useToast()
  const [view, setView] = useState('calendar')

  return (
    <div>
      {toastEl}
      <div className="head">
        <h2>일정</h2>
        <div className="seg">
          <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>캘린더</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>목록</button>
        </div>
      </div>
      {view === 'calendar'
        ? <Calendar refs={refs} toast={toast} />
        : <ScheduleList refs={refs} toast={toast} showDone />}
    </div>
  )
}
