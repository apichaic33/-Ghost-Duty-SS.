import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday } from 'date-fns';
import { th } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, RefreshCw, X as CloseIcon } from 'lucide-react';
import { collection, onSnapshot, query, where, doc, setDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, Shift, ShiftCode, ShiftProperty } from '../types';
import { generateSchedule, getShiftCode } from '../lib/scheduleUtils';
import { toast } from 'sonner';
import emailjs from '@emailjs/browser';

const EMAILJS_SERVICE_ID = 'service_yamka';
const EMAILJS_TEMPLATE_ID = 'template_nfo6sld';
const EMAILJS_PUBLIC_KEY = 'YY8IVNkVN-qhgglkU';

const SHIFT_COLORS: Record<string, string> = {
  'S11': 'bg-gray-100 text-gray-500',
  'S12': 'bg-gray-100 text-gray-500',
  'S13': 'bg-gray-100 text-gray-500',
  'AL-S11': 'bg-gray-100 text-gray-400',
  'AL-S12': 'bg-gray-100 text-gray-400',
  'AL-S13': 'bg-gray-100 text-gray-400',
  'S78': 'bg-gray-100 text-gray-500',
  'X': 'bg-white text-gray-300',
  'A': 'bg-red-50 text-red-400',
  'H': 'bg-rose-50 text-rose-400',
};

const SELF_COLORS: Record<string, string> = {
  'S11': 'bg-orange-50 text-orange-700',
  'S12': 'bg-orange-50 text-orange-700',
  'S13': 'bg-orange-50 text-orange-700',
  'AL-S11': 'bg-amber-50 text-amber-600',
  'AL-S12': 'bg-amber-50 text-amber-600',
  'AL-S13': 'bg-amber-50 text-amber-600',
  'S78': 'bg-orange-50 text-orange-700',
  'X': 'bg-white text-gray-300',
  'A': 'bg-red-50 text-red-500',
  'H': 'bg-rose-50 text-rose-500',
};

interface TeamScheduleProps {
  member: Member;
  isAdmin: boolean;
}

interface SwapPopup {
  targetMember: Member;
  targetDate: string;
  targetShift: string;
}

interface RequestForm {
  type: 'swap' | 'cover';
  targetMember: Member;
  targetDate: string;
  targetShift: string;
  requesterDate: string;
  returnDate: string;
  submitting: boolean;
}

