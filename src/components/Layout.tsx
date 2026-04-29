import React, { useState } from 'react';
import { LogOut, Calendar, Users, Settings, MessageSquare, LayoutGrid, Menu, X, Star } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isAdmin: boolean;
  hasPairGroup?: boolean;
  onSignOut: () => void;
}

export default function Layout({ children, activeTab, setActiveTab, isAdmin, hasPairGroup, onSignOut }: LayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const tabs = [
    { id: 'dashboard', label: 'ตารางกะ', icon: Calendar },
    { id: 'team', label: 'กะทั้งหมด', icon: Users },
    { id: 'special', label: 'ตารางกะพิเศษ', icon: Star, pairOnly: true },
    { id: 'requests', label: 'คำขอสลับกะ', icon: MessageSquare },
    { id: 'members', label: 'จัดการสมาชิก', icon: Users, adminOnly: true },
    { id: 'pairgroups', label: 'จัดการกลุ่มกะ', icon: Users, adminOnly: true },
    { id: 'shiftpatterns', label: 'Shift Pattern', icon: LayoutGrid, adminOnly: true },
    { id: 'settings', label: 'ตั้งค่าระบบ', icon: Settings, adminOnly: true },
  ];

  const handleTabClick = (id: string) => {
    setActiveTab(id);
    setMenuOpen(false);
  };

  const NavLinks = () => (
    <>
      <nav className="flex-1 p-4 space-y-1">
        {tabs.map((tab) => {
          if (tab.adminOnly && !isAdmin) return null;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-orange-50 text-orange-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={onSignOut}
          className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut size={18} />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Mobile top bar ── */}
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-gray-200 flex items-center justify-between px-4 py-3 shadow-sm">
        <div>
          <p className="text-sm font-bold text-orange-600 leading-none">ระบบยำกะผี</p>
          <p className="text-[10px] text-gray-400">Yum Ka Phi System</p>
        </div>
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="เมนู"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* ── Mobile drawer overlay ── */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <div className={`md:hidden fixed top-[53px] right-0 bottom-0 z-40 w-64 bg-white shadow-2xl flex flex-col transition-transform duration-200 ${
        menuOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <NavLinks />
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden md:flex min-h-screen">
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-xl font-bold text-orange-600">ระบบยำกะผี</h1>
            <p className="text-xs text-gray-500 mt-1">Yum Ka Phi System</p>
          </div>
          <NavLinks />
        </aside>
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>

      {/* ── Mobile content ── */}
      <main className="md:hidden p-4 overflow-y-auto">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>

    </div>
  );
}
