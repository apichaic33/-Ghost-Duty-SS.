import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday } from 'date-fns';
import { th } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, RefreshCw, X as CloseIcon } from 'lucide-react';
import { collection, onSnapshot, query, where, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, Shift, ShiftCode, ShiftProperty } from '../types';
import { generateSchedule } from '../lib/scheduleUtils';
import { toast } from 'sonner';
import emailjs from '@emailjs/browser';

const EMAILJS_SERVICE_ID = 'service_yamka';
const EMAILJS_TEMPLATE_ID = 'template_nfo6sld';
const EMAILJS_PUBLIC_KEY = 'YY8IVNkVN-qhgglkU';

const SHIFT_COLORS: Record<string, string> = {
  'S11': 'bg-blue-100 text-blue-700',
  'S12': 'bg-green-100 text-green-700',
  'S13': 'bg-purple-100 text-purple-700',
  'AL-S11': 'bg-orange-100 text-orange-700',
  'AL-S12': 'bg-orange-100 text-orange-700',
  'AL-S13': 'bg-orange-100 text-orange-700',
  'S78': 'bg-yellow-100 text-yellow-700',
  'X': 'bg-gray-50 text-gray-400',
  'A': 'bg-red-100 text-red-700',
  'H': 'bg-pink-100 text-pink-700',
};

interface TeamScheduleProps {
  member: Member;
  onSwapClick: (data: any) => void;
  isAdmin: boolean;
}

interface SwapPopup {
  targetMember: Member;
  targetDate: string;
  targetShift: string;
}

