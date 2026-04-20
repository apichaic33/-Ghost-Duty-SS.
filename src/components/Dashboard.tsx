import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths } from 'date-fns';
import { th } from 'date-fns/locale';
import { RefreshCw } from 'lucide-react';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, Shift, ShiftCode } from '../types';
import { generateSchedule } from '../lib/scheduleUtils';
import { toast } from 'sonner';

const SHIFT_COLORS: Record<string, string> = {
  'S11': 'bg-blue-100 text-blue-700 border-blue-200',
  'S12': 'bg-green-100 text-green-700 border-green-200',
  'S13': 'bg-purple-100 text-purple-700 border-purple-200',
  'AL-S11': 'bg-orange-100 text-orange-700 border-orange-200',
  'AL-S12': 'bg-orange-100 text-orange-700 border-orange-200',
  'AL-S13': 'bg-orange-100 text-orange-700 border-orange-200',
  'S78': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'X': 'bg-gray-100 text-gray-500 border-gray-200',
  'A': 'bg-red-100 text-red-700 border-red-200',
  'H': 'bg-pink-100 text-pink-700 border-pink-200',
};

interface DashboardProps {
  member: Member;
  onSwapClick: (data: any) => void;
}

export default function Dashboard({ member, onSwapClick }: DashboardProps) {
  const today = new Date();
  const rangeStart = startOfMonth(today);
  const rangeEnd = endOfMonth(addMonths(today, 11));

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'shifts'),
      where('memberId', '==', member.id),
      where('date', '>=', format(rangeStart, 'yyyy-MM-dd')),
      where('date', '<=', format(rangeEnd, 'yyyy-MM-dd'))
    );
    const unsub = onSnapshot(q, (snap) => {
      setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));
      setLoading(false);
    });
    return () => unsub();
  }, [member.id]);

  const generated = generateSchedule(member.id, member.shiftPattern, member.cycleStartDate, 2);

  const getShift = (dateStr: string): { code: ShiftCode; original?: ShiftCode; isDouble?: boolean } => {
    const ex = shifts.find(s => s.date === dateStr);
    if (ex) return { code: ex.shiftCode, original: ex.originalShiftCode, isDouble: ex.isDoubleShift };
    const gen = generated.find(s => s.date === dateStr);
    return { code: (gen?.shiftCode as ShiftCode) || 'X' };
  };

  const markCode = async (dateStr: string, newCode: 'H' | 'A') => {
    const { code, original } = getShift(dateStr);
    try {
      await setDoc(doc(db, 'shifts', `${member.id}_${dateStr}`), {
        memberId: member.id,
        date: dateStr,
        shiftCode: newCode,
        originalShiftCode: code !== newCode ? code : (original || code),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      toast.success(`ใส่ ${newCode} วันที่ ${dateStr}`);
      setSelectedDay(null);
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  const revertShift = async (dateStr: string) => {
    const { original } = getShift(dateStr);
    if (!original) return;
    try {
      await setDoc(doc(db, 'shifts', `${member.id}_${dateStr}`), {
        memberId: member.id,
        date: dateStr,
        shiftCode: original,
        originalShiftCode: null,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      toast.success(`คืนกะเดิม ${original}`);
      setSelectedDay(null);
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  const allDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const totalA = allDays.filter(d => getShift(format(d, 'yyyy-MM-dd')).code === 'A').length;
  const totalH = allDays.filter(d => getShift(format(d, 'yyyy-MM-dd')).code === 'H').length;
  const totalX = allDays.filter(d => getShift(format(d, 'yyyy-MM-dd')).code === 'X').length;

  const months = Array.from({ length: 12 }, (_, i) => addMonths(today, i));

  const selShift = selectedDay ? getShift(selectedDay) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">ตารางกะการทำงาน</h2>
          <p className="text-sm text-gray-500">{member.name} — {member.station}
            {member.position && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">{member.position}</span>}
          </p>
        </div>
        <button onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 300); }}
          className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-orange-600">
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Quota Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { code: 'A', label: 'ลาพักร้อน', quota: member.quotaA, used: totalA, bar: 'bg-red-400', badge: 'bg-red-50 text-red-600' },
          { code: 'H', label: 'หยุดนักขัตฤกษ์', quota: member.quotaH, used: totalH, bar: 'bg-pink-400', badge: 'bg-pink-50 text-pink-600' },
          { code: 'X', label: 'หยุดประจำ', quota: member.quotaX, used: totalX, bar: 'bg-gray-400', badge: 'bg-gray-50 text-gray-600' },
        ].map(({ code, label, quota, used, bar, badge }) => (
          <div key={code} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex justify-between items-start mb-1">
              <p className="text-[10px] uppercase font-bold text-gray-400">{label}</p>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge}`}>{code} {quota}</span>
            </div>
            <p className="text-xl font-black text-gray-800">{used} <span className="text-xs font-normal text-gray-400">วัน</span></p>
            <div className="mt-1 h-1 w-full bg-gray-100 rounded-full">
              <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${Math.min(100, (used / Math.max(1, quota)) * 100)}%` }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">เหลือ {Math.max(0, quota - used)} วัน</p>
          </div>
        ))}
      </div>

      {/* 12-Month Calendars */}
      {months.map((monthDate) => {
        const mStart = startOfMonth(monthDate);
        const mEnd = endOfMonth(monthDate);
        const mDays = eachDayOfInterval({ start: mStart, end: mEnd });
        const isCurrent = format(monthDate, 'yyyy-MM') === format(today, 'yyyy-MM');
        const mA = mDays.filter(d => getShift(format(d, 'yyyy-MM-dd')).code === 'A').length;
        const mH = mDays.filter(d => getShift(format(d, 'yyyy-MM-dd')).code === 'H').length;
        const mX = mDays.filter(d => getShift(format(d, 'yyyy-MM-dd')).code === 'X').length;

        return (
          <div key={format(monthDate, 'yyyy-MM')} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className={`px-4 py-2.5 border-b border-gray-100 flex items-center justify-between ${isCurrent ? 'bg-orange-50' : 'bg-gray-50'}`}>
              <div className="flex items-center space-x-2">
                <h3 className={`font-bold text-sm ${isCurrent ? 'text-orange-700' : 'text-gray-700'}`}>
                  {format(monthDate, 'MMMM yyyy', { locale: th })}
                </h3>
                {isCurrent && <span className="text-[9px] bg-orange-600 text-white px-1.5 py-0.5 rounded-full font-bold">เดือนนี้</span>}
              </div>
              <div className="flex items-center space-x-2 text-[10px] font-bold">
                <span className="text-red-500">A:{mA}</span>
                <span className="text-pink-500">H:{mH}</span>
                <span className="text-gray-400">X:{mX}</span>
              </div>
            </div>

            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
              {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => (
                <div key={d} className="py-1.5 text-center text-[10px] font-bold text-gray-400">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {Array.from({ length: mStart.getDay() }).map((_, i) => (
                <div key={`pad-${i}`} className="h-14 border-b border-r border-gray-50 bg-gray-50/30" />
              ))}
              {mDays.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const { code, original, isDouble } = getShift(dateStr);
                const todayDay = isToday(day);

                return (
                  <div
                    key={dateStr}
                    onClick={() => setSelectedDay(selectedDay === dateStr ? null : dateStr)}
                    className={`h-14 border-b border-r border-gray-100 p-1 cursor-pointer hover:bg-orange-50/20 transition-colors ${todayDay ? 'bg-orange-50/40' : ''} ${selectedDay === dateStr ? 'ring-2 ring-orange-400 ring-inset' : ''}`}
                  >
                    <span className={`text-[10px] font-medium block ${todayDay ? 'text-orange-600 font-bold' : 'text-gray-500'}`}>
                      {format(day, 'd')}
                    </span>
                    <span className={`inline-block px-1 py-0.5 rounded text-[9px] font-bold border ${SHIFT_COLORS[code] || 'bg-gray-100'}`}>
                      {code}{isDouble ? '×2' : ''}
                    </span>
                    {original && (
                      <span className="block text-[8px] text-gray-400 line-through leading-tight">{original}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Day Action Modal */}
      {selectedDay && selShift && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setSelectedDay(null)}>
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-2xl p-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold">วันที่</p>
                <p className="font-bold text-gray-800">{format(new Date(selectedDay + 'T00:00:00'), 'd MMMM yyyy', { locale: th })}</p>
              </div>
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${SHIFT_COLORS[selShift.code] || 'bg-gray-100'}`}>
                {selShift.code}
              </span>
            </div>

            <div className="space-y-2">
              {selShift.code !== 'H' && (
                <button onClick={() => markHoliday(selectedDay)}
                  className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 font-medium text-sm transition-colors">
                  <span className="text-lg">🏖️</span>
                  <span>ใส่วันหยุดนักขัตฤกษ์ (H)</span>
                </button>
              )}
              {selShift.original && (
                <button onClick={() => revertShift(selectedDay)}
                  className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium text-sm transition-colors">
                  <span className="text-lg">↩️</span>
                  <span>คืนกะเดิม ({selShift.original})</span>
                </button>
              )}
              <button onClick={() => { onSwapClick({ requesterDate: selectedDay, type: 'swap' }); setSelectedDay(null); }}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 font-medium text-sm transition-colors">
                <span className="text-lg">⇄</span>
                <span>ขอสลับกะ</span>
              </button>
              <button onClick={() => setSelectedDay(null)}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
