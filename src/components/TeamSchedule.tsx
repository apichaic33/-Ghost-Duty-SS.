import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Search, Filter, RefreshCw } from 'lucide-react';
import { collection, onSnapshot, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, Shift, ShiftCode, ShiftProperty } from '../types';
import { generateSchedule } from '../lib/scheduleUtils';
import { toast } from 'sonner';
import { X as CloseIcon } from 'lucide-react';

interface TeamScheduleProps {
  onSwapClick: (data: any) => void;
  isAdmin: boolean;
}

export default function TeamSchedule({ onSwapClick, isAdmin }: TeamScheduleProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [members, setMembers] = useState<Member[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [shiftProps, setShiftProps] = useState<ShiftProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStation, setSelectedStation] = useState('All');
  const [editingShift, setEditingShift] = useState<{ member: Member, date: string } | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  useEffect(() => {
    // Fetch all members
    const unsubMembers = onSnapshot(collection(db, 'members'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
    });

    // Fetch shift properties
    const unsubProps = onSnapshot(collection(db, 'shiftProperties'), (snap) => {
      setShiftProps(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftProperty)));
    });

    // Fetch all shifts for the current month
    const q = query(
      collection(db, 'shifts'),
      where('date', '>=', format(monthStart, 'yyyy-MM-dd')),
      where('date', '<=', format(monthEnd, 'yyyy-MM-dd'))
    );

    const unsubShifts = onSnapshot(q, (snap) => {
      setAllShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));
      setLoading(false);
    });

    return () => {
      unsubMembers();
      unsubProps();
      unsubShifts();
    };
  }, [currentDate]);

  const getShiftForMemberDay = (member: Member, day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const existing = allShifts.find(s => s.memberId === member.id && s.date === dateStr);
    if (existing) return existing.shiftCode;

    // Fallback to pattern
    const fullSchedule = generateSchedule(member.id, member.shiftPattern, member.cycleStartDate, 2);
    const generated = fullSchedule.find(s => s.date === dateStr);
    return generated ? generated.shiftCode : 'X';
  };

  const shiftColors: Record<string, string> = {
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

  const stations = ['All', ...Array.from(new Set(members.map(m => m.station)))];

  const filteredMembers = members.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         m.station.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStation = selectedStation === 'All' || m.station === selectedStation;
    return matchesSearch && matchesStation;
  });

  const handleUpdateShift = async (code: ShiftCode) => {
    if (!editingShift) return;
    try {
      const shiftId = `${editingShift.member.id}_${editingShift.date}`;
      await setDoc(doc(db, 'shifts', shiftId), {
        memberId: editingShift.member.id,
        date: editingShift.date,
        shiftCode: code,
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin'
      });
      toast.success('อัปเดตข้อมูลกะสำเร็จ');
      setEditingShift(null);
    } catch (e) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const getUsage = (member: Member, code: ShiftCode) => {
    return days.filter(d => getShiftForMemberDay(member, d) === code).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">ภาพรวมกะทั้งหมด</h2>
          <p className="text-gray-500">ตรวจสอบตารางการทำงานของนายสถานีทุกคน</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 500);
              toast.success('อัปเดตข้อมูลสำเร็จ');
            }}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-orange-600"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="h-6 w-[1px] bg-gray-200 mx-1"></div>
          <button 
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-semibold min-w-[140px] text-center">
            {format(currentDate, 'MMMM yyyy')}
          </span>
          <button 
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text"
            placeholder="ค้นหาชื่อหรือสถานี..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Filter className="text-gray-400" size={18} />
          <select 
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
          >
            {stations.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase border-r border-gray-200 min-w-[150px]">
                นายสถานี
              </th>
              <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase border-r border-gray-100 min-w-[80px]">
                ใช้ A/H/X
              </th>
              {days.map(day => (
                <th key={day.toISOString()} className="px-2 py-3 text-center text-[10px] font-bold text-gray-400 uppercase min-w-[40px] border-r border-gray-100">
                  {format(day, 'd')}
                  <div className="text-[8px] font-normal">{format(day, 'EEE')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredMembers.map(member => (
              <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r border-gray-200 group-hover:bg-gray-50">
                  <p className="text-sm font-bold text-gray-800 truncate">{member.name}</p>
                  <p className="text-[10px] text-gray-400">{member.station}</p>
                </td>
                <td className="px-2 py-3 border-r border-gray-100 text-center bg-gray-50/30">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-red-600">A: {getUsage(member, 'A')}/{member.quotaA}</span>
                    <span className="text-[9px] font-bold text-pink-600">H: {getUsage(member, 'H')}/{member.quotaH}</span>
                    <span className="text-[9px] font-bold text-gray-500">X: {getUsage(member, 'X')}/{member.quotaX}</span>
                  </div>
                </td>
                {days.map(day => {
                  const code = getShiftForMemberDay(member, day);
                  return (
                    <td key={day.toISOString()} className="p-1 border-r border-gray-100 text-center">
                      <button 
                        onClick={() => {
                          if (isAdmin) {
                            setEditingShift({ member, date: format(day, 'yyyy-MM-dd') });
                          } else {
                            onSwapClick({
                              toMemberId: member.id,
                              toDate: format(day, 'yyyy-MM-dd'),
                              type: 'swap'
                            });
                          }
                        }}
                        className={`w-full h-8 flex items-center justify-center rounded text-[10px] font-bold transition-transform active:scale-95 ${shiftColors[code] || 'bg-gray-100'}`}
                      >
                        {code}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-[10px] font-bold text-gray-500 bg-gray-50 p-4 rounded-xl border border-gray-200">
        {shiftProps.length > 0 ? (
          shiftProps.map(prop => (
            <div key={prop.id} className="flex items-center space-x-1">
              <div className={`w-3 h-3 rounded ${shiftColors[prop.id] || 'bg-gray-200'}`}></div>
              <span>{prop.id}: {prop.name}</span>
            </div>
          ))
        ) : (
          <>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-blue-100 rounded"></div>
              <span>S11: เช้า</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-green-100 rounded"></div>
              <span>S12: บ่าย</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-purple-100 rounded"></div>
              <span>S13: ดึก</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-orange-100 rounded"></div>
              <span>AL: Spare (S11, S12, S13)</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-yellow-100 rounded"></div>
              <span>S78: ช่วย</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-gray-100 rounded"></div>
              <span>X: หยุด</span>
            </div>
          </>
        )}
      </div>

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
              <p className="text-xs text-gray-500">วันที่: {format(new Date(editingShift.date), 'dd MMMM yyyy')}</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['S11', 'S12', 'S13', 'S78', 'AL-S11', 'AL-S12', 'AL-S13', 'X', 'A', 'H'].map(code => (
                <button
                  key={code}
                  onClick={() => handleUpdateShift(code as ShiftCode)}
                  className={`py-2 rounded text-xs font-bold border ${shiftColors[code] || 'bg-gray-100 border-gray-200'}`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
