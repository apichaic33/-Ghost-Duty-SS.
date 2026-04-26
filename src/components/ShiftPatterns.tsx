import React, { useState, useEffect } from 'react';
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, getDocs, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { Member, ShiftPatternTemplate } from '../types';
import { format, startOfMonth } from 'date-fns';
import { Plus, Edit2, Trash2, Users, Check, X as CloseIcon } from 'lucide-react';
import { toast } from 'sonner';

const SHIFT_COLORS: Record<string, string> = {
  S11: 'bg-blue-100 text-blue-700 border-blue-200',
  S12: 'bg-green-100 text-green-700 border-green-200',
  S13: 'bg-purple-100 text-purple-700 border-purple-200',
  'AL-S11': 'bg-orange-100 text-orange-700 border-orange-200',
  'AL-S12': 'bg-orange-100 text-orange-700 border-orange-200',
  'AL-S13': 'bg-orange-100 text-orange-700 border-orange-200',
  S78: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  X: 'bg-gray-100 text-gray-400 border-gray-200',
  A: 'bg-red-100 text-red-700 border-red-200',
  H: 'bg-pink-100 text-pink-700 border-pink-200',
};

const POSITION_BADGE: Record<string, string> = {
  SS: 'bg-orange-50 text-orange-600 border-orange-200',
  AStS: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  SP: 'bg-purple-50 text-purple-600 border-purple-200',
};

const EMPTY_FORM = { name: '', pattern: '', position: '' as '' | 'SS' | 'AStS' | 'SP' };

