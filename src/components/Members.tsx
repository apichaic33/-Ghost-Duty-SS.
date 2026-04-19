import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member } from '../types';
import { UserPlus, Edit2, Shield, User } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const SHIFT_COLORS: Record<string, string> = {
  'S11': 'bg-blue-100 text-blue-700 border-blue-300',
  'S12': 'bg-green-100 text-green-700 border-green-300',
  'S13': 'bg-purple-100 text-purple-700 border-purple-300',
  'AL-S11': 'bg-orange-100 text-orange-700 border-orange-300',
  'AL-S12': 'bg-orange-100 text-orange-700 border-orange-300',
  'AL-S13': 'bg-orange-100 text-orange-700 border-orange-300',
  'S78': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  'X': 'bg-gray-100 text-gray-400 border-gray-300',
  'A': 'bg-red-100 text-red-700 border-red-300',
  'H': 'bg-pink-100 text-pink-700 border-pink-300',
};

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  const [patternInput, setPatternInput] = useState('');
  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [cycleStartDate, setCycleStartDate] = useState('');

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthLabel = format(firstOfMonth, 'MMMM yyyy', { locale: th });

  const patternArray = patternInput.split(',').map(s => s.trim()).filter(Boolean);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'members'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
    });
    return () => unsubscribe();
  }, []);

  const openModal = (member: Member | null) => {
    setEditingMember(member);
    setPatternInput(member?.shiftPattern || '');
    setSelectedPos(null);
    setCycleStartDate(member?.cycleStartDate || firstOfMonth.toISOString().split('T')[0]);
    setShowModal(true);
  };

  const handleSelectPosition = (index: number) => {
    setSelectedPos(index);
    const d = new Date(firstOfMonth);
    d.setDate(d.getDate() - index);
    setCycleStartDate(format(d, 'yyyy-MM-dd'));
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: any = Object.fromEntries(formData.entries());
    data.quotaA = Number(data.quotaA);
    data.quotaH = Number(data.quotaH);
    data.quotaX = Number(data.quotaX);
    data.shiftPattern = patternInput;
    data.cycleStartDate = cycleStartDate;

    try {
      if (editingMember) {
        await updateDoc(doc(db, 'members', editingMember.id), data);
        toast.success('อัปเดตข้อมูลสำเร็จ');
      } else {
        if (!data.uid) { toast.error('กรุณาระบุ UID'); return; }
        await setDoc(doc(db, 'members', data.uid), { ...data, role: 'member' });
        toast.success('เพิ่มสมาชิกสำเร็จ');
      }
      setShowModal(false);
      setEditingMember(null);
    } catch {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const toggleRole = async (member: Member) => {
    try {
      await updateDoc(doc(db, 'members', member.id), {
        role: member.role === 'admin' ? 'member' : 'admin'
      });
      toast.success('เปลี่ยนสิทธิ์สำเร็จ');
    } catch {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">จัดการสมาชิก</h2>
        <button
          onClick={() => openModal(null)}
          className="flex items-center space-x-2 bg-orange-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-orange-700 transition-colors shadow-sm"
        >
          <UserPlus size={18} />
          <span>เพิ่มสมาชิกใหม่</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">ชื่อ-นามสกุล</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">สถานี / โซน</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">ตำแหน่ง</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">สิทธิ์</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-800">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.uid}</p>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-gray-700">{m.station}</p>
                  <p className="text-xs text-gray-400">{m.zone}</p>
                </td>
                <td className="px-6 py-4">
                  {m.position ? (
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${
                      m.position === 'SS' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                      m.position === 'AStS' ? 'bg-cyan-50 text-cyan-600 border-cyan-200' :
                      'bg-purple-50 text-purple-600 border-purple-200'
                    }`}>{m.position}</span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => toggleRole(m)}
                    className={`flex items-center space-x-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase border ${
                      m.role === 'admin' ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {m.role === 'admin' ? <Shield size={12} /> : <User size={12} />}
                    <span>{m.role}</span>
                  </button>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => openModal(m)}
                    className="p-2 text-gray-400 hover:text-orange-600 transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl p-6 shadow-2xl my-4">
            <h3 className="text-xl font-bold mb-4">{editingMember ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิก'}</h3>
            <form onSubmit={handleSave} className="space-y-4">

              {!editingMember && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">รหัสผู้ใช้ (UID)</label>
                  <input name="uid" required placeholder="คัดลอกจากหน้าจอรออนุมัติของสมาชิก"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 font-mono" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ชื่อ-นามสกุล</label>
                  <input name="name" defaultValue={editingMember?.name} required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">สถานี</label>
                  <input name="station" defaultValue={editingMember?.station} required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">โซน</label>
                  <input name="zone" defaultValue={editingMember?.zone} required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ตำแหน่ง (GAS)</label>
                  <select name="position" defaultValue={editingMember?.position || ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">— ไม่ระบุ —</option>
                    <option value="SS">SS — นายสถานี</option>
                    <option value="AStS">AStS — ผู้ช่วยนายสถานี</option>
                    <option value="SP">SP — เจ้าหน้าที่สถานี</option>
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">ต้องตรงกับคอลัมน์ตำแหน่งใน Employee Sheet</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">โควตา A</label>
                  <input type="number" name="quotaA" defaultValue={editingMember?.quotaA ?? 0} required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">โควตา H</label>
                  <input type="number" name="quotaH" defaultValue={editingMember?.quotaH ?? 0} required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">โควตา X</label>
                  <input type="number" name="quotaX" defaultValue={editingMember?.quotaX ?? 4} required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              </div>

              {/* Pattern Input */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">รูปแบบกะ (Pattern)</label>
                <textarea
                  value={patternInput}
                  onChange={(e) => { setPatternInput(e.target.value); setSelectedPos(null); }}
                  required rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                />
                <p className="text-[10px] text-gray-400 mt-1">คั่นด้วยจุลภาค เช่น S11,S11,S11,X,X,S13,S13,S13,X,X</p>
              </div>

              {/* Pattern Visualizer */}
              {patternArray.length > 0 && (
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                  <p className="text-xs font-bold text-orange-700 uppercase mb-1">
                    เลือกตำแหน่งที่ตรงกับวันที่ 1 {monthLabel}
                  </p>

                  {/* Usage Guide */}
                  <div className="bg-white rounded-lg px-3 py-2 border border-orange-100 mb-3 space-y-1">
                    <p className="text-[11px] font-bold text-gray-600">วิธีใช้</p>
                    <p className="text-[10px] text-gray-500">
                      1. ดูว่าสมาชิกทำงาน<span className="font-bold text-gray-700">กะอะไร</span>ในวันที่ 1 ของเดือนนี้ เช่น S11
                    </p>
                    <p className="text-[10px] text-gray-500">
                      2. ดูว่าเดือนที่แล้วทำกะนั้นมาแล้ว<span className="font-bold text-gray-700">กี่วัน</span> เช่น ทำ S11 มาแล้ว 3 วัน
                    </p>
                    <p className="text-[10px] text-gray-500">
                      3. กดที่ช่อง S11 <span className="font-bold text-gray-700">ตำแหน่งที่ 4</span> ในรอบ (3 วันที่ผ่านมา + วันที่ 1 = วันที่ 4)
                    </p>
                    <p className="text-[10px] text-orange-500 font-medium pt-0.5">
                      → ระบบจะคำนวณวันเริ่มรอบ (cycleStartDate) ให้อัตโนมัติ
                    </p>
                  </div>

                  <p className="text-[10px] text-orange-500 mb-3">กดที่ช่องกะที่สมาชิกทำงานในวันที่ 1 ของเดือน</p>
                  <div className="flex flex-wrap gap-1">
                    {patternArray.map((code, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectPosition(idx)}
                        className={`flex flex-col items-center justify-center w-10 h-12 rounded-lg border text-[10px] font-bold transition-all
                          ${selectedPos === idx
                            ? 'ring-2 ring-orange-500 ring-offset-1 scale-110 shadow-md'
                            : 'hover:scale-105 hover:shadow-sm'}
                          ${SHIFT_COLORS[code] || 'bg-gray-100 text-gray-500 border-gray-300'}`}
                      >
                        <span className="text-[8px] opacity-50 font-normal">{idx + 1}</span>
                        <span>{code}</span>
                      </button>
                    ))}
                  </div>

                  {selectedPos !== null ? (
                    <div className="mt-3 flex items-center space-x-2 bg-white rounded-lg px-3 py-2 border border-orange-200">
                      <div className={`px-2 py-0.5 rounded text-xs font-bold border ${SHIFT_COLORS[patternArray[selectedPos]] || ''}`}>
                        {patternArray[selectedPos]}
                      </div>
                      <span className="text-xs text-gray-600">
                        วันที่ 1 {monthLabel} = ตำแหน่งที่ {selectedPos + 1} ของรอบ
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        cycleStart: {cycleStartDate}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-3 text-[10px] text-orange-400 italic">ยังไม่ได้เลือกตำแหน่ง</p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">
                  ยกเลิก
                </button>
                <button type="submit"
                  className="px-6 py-2 bg-orange-600 text-white text-sm font-bold rounded-lg hover:bg-orange-700">
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
