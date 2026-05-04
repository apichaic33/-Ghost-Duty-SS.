import React, { useState, useEffect } from 'react';
import { doc, updateDoc, collection, onSnapshot, setDoc, deleteDoc, getDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Member, NotificationPreferences, ShiftProperty, ShiftTimeSlot, ShiftGroup, SHIFT_GROUPS } from '../types';
import { toast } from 'sonner';
import { Bell, User, CheckCircle2, XCircle, Settings as SettingsIcon, Plus, Trash2, Link, RefreshCw, Database, AlertTriangle } from 'lucide-react';

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
  const [newShiftProp, setNewShiftProp] = useState<Partial<ShiftProperty>>({ id: '', name: '', color: '#ea580c', timeSlot: 'morning', isMain: true, group: 'main', startTime: '', endTime: '', isOvernight: false });
  const [gasUrl, setGasUrl] = useState('');
  const [gasUrlSaving, setGasUrlSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; updated: number } | null>(null);
  const [shiftFormKey, setShiftFormKey] = useState(0);

  useEffect(() => {
    if (member.role === 'admin') {
      const unsubProps = onSnapshot(collection(db, 'shiftProperties'), (snap) => {
        setShiftProps(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftProperty)));
      });
      getDoc(doc(db, 'settings', 'system')).then(snap => {
        if (snap.exists()) setGasUrl(snap.data().gasUrl || '');
      });
      return () => unsubProps();
    }
  }, [member.role]);

  const handleAddShiftProp = async () => {
    const id = (newShiftProp.id || '').trim().toUpperCase();
    const name = (newShiftProp.name || '').trim();
    if (!id) { toast.error('กรุณากรอกรหัสกะ'); return; }
    if (!name) { toast.error('กรุณากรอกชื่อเรียก'); return; }
    if (auth.currentUser?.isAnonymous) {
      toast.error('ต้องเข้าสู่ระบบด้วย Google เพื่อจัดการทะเบียนรหัสกะ');
      return;
    }
    const group = newShiftProp.group || 'main';
    const isMain = group === 'main';
    try {
      await setDoc(doc(db, 'shiftProperties', id), {
        name,
        color: newShiftProp.color || '#ea580c',
        timeSlot: newShiftProp.timeSlot || 'morning',
        isMain,
        group,
        startTime: newShiftProp.startTime || '',
        endTime: newShiftProp.endTime || '',
        isOvernight: newShiftProp.isOvernight || false,
      });
      setNewShiftProp({ id: '', name: '', color: '#ea580c', timeSlot: 'morning', isMain: true, group: 'main', startTime: '', endTime: '', isOvernight: false });
      setShiftFormKey(k => k + 1);
      toast.success('เพิ่มรหัสกะสำเร็จ');
    } catch (err: any) {
      console.error('[handleAddShiftProp]', err?.code, err?.message);
      if (err?.code === 'permission-denied') {
        toast.error('ไม่มีสิทธิ์ — กรุณาเข้าสู่ระบบด้วย Google (Admin)');
      } else {
        toast.error(`เกิดข้อผิดพลาด: ${err?.code || err?.message || 'unknown'}`);
      }
    }
  };

  const handleSaveGasUrl = async () => {
    if (!gasUrl.trim()) { toast.error('กรุณากรอก URL'); return; }
    setGasUrlSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'system'), { gasUrl: gasUrl.trim() }, { merge: true });
      toast.success('บันทึก GAS URL สำเร็จ');
    } catch { toast.error('เกิดข้อผิดพลาด'); }
    finally { setGasUrlSaving(false); }
  };

  const handleSyncFromGas = async () => {
    if (!gasUrl.trim()) { toast.error('กรุณาบันทึก GAS URL ก่อน'); return; }
    setSyncing(true);
    setSyncResult(null);
    try {
      const sep = gasUrl.includes('?') ? '&' : '?';
      const res = await fetch(gasUrl.trim() + sep + 'action=getAllMembers');
      const json = await res.json();
      if (json.status !== 'success') { toast.error('GAS ตอบกลับข้อผิดพลาด: ' + json.message); return; }

      const snap = await getDocs(collection(db, 'members'));
      const existing = snap.docs.map(d => ({ id: d.id, ...d.data() } as Member));
      const today = new Date().toISOString().split('T')[0];

      let imported = 0, updated = 0;
      for (const m of json.members) {
        const cleanPos = (m.position || '').replace(/\.$/, '').trim();
        const found =
          existing.find((ex: Member) => ex.uid === m.empId || ex.id === m.empId) ||
          existing.find((ex: Member) => ex.name.trim().toLowerCase() === m.name.trim().toLowerCase());
        if (found) {
          await updateDoc(doc(db, 'members', found.id), {
            name: m.name,
            ...(cleanPos && { position: cleanPos }),
            ...(m.department && { station: m.department }),
          });
          updated++;
        } else {
          await setDoc(doc(db, 'members', m.empId), {
            uid: m.empId, empId: m.empId, name: m.name,
            ...(cleanPos && { position: cleanPos }),
            station: m.department || '', zone: '',
            quotaA: 0, quotaH: 0, quotaX: 4,
            shiftPattern: '', cycleStartDate: today, role: 'member',
          }, { merge: true });
          imported++;
        }
      }
      setSyncResult({ imported, updated });
      toast.success(`Sync สำเร็จ: ${imported} คนใหม่, ${updated} คนอัปเดต`);
    } catch { toast.error('เชื่อมต่อ GAS ไม่ได้ — ตรวจสอบ Deploy Settings'); }
    finally { setSyncing(false); }
  };

  const handleSeedShiftProps = async () => {
    if (!confirm('Seed รหัสกะเริ่มต้น 10 รายการเข้า Firestore ใช่ไหม? (จะข้ามถ้ามีอยู่แล้ว)')) return;
    const defaults = [
      { id: 'S11',    name: 'กะเช้า',             color: '#ea580c', timeSlot: 'morning',   isMain: true,  group: 'main',    startTime: '06:00', endTime: '14:00', isOvernight: false },
      { id: 'S12',    name: 'กะบ่าย',             color: '#ea580c', timeSlot: 'afternoon', isMain: true,  group: 'main',    startTime: '14:00', endTime: '22:00', isOvernight: false },
      { id: 'S13',    name: 'กะดึก',              color: '#ea580c', timeSlot: 'night',     isMain: true,  group: 'main',    startTime: '22:00', endTime: '06:00', isOvernight: true  },
      { id: 'S78',    name: 'กะพิเศษ',            color: '#ea580c', timeSlot: 'morning',   isMain: true,  group: 'main',    startTime: '',      endTime: '',      isOvernight: false },
      { id: 'AL-S11', name: 'ลา + กะเช้า',        color: '#d97706', timeSlot: 'morning',   isMain: false, group: 'spare',   startTime: '06:00', endTime: '14:00', isOvernight: false },
      { id: 'AL-S12', name: 'ลา + กะบ่าย',        color: '#d97706', timeSlot: 'afternoon', isMain: false, group: 'spare',   startTime: '14:00', endTime: '22:00', isOvernight: false },
      { id: 'AL-S13', name: 'ลา + กะดึก',         color: '#d97706', timeSlot: 'night',     isMain: false, group: 'spare',   startTime: '22:00', endTime: '06:00', isOvernight: true  },
      { id: 'X',      name: 'วันหยุด',            color: '#9ca3af', timeSlot: 'rest',      isMain: false, group: 'rest',    startTime: '',      endTime: '',      isOvernight: false },
      { id: 'XO',     name: 'หยุด (แลกนอกสถานี)', color: '#3b82f6', timeSlot: 'rest',      isMain: false, group: 'rest',    startTime: '',      endTime: '',      isOvernight: false },
      { id: 'A',      name: 'ลาพักร้อน',          color: '#ef4444', timeSlot: 'leave',     isMain: false, group: 'leave',   startTime: '',      endTime: '',      isOvernight: false },
      { id: 'H',      name: 'หยุดนักขัตฤกษ์',    color: '#f43f5e', timeSlot: 'holiday',   isMain: false, group: 'holiday', startTime: '',      endTime: '',      isOvernight: false },
    ];
    try {
      const existingIds = new Set(shiftProps.map(p => p.id));
      let added = 0;
      for (const d of defaults) {
        if (!existingIds.has(d.id)) {
          await setDoc(doc(db, 'shiftProperties', d.id), d);
          added++;
        }
      }
      toast.success(added > 0 ? `Seed สำเร็จ ${added} รหัส` : 'มีครบแล้ว ไม่มีรหัสใหม่');
    } catch { toast.error('เกิดข้อผิดพลาด'); }
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
    const name = formData.get('name') as string;

    try {
      await updateDoc(doc(db, 'members', member.id), {
        name,
        notificationPreferences: prefs
      });
      setMember({ ...member, name, notificationPreferences: prefs });
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
              <label className="block text-sm font-bold text-gray-700 mb-1">การแจ้งเตือนทางอีเมล</label>
              <p className="text-xs text-gray-500 mb-4">ระบบจะส่งอีเมลแจ้งเตือนตามที่ตั้งค่าไว้</p>

              <div className="space-y-4">
                <label className="block text-sm font-bold text-gray-700 mb-3">ตั้งค่าประเภทการแจ้งเตือน</label>

                <div className="space-y-2">
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
          {auth.currentUser?.isAnonymous && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium rounded-xl px-4 py-3 mb-6">
              <AlertTriangle size={14} className="shrink-0" />
              <span>คุณเข้าสู่ระบบด้วย PIN — ฟีเจอร์ Admin บางส่วนต้องการ <strong>เข้าสู่ระบบด้วย Google</strong> เพื่อแก้ไขข้อมูล</span>
            </div>
          )}
          {/* GAS URL */}
          <div className="flex items-start space-x-4 mb-6 pb-6 border-b border-gray-100">
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <Link size={20} />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-700 mb-1">URL ของ GAS (Google Apps Script)</label>
              <p className="text-xs text-gray-500 mb-3">ตั้งค่าครั้งเดียว ระบบจะดึงรายชื่อสมาชิกจาก GAS โดยอัตโนมัติ</p>
              <div className="flex space-x-2">
                <input
                  type="url"
                  value={gasUrl}
                  onChange={e => setGasUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/xxx/exec"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={handleSaveGasUrl}
                  disabled={gasUrlSaving}
                  className="px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {gasUrlSaving ? 'กำลังบันทึก...' : 'บันทึก URL'}
                </button>
              </div>
              {gasUrl && (
                <>
                  <p className="text-[10px] text-green-600 mt-1">✓ ตั้งค่าแล้ว — หน้าจัดการสมาชิกจะใช้ URL นี้โดยอัตโนมัติ</p>
                  <button
                    onClick={handleSyncFromGas}
                    disabled={syncing}
                    className="mt-3 flex items-center space-x-2 px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                    <span>{syncing ? 'กำลัง Sync...' : 'Sync สมาชิกจาก GAS ทันที'}</span>
                  </button>
                  {syncResult && (
                    <p className="text-[10px] text-green-700 mt-2 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
                      ✓ Sync เสร็จ — ใหม่ {syncResult.imported} คน · อัปเดต {syncResult.updated} คน
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-start space-x-4 mb-6">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <SettingsIcon size={20} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700">ทะเบียนรหัสกะ</label>
                  <p className="text-xs text-gray-500">กำหนดชื่อ สี ช่วงเวลา และประเภทของแต่ละรหัสกะ</p>
                </div>
                <button onClick={handleSeedShiftProps}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 transition-colors">
                  <Database size={13} />
                  <span>Seed ค่าเริ่มต้น</span>
                </button>
              </div>

              <div className="space-y-4">
                {/* Add form */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase">เพิ่มรหัสกะใหม่</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">รหัสกะ</label>
                      <input
                        placeholder="เช่น S78"
                        value={newShiftProp.id}
                        onChange={e => setNewShiftProp(prev => ({ ...prev, id: e.target.value.toUpperCase() }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">ชื่อเรียก</label>
                      <input
                        placeholder="เช่น กะเช้าเสริม"
                        value={newShiftProp.name}
                        onChange={e => setNewShiftProp(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">กลุ่มกะ</label>
                      <select
                        value={newShiftProp.group || 'main'}
                        onChange={e => setNewShiftProp(prev => ({ ...prev, group: e.target.value as ShiftGroup }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        {SHIFT_GROUPS.map(g => (
                          <option key={g.value} value={g.value}>{g.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">ช่วงเวลา</label>
                      <select
                        value={newShiftProp.timeSlot}
                        onChange={e => setNewShiftProp(prev => ({ ...prev, timeSlot: e.target.value as ShiftTimeSlot }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="morning">เช้า</option>
                        <option value="afternoon">บ่าย</option>
                        <option value="night">ดึก</option>
                        <option value="rest">หยุด</option>
                        <option value="holiday">วันหยุดนักขัตฤกษ์</option>
                        <option value="leave">ลา</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">เวลาเข้างาน</label>
                      <input
                        type="time"
                        value={newShiftProp.startTime || ''}
                        onChange={e => setNewShiftProp(prev => ({ ...prev, startTime: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">เวลาออกงาน</label>
                      <input
                        type="time"
                        value={newShiftProp.endTime || ''}
                        onChange={e => setNewShiftProp(prev => ({ ...prev, endTime: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">สี</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={newShiftProp.color}
                          onChange={e => setNewShiftProp(prev => ({ ...prev, color: e.target.value }))}
                          className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                        />
                        <span className="text-xs font-mono text-gray-500">{newShiftProp.color}</span>
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newShiftProp.isOvernight || false}
                        onChange={e => setNewShiftProp(prev => ({ ...prev, isOvernight: e.target.checked }))}
                        className="rounded"
                      />
                      กะข้ามวัน (ดึก)
                    </label>
                    <button
                      onClick={handleAddShiftProp}
                      className="ml-auto bg-orange-600 text-white rounded-lg px-4 py-2 text-xs font-bold flex items-center space-x-1 hover:bg-orange-700"
                    >
                      <Plus size={14} />
                      <span>เพิ่ม</span>
                    </button>
                  </div>
                </div>

                {/* List grouped by category */}
                {shiftProps.length === 0 ? (
                  <p className="p-4 text-center text-xs text-gray-400 italic border border-dashed border-gray-200 rounded-xl">ยังไม่มีรหัสกะในระบบ</p>
                ) : (
                  <div className="space-y-3">
                    {SHIFT_GROUPS.map(grp => {
                      const items = shiftProps.filter(p => (p.group || (p.isMain ? 'main' : 'extra')) === grp.value);
                      if (items.length === 0) return null;
                      return (
                        <div key={grp.value} className="border border-gray-100 rounded-xl overflow-hidden">
                          <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: grp.color + '14' }}>
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: grp.color }} />
                            <span className="text-[10px] font-bold uppercase" style={{ color: grp.color }}>{grp.label}</span>
                            <span className="text-[9px] text-gray-400 ml-1">{items.length} รหัส</span>
                          </div>
                          <div className="divide-y divide-gray-50">
                            {items.map(prop => (
                              <div key={prop.id} className="px-3 py-2.5 hover:bg-gray-50 space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    defaultValue={prop.color || '#ea580c'}
                                    onBlur={async e => {
                                      if (e.target.value !== prop.color) {
                                        try {
                                          await setDoc(doc(db, 'shiftProperties', prop.id), { ...prop, color: e.target.value });
                                          toast.success(`อัปเดตสี ${prop.id}`);
                                        } catch { toast.error('เกิดข้อผิดพลาด'); }
                                      }
                                    }}
                                    className="w-6 h-6 rounded-md border border-gray-200 cursor-pointer p-0 flex-shrink-0"
                                  />
                                  <span className="text-xs font-bold font-mono text-gray-700 w-16 shrink-0">{prop.id}</span>
                                  <span className="text-xs text-gray-600 flex-1">{prop.name}</span>
                                  <button
                                    onClick={() => handleDeleteShiftProp(prop.id)}
                                    className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                                {/* Time row — show only for work shifts (not rest/leave/holiday) */}
                                {!['rest', 'leave', 'holiday'].includes(prop.timeSlot) && (
                                  <div className="flex items-center gap-2 pl-8">
                                    <span className="text-[10px] text-gray-400 w-12 shrink-0">เวลา</span>
                                    <input
                                      type="time"
                                      defaultValue={prop.startTime || ''}
                                      onBlur={async e => {
                                        if (e.target.value !== (prop.startTime || '')) {
                                          try {
                                            await setDoc(doc(db, 'shiftProperties', prop.id), { ...prop, startTime: e.target.value });
                                            toast.success(`อัปเดตเวลาเข้า ${prop.id}`);
                                          } catch { toast.error('เกิดข้อผิดพลาด'); }
                                        }
                                      }}
                                      className="border border-gray-200 rounded px-2 py-1 text-[10px] outline-none focus:ring-1 focus:ring-orange-400 w-24"
                                    />
                                    <span className="text-[10px] text-gray-400">–</span>
                                    <input
                                      type="time"
                                      defaultValue={prop.endTime || ''}
                                      onBlur={async e => {
                                        if (e.target.value !== (prop.endTime || '')) {
                                          try {
                                            await setDoc(doc(db, 'shiftProperties', prop.id), { ...prop, endTime: e.target.value });
                                            toast.success(`อัปเดตเวลาออก ${prop.id}`);
                                          } catch { toast.error('เกิดข้อผิดพลาด'); }
                                        }
                                      }}
                                      className="border border-gray-200 rounded px-2 py-1 text-[10px] outline-none focus:ring-1 focus:ring-orange-400 w-24"
                                    />
                                    <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        defaultChecked={prop.isOvernight || false}
                                        onChange={async e => {
                                          try {
                                            await setDoc(doc(db, 'shiftProperties', prop.id), { ...prop, isOvernight: e.target.checked });
                                          } catch { toast.error('เกิดข้อผิดพลาด'); }
                                        }}
                                        className="rounded"
                                      />
                                      ข้ามวัน
                                    </label>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
