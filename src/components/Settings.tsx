import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, NotificationPreferences } from '../types';
import { toast } from 'sonner';
import { Key, Bell, User, CheckCircle2, XCircle } from 'lucide-react';

interface SettingsProps {
  member: Member;
  setMember: (member: Member) => void;
}

export default function Settings({ member, setMember }: SettingsProps) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(member.notificationPreferences || {
    newRequests: true,
    requestStatus: true,
    warnings: true,
    lineEnabled: true
  });

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const lineToken = formData.get('lineToken') as string;
    const name = formData.get('name') as string;

    try {
      await updateDoc(doc(db, 'members', member.id), { 
        lineToken, 
        name,
        notificationPreferences: prefs
      });
      setMember({ ...member, lineToken, name, notificationPreferences: prefs });
      toast.success('บันทึกข้อมูลสำเร็จ');
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const togglePref = (key: keyof NotificationPreferences) => {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">ตั้งค่าส่วนตัว</h2>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 max-w-2xl">
        <form onSubmit={handleUpdate} className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
              <User size={20} />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-700 mb-1">ข้อมูลส่วนตัว</label>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">ชื่อ-นามสกุล</label>
                  <input 
                    name="name" 
                    defaultValue={member.name} 
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">สถานี</label>
                    <input disabled value={member.station} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">โซน</label>
                    <input disabled value={member.zone} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <Bell size={20} />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-700 mb-1">การแจ้งเตือน Line Notify</label>
              <p className="text-xs text-gray-500 mb-3">ใส่ Token เพื่อรับการแจ้งเตือนเมื่อมีการสลับกะ</p>
              <input 
                name="lineToken" 
                defaultValue={member.lineToken} 
                placeholder="ใส่ Line Notify Token ของคุณ"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 font-mono"
              />
              <a 
                href="https://notify-bot.line.me/my/" 
                target="_blank" 
                rel="noreferrer"
                className="text-[10px] text-orange-600 hover:underline mt-1 inline-block"
              >
                วิธีขอ Token Line Notify
              </a>

              <div className="mt-6 space-y-4">
                <label className="block text-sm font-bold text-gray-700 mb-3">ตั้งค่าประเภทการแจ้งเตือน</label>
                
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => togglePref('lineEnabled')}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${prefs.lineEnabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={prefs.lineEnabled ? 'text-green-600' : 'text-gray-400'}>
                        {prefs.lineEnabled ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                      </div>
                      <span className={`text-sm font-medium ${prefs.lineEnabled ? 'text-green-900' : 'text-gray-500'}`}>เปิดใช้งาน Line Notify</span>
                    </div>
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {[
                      { key: 'newRequests', label: 'คำขอใหม่' },
                      { key: 'requestStatus', label: 'สถานะคำขอ' },
                      { key: 'warnings', label: 'คำเตือนกะ' }
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => togglePref(item.key as keyof NotificationPreferences)}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${prefs[item.key as keyof NotificationPreferences] ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <span className={`text-xs font-medium ${prefs[item.key as keyof NotificationPreferences] ? 'text-orange-900' : 'text-gray-500'}`}>{item.label}</span>
                        <div className={prefs[item.key as keyof NotificationPreferences] ? 'text-orange-600' : 'text-gray-400'}>
                          {prefs[item.key as keyof NotificationPreferences] ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button 
              type="submit"
              className="bg-orange-600 text-white px-8 py-2 rounded-lg font-bold hover:bg-orange-700 transition-colors"
            >
              บันทึกการเปลี่ยนแปลง
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
