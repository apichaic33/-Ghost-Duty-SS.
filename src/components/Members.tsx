import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member } from '../types';
import { UserPlus, Edit2, Shield, User, Download, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';

interface GasMember {
  empId: string;
  name: string;
  position: string;
  department: string;
  status: string;
  phone: string;
}

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

  // Import from GAS
  const [showImportModal, setShowImportModal] = useState(false);
  const [gasUrl, setGasUrl] = useState('');
  const [gasMembers, setGasMembers] = useState<GasMember[]>([]);
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [fetchLoading, setFetchLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthLabel = format(firstOfMonth, 'MMMM yyyy', { locale: th });

  const patternArray = patternInput.split(',').map(s => s.trim()).filter(Boolean);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'members'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
    });
    getDoc(doc(db, 'settings', 'system')).then(snap => {
      if (snap.exists() && snap.data().gasUrl) setGasUrl(snap.data().gasUrl);
    });
    return () => unsubscribe();
  }, []);

  const openModal = (member: Member | null) => {
    setEditingMember(member);
    const pattern = member?.shiftPattern || '';
    setPatternInput(pattern);
    const existingCycleStart = member?.cycleStartDate || firstOfMonth.toISOString().split('T')[0];
    setCycleStartDate(existingCycleStart);

    // คำนวณ position ปัจจุบันจาก cycleStartDate ที่มีอยู่
    if (member?.cycleStartDate && pattern) {
      const patternArr = pattern.split(',').map(s => s.trim()).filter(Boolean);
      const diff = differenceInDays(firstOfMonth, parseISO(member.cycleStartDate));
      const pos = diff >= 0 ? diff % patternArr.length : null;
      setSelectedPos(pos);
    } else {
      setSelectedPos(null);
    }
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

  const fetchFromGas = async () => {
    if (!gasUrl.trim()) { toast.error('กรุณากรอก URL ของ GAS'); return; }
    setFetchLoading(true);
    setGasMembers([]);
    try {
      const sep = gasUrl.includes('?') ? '&' : '?';
      const res = await fetch(gasUrl.trim() + sep + 'action=getAllMembers');
      const json = await res.json();
      if (json.status === 'success') {
        setGasMembers(json.members);
        setSelectedEmpIds(new Set(json.members.map((m: GasMember) => m.empId)));
        if (json.members.length === 0) toast.info('ไม่พบรายชื่อพนักงานใน Sheet');
      } else {
        toast.error('GAS ตอบกลับข้อผิดพลาด: ' + json.message);
      }
    } catch (err: any) {
      toast.error('เชื่อมต่อไม่ได้ — ตรวจสอบ GAS Deploy ว่าตั้ง "Anyone, even anonymous"');
    } finally {
      setFetchLoading(false);
    }
  };

  const toggleSelectEmp = (empId: string) => {
    setSelectedEmpIds(prev => {
      const next = new Set(prev);
      next.has(empId) ? next.delete(empId) : next.add(empId);
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedEmpIds.size === 0) { toast.error('เลือกอย่างน้อย 1 คน'); return; }
    setImportLoading(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    let imported = 0;
    let updated = 0;
    try {
      for (const m of gasMembers) {
        if (!selectedEmpIds.has(m.empId)) continue;
        const existing = members.find(ex => ex.uid === m.empId || ex.id === m.empId);
        const cleanPosition = m.position?.replace(/\.$/, '').trim() as Member['position'];
        if (existing) {
          await updateDoc(doc(db, 'members', existing.id), {
            name: m.name,
            ...(cleanPosition && { position: cleanPosition }),
            ...(m.department && { station: m.department }),
          });
          updated++;
        } else {
          await setDoc(doc(db, 'members', m.empId), {
            uid: m.empId,
            name: m.name,
            position: cleanPosition || undefined,
            station: m.department || '',
            zone: '',
            quotaA: 0,
            quotaH: 0,
            quotaX: 4,
            shiftPattern: '',
            cycleStartDate: today,
            role: 'member',
          });
          imported++;
        }
      }
      toast.success(`นำเข้าสำเร็จ: ${imported} คนใหม่, ${updated} คนอัปเดต`);
      setShowImportModal(false);
      setGasMembers([]);
      setGasUrl('');
    } catch {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setImportLoading(false);
    }
  };

  // Duplicate detection
  const [showDupModal, setShowDupModal] = useState(false);
  const [selectedDups, setSelectedDups] = useState<Set<string>>(new Set());

  const duplicateGroups = (() => {
    const byName = new Map<string, Member[]>();
    for (const m of members) {
      const key = m.name.trim().toLowerCase();
      byName.set(key, [...(byName.get(key) || []), m]);
    }
    return [...byName.values()].filter(g => g.length > 1);
  })();

  const openDupModal = () => {
    // Pre-select empId docs (shorter IDs = imported from GAS, not real UID)
    const toDelete = new Set<string>();
    for (const group of duplicateGroups) {
      // Sort: prefer Firebase UID (longer) as keeper, mark shorter empId for deletion
      const sorted = [...group].sort((a, b) => b.id.length - a.id.length);
      sorted.slice(1).forEach(m => toDelete.add(m.id));
    }
    setSelectedDups(toDelete);
    setShowDupModal(true);
  };

  const handleDeleteDups = async () => {
    if (selectedDups.size === 0) return;
    if (!confirm(`ลบ ${selectedDups.size} รายการที่เลือกใช่ไหม?`)) return;
    try {
      await Promise.all([...selectedDups].map(id => deleteDoc(doc(db, 'members', id))));
      toast.success(`ลบสำเร็จ ${selectedDups.size} รายการ`);
      setShowDupModal(false);
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  const toggleDup = (id: string) => {
    setSelectedDups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
        <div className="flex items-center space-x-2">
          {duplicateGroups.length > 0 && (
            <button onClick={openDupModal}
              className="flex items-center space-x-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-xl font-bold hover:bg-red-100 transition-colors shadow-sm">
              <AlertTriangle size={16} />
              <span>ข้อมูลซ้ำ ({duplicateGroups.length})</span>
            </button>
          )}
          <button
            onClick={() => { setShowImportModal(true); if (gasUrl && gasMembers.length === 0) setTimeout(fetchFromGas, 50); }}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Download size={18} />
            <span>นำเข้าจาก GAS</span>
          </button>
          <button
            onClick={() => openModal(null)}
            className="flex items-center space-x-2 bg-orange-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-orange-700 transition-colors shadow-sm"
          >
            <UserPlus size={18} />
            <span>เพิ่มสมาชิกใหม่</span>
          </button>
        </div>
      </div>

      {/* Members grouped by position */}
      {(() => {
        const knownPositions = ['SS', 'AStS', 'SP'];
        const normalize = (p?: string) => (p || '').replace(/\.$/, '').trim();
        const groups = [
          { pos: 'SS', label: 'นายสถานี (SS)', badge: 'bg-orange-50 text-orange-600 border-orange-200' },
          { pos: 'AStS', label: 'ผู้ช่วยนายสถานี (AStS)', badge: 'bg-cyan-50 text-cyan-600 border-cyan-200' },
          { pos: 'SP', label: 'เจ้าหน้าที่สถานี (SP)', badge: 'bg-purple-50 text-purple-600 border-purple-200' },
          { pos: '__other__', label: 'ไม่ระบุตำแหน่ง', badge: 'bg-gray-50 text-gray-500 border-gray-200' },
        ];
        return groups.map(({ pos, label, badge }) => {
        const group = pos === '__other__'
          ? members.filter(m => !knownPositions.includes(normalize(m.position)))
          : members.filter(m => normalize(m.position) === pos);
        if (group.length === 0) return null;
        return (
          <div key={pos || 'none'} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center space-x-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge}`}>{pos || '—'}</span>
              <span className="text-xs font-bold text-gray-600">{label}</span>
              <span className="ml-auto text-[10px] text-gray-400">{group.length} คน</span>
            </div>
            <table className="w-full text-left">
              <thead className="bg-white border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase">ชื่อ-นามสกุล</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase">สถานี / โซน</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase">สิทธิ์</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {group.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800 text-sm">{m.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{m.uid}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-700">{m.station}</p>
                      <p className="text-[10px] text-gray-400">{m.zone}</p>
                    </td>
                    <td className="px-5 py-3">
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
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => openModal(m)} className="p-2 text-gray-400 hover:text-orange-600 transition-colors">
                        <Edit2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      });
      })()}

      {/* Import from GAS Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl p-6 shadow-2xl my-4">
            <h3 className="text-xl font-bold mb-1">นำเข้าสมาชิกจาก GAS</h3>
            <p className="text-xs text-gray-400 mb-4">ดึงรายชื่อจาก Employee Sheet แล้วบันทึกลง Firestore</p>

            {/* URL Input */}
            <div className="flex space-x-2 mb-4">
              <input
                type="url"
                value={gasUrl}
                onChange={(e) => setGasUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/xxx/exec"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <button
                onClick={fetchFromGas}
                disabled={fetchLoading}
                className="flex items-center space-x-1 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw size={14} className={fetchLoading ? 'animate-spin' : ''} />
                <span>{fetchLoading ? 'กำลังดึง...' : 'ดึงข้อมูล'}</span>
              </button>
            </div>

            {/* Member List */}
            {gasMembers.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-gray-700">พบ {gasMembers.length} คน — เลือก {selectedEmpIds.size} คน</p>
                  <button
                    onClick={() => setSelectedEmpIds(
                      selectedEmpIds.size === gasMembers.length
                        ? new Set()
                        : new Set(gasMembers.map(m => m.empId))
                    )}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {selectedEmpIds.size === gasMembers.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50 mb-4">
                  {gasMembers.map((m) => {
                    const exists = members.some(ex => ex.uid === m.empId || ex.id === m.empId);
                    return (
                      <label key={m.empId} className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedEmpIds.has(m.empId)}
                          onChange={() => toggleSelectEmp(m.empId)}
                          className="mr-3 accent-blue-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{m.name}</p>
                          <p className="text-xs text-gray-400">{m.empId} · {m.department}</p>
                        </div>
                        <div className="flex items-center space-x-2 ml-2 shrink-0">
                          {m.position && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              m.position === 'SS' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                              m.position === 'AStS' ? 'bg-cyan-50 text-cyan-600 border-cyan-200' :
                              'bg-purple-50 text-purple-600 border-purple-200'
                            }`}>{m.position}</span>
                          )}
                          {exists && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-200">มีแล้ว</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mb-4">
                  สมาชิกที่ "มีแล้ว" จะอัปเดตเฉพาะชื่อ/ตำแหน่ง/สถานี · quotaA/H/X และรูปแบบกะจะไม่ถูกเขียนทับ
                </p>
              </>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowImportModal(false); setGasMembers([]); setGasUrl(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                ยกเลิก
              </button>
              {gasMembers.length > 0 && (
                <button
                  onClick={handleImport}
                  disabled={importLoading || selectedEmpIds.size === 0}
                  className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {importLoading ? 'กำลังนำเข้า...' : `นำเข้า ${selectedEmpIds.size} คน`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl my-4">
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-6 pb-4 border-b border-gray-100 z-10">
              <h3 className="text-xl font-bold">{editingMember ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิก'}</h3>
            </div>
            <div className="px-6 pb-6">
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
            </div>{/* end scrollable content */}
          </div>
        </div>
      )}

      {/* Duplicate Members Modal */}
      {showDupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500" />
                <h3 className="text-lg font-bold">พบข้อมูลซ้ำ</h3>
              </div>
              <p className="text-xs text-gray-400 mt-1">เลือกรายการที่ต้องการลบ ระบบจะเก็บไว้เฉพาะที่ไม่ถูกเลือก</p>
            </div>
            <div className="px-6 py-4 max-h-96 overflow-y-auto space-y-4">
              {duplicateGroups.map(group => (
                <div key={group[0].name} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-600">{group[0].name}</div>
                  {group.map(m => (
                    <button key={m.id} onClick={() => toggleDup(m.id)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm border-t border-gray-100 transition-colors ${
                        selectedDups.has(m.id) ? 'bg-red-50 text-red-700' : 'hover:bg-gray-50 text-gray-700'
                      }`}>
                      <div className="text-left">
                        <p className="font-mono text-[11px] text-gray-400">{m.id}</p>
                        <p className="text-xs">{m.station} · {m.position || '—'} · {m.role}</p>
                      </div>
                      {selectedDups.has(m.id)
                        ? <span className="text-[10px] font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-full">ลบ</span>
                        : <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">เก็บ</span>
                      }
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex space-x-2">
              <button onClick={() => setShowDupModal(false)}
                className="flex-1 py-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">
                ยกเลิก
              </button>
              <button onClick={handleDeleteDups} disabled={selectedDups.size === 0}
                className="flex-1 py-2 text-sm text-white font-bold bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 flex items-center justify-center gap-2">
                <Trash2 size={14} />
                ลบ {selectedDups.size} รายการ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
