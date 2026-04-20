import React, { useState, useEffect } from 'react';
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

const POSITION_LABELS: Record<string, string> = {
  'SS': 'นายสถานี',
  'AStS': 'ผู้ช่วยนายสถานี',
  'SP': 'เจ้าหน้าที่สถานี',
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

  const getShift = (m: Member, day: Date): string => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const existing = allShifts.find(s => s.memberId === m.id && s.date === dateStr);
    if (existing) return existing.shiftCode;
    const gen = generateSchedule(m.id, m.shiftPattern, m.cycleStartDate, 2).find(s => s.date === dateStr);
    return gen ? gen.shiftCode : 'X';
  };

  const visibleMembers = members.filter(m => {
    if (isAdmin) {
      return positionTab === 'All' || m.position === positionTab;
    }
    return m.position === member.position;
  });

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

  const getUsage = (m: Member, code: ShiftCode) =>
    days.filter(d => getShift(m, d) === code).length;

  const positionTabs = isAdmin ? ['All', 'SS', 'AStS', 'SP'] : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">ภาพรวมกะทั้งหมด</h2>
          <p className="text-sm text-gray-500">
            {isAdmin ? 'ดูและแก้ไขตารางกะของทุกตำแหน่ง' : `แสดงเฉพาะตำแหน่ง ${member.position || '—'}`}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 400); }}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-orange-600"
          >
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

      {/* Position tabs (admin only) */}
      {isAdmin && (
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
          {positionTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setPositionTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                positionTab === tab
                  ? 'bg-white shadow text-orange-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'All' ? 'ทั้งหมด' : tab}
            </button>
          ))}
        </div>
      )}

      {/* Schedule Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase border-r border-gray-200 min-w-[140px]">
                สมาชิก
              </th>
              <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase border-r border-gray-100 min-w-[72px]">
                A/H/X
              </th>
              {days.map(day => (
                <th
                  key={day.toISOString()}
                  className={`px-1 py-3 text-center text-[10px] font-bold uppercase min-w-[36px] border-r border-gray-100 ${isToday(day) ? 'bg-orange-50 text-orange-600' : 'text-gray-400'}`}
                >
                  {format(day, 'd')}
                  <div className="text-[8px] font-normal">{format(day, 'EEE')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleMembers.map(m => (
              <tr key={m.id} className={`hover:bg-gray-50 transition-colors ${m.id === member.id ? 'bg-orange-50/30' : ''}`}>
                <td className="sticky left-0 z-10 bg-inherit px-3 py-3 border-r border-gray-200">
                  <p className="text-xs font-bold text-gray-800 truncate">{m.name}</p>
                  <div className="flex items-center space-x-1 mt-0.5">
                    <p className="text-[10px] text-gray-400">{m.station}</p>
                    {m.position && (
                      <span className={`text-[9px] font-bold px-1 rounded border ${
                        m.position === 'SS' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                        m.position === 'AStS' ? 'bg-cyan-50 text-cyan-600 border-cyan-200' :
                        'bg-purple-50 text-purple-600 border-purple-200'
                      }`}>{m.position}</span>
                    )}
                    {m.id === member.id && <span className="text-[9px] font-bold text-orange-500">คุณ</span>}
                  </div>
                </td>
                <td className="px-1 py-3 border-r border-gray-100 text-center bg-gray-50/30">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-red-600">A:{getUsage(m, 'A')}</span>
                    <span className="text-[9px] font-bold text-pink-600">H:{getUsage(m, 'H')}</span>
                    <span className="text-[9px] font-bold text-gray-500">X:{getUsage(m, 'X')}</span>
                  </div>
                </td>
                {days.map(day => {
                  const code = getShift(m, day);
                  const isSelf = m.id === member.id;
                  return (
                    <td key={day.toISOString()} className={`p-0.5 border-r border-gray-100 text-center ${isToday(day) ? 'bg-orange-50/30' : ''}`}>
                      <button
                        onClick={() => {
                          if (isAdmin) {
                            setEditingShift({ member: m, date: format(day, 'yyyy-MM-dd') });
                          } else if (!isSelf) {
                            setSwapPopup({
                              targetMember: m,
                              targetDate: format(day, 'yyyy-MM-dd'),
                              targetShift: code,
                            });
                          }
                        }}
                        disabled={!isAdmin && isSelf}
                        className={`w-full h-7 flex items-center justify-center rounded text-[10px] font-bold transition-all
                          ${isSelf && !isAdmin ? 'cursor-default opacity-80' : 'hover:opacity-80 active:scale-95 cursor-pointer'}
                          ${SHIFT_COLORS[code] || 'bg-gray-100 text-gray-500'}`}
                      >
                        {code}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {visibleMembers.length === 0 && (
              <tr>
                <td colSpan={days.length + 2} className="py-12 text-center text-sm text-gray-400 italic">
                  ไม่พบสมาชิกในตำแหน่งนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] font-bold text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-200">
        {shiftProps.length > 0 ? (
          shiftProps.map(prop => (
            <div key={prop.id} className="flex items-center space-x-1">
              <div className={`w-3 h-3 rounded ${SHIFT_COLORS[prop.id] || 'bg-gray-200'}`} />
              <span>{prop.id}: {prop.name}</span>
            </div>
          ))
        ) : (
          [['S11','bg-blue-100','เช้า'],['S12','bg-green-100','บ่าย'],['S13','bg-purple-100','ดึก'],
           ['AL','bg-orange-100','สำรอง'],['S78','bg-yellow-100','ช่วย'],['X','bg-gray-100','หยุด'],
           ['H','bg-pink-100','นักขัตฤกษ์'],['A','bg-red-100','ลาพักร้อน']].map(([id, bg, label]) => (
            <div key={id} className="flex items-center space-x-1">
              <div className={`w-3 h-3 rounded ${bg}`} />
              <span>{id}: {label}</span>
            </div>
          ))
        )}
      </div>

      {/* Admin: Edit Shift Modal */}
      {editingShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">แก้ไขกะการทำงาน</h3>
              <button onClick={() => setEditingShift(null)} className="text-gray-400 hover:text-gray-600">
                <CloseIcon size={20} />
              </button>
            </div>
            <div className="mb-4">
              <p className="text-sm font-bold text-gray-700">{editingShift.member.name}</p>
              <p className="text-xs text-gray-500">วันที่: {format(new Date(editingShift.date + 'T00:00:00'), 'd MMMM yyyy', { locale: th })}</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(['S11','S12','S13','S78','AL-S11','AL-S12','AL-S13','X','A','H'] as ShiftCode[]).map(code => (
                <button
                  key={code}
                  onClick={() => handleUpdateShift(code)}
                  className={`py-2 rounded text-xs font-bold border ${SHIFT_COLORS[code] || 'bg-gray-100 border-gray-200'} border-opacity-50`}
                >
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
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-2xl p-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold">เลือกประเภทคำขอ</p>
                <p className="font-bold text-gray-800 text-sm">{swapPopup.targetMember.name}</p>
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
                onClick={() => {
                  onSwapClick({
                    type: 'swap',
                    targetId: swapPopup.targetMember.id,
                    targetName: swapPopup.targetMember.name,
                    targetDate: swapPopup.targetDate,
                    targetShift: swapPopup.targetShift,
                  });
                  setSwapPopup(null);
                }}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 font-medium text-sm transition-colors"
              >
                <span className="text-lg">⇄</span>
                <div className="text-left">
                  <p className="font-bold">ขอสลับกะ</p>
                  <p className="text-[10px] text-orange-500">สลับกะระหว่างกัน</p>
                </div>
              </button>
              <button
                onClick={() => {
                  onSwapClick({
                    type: 'cover',
                    targetId: swapPopup.targetMember.id,
                    targetName: swapPopup.targetMember.name,
                    targetDate: swapPopup.targetDate,
                    targetShift: swapPopup.targetShift,
                  });
                  setSwapPopup(null);
                }}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium text-sm transition-colors"
              >
                <span className="text-lg">🔄</span>
                <div className="text-left">
                  <p className="font-bold">ขอควงกะ</p>
                  <p className="text-[10px] text-blue-500">ขอให้อีกฝ่ายทำงานแทน</p>
                </div>
              </button>
              <button onClick={() => setSwapPopup(null)}
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