export default function TeamSchedule({ member, isAdmin }: TeamScheduleProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [members, setMembers] = useState<Member[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [shiftProps, setShiftProps] = useState<ShiftProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const normalizePos = (p?: string) => (p || '').replace(/\.$/, '').trim();
  const [positionTab, setPositionTab] = useState<string>(normalizePos(member.position) || 'SS');
  const [editingShift, setEditingShift] = useState<{ member: Member; date: string } | null>(null);
  const [swapPopup, setSwapPopup] = useState<SwapPopup | null>(null);
  const [requestForm, setRequestForm] = useState<RequestForm | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  useEffect(() => {
    const unsubMembers = onSnapshot(collection(db, 'members'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
    });
    const unsubProps = onSnapshot(collection(db, 'shiftProperties'), (snap) => {
      setShiftProps(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftProperty)));
    });
    const q = query(
      collection(db, 'shifts'),
      where('date', '>=', format(monthStart, 'yyyy-MM-dd')),
      where('date', '<=', format(monthEnd, 'yyyy-MM-dd'))
    );
    const unsubShifts = onSnapshot(q, (snap) => {
      setAllShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));
      setLoading(false);
    });
    return () => { unsubMembers(); unsubProps(); unsubShifts(); };
  }, [currentDate]);

  const shiftsMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allShifts) map.set(`${s.memberId}_${s.date}`, s.shiftCode);
    return map;
  }, [allShifts]);

  const generatedMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    for (const m of members) {
      if (!m.shiftPattern) continue;
      const schedule = generateSchedule(m.id, m.shiftPattern, m.cycleStartDate, 2);
      map.set(m.id, new Map(schedule.map(s => [s.date, s.shiftCode])));
    }
    return map;
  }, [members]);

  const getShift = (m: Member, dateStr: string): string =>
    shiftsMap.get(`${m.id}_${dateStr}`) ?? generatedMap.get(m.id)?.get(dateStr) ?? 'X';

  // Both admin and member: filter by positionTab
  const visibleMembers = useMemo(() => members.filter(m =>
    normalizePos(m.position) === positionTab
  ), [members, positionTab]);

  const getUsage = (m: Member, code: string) =>
    days.filter(d => getShift(m, format(d, 'yyyy-MM-dd')) === code).length;

  const openRequestForm = (type: 'swap' | 'cover', popup: SwapPopup) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const defaultReturn = format(addMonths(new Date(), 1), 'yyyy-MM-dd');
    setSwapPopup(null);
    setRequestForm({
      type,
      targetMember: popup.targetMember,
      targetDate: popup.targetDate,
      targetShift: popup.targetShift,
      requesterDate: today,
      returnDate: defaultReturn,
      submitting: false,
    });
  };

  const submitRequest = async () => {
    if (!requestForm) return;
    const { type, targetMember, targetDate, targetShift, requesterDate, returnDate } = requestForm;

    if (type === 'cover') {
      const now = new Date();
      const maxReturn = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      if (new Date(returnDate) > maxReturn) {
        toast.error('วันคืนกะต้องอยู่ภายในเดือนถัดไป');
        return;
      }
      if (new Date(returnDate) <= new Date(requesterDate)) {
        toast.error('วันคืนกะต้องอยู่หลังวันควงกะ');
        return;
      }
    }

    const requesterShift = getShiftCode(member, requesterDate, allShifts);

    setRequestForm(f => f ? { ...f, submitting: true } : null);
    try {
      await addDoc(collection(db, 'swapRequests'), {
        requesterId: member.id,
        requesterName: member.name,
        targetId: targetMember.id,
        targetName: targetMember.name,
        type,
        requesterDate,
        targetDate: type === 'swap' ? targetDate : undefined,
        returnDate: type === 'cover' ? returnDate : undefined,
        requesterShift,
        targetShift: type === 'swap' ? targetShift : undefined,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      if (targetMember.email) {
        const label = type === 'swap' ? 'สลับกะ' : 'ควงกะ';
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          subject: `คำขอ${label}ใหม่จาก ${member.name}`,
          to_email: targetMember.email,
          message: `คำขอ${label}ใหม่!\nจาก: ${member.name}\nวันที่: ${requesterDate} (${requesterShift})\nกรุณาตรวจสอบในระบบ`,
        }, EMAILJS_PUBLIC_KEY).catch(() => {});
      }

      toast.success('ส่งคำขอเรียบร้อยแล้ว');
      setRequestForm(null);
    } catch {
      toast.error('เกิดข้อผิดพลาด');
      setRequestForm(f => f ? { ...f, submitting: false } : null);
    }
  };

  const handleUpdateShift = async (code: ShiftCode) => {
    if (!editingShift) return;
    try {
      await setDoc(doc(db, 'shifts', `${editingShift.member.id}_${editingShift.date}`), {
        memberId: editingShift.member.id,
        date: editingShift.date,
        shiftCode: code,
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin',
      });
      if (editingShift.member.email) {
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          subject: `Admin แก้ไขกะของคุณ วันที่ ${editingShift.date}`,
          to_email: editingShift.member.email,
          message: `กะของคุณวันที่ ${editingShift.date} ถูกแก้ไขเป็น ${code} โดย Admin`,
        }, EMAILJS_PUBLIC_KEY).catch(() => {});
      }
      toast.success('อัปเดตกะสำเร็จ');
      setEditingShift(null);
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">กะทั้งหมด</h2>
          <p className="text-sm text-gray-500">
            {isAdmin ? 'ดูและแก้ไขตารางกะของทุกตำแหน่ง' : `ตำแหน่ง ${member.position || '—'}`}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 400); }}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-orange-600">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="h-6 w-px bg-gray-200" />
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm font-bold min-w-[120px] text-center">
            {format(currentDate, 'MMMM yyyy', { locale: th })}
          </span>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Position tabs — all users */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
        {['SS', 'AStS', 'SP'].map(tab => (
          <button key={tab} onClick={() => setPositionTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${positionTab === tab ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto" style={{ paddingBottom: 17 }}>
        <table className="border-collapse text-xs" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="sticky left-0 z-20 bg-gray-50 px-3 py-3 text-left font-bold text-gray-500 uppercase border-r border-gray-200" style={{ minWidth: 170, width: 170 }}>
                สมาชิก
              </th>
              {days.map(day => (
                <th key={day.toISOString()}
                  style={{ width: 32, minWidth: 32 }}
                  className={`px-0 py-2 text-center font-bold uppercase border-r border-gray-100 ${isToday(day) ? 'bg-orange-50 text-orange-500' : 'text-gray-400'}`}>
                  <div>{format(day, 'd')}</div>
                  <div className="text-[8px] font-normal">{format(day, 'EEE')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleMembers.map(m => {
              const isSelf = m.id === member.id;
              return (
                <tr key={m.id} className={`hover:bg-gray-50/50 transition-colors ${isSelf ? 'bg-orange-50/20' : ''}`}>
                  <td className={`sticky left-0 z-10 px-3 py-2 border-r border-gray-200 ${isSelf ? 'bg-orange-50' : 'bg-white'}`}
                    style={{ minWidth: 170, width: 170, boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)' }}>
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-bold text-gray-800 truncate leading-tight" style={{ maxWidth: 100 }}>{m.name}</p>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {m.position && (
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded border leading-none ${
                            m.position === 'SS' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                            m.position === 'AStS' ? 'bg-cyan-50 text-cyan-600 border-cyan-200' :
                            'bg-purple-50 text-purple-600 border-purple-200'
                          }`}>{m.position}</span>
                        )}
                        {isSelf && <span className="text-[9px] font-bold text-orange-500">★</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-gray-400 truncate">{m.station}</span>
                      <span className="text-[9px] text-red-500 font-bold">A:{getUsage(m, 'A')}</span>
                      <span className="text-[9px] text-pink-500 font-bold">H:{getUsage(m, 'H')}</span>
                      <span className="text-[9px] text-gray-400 font-bold">X:{getUsage(m, 'X')}</span>
                    </div>
                  </td>
                  {days.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const code = getShift(m, dateStr);
                    return (
                      <td key={dateStr} className={`p-0.5 border-r border-gray-100 text-center ${isToday(day) ? 'bg-orange-50/20' : ''}`}>
                        <button
                          onClick={() => {
                            if (isAdmin) setEditingShift({ member: m, date: dateStr });
                            else if (!isSelf) setSwapPopup({ targetMember: m, targetDate: dateStr, targetShift: code });
                          }}
                          disabled={!isAdmin && isSelf}
                          className={`w-full h-7 flex items-center justify-center rounded text-[10px] font-bold transition-all
                            ${!isAdmin && isSelf ? 'cursor-default opacity-70' : 'hover:opacity-75 active:scale-95 cursor-pointer'}
                            ${(isSelf ? SELF_COLORS : SHIFT_COLORS)[code] || 'bg-gray-100 text-gray-500'}`}
                        >
                          {code}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {visibleMembers.length === 0 && (
              <tr><td colSpan={days.length + 1} className="py-12 text-center text-sm text-gray-400 italic">ไม่พบสมาชิกในตำแหน่งนี้</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] font-bold text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-200">
        {shiftProps.length > 0 ? shiftProps.map(p => (
          <div key={p.id} className="flex items-center space-x-1">
            <div className={`w-3 h-3 rounded ${SELF_COLORS[p.id] || 'bg-gray-200'}`} />
            <span>{p.id}: {p.name}</span>
          </div>
        )) : [['S11','bg-orange-50','เช้า'],['S12','bg-orange-50','บ่าย'],['S13','bg-orange-50','ดึก'],
               ['X','bg-white border border-gray-200','หยุด'],['H','bg-rose-50','นักขัตฤกษ์'],['A','bg-red-50','ลาพักร้อน']
        ].map(([id, bg, label]) => (
          <div key={id} className="flex items-center space-x-1">
            <div className={`w-3 h-3 rounded ${bg}`} /><span>{id}: {label}</span>
          </div>
        ))}
      </div>

      {/* Admin: Edit Shift Modal */}
      {editingShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">แก้ไขกะ</h3>
              <button onClick={() => setEditingShift(null)} className="text-gray-400 hover:text-gray-600"><CloseIcon size={20} /></button>
            </div>
            <p className="text-sm font-bold text-gray-700 mb-1">{editingShift.member.name}</p>
            <p className="text-xs text-gray-500 mb-4">{format(new Date(editingShift.date + 'T00:00:00'), 'd MMMM yyyy', { locale: th })}</p>
            <div className="grid grid-cols-4 gap-2">
              {(['S11','S12','S13','S78','AL-S11','AL-S12','AL-S13','X','A','H'] as ShiftCode[]).map(code => (
                <button key={code} onClick={() => handleUpdateShift(code)}
                  className={`py-2.5 rounded-lg text-xs font-bold border-2 transition-all hover:scale-105 active:scale-95 ${SELF_COLORS[code] || 'bg-gray-100 border-gray-200'} border-opacity-60`}>
                  {code}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Member: Step 1 — choose type */}
      {swapPopup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setSwapPopup(null)}>
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold">เลือกประเภทคำขอ</p>
                <p className="font-bold text-gray-800 text-sm mt-0.5">{swapPopup.targetMember.name}</p>
                <p className="text-xs text-gray-500">{format(new Date(swapPopup.targetDate + 'T00:00:00'), 'd MMMM yyyy', { locale: th })}</p>
              </div>
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${SHIFT_COLORS[swapPopup.targetShift] || 'bg-gray-100'}`}>{swapPopup.targetShift}</span>
            </div>
            <div className="space-y-2">
              <button onClick={() => openRequestForm('swap', swapPopup)}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 font-medium text-sm transition-colors">
                <span className="text-lg">⇄</span>
                <div className="text-left">
                  <p className="font-bold">ขอสลับกะ</p>
                  <p className="text-[10px] text-orange-500">สลับกะระหว่างกัน</p>
                </div>
              </button>
              <button onClick={() => openRequestForm('cover', swapPopup)}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium text-sm transition-colors">
                <span className="text-lg">🔄</span>
                <div className="text-left">
                  <p className="font-bold">ขอควงกะ</p>
                  <p className="text-[10px] text-purple-500">ต้องคืนภายในเดือนถัดไป</p>
                </div>
              </button>
              <button onClick={() => setSwapPopup(null)} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* Member: Step 2 — fill in dates & submit */}
      {requestForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setRequestForm(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold">
                  {requestForm.type === 'swap' ? 'คำขอสลับกะ' : 'คำขอควงกะ'}
                </p>
                <p className="font-bold text-gray-800 text-sm mt-0.5">กับ {requestForm.targetMember.name}</p>
              </div>
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${SHIFT_COLORS[requestForm.targetShift] || 'bg-gray-100'}`}>{requestForm.targetShift}</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  {requestForm.type === 'swap' ? 'วันของคุณที่ต้องการแลก' : 'วันที่คุณต้องการควง'}
                </label>
                <input type="date" value={requestForm.requesterDate}
                  onChange={e => setRequestForm(f => f ? { ...f, requesterDate: e.target.value } : null)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
              </div>

              {requestForm.type === 'swap' && (
                <div className="bg-orange-50 rounded-lg px-3 py-2 text-xs text-orange-700">
                  วันที่แลก: <span className="font-bold">{format(new Date(requestForm.targetDate + 'T00:00:00'), 'd MMM yyyy', { locale: th })}</span>
                  {' '}กะ <span className={`px-1.5 py-0.5 rounded font-bold ${SHIFT_COLORS[requestForm.targetShift] || ''}`}>{requestForm.targetShift}</span>
                </div>
              )}

              {requestForm.type === 'cover' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">วันที่คืนกะ</label>
                  <input type="date" value={requestForm.returnDate}
                    onChange={e => setRequestForm(f => f ? { ...f, returnDate: e.target.value } : null)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                  <p className="text-[10px] text-purple-500 mt-1">⚠️ ต้องคืนภายในเดือนนี้หรือเดือนถัดไป</p>
                </div>
              )}
            </div>

            <div className="flex space-x-2 mt-5">
              <button onClick={() => setRequestForm(null)}
                className="flex-1 py-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">
                ยกเลิก
              </button>
              <button onClick={submitRequest} disabled={requestForm.submitting}
                className={`flex-1 py-2 text-sm text-white font-bold rounded-lg transition-colors disabled:opacity-50 ${requestForm.type === 'swap' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                {requestForm.submitting ? 'กำลังส่ง...' : 'ยืนยันส่งคำขอ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
