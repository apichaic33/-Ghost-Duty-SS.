import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDocs, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, SwapRequest, Shift, ShiftCode } from '../types';
import { format, addDays, parseISO } from 'date-fns';
import { Send, Check, X, ArrowRightLeft, Repeat, Calendar as CalendarIcon, Info } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { getShiftCode } from '../lib/scheduleUtils';

interface RequestsProps {
  member: Member;
  initialData?: any;
  onClearInitialData?: () => void;
}

export default function Requests({ member, initialData, onClearInitialData }: RequestsProps) {
  const [requests, setRequests] = useState<SwapRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [showNewRequest, setShowNewRequest] = useState(!!initialData);
  const [loading, setLoading] = useState(true);

  // Form state
  const [type, setType] = useState<'swap' | 'double' | 'dayoff'>(initialData?.type || 'swap');
  const [toMemberId, setToMemberId] = useState(initialData?.toMemberId || '');
  const [fromDate, setFromDate] = useState(initialData?.fromDate || format(new Date(), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(initialData?.toDate || initialData?.fromDate || format(new Date(), 'yyyy-MM-dd'));
  
  const [fromShiftCode, setFromShiftCode] = useState<ShiftCode>('X');
  const [toShiftCode, setToShiftCode] = useState<ShiftCode>('X');

  // Clear initial data after use
  useEffect(() => {
    if (initialData && onClearInitialData) {
      onClearInitialData();
    }
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'swapRequests'),
      where('fromMemberId', '==', member.id),
      where('status', '==', 'pending')
    );
    const q2 = query(
      collection(db, 'swapRequests'),
      where('toMemberId', '==', member.id),
      where('status', '==', 'pending')
    );

    const unsub1 = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest));
      setRequests(prev => {
        const others = prev.filter(r => r.toMemberId === member.id);
        return [...data, ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest));
      setRequests(prev => {
        const mine = prev.filter(r => r.fromMemberId === member.id);
        return [...data, ...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
    });

    // Load all members for selection
    getDocs(collection(db, 'members')).then(snap => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)).filter(m => m.id !== member.id));
    });

    // Load shifts to calculate codes
    const unsubShifts = onSnapshot(collection(db, 'shifts'), (snap) => {
      setAllShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));
    });

    setLoading(false);
    return () => { unsub1(); unsub2(); unsubShifts(); };
  }, [member.id]);

  // Update shift codes when inputs change
  useEffect(() => {
    const code = getShiftCode(member, fromDate, allShifts);
    setFromShiftCode(code);
  }, [fromDate, allShifts, member]);

  useEffect(() => {
    const target = members.find(m => m.id === toMemberId);
    if (target) {
      const code = getShiftCode(target, toDate, allShifts);
      setToShiftCode(code);
    }
  }, [toDate, toMemberId, allShifts, members]);

  const sendLineNotification = async (targetMember: Member, message: string, type: 'newRequests' | 'requestStatus') => {
    if (!targetMember.lineToken) return;
    
    // Check preferences
    const prefs = targetMember.notificationPreferences || {
      newRequests: true,
      requestStatus: true,
      warnings: true,
      lineEnabled: true
    };

    if (!prefs.lineEnabled) return;
    if (type === 'newRequests' && !prefs.newRequests) return;
    if (type === 'requestStatus' && !prefs.requestStatus) return;

    try {
      await axios.post('/api/notify', {
        token: targetMember.lineToken,
        message
      });
    } catch (err) {
      console.error('Failed to send Line notification');
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const targetMember = members.find(m => m.id === toMemberId);
      
      const newRequest: Partial<SwapRequest> = {
        fromMemberId: member.id,
        toMemberId: type === 'double' ? undefined : toMemberId,
        type,
        fromDate,
        toDate: type === 'swap' || type === 'dayoff' ? toDate : undefined,
        fromShiftCode,
        toShiftCode: type === 'double' ? undefined : toShiftCode,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'swapRequests'), newRequest);
      
      if (targetMember) {
        const msg = `🔔 คำขอ${type === 'swap' ? 'แลกกะ' : type === 'dayoff' ? 'แลกวันหยุด' : 'ควงกะ'}ใหม่!\nจาก: ${member.name}\nวันที่: ${fromDate} (${fromShiftCode})\nแลกกับ: ${toDate} (${toShiftCode})\nกรุณาตรวจสอบในระบบ`;
        sendLineNotification(targetMember, msg, 'newRequests');
      }

      toast.success('ส่งคำขอเรียบร้อยแล้ว');
      setShowNewRequest(false);
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const handleAction = async (req: SwapRequest, action: 'approved' | 'rejected') => {
    try {
      const batch = writeBatch(db);
      const reqRef = doc(db, 'swapRequests', req.id);
      batch.update(reqRef, { status: action });

      if (action === 'approved') {
        if (req.type === 'swap' || req.type === 'dayoff') {
          // Swap logic: Update shifts for both members
          const fromShiftId = `${req.fromMemberId}_${req.fromDate}`;
          const toShiftId = `${req.toMemberId}_${req.toDate}`;

          // Create/Update fromMember's new shift
          batch.set(doc(db, 'shifts', fromShiftId), {
            memberId: req.fromMemberId,
            date: req.fromDate,
            shiftCode: req.toShiftCode,
            originalShiftCode: req.fromShiftCode,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          // Create/Update toMember's new shift
          batch.set(doc(db, 'shifts', toShiftId), {
            memberId: req.toMemberId!,
            date: req.toDate!,
            shiftCode: req.fromShiftCode,
            originalShiftCode: req.toShiftCode,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } else if (req.type === 'double') {
          // Double shift logic for the requester
          const shiftId = `${req.fromMemberId}_${req.fromDate}`;
          batch.set(doc(db, 'shifts', shiftId), {
            memberId: req.fromMemberId,
            date: req.fromDate,
            shiftCode: req.fromShiftCode, // Usually keep the code but flag as double
            isDoubleShift: true,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }

      await batch.commit();
      
      const requester = members.find(m => m.id === req.fromMemberId);
      if (requester) {
        const msg = `🔔 คำขอ${req.type} ของคุณได้รับการ${action === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}\nโดย: ${member.name}`;
        sendLineNotification(requester, msg, 'requestStatus');
      }

      toast.success(`ดำเนินการ${action === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}เรียบร้อย`);
    } catch (error) {
      console.error(error);
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const shiftColors: Record<string, string> = {
    'S11': 'bg-blue-100 text-blue-700 border-blue-200',
    'S12': 'bg-green-100 text-green-700 border-green-200',
    'S13': 'bg-purple-100 text-purple-700 border-purple-200',
    'AL-S11': 'bg-orange-100 text-orange-700 border-orange-200',
    'S78': 'bg-yellow-100 text-yellow-700 border-yellow-200',
    'X': 'bg-gray-100 text-gray-500 border-gray-200',
    'A': 'bg-red-100 text-red-700 border-red-200',
    'H': 'bg-pink-100 text-pink-700 border-pink-200',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">คำขอสลับกะ</h2>
        <button 
          onClick={() => setShowNewRequest(true)}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 transition-colors flex items-center space-x-2"
        >
          <Send size={18} />
          <span>สร้างคำขอใหม่</span>
        </button>
      </div>

      {showNewRequest && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-lg animate-in fade-in slide-in-from-top-4">
          <form onSubmit={handleCreateRequest} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ประเภทคำขอ</label>
                <select 
                  value={type} 
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="swap">แลกกะ (Shift Swap)</option>
                  <option value="double">ควงกะ (Double Shift)</option>
                  <option value="dayoff">แลกวันหยุด (Day Off Swap)</option>
                </select>
              </div>
              {type !== 'double' && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">แลกกับใคร</label>
                  <select 
                    value={toMemberId} 
                    onChange={(e) => setToMemberId(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                  >
                    <option value="">เลือกสมาชิก</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.station})</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Requester Side */}
              <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase">กะของคุณ</p>
                <input 
                  type="date" 
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                  <span className="text-xs text-gray-500">กะปัจจุบัน:</span>
                  <span className={`px-2 py-1 rounded text-xs font-bold border ${shiftColors[fromShiftCode]}`}>
                    {fromShiftCode}
                  </span>
                </div>
              </div>

              {/* Target Side */}
              {type !== 'double' && (
                <div className="space-y-3 p-4 bg-orange-50/30 rounded-xl border border-orange-100">
                  <p className="text-xs font-bold text-orange-400 uppercase">กะของเพื่อน</p>
                  <input 
                    type="date" 
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                  <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                    <span className="text-xs text-gray-500">กะปัจจุบัน:</span>
                    <span className={`px-2 py-1 rounded text-xs font-bold border ${shiftColors[toShiftCode]}`}>
                      {toShiftCode}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Preview Section */}
            {type === 'swap' && toMemberId && (
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center justify-center space-x-8">
                <div className="text-center">
                  <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">คุณจะได้กะ</p>
                  <span className={`px-3 py-1 rounded text-sm font-bold border ${shiftColors[toShiftCode]}`}>
                    {toShiftCode}
                  </span>
                </div>
                <ArrowRightLeft className="text-blue-300" size={24} />
                <div className="text-center">
                  <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">เพื่อนจะได้กะ</p>
                  <span className={`px-3 py-1 rounded text-sm font-bold border ${shiftColors[fromShiftCode]}`}>
                    {fromShiftCode}
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button 
                type="button"
                onClick={() => setShowNewRequest(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ยกเลิก
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-orange-600 text-white text-sm font-bold rounded-lg hover:bg-orange-700 transition-colors"
              >
                ยืนยันการส่งคำขอ
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {requests.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
            <p className="text-gray-400">ไม่มีคำขอที่รอดำเนินการ</p>
          </div>
        ) : (
          requests.map((req) => (
            <div key={req.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-full ${
                  req.type === 'swap' ? 'bg-blue-50 text-blue-600' : 
                  req.type === 'double' ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'
                }`}>
                  {req.type === 'swap' ? <ArrowRightLeft size={20} /> : 
                   req.type === 'double' ? <Repeat size={20} /> : <CalendarIcon size={20} />}
                </div>
                <div>
                  <p className="font-bold text-gray-800">
                    {req.type === 'swap' ? 'คำขอแลกกะ' : req.type === 'double' ? 'คำขอควงกะ' : 'คำขอแลกวันหยุด'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {req.fromMemberId === member.id ? `ส่งถึง: ${members.find(m => m.id === req.toMemberId)?.name || 'ตัวเอง'}` : `จาก: ${members.find(m => m.id === req.fromMemberId)?.name}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-6 text-sm">
                <div className="text-center">
                  <p className="text-[10px] uppercase font-bold text-gray-400">กะเดิม</p>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${shiftColors[req.fromShiftCode]}`}>
                    {req.fromShiftCode}
                  </span>
                  <p className="mt-1 font-medium text-xs">{req.fromDate}</p>
                </div>
                {req.toDate && (
                  <>
                    <ArrowRightLeft size={14} className="text-gray-300" />
                    <div className="text-center">
                      <p className="text-[10px] uppercase font-bold text-gray-400">กะที่แลก</p>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${shiftColors[req.toShiftCode!]}`}>
                        {req.toShiftCode}
                      </span>
                      <p className="mt-1 font-medium text-xs">{req.toDate}</p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {req.fromMemberId !== member.id ? (
                  <>
                    <button 
                      onClick={() => handleAction(req, 'approved')}
                      className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                      title="อนุมัติ"
                    >
                      <Check size={20} />
                    </button>
                    <button 
                      onClick={() => handleAction(req, 'rejected')}
                      className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      title="ปฏิเสธ"
                    >
                      <X size={20} />
                    </button>
                  </>
                ) : (
                  <span className="px-3 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-full">
                    รอการยืนยัน
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
