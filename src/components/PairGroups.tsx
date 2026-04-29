import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, PairGroup } from '../types';
import { Plus, Pencil, Trash2, X, Users } from 'lucide-react';
import { toast } from 'sonner';

export default function PairGroups() {
  const [groups, setGroups] = useState<PairGroup[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PairGroup | null>(null);
  const [formName, setFormName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'pairGroups'), snap => {
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as PairGroup))
        .sort((a, b) => a.name.localeCompare(b.name, 'th')));
    });
    const unsub2 = onSnapshot(collection(db, 'members'), snap => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member))
        .sort((a, b) => a.name.localeCompare(b.name, 'th')));
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const occupiedIds = groups
    .filter(g => editingGroup ? g.id !== editingGroup.id : true)
    .flatMap(g => g.memberIds);

  const openCreate = () => {
    setEditingGroup(null);
    setFormName('');
    setSelectedIds([]);
    setShowForm(true);
  };

  const openEdit = (g: PairGroup) => {
    setEditingGroup(g);
    setFormName(g.name);
    setSelectedIds(g.memberIds);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingGroup(null); };

  const toggleMember = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('กรุณาระบุชื่อกลุ่ม'); return; }
    if (selectedIds.length < 2) { toast.error('กรุณาเลือกสมาชิกอย่างน้อย 2 คน'); return; }
    setSaving(true);
    try {
      if (editingGroup) {
        await updateDoc(doc(db, 'pairGroups', editingGroup.id), {
          name: formName.trim(),
          memberIds: selectedIds,
        });
        toast.success('อัปเดตกลุ่มเรียบร้อย');
      } else {
        await addDoc(collection(db, 'pairGroups'), {
          name: formName.trim(),
          memberIds: selectedIds,
          createdAt: new Date().toISOString(),
        });
        toast.success('สร้างกลุ่มเรียบร้อย');
      }
      closeForm();
    } catch { toast.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (g: PairGroup) => {
    if (!confirm(`ต้องการลบกลุ่ม "${g.name}" ใช่ไหม?`)) return;
    try {
      await deleteDoc(doc(db, 'pairGroups', g.id));
      toast.success('ลบกลุ่มเรียบร้อย');
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  const getMemberName = (id: string) => members.find(m => m.id === id)?.name || id;
  const getMember = (id: string) => members.find(m => m.id === id);

  const positionColor = (pos?: string) => {
    if (pos === 'SS') return 'bg-orange-50 text-orange-600 border-orange-200';
    if (pos === 'AStS') return 'bg-cyan-50 text-cyan-600 border-cyan-200';
    return 'bg-purple-50 text-purple-600 border-purple-200';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">จัดการกลุ่มกะ</h2>
          <p className="text-sm text-gray-500">กำหนดกลุ่มสำหรับดูตารางกะพิเศษข้ามตำแหน่ง (สูงสุด 4 คนต่อกลุ่ม)</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors text-sm font-bold">
          <Plus size={16} />
          <span>สร้างกลุ่ม</span>
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-gray-200 text-sm text-gray-400">
          <Users size={32} className="mx-auto mb-3 text-gray-300" />
          ยังไม่มีกลุ่มกะ กดปุ่มสร้างกลุ่มเพื่อเริ่มต้น
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map(g => (
            <div key={g.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <Users size={16} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">{g.name}</p>
                    <p className="text-xs text-gray-400">{g.memberIds.length} สมาชิก</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(g)}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(g)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {g.memberIds.map(id => {
                  const m = getMember(id);
                  return (
                    <div key={id} className="flex items-center gap-1 bg-gray-50 rounded-lg px-2 py-1">
                      {m?.position && (
                        <span className={`text-[7px] font-bold px-1 rounded border leading-none ${positionColor(m.position)}`}>
                          {m.position}
                        </span>
                      )}
                      <span className="text-xs text-gray-700 font-medium">{getMemberName(id)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closeForm}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-800">
                {editingGroup ? 'แก้ไขกลุ่ม' : 'สร้างกลุ่มใหม่'}
              </h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ชื่อกลุ่ม</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="เช่น กลุ่ม A, ทีม 1"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">เลือกสมาชิก</label>
                  <span className={`text-xs font-bold ${selectedIds.length >= 4 ? 'text-red-500' : 'text-gray-400'}`}>
                    {selectedIds.length}/4
                  </span>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {members.map(m => {
                    const isOccupied = occupiedIds.includes(m.id);
                    const isSelected = selectedIds.includes(m.id);
                    const disabled = isOccupied && !isSelected;
                    return (
                      <button
                        key={m.id}
                        onClick={() => !disabled && toggleMember(m.id)}
                        disabled={disabled}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                          ${isSelected ? 'bg-orange-50' : disabled ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-50'}`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                          ${isSelected ? 'bg-orange-600 border-orange-600' : 'border-gray-300'}`}>
                          {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12"><path d="M10 3L5 8.5 2 5.5l-1 1L5 10.5l6-7z"/></svg>}
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          {m.position && (
                            <span className={`text-[7px] font-bold px-1 py-0 rounded border leading-none shrink-0 ${positionColor(m.position)}`}>
                              {m.position}
                            </span>
                          )}
                          <span className="text-sm text-gray-800 font-medium truncate">{m.name}</span>
                        </div>
                        {isOccupied && !isSelected && (
                          <span className="ml-auto text-[10px] text-gray-400 shrink-0">อยู่ในกลุ่มแล้ว</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={closeForm}
                className="flex-1 py-2.5 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 text-sm text-white bg-orange-600 hover:bg-orange-700 rounded-xl font-bold transition-colors disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : editingGroup ? 'บันทึกการแก้ไข' : 'สร้างกลุ่ม'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