export default function TeamSchedule({ member, onSwapClick, isAdmin }: TeamScheduleProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [members, setMembers] = useState<Member[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [shiftProps, setShiftProps] = useState<ShiftProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [positionTab, setPositionTab] = useState<string>(member.position || 'All');
  const [editingShift, setEditingShift] = useState<{ member: Member; date: string } | null>(null);
  const [swapPopup, setSwapPopup] = useState<SwapPopup | null>(null);

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

  // O(1) lookup map for Firestore shifts
  const shiftsMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allShifts) map.set(`${s.memberId}_${s.date}`, s.shiftCode);
    return map;
  }, [allShifts]);

  // Pre-generate all schedules once per render
  const generatedMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    for (const m of members) {
      if (!m.shiftPattern) continue;
      const schedule = generateSchedule(m.id, m.shiftPattern, m.cycleStartDate, 2);
      map.set(m.id, new Map(schedule.map(s => [s.date, s.shiftCode])));
    }
    return map;
  }, [members]);

  const getShift = (m: Member, dateStr: string): string => {
    return shiftsMap.get(`${m.id}_${dateStr}`) ?? generatedMap.get(m.id)?.get(dateStr) ?? 'X';
  };

  // Filter: non-admin sees only same station AND same position
  const visibleMembers = useMemo(() => members.filter(m => {
    if (isAdmin) return positionTab === 'All' || m.position === positionTab;
    return m.station === member.station && m.position === member.position;
  }), [members, isAdmin, positionTab, member.station, member.position]);

  const getUsage = (m: Member, code: string) =>
    days.filter(d => getShift(m, format(d, 'yyyy-MM-dd')) === code).length;

  const handleUpdateShift = async (code: ShiftCode) => {
    if (!editingShift) return;
    try {
      await setDoc(doc(db, 'shifts', `${editingShift.member.id}_${editingShift.date}`), {
        memberId: editingShift.member.id,
        date: editingShift.date,
        shiftCode: code,
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin'
      });
      if (editingShift.member.email) {
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          subject: `Admin แก้ไขกะของคุณ วันที่ ${editingShift.date}`,
          to_email: editingShift.member.email,
          message: `กะของคุณวันที่ ${editingShift.date} ถูกแก้ไขเป็น ${code} โดย Admin`
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
            {isAdmin
              ? 'ดูและแก้ไขตารางกะของทุกตำแหน่ง'
              : `สถานี ${member.station} · ตำแหน่ง ${member.position || '—'}`}
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

      {/* Position tabs — admin only */}
      {isAdmin && (
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
          {['All', 'SS', 'AStS', 'SP'].map(tab => (
            <button key={tab} onClick={() => setPositionTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${positionTab === tab ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {tab === 'All' ? 'ทั้งหมด' : tab}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="sticky left-0 z-20 bg-gray-50 px-3 py-3 text-left font-bold text-gray-500 uppercase border-r border-gray-200 min-w-[170px] w-[170px]">
                สมาชิก
              </th>
              {days.map(day => (
                <th key={day.toISOString()}
                  className={`px-0 py-2 text-center font-bold uppercase w-8 min-w-[32px] border-r border-gray-100 ${isToday(day) ? 'bg-orange-50 text-orange-500' : 'text-gray-400'}`}>
                  <div>{format(day, 'd')}</div>
                  <div className="text-[8px] font-normal">{format(day, 'EEE')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleMembers.map(m => {
              const isSelf = m.id === member.id;
              const mA = getUsage(m, 'A');
              const mH = getUsage(m, 'H');
              const mX = getUsage(m, 'X');
              return (
                <tr key={m.id} className={`hover:bg-gray-50/50 transition-colors ${isSelf ? 'bg-orange-50/20' : ''}`}>
                  {/* Sticky name cell — fixed width, explicit bg */}
                  <td className={`sticky left-0 z-10 px-3 py-2 border-r border-gray-200 ${isSelf ? 'bg-orange-50/40' : 'bg-white'}`}
                    style={{ minWidth: 170, width: 170 }}>
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
                        {isSelf && <span className="text-[9px] font-bold text-orange-500 leading-none">★</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-gray-400 truncate">{m.station}</span>
                      <span className="text-[9px] text-red-500 font-bold">A:{mA}</span>
                      <span className="text-[9px] text-pink-500 font-bold">H:{mH}</span>
                      <span className="text-[9px] text-gray-400 font-bold">X:{mX}</span>
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
                            ${SHIFT_COLORS[code] || 'bg-gray-100 text-gray-500'}`}
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
              <tr><td colSpan={days.length + 1} className="py-12 text-center text-sm text-gray-400 italic">ไม่พบสมาชิกในสถานี/ตำแหน่งนี้</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] font-bold text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-200">
        {shiftProps.length > 0 ? shiftProps.map(prop => (
          <div key={prop.id} className="flex items-center space-x-1">
            <div className={`w-3 h-3 rounded ${SHIFT_COLORS[prop.id] || 'bg-gray-200'}`} />
            <span>{prop.id}: {prop.name}</span>
          </div>
        )) : (
          [['S11','bg-blue-100','เช้า'],['S12','bg-green-100','บ่าย'],['S13','bg-purple-100','ดึก'],
           ['AL','bg-orange-100','สำรอง'],['X','bg-gray-100','หยุด'],['H','bg-pink-100','นักขัตฤกษ์'],['A','bg-red-100','ลาพักร้อน']
          ].map(([id, bg, label]) => (
            <div key={id} className="flex items-center space-x-1">
              <div className={`w-3 h-3 rounded ${bg}`} /><span>{id}: {label}</span>
            </div>
          ))
        )}
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
            <p className="text-xs text-gray-500 mb-4">
              {format(new Date(editingShift.date + 'T00:00:00'), 'd MMMM yyyy', { locale: th })}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {(['S11','S12','S13','S78','AL-S11','AL-S12','AL-S13','X','A','H'] as ShiftCode[]).map(code => (
                <button key={code} onClick={() => handleUpdateShift(code)}
                  className={`py-2.5 rounded-lg text-xs font-bold border-2 transition-all hover:scale-105 active:scale-95 ${SHIFT_COLORS[code] || 'bg-gray-100 border-gray-200'} border-opacity-60`}>
                  {code}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Member: Swap/Cover Popup */}
      {swapPopup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setSwapPopup(null)}>
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold">เลือกประเภทคำขอ</p>
                <p className="font-bold text-gray-800 text-sm mt-0.5">{swapPopup.targetMember.name}</p>
                <p className="text-xs text-gray-500">
                  {format(new Date(swapPopup.targetDate + 'T00:00:00'), 'd MMMM yyyy', { locale: th })}
                </p>
              </div>
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${SHIFT_COLORS[swapPopup.targetShift] || 'bg-gray-100'}`}>
                {swapPopup.targetShift}
              </span>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => { onSwapClick({ type: 'swap', targetId: swapPopup.targetMember.id, targetName: swapPopup.targetMember.name, targetDate: swapPopup.targetDate, targetShift: swapPopup.targetShift }); setSwapPopup(null); }}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 font-medium text-sm transition-colors">
                <span className="text-lg">⇄</span>
                <div className="text-left">
                  <p className="font-bold">ขอสลับกะ</p>
                  <p className="text-[10px] text-orange-500">สลับกะระหว่างกัน</p>
                </div>
              </button>
              <button
                onClick={() => { onSwapClick({ type: 'cover', targetId: swapPopup.targetMember.id, targetName: swapPopup.targetMember.name, targetDate: swapPopup.targetDate, targetShift: swapPopup.targetShift }); setSwapPopup(null); }}
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
    </div>
  );
}
