import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { supabase, ROLES } from './lib'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Claims from './pages/Claims'
import ClaimNew from './pages/ClaimNew'
import ClaimDetail from './pages/ClaimDetail'
import Report from './pages/Report'
import Schedules from './pages/Schedules'
import Masters from './pages/Masters'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Billing from './pages/Billing'
import Notifications from './Notifications'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return setProfile(null)
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data))
  }, [session])

  if (session === undefined) return <div className="center muted">불러오는 중…</div>
  if (!session) return <Login />

  const isAdmin = profile?.role === 'admin'
  return (
    <AuthCtx.Provider value={{ session, profile, isAdmin, setProfile }}>
      <Routes>
        <Route path="/claims/:id/report" element={<Report />} />
        <Route path="*" element={
          <div className="layout">
            <aside className="side">
              <div className="brand">모빌링손해사정<small>차량 손해사정 업무시스템</small></div>
              <Notifications userId={session.user.id} />
              <nav>
                <NavLink to="/" end>대시보드</NavLink>
                <NavLink to="/claims">사건관리</NavLink>
                <NavLink to="/claims/new">사고접수</NavLink>
                <NavLink to="/schedules">일정</NavLink>
                <NavLink to="/billing">청구관리</NavLink>
                <NavLink to="/masters">보험사·정비공장</NavLink>
                {isAdmin && <NavLink to="/users">사용자 관리</NavLink>}
                <NavLink to="/settings">설정</NavLink>
              </nav>
              <div className="me">
                <div>{profile?.name || session.user.email}</div>
                <small>{ROLES[profile?.role] || ''}</small>
                <button className="link" onClick={() => supabase.auth.signOut()}>로그아웃</button>
              </div>
            </aside>
            <main className="main">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/claims" element={<Claims />} />
                <Route path="/claims/new" element={<ClaimNew />} />
                <Route path="/claims/:id" element={<ClaimDetail />} />
                <Route path="/schedules" element={<Schedules />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/masters" element={<Masters />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/users" element={isAdmin ? <Users /> : <Navigate to="/" />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </main>
          </div>
        } />
      </Routes>
    </AuthCtx.Provider>
  )
}
