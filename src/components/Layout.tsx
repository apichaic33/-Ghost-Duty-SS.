import React from 'react';
import { LogOut, Calendar, Users, Settings, MessageSquare, LayoutGrid } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isAdmin: boolean;
  onSignOut: () => void;
}

export default function Layout({ children, activeTab, setActiveTab, isAdmin, onSignOut }: LayoutProps) {
  const tabs = [
    { id: 'dashboard', label: 'ตารางกะ', icon: Calendar },
    { id: 'team', label: 'กะทั้งหมด', icon: Users },
    { id: 'requests', label: 'คำขอสลับกะ', icon: MessageSquare },
    { id: 'members', label: 'จัดการสมาชิก', icon: Users, adminOnly: true },
    { id: 'shiftpatterns', label: 'Shift Pattern', icon: LayoutGrid, adminOnly: true },
    { id: 'settings', label: 'ตั้งค่าระบบ', icon: Settings, adminOnly: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-orange-600">ระบบยำกะผี</h1>
          <p className="text-xs text-gray-500 mt-1">Yum Ka Phi System</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {tabs.map((tab) => {
            if (tab.adminOnly && !isAdmin) return null;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
            onClick={() => signOut(auth)}
            className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={18} />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
