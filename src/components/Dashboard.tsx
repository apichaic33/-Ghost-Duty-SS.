import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, parseISO, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, AlertCircle, RefreshCw, ArrowRightLeft } from 'lucide-react';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, Shift, ShiftCode } from '../types';
import { generateSchedule, validateShifts } from '../lib/scheduleUtils';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface DashboardProps {
  member: Member;
  onSwapClick: (data: any) => void;
}

export default function Dashboard({ member, onSwapClick }: DashboardProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  useEffect(() => {
    const q = query(
      collection(db, 'shifts'),
      where('memberId', '==', member.id),
      where('date', '>=', format(monthStart, 'yyyy-MM-dd')),
      where('date', '<=', format(monthEnd, 'yyyy-MM-dd'))
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const shiftData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift));
      setShifts(shiftData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [member.id, currentDate]);

  // Generate base schedule if no shifts exist for the month
  const getShiftForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const existing = shifts.find(s => s.date === dateStr);
    if (existing) return existing.shiftCode;

    // Fallback to generated pattern
    const fullSchedule = generateSchedule(member.id, member.shiftPattern, member.cycleStartDate, 2);
    const generated = fullSchedule.find(s => s.date === dateStr);
    return generated ? generated.shiftCode : 'X';
  };

  useEffect(() => {
    // Validate current month's shifts
    const monthShifts = days.map(d => ({
      date: format(d, 'yyyy-MM-dd'),
      shiftCode: getShiftForDay(d) as ShiftCode
    }));
    setWarnings(validateShifts(monthShifts));
  }, [shifts, currentDate]);

  const shiftColors: Record<string, string> = {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">ตารางกะการทำงาน</h2>
          <p className="text-gray-500">{member.name} - {member.station}</p>
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

      {warnings.length > 0 && (member.notificationPreferences?.warnings !== false) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-800">พบข้อผิดพลาดเงื่อนไขการทำงาน</p>
            <ul className="text-xs text-amber-700 list-disc list-inside">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(day => (
            <div key={day} className="py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {/* Padding for start of month */}
          {Array.from({ length: monthStart.getDay() }).map((_, i) => (
            <div key={`pad-${i}`} className="h-24 md:h-32 border-b border-r border-gray-100 bg-gray-50/50" />
          ))}
          
          {days.map(day => {
            const shiftCode = getShiftForDay(day);
            const isTodayDate = isToday(day);
            
            return (
              <div 
                key={day.toISOString()} 
                className={`h-24 md:h-32 border-b border-r border-gray-100 p-2 transition-colors hover:bg-gray-50 relative ${
                  isTodayDate ? 'bg-orange-50/30' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className={`text-sm font-medium ${isTodayDate ? 'text-orange-600 font-bold' : 'text-gray-700'}`}>
                    {format(day, 'd')}
                  </span>
                  <button 
                    onClick={() => {
                      onSwapClick({
                        fromDate: format(day, 'yyyy-MM-dd'),
                        type: 'swap'
                      });
                    }}
                    className="p-1 text-gray-300 hover:text-orange-500 transition-colors md:opacity-0 group-hover:opacity-100"
                  >
                    <ArrowRightLeft size={12} />
                  </button>
                </div>
                <div className="mt-2 space-y-1">
                  <span className={`inline-block px-2 py-1 rounded text-[10px] md:text-xs font-bold border ${shiftColors[shiftCode] || 'bg-gray-100'}`}>
                    {shiftCode}
                  </span>
                  {shifts.find(s => s.date === format(day, 'yyyy-MM-dd'))?.isDoubleShift && (
                    <span className="ml-1 inline-block px-1 py-0.5 bg-red-500 text-white text-[8px] rounded font-bold">2X</span>
                  )}
                  {shifts.find(s => s.date === format(day, 'yyyy-MM-dd'))?.originalShiftCode && (
                    <div className="text-[8px] text-gray-400 line-through">
                      เดิม: {shifts.find(s => s.date === format(day, 'yyyy-MM-dd'))?.originalShiftCode}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">โควต้าวันลาพักร้อน (A)</p>
          <p className="text-xl font-bold text-gray-800">{member.quotaA} วัน</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">โควต้าวันหยุด (H)</p>
          <p className="text-xl font-bold text-gray-800">{member.quotaH} วัน</p>
        </div>
      </div>
    </div>
  );
}
