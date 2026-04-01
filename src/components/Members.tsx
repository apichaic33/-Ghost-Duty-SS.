import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member } from '../types';
import { UserPlus, Edit2, Trash2, Shield, User } from 'lucide-react';
import { toast } from 'sonner';

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'members'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: any = Object.fromEntries(formData.entries());
    if (data.quotaA) data.quotaA = Number(data.quotaA);
    if (data.quotaH) data.quotaH = Number(data.quotaH);
    if (data.quotaX) data.quotaX = Number(data.quotaX);

    try {
      if (editingMember) {
        await updateDoc(doc(db, 'members', editingMember.id), data);
        toast.success('อัปเดตข้อมูลสำเร็จ');
      } else {
        // In a real app, you'd need to create the user in Firebase Auth first
        // or just add them to the database and they login later
        toast.error('กรุณาให้สมาชิกเข้าสู่ระบบครั้งแรกเพื่อสร้างโปรไฟล์');
      }
      setShowModal(false);
      setEditingMember(null);
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const toggleRole = async (member: Member) => {
    try {
      await updateDoc(doc(db, 'members', member.id), {
        role: member.role === 'admin' ? 'user' : 'admin'
      });
      toast.success('เปลี่ยนสิทธิ์สำเร็จ');
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">จัดการสมาชิก</h2>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">ชื่อ-นามสกุล</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">สถานี / โซน</th>
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
                  <div className="flex justify-end space-x-2">
                    <button 
                      onClick={() => { setEditingMember(m); setShowModal(true); }}
                      className="p-2 text-gray-400 hover:text-orange-600 transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold mb-4">{editingMember ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิก'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ชื่อ-นามสกุล</label>
                <input name="name" defaultValue={editingMember?.name} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">สถานี</label>
                  <input name="station" defaultValue={editingMember?.station} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">โซน</label>
                  <input name="zone" defaultValue={editingMember?.zone} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">โควตา A</label>
                  <input type="number" name="quotaA" defaultValue={editingMember?.quotaA || 0} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">โควตา H</label>
                  <input type="number" name="quotaH" defaultValue={editingMember?.quotaH || 0} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">โควตา X (หยุด)</label>
                  <input type="number" name="quotaX" defaultValue={editingMember?.quotaX || 4} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">รูปแบบกะ (Pattern)</label>
                <textarea name="shiftPattern" defaultValue={editingMember?.shiftPattern} required rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 font-mono" />
                <p className="text-[10px] text-gray-400 mt-1">คั่นด้วยเครื่องหมายจุลภาค (,) เช่น S11,S11,X,X</p>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">ยกเลิก</button>
                <button type="submit" className="px-6 py-2 bg-orange-600 text-white text-sm font-bold rounded-lg hover:bg-orange-700">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
