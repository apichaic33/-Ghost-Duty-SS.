import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, isToday } from 'date-fns';
import { th } from 'date-fns/locale';
import { RefreshCw, X as CloseIcon } from 'lucide-react';
import { collection, onSnapshot, query, where, doc, setDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, Shift, ShiftCode, SwapRequest } from '../types';
import { generateSchedule, getShiftCode } from '../lib/scheduleUtils';
import { toast } from 'sonner';
import emailjs from '@emailjs/browser';
import { useShiftProperties } from '../hooks/useShiftProperties';

const EMAILJS_SERVICE_ID = 'service_yamka';
const EMAILJS_TEMPLATE_ID = 'template_nfo6sld';
const EMAILJS_PUBLIC_KEY = 'YY8IVNkVN-qhgglkU';

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
  const { getShiftStyle, getOtherShiftStyle } = useShiftProperties();
  const [members, setMembers] = useState<Member[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const normalizePos = (p?: string) => (p || '').replace(/\.$/, '').trim();
  const [positionTab, setPositionTab] = useState<string>(normalizePos(member.position) || 'SS');
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [editingShift, setEditingShift] = useState<{ member: Member; date: string } | null>(null);
  const [swapPopup, setSwapPopup] = useState<SwapPopup | null>(null);
  const [requestForm, setRequestForm] = useState<RequestForm | null>(null);
  const [approvedSwaps, setApprovedSwaps] = useState<SwapRequest[]>([]);
  const [swapDetail, setSwapDetail] = useState<SwapRequest | null>(null);

  const rangeStart = startOfMonth(new Date());
  const rangeEnd = endOfMonth(addMonths(new Date(), 11));
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => addMonths(rangeStart, i)), []);

  useEffect(() => {
    const unsubMembers = onSnapshot(collection(db, 'members'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
    });
    const q = query(
      collection(db, 'shifts'),
      where('date', '>=', format(rangeStart, 'yyyy-MM-dd')),
      where('date', '<=', format(rangeEnd, 'yyyy-MM-dd'))
    );
    const unsubShifts = onSnapshot(q, (snap) => {
      setAllShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));
      setLoading(false);
    });
    const unsubSwaps = onSnapshot(
      query(collection(db, 'swapRequests'), where('status', '==', 'approved')),
      snap => setApprovedSwaps(snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest)))
    );
    return () => { unsubMembers(); unsubShifts(); unsubSwaps(); };
  }, []);

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

  const swapMap = useMemo(() => {
    const map = new Map<string, SwapRequest>();
    for (const sw of approvedSwaps) {
      if (sw.requesterId && sw.requesterDate) map.set(`${sw.requesterId}_${sw.requesterDate}`, sw);
      if (sw.targetId && sw.targetDate) map.set(`${sw.targetId}_${sw.targetDate}`, sw);
    }
    return map;
  }, [approvedSwaps]);

  const zones = useMemo(() =>
    [...new Set(members.map(m => m.zone).filter(Boolean))].sort(), [members]);

  const stationsInZone = useMemo(() =>
    [...new Set(members.filter(m => m.zone === selectedZone).map(m => m.station).filter(Boolean))].sort(),
    [members, selectedZone]);

  // Auto-select first zone when members load (admin)
  useEffect(() => {
    if (isAdmin && zones.length > 0 && !selectedZone) setSelectedZone(zones[0]);
  }, [zones, isAdmin]);

  // Auto-select first station when zone changes (admin)
  useEffect(() => {
    if (isAdmin && stationsInZone.length > 0) setSelectedStation(stationsInZone[0]);
  }, [selectedZone, stationsInZone, isAdmin]);

  const visibleMembers = useMemo(() => {
    const filtered = members.filter(m => {
      if (normalizePos(m.position) !== positionTab) return false;
      if (isAdmin) {
        if (selectedZone && m.zone !== selectedZone) return false;
        if (selectedStation && m.station !== selectedStation) return false;
      } else {
        if (m.station !== member.station) return false;
      }
      return true;
    });
    return [...filtered.filter(m => m.id === member.id), ...filtered.filter(m => m.id !== member.id)];
  }, [members, positionTab, member.id, isAdmin, selectedZone, selectedStation, member.station]);

  const getUsage = (m: Member, code: string, mDays: Date[]) =>
    mDays.filter((d: Date) => getShift(m, format(d, 'yyyy-MM-dd')) === code).length;

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

    if (targetMember.zone !== member.zone) {
      toast.error(`ไม่สามารถแลกกะข้ามโซนได้ (โซน ${member.zone} ↔ ${targetMember.zone})`);
      return;
    }

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
      const payload: Record<string, unknown> = {
        requesterId: member.id,
        requesterName: member.name,
        targetId: targetMember.id,
        targetName: targetMember.name,
        type,
        requesterDate,
        requesterShift,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      if (type === 'swap') {
        payload.targetDate = targetDate;
        payload.targetShift = targetShift;
      } else {
        payload.returnDate = returnDate;
      }
      await addDoc(collection(db, 'swapRequests'), payload);

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

  const MemberCell = ({ m, mDays }: { m: Member; mDays: Date[] }) => {
    const isSelf = m.id === member.id;
    const isDiffStation = !isSelf && m.station !== member.station;
    const parts = m.name.trim().split(' ');
    return (
      <td className={`sticky left-0 z-10 px-1.5 py-1 border-r border-gray-200 ${isSelf ? 'bg-orange-50' : 'bg-white'}`}
        style={{ minWidth: 80, width: 80, boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-0.5 mb-0.5">
          {m.position && (
            <span className={`text-[7px] font-bold px-1 py-0 rounded border leading-none shrink-0 ${
              m.position === 'SS' ? 'bg-orange-50 text-orange-600 border-orange-200' :
              m.position === 'AStS' ? 'bg-cyan-50 text-cyan-600 border-cyan-200' :
              'bg-purple-50 text-purple-600 border-purple-200'
            }`}>{m.position}</span>
          )}
          {isSelf && <span className="text-[9px] font-bold text-orange-500 shrink-0">★</span>}
        </div>
        <p className="text-[10px] font-bold text-gray-800 leading-tight break-all">{parts[0]}</p>
        {parts[1] && <p className="text-[10px] font-bold text-gray-800 leading-tight break-all">{parts.slice(1).join(' ')}</p>}
        {isDiffStation && m.station && (
          <p className="text-[7px] text-indigo-500 font-bold leading-none mt-0.5 truncate">{m.station}</p>
        )}
        <div className="flex items-center gap-0.5 mt-0.5 flex-wrap">
          <span className="text-[7px] text-red-500 font-bold leading-none">A:{getUsage(m, 'A', mDays)}</span>
          <span className="text-[7px] text-pink-500 font-bold leading-none">H:{getUsage(m, 'H', mDays)}</span>
          <span className="text-[7px] text-gray-400 font-bold leading-none">X:{getUsage(m, 'X', mDays)}</span>
        </div>
      </td>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">กะทั้งหมด</h2>
          <p className="text-sm text-gray-500">
            {isAdmin ? 'ดูและแก้ไขตารางกะของทุกตำแหน่ง' : `ตำแหน่ง ${member.position || '—'}`}
          </p>
        </div>
        <button onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 400); }}
          className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-orange-600">
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Admin: Zone → Station → Position tabs */}
      {isAdmin && (
        <div className="space-y-2">
          {/* Zone tabs */}
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase self-center mr-1">โซน</span>
            {zones.map(z => (
              <button key={z} onClick={() => setSelectedZone(z)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${selectedZone === z ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}>
                {z}
              </button>
            ))}
          </div>
          {/* Station tabs */}
          {stationsInZone.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase self-center mr-1">สถานี</span>
              {stationsInZone.map(s => (
                <button key={s} onClick={() => setSelectedStation(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${selectedStation === s ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {/* Position tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {['SS', 'AStS', 'SP'].map(tab => (
              <button key={tab} onClick={() => setPositionTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${positionTab === tab ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Non-admin: position tabs only (own station auto-filtered) */}
      {!isAdmin && (
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {['SS', 'AStS', 'SP'].map(tab => (
              <button key={tab} onClick={() => setPositionTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${positionTab === tab ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab}
              </button>
            ))}
          </div>
          {member.station && (
            <span className="text-xs text-indigo-600 font-bold bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-lg">
              {member.station}
            </span>
          )}
        </div>
      )}

      {/* 12 Month Tables */}
      {months.map(monthDate => {
        const mStart = startOfMonth(monthDate);
        const mEnd = endOfMonth(monthDate);
        const mDays = eachDayOfInterval({ start: mStart, end: mEnd });
        const isCurrent = format(monthDate, 'yyyy-MM') === format(new Date(), 'yyyy-MM');

        return (
          <div key={format(monthDate, 'yyyy-MM')} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className={`px-3 py-2 border-b border-gray-100 flex items-center justify-between ${isCurrent ? 'bg-orange-50' : 'bg-gray-50'}`}>
              <h3 className={`font-bold text-sm ${isCurrent ? 'text-orange-700' : 'text-gray-700'}`}>
                {format(monthDate, 'MMMM yyyy', { locale: th })}
              </h3>
              {isCurrent && <span className="text-[9px] bg-orange-600 text-white px-1.5 py-0.5 rounded-full font-bold">เดือนนี้</span>}
            </div>
            <div className="overflow-x-auto" style={{ paddingBottom: 17 }}>
              <table className="border-collapse text-xs" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="sticky left-0 z-20 bg-gray-50 px-1.5 py-2 text-left font-bold text-gray-500 uppercase border-r border-gray-200" style={{ minWidth: 80, width: 80 }}>
                      สมาชิก
                    </th>
                    {mDays.map((day: Date) => (
                      <th key={day.toISOString()}
                        style={{ width: 28, minWidth: 28 }}
                        className={`px-0 py-1.5 text-center font-bold uppercase border-r border-gray-100 ${isToday(day) ? 'bg-orange-50 text-orange-500' : 'text-gray-400'}`}>
                        <div className="text-[10px]">{format(day, 'd')}</div>
                        <div className="text-[7px] font-normal">{format(day, 'EEE')}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleMembers.map(m => {
                    const isSelf = m.id === member.id;
                    return (
                      <tr key={m.id} className={`hover:bg-gray-50/50 transition-colors ${isSelf ? 'bg-orange-50/20' : ''}`}>
                        <MemberCell m={m} mDays={mDays} />
                        {mDays.map((day: Date) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const code = getShift(m, dateStr);
                          const swap = swapMap.get(`${m.id}_${dateStr}`);
                          return (
                            <td key={dateStr} className={`p-0.5 border-r border-gray-100 text-center ${isToday(day) ? 'bg-orange-50/20' : ''}`}>
                              <button
                                onClick={() => {
                                  if (swap) { setSwapDetail(swap); return; }
                                  if (isAdmin) setEditingShift({ member: m, date: dateStr });
                                  else if (!isSelf) setSwapPopup({ targetMember: m, targetDate: dateStr, targetShift: code });
                                }}
                                disabled={!isAdmin && isSelf && !swap}
                                className={`relative w-full h-6 flex items-center justify-center rounded text-[9px] font-bold transition-all
                                  ${(!isAdmin && isSelf && !swap) ? 'cursor-default opacity-70' : 'hover:opacity-75 active:scale-95 cursor-pointer'}`}
                                style={isSelf ? getShiftStyle(code) : getOtherShiftStyle(code)}
                              >
                                {code === 'XO' ? 'X' : code}
                                {swap && <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-green-500" />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {visibleMembers.length === 0 && (
                    <tr><td colSpan={mDays.length + 1} className="py-8 text-center text-sm text-gray-400 italic">ไม่พบสมาชิกในตำแหน่งนี้</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

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
                  className="py-2.5 rounded-lg text-xs font-bold border-2 transition-all hover:scale-105 active:scale-95"
                  style={getShiftStyle(code)}>
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
                <div className="flex items-center gap-1.5 mt-0.5">
                  {swapPopup.targetMember.station && (
                    <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                      {swapPopup.targetMember.station}
                    </span>
                  )}
                  <p className="text-xs text-gray-500">{format(new Date(swapPopup.targetDate + 'T00:00:00'), 'd MMMM yyyy', { locale: th })}</p>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-lg text-sm font-bold" style={getOtherShiftStyle(swapPopup.targetShift)}>{swapPopup.targetShift}</span>
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
              <span className="px-3 py-1.5 rounded-lg text-sm font-bold" style={getOtherShiftStyle(requestForm.targetShift)}>{requestForm.targetShift}</span>
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
                  {' '}กะ <span className="px-1.5 py-0.5 rounded font-bold" style={getOtherShiftStyle(requestForm.targetShift)}>{requestForm.targetShift}</span>
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
      {/* Swap Detail Modal */}
      {swapDetail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setSwapDetail(null)}>
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-green-600 uppercase">✓ การแลกกะที่อนุมัติแล้ว</p>
              <button onClick={() => setSwapDetail(null)} className="text-gray-400 hover:text-gray-600"><CloseIcon size={18} /></button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">ประเภท</span>
                <span className="font-bold">{swapDetail.type === 'swap' ? 'สลับกะ' : 'ควงกะ'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ผู้ขอ</span>
                <span className="font-bold text-gray-800">{swapDetail.requesterName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">วันที่ผู้ขอ</span>
                <span className="font-bold">{swapDetail.requesterDate} <span className="text-orange-600">({swapDetail.requesterShift})</span></span>
              </div>
              {swapDetail.targetName && (
                <div className="flex justify-between">
                  <span className="text-gray-500">คู่แลก</span>
                  <span className="font-bold text-gray-800">{swapDetail.targetName}</span>
                </div>
              )}
              {swapDetail.targetDate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">วันที่คู่แลก</span>
                  <span className="font-bold">{swapDetail.targetDate} <span className="text-orange-600">({swapDetail.targetShift})</span></span>
                </div>
              )}
              {swapDetail.returnDate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">วันคืนกะ</span>
                  <span className="font-bold text-purple-600">{swapDetail.returnDate}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
