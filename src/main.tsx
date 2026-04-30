import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import AddTransaction from './pages/AddTransaction'
import Import from './pages/Import'
import Budget from './pages/Budget'
import FixedCosts from './pages/FixedCosts'
import AppSettings from './pages/AppSettings'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/add" element={<AddTransaction />} />
          <Route path="/import" element={<Import />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/fixed" element={<FixedCosts />} />
          <Route path="/settings" element={<AppSettings />} />
        </Routes>
      </Layout>
    </HashRouter>
  </StrictMode>,
)
