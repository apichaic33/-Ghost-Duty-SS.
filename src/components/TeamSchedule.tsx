import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, Shift, ShiftCode } from '../types';
import { generateSchedule } from '../lib/scheduleUtils';

interface TeamScheduleProps {
  onSwapClick: (data: any) => void;
}

export default function TeamSchedule({ onSwapClick }: TeamScheduleProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [members, setMembers] = useState<Member[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStation, setSelectedStation] = useState('All');

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  useEffect(() => {
    // Fetch all members
    const unsubMembers = onSnapshot(collection(db, 'members'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">ภาพรวมกะทั้งทีม</h2>
          <p className="text-gray-500">ตรวจสอบตารางการทำงานของนายสถานีทุกคน</p>
        </div>
        
        <div className="flex items-center space-x-2">
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
                {days.map(day => {
                  const code = getShiftForMemberDay(member, day);
                  return (
                    <td key={day.toISOString()} className="p-1 border-r border-gray-100 text-center">
                      <button 
                        onClick={() => onSwapClick({
                          toMemberId: member.id,
                          toDate: format(day, 'yyyy-MM-dd'),
                          type: 'swap'
                        })}
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
          <span>AL: Spare</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-yellow-100 rounded"></div>
          <span>S78: ช่วย</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-gray-100 rounded"></div>
          <span>X: หยุด</span>
        </div>
      </div>
    </div>
  );
}