export default function ShiftPatterns() {
  const [templates, setTemplates] = useState<ShiftPatternTemplate[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Assign modal state
  const [assignTemplate, setAssignTemplate] = useState<ShiftPatternTemplate | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [cycleStartDate, setCycleStartDate] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'shiftPatterns'), snap =>
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftPatternTemplate))
        .sort((a, b) => a.name.localeCompare(b.name, 'th')))
    );
    const unsub2 = onSnapshot(collection(db, 'members'), snap =>
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)))
    );
    return () => { unsub1(); unsub2(); };
  }, []);

  const patternArray = form.pattern.split(',').map(s => s.trim()).filter(Boolean);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (t: ShiftPatternTemplate) => {
    setEditingId(t.id);
    setForm({ name: t.name, pattern: t.pattern, position: t.position || '' });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('กรุณาระบุชื่อ Pattern'); return; }
    if (!form.pattern.trim()) { toast.error('กรุณาระบุ Pattern'); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        pattern: form.pattern.trim(),
        position: form.position || null,
        createdAt: new Date().toISOString(),
      };
      if (editingId) {
        await updateDoc(doc(db, 'shiftPatterns', editingId), data);
        toast.success('อัปเดต Pattern สำเร็จ');
      } else {
        await addDoc(collection(db, 'shiftPatterns'), data);
        toast.success('สร้าง Pattern สำเร็จ');
      }
      setShowForm(false);
    } catch { toast.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (t: ShiftPatternTemplate) => {
    if (!confirm(`ลบ Pattern "${t.name}" ใช่ไหม?`)) return;
    try {
      await deleteDoc(doc(db, 'shiftPatterns', t.id));
      toast.success('ลบ Pattern สำเร็จ');
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  const openAssign = (t: ShiftPatternTemplate) => {
    setAssignTemplate(t);
    const eligible = members.filter(m =>
      !t.position || (m.position || '').replace(/\.$/, '').trim() === t.position
    );
    setSelectedMemberIds(new Set(eligible.map(m => m.id)));
    setCycleStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  };

  const handleAssign = async () => {
    if (!assignTemplate || selectedMemberIds.size === 0) return;
    setAssigning(true);
    try {
      const batch = writeBatch(db);
      for (const id of selectedMemberIds) {
        batch.update(doc(db, 'members', id), {
          shiftPattern: assignTemplate.pattern,
          cycleStartDate,
        });
      }
      await batch.commit();
      toast.success(`Assign สำเร็จ ${selectedMemberIds.size} คน`);
      setAssignTemplate(null);
    } catch { toast.error('เกิดข้อผิดพลาด'); }
    finally { setAssigning(false); }
  };

  const toggleMember = (id: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const assignableMembers = assignTemplate
    ? members.filter(m =>
        !assignTemplate.position ||
        (m.position || '').replace(/\.$/, '').trim() === assignTemplate.position
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Shift Pattern</h2>
          <p className="text-sm text-gray-500 mt-0.5">สร้างและ assign รูปแบบกะให้สมาชิก</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center space-x-2 bg-orange-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-orange-700 transition-colors shadow-sm">
          <Plus size={18} />
          <span>สร้าง Pattern ใหม่</span>
        </button>
      </div>

      {/* Pattern List */}
      {templates.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-gray-200 text-sm text-gray-400">
          ยังไม่มี Pattern — กด "สร้าง Pattern ใหม่" เพื่อเริ่มต้น
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => {
            const codes = t.pattern.split(',').map(s => s.trim()).filter(Boolean);
            return (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-bold text-gray-800">{t.name}</p>
                      {t.position && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${POSITION_BADGE[t.position] || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {t.position}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">{codes.length} วัน/รอบ</span>
                    </div>
                    {/* Pattern preview */}
                    <div className="flex flex-wrap gap-1">
                      {codes.map((code, i) => (
                        <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${SHIFT_COLORS[code] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openAssign(t)}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-bold border border-blue-200">
                      <Users size={15} />
                      <span>Assign</span>
                    </button>
                    <button onClick={() => openEdit(t)}
                      className="p-2 text-gray-400 hover:text-orange-600 transition-colors">
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => handleDelete(t)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold">{editingId ? 'แก้ไข Pattern' : 'สร้าง Pattern ใหม่'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><CloseIcon size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ชื่อ Pattern</label>
                <input type="text" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="เช่น Pattern SS ปกติ"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ตำแหน่ง (ถ้าระบุจะกรอง Assign อัตโนมัติ)</label>
                <select value={form.position}
                  onChange={e => setForm(f => ({ ...f, position: e.target.value as typeof form.position }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none">
                  <option value="">— ทุกตำแหน่ง —</option>
                  <option value="SS">SS - นายสถานี</option>
                  <option value="AStS">AStS - ผู้ช่วยนายสถานี</option>
                  <option value="SP">SP - เจ้าหน้าที่สถานี</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pattern (คั่นด้วยจุลภาค)</label>
                <textarea value={form.pattern}
                  onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}
                  rows={3}
                  placeholder="S11,S12,S13,X,X,S11,S12..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none font-mono" />
              </div>

              {/* Visualizer */}
              {patternArray.length > 0 && (
                <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
                  <p className="text-[10px] font-bold text-orange-600 uppercase mb-2">{patternArray.length} วัน/รอบ</p>
                  <div className="flex flex-wrap gap-1">
                    {patternArray.map((code, i) => (
                      <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${SHIFT_COLORS[code] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex space-x-2 mt-6">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 text-sm text-white font-bold bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold">Assign Pattern</h3>
                <p className="text-xs text-gray-500 mt-0.5">{assignTemplate.name}</p>
              </div>
              <button onClick={() => setAssignTemplate(null)} className="text-gray-400 hover:text-gray-600"><CloseIcon size={20} /></button>
            </div>

            {/* Cycle start date */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">วันเริ่มต้น Cycle</label>
              <input type="date" value={cycleStartDate}
                onChange={e => setCycleStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
            </div>

            {/* Member list */}
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 uppercase">เลือกสมาชิก ({selectedMemberIds.size}/{assignableMembers.length})</p>
              <div className="flex gap-2">
                <button onClick={() => setSelectedMemberIds(new Set(assignableMembers.map(m => m.id)))}
                  className="text-[11px] text-blue-600 font-bold hover:underline">เลือกทั้งหมด</button>
                <button onClick={() => setSelectedMemberIds(new Set())}
                  className="text-[11px] text-gray-400 font-bold hover:underline">ล้าง</button>
              </div>
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1 mb-5">
              {assignableMembers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">ไม่มีสมาชิกในตำแหน่งนี้</p>
              ) : assignableMembers.map(m => (
                <button key={m.id} onClick={() => toggleMember(m.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors border ${
                    selectedMemberIds.has(m.id)
                      ? 'bg-orange-50 border-orange-200 text-orange-700'
                      : 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100'
                  }`}>
                  <div className="text-left">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-[10px] text-gray-400">{m.station} · {m.position || '—'}</p>
                  </div>
                  {selectedMemberIds.has(m.id) && <Check size={14} className="text-orange-600 shrink-0" />}
                </button>
              ))}
            </div>

            <div className="flex space-x-2">
              <button onClick={() => setAssignTemplate(null)}
                className="flex-1 py-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">
                ยกเลิก
              </button>
              <button onClick={handleAssign} disabled={assigning || selectedMemberIds.size === 0}
                className="flex-1 py-2 text-sm text-white font-bold bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                {assigning ? 'กำลัง Assign...' : `Assign ${selectedMemberIds.size} คน`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
