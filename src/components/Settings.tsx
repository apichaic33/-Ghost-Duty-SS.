import React, { useState, useEffect } from 'react';
import { doc, updateDoc, collection, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, NotificationPreferences, ShiftProperty } from '../types';
import { toast } from 'sonner';
import { Key, Bell, User, CheckCircle2, XCircle, Settings as SettingsIcon, Plus, Trash2 } from 'lucide-react';

interface SettingsProps {
  member: Member;
  setMember: (member: Member) => void;
}

export default function Settings({ member, setMember }: SettingsProps) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(member.notificationPreferences || {
    newRequests: true,
    requestStatus: true,
    warnings: true,
  });
  const [shiftProps, setShiftProps] = useState<ShiftProperty[]>([]);
  const [newShiftProp, setNewShiftProp] = useState<Partial<ShiftProperty>>({ id: '', name: '', color: 'bg-blue-100 text-blue-700' });

  useEffect(() => {
    if (member.role === 'admin') {
      const unsub = onSnapshot(collection(db, 'shiftProperties'), (snap) => {
        setShiftProps(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftProperty)));
      });
      return () => unsub();
    }
  }, [member.role]);

  const handleAddShiftProp = async () => {
    if (!newShiftProp.id || !newShiftProp.name) return;
    try {
      await setDoc(doc(db, 'shiftProperties', newShiftProp.id), {
        name: newShiftProp.name,
        color: newShiftProp.color
      });
      setNewShiftProp({ id: '', name: '', color: 'bg-blue-100 text-blue-700' });
      toast.success('เพิ่มคุณสมบัติกะสำเร็จ');
    } catch (e) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const handleDeleteShiftProp = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'shiftProperties', id));
      toast.success('ลบคุณสมบัติกะสำเร็จ');
    } catch (e) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

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

      {member.role === 'admin' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 max-w-2xl">
          <div className="flex items-start space-x-4 mb-6">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <SettingsIcon size={20} />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-700 mb-1">ตั้งค่าคุณสมบัติกะ</label>
              <p className="text-xs text-gray-500 mb-4">กำหนดชื่อเรียกและสีของแต่ละรหัสกะ</p>
              
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <input 
                    placeholder="รหัส (เช่น S78)" 
                    value={newShiftProp.id}
                    onChange={e => setNewShiftProp(prev => ({ ...prev, id: e.target.value.toUpperCase() }))}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input 
                    placeholder="ชื่อเรียก (เช่น ดิวช่วย)" 
                    value={newShiftProp.name}
                    onChange={e => setNewShiftProp(prev => ({ ...prev, name: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button 
                    onClick={handleAddShiftProp}
                    className="bg-blue-600 text-white rounded-lg px-3 py-2 text-xs font-bold flex items-center justify-center space-x-1 hover:bg-blue-700"
                  >
                    <Plus size={14} />
                    <span>เพิ่ม</span>
                  </button>
                </div>

                <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                  {shiftProps.map(prop => (
                    <div key={prop.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-bold text-gray-400 w-10">{prop.id}</span>
                        <span className="text-sm font-medium text-gray-700">{prop.name}</span>
                      </div>
                      <button 
                        onClick={() => handleDeleteShiftProp(prop.id)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {shiftProps.length === 0 && (
                    <p className="p-4 text-center text-xs text-gray-400 italic">ยังไม่มีการตั้งค่าคุณสมบัติกะ</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
