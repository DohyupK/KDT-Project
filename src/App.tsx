import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { MainPage } from './pages/MainPage'; import { DashBoardPage } from './pages/DashBoardPage'; import { LoginPage } from './pages/LoginPage'; import { IssuePage } from './pages/IssuePage'
import { InquiryPage } from './pages/InquiryPage'; import { KnowledgePage } from './pages/KnowledgePage'; import { ManagementPage } from './pages/ManagementPage'; import { SettingPage } from './pages/SettingPage'

export const App = () => (
  <BrowserRouter><Routes>
    <Route path="/" element={<MainPage />} /><Route path="/dashboard" element={<DashBoardPage />} /><Route path="/login" element={<LoginPage />} /><Route path="/issue" element={<IssuePage />} />
    <Route path="/inquiry" element={<InquiryPage />} /><Route path="/knowledge" element={<KnowledgePage />} /><Route path="/management" element={<ManagementPage />} /><Route path="/setting" element={<SettingPage />} />
  </Routes></BrowserRouter>
); export default App
