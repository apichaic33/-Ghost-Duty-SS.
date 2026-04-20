import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDocs, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, SwapRequest, Shift, ShiftCode } from '../types';
import { format, addDays, parseISO } from 'date-fns';
import { Send, Check, X, ArrowRightLeft, Repeat, Calendar as CalendarIcon, Info } from 'lucide-react';
import { toast } from 'sonner';
import emailjs from '@emailjs/browser';
import { getShiftCode } from '../lib/scheduleUtils';

const EMAILJS_SERVICE_ID = 'service_yamka';
const EMAILJS_TEMPLATE_ID = 'template_nfo6sld';
const EMAILJS_PUBLIC_KEY = 'YY8IVNkVN-qhgglkU';

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
  const [type, setType] = useState<'swap' | 'cover'>(initialData?.type || 'swap');
  const [targetId, setTargetId] = useState(initialData?.targetId || '');
  const [requesterDate, setRequesterDate] = useState(initialData?.requesterDate || format(new Date(), 'yyyy-MM-dd'));
  const [targetDate, setTargetDate] = useState(initialData?.targetDate || initialData?.requesterDate || format(new Date(), 'yyyy-MM-dd'));
  // Cover: return date must be within this or next month
  const [returnDate, setReturnDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return format(d, 'yyyy-MM-dd');
  });

  const [requesterShift, setRequesterShift] = useState<ShiftCode>('X');
  const [targetShift, setTargetShift] = useState<ShiftCode>('X');

  // Clear initial data after use
  useEffect(() => {
    if (initialData && onClearInitialData) {
      onClearInitialData();
    }
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'swapRequests'),
      where('requesterId', '==', member.id),
      where('status', '==', 'pending')
    );
    const q2 = query(
      collection(db, 'swapRequests'),
      where('targetId', '==', member.id),
      where('status', '==', 'pending')
    );

    const unsub1 = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest));
      setRequests(prev => {
        const others = prev.filter(r => r.targetId === member.id);
        return [...data, ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest));
      setRequests(prev => {
        const mine = prev.filter(r => r.requesterId === member.id);
        return [...data, ...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
    });

    // Load members — same position only (admin sees all)
    getDocs(collection(db, 'members')).then(snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Member));
      setMembers(all.filter(m => {
        if (m.id === member.id) return false;
        if (member.role === 'admin') return true;
        return m.position === member.position;
      }));
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
    const code = getShiftCode(member, requesterDate, allShifts);
    setRequesterShift(code);
  }, [requesterDate, allShifts, member]);

  useEffect(() => {
    const target = members.find(m => m.id === targetId);
    if (target) {
      const code = getShiftCode(target, targetDate, allShifts);
      setTargetShift(code);
    }
  }, [targetDate, targetId, allShifts, members]);

  const sendEmailNotification = async (targetMember: Member, subject: string, message: string, notifType: 'newRequests' | 'requestStatus') => {
    if (!targetMember.email) return;

    const prefs = targetMember.notificationPreferences || { newRequests: true, requestStatus: true, warnings: true };
    if (notifType === 'newRequests' && !prefs.newRequests) return;
    if (notifType === 'requestStatus' && !prefs.requestStatus) return;

    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        { subject, to_email: targetMember.email, message },
        EMAILJS_PUBLIC_KEY
      );
    } catch (err) {
      console.error('Failed to send email notification');
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const targetMember = members.find(m => m.id === targetId);

      // Validate cover return date within this or next month
      if (type === 'cover') {
        const now = new Date();
        const maxReturn = new Date(now.getFullYear(), now.getMonth() + 2, 0); // last day of next month
        if (new Date(returnDate) > maxReturn) {
          toast.error('วันคืนกะต้องอยู่ภายในเดือนถัดไป');
          return;
        }
        if (new Date(returnDate) <= new Date(requesterDate)) {
          toast.error('วันคืนกะต้องอยู่หลังวันควงกะ');
          return;
        }
      }

      const newRequest: Partial<SwapRequest> = {
        requesterId: member.id,
        requesterName: member.name,
        targetId: targetId || undefined,
        targetName: targetMember?.name,
        type,
        requesterDate,
        targetDate: type === 'swap' ? targetDate : undefined,
        returnDate: type === 'cover' ? returnDate : undefined,
        requesterShift,
        targetShift: type === 'cover' ? undefined : targetShift,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'swapRequests'), newRequest);

      if (targetMember) {
        const typeLabel = type === 'swap' ? 'แลกกะ' : 'ควงกะ';
        sendEmailNotification(
          targetMember,
          `คำขอ${typeLabel}ใหม่จาก ${member.name}`,
          `คำขอ${typeLabel}ใหม่!\nจาก: ${member.name}\nวันที่: ${requesterDate} (${requesterShift})\nแลกกับ: ${targetDate} (${targetShift})\nกรุณาตรวจสอบในระบบ`,
          'newRequests'
        );
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
        if (req.type === 'swap') {
          const requesterShiftId = `${req.requesterId}_${req.requesterDate}`;
          const targetShiftId = `${req.targetId}_${req.targetDate}`;

          batch.set(doc(db, 'shifts', requesterShiftId), {
            memberId: req.requesterId,
            date: req.requesterDate,
            shiftCode: req.targetShift,
            originalShiftCode: req.requesterShift,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          batch.set(doc(db, 'shifts', targetShiftId), {
            memberId: req.targetId!,
            date: req.targetDate!,
            shiftCode: req.requesterShift,
            originalShiftCode: req.targetShift,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } else if (req.type === 'cover') {
          const shiftId = `${req.requesterId}_${req.requesterDate}`;
          batch.set(doc(db, 'shifts', shiftId), {
            memberId: req.requesterId,
            date: req.requesterDate,
            shiftCode: req.requesterShift,
            isDoubleShift: true,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }

      await batch.commit();

      const requesterMember = members.find((m: Member) => m.id === req.requesterId);
      if (requesterMember) {
        const actionLabel = action === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ';
        sendEmailNotification(
          requesterMember,
          `คำขอของคุณได้รับการ${actionLabel}`,
          `คำขอ${req.type === 'swap' ? 'สลับกะ' : 'ควงกะ'} ของคุณได้รับการ${actionLabel}\nโดย: ${member.name}`,
          'requestStatus'
        );
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
                  <option value="swap">สลับกะ (Shift Swap)</option>
                  <option value="cover">ควงกะ (Cover Shift)</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  {type === 'cover' ? 'ควงกะแทนใคร' : 'สลับกับใคร'}
                </label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="">เลือกสมาชิก</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.position ? `[${m.position}]` : ''} — {m.station}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Requester Side */}
              <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase">
                  {type === 'cover' ? 'วันที่ควงกะ' : 'กะของคุณ'}
                </p>
                <input
                  type="date"
                  value={requesterDate}
                  onChange={(e) => setRequesterDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                  <span className="text-xs text-gray-500">กะปัจจุบัน:</span>
                  <span className={`px-2 py-1 rounded text-xs font-bold border ${shiftColors[requesterShift] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    {requesterShift}
                  </span>
                </div>
              </div>

              {/* Target Side — swap */}
              {type === 'swap' && (
                <div className="space-y-3 p-4 bg-orange-50/30 rounded-xl border border-orange-100">
                  <p className="text-xs font-bold text-orange-400 uppercase">กะของเพื่อน</p>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                  <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                    <span className="text-xs text-gray-500">กะปัจจุบัน:</span>
                    <span className={`px-2 py-1 rounded text-xs font-bold border ${shiftColors[targetShift] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {targetShift}
                    </span>
                  </div>
                </div>
              )}

              {/* Return Date — cover */}
              {type === 'cover' && (
                <div className="space-y-3 p-4 bg-purple-50/30 rounded-xl border border-purple-100">
                  <p className="text-xs font-bold text-purple-500 uppercase">วันที่คืนกะ</p>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                  <p className="text-[10px] text-purple-500 bg-purple-50 px-2 py-1.5 rounded-lg border border-purple-100">
                    ⚠️ วันคืนกะต้องอยู่ภายในเดือนนี้หรือเดือนถัดไป
                  </p>
                </div>
              )}
            </div>

            {/* Preview Section */}
            {type === 'swap' && targetId && (
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center justify-center space-x-8">
                <div className="text-center">
                  <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">คุณจะได้กะ</p>
                  <span className={`px-3 py-1 rounded text-sm font-bold border ${shiftColors[targetShift] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    {targetShift}
                  </span>
                </div>
                <ArrowRightLeft className="text-blue-300" size={24} />
                <div className="text-center">
                  <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">เพื่อนจะได้กะ</p>
                  <span className={`px-3 py-1 rounded text-sm font-bold border ${shiftColors[requesterShift] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    {requesterShift}
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
                  req.type === 'swap' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                }`}>
                  {req.type === 'swap' ? <ArrowRightLeft size={20} /> : <Repeat size={20} />}
                </div>
                <div>
                  <p className="font-bold text-gray-800">
                    {req.type === 'swap' ? 'คำขอสลับกะ' : 'คำขอควงกะ'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {req.requesterId === member.id
                      ? `ส่งถึง: ${req.targetName || '—'}`
                      : `จาก: ${req.requesterName}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-6 text-sm">
                <div className="text-center">
                  <p className="text-[10px] uppercase font-bold text-gray-400">กะผู้ขอ</p>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${shiftColors[req.requesterShift] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    {req.requesterShift}
                  </span>
                  <p className="mt-1 font-medium text-xs">{req.requesterDate}</p>
                </div>
                {req.targetDate && (
                  <>
                    <ArrowRightLeft size={14} className="text-gray-300" />
                    <div className="text-center">
                      <p className="text-[10px] uppercase font-bold text-gray-400">กะที่แลก</p>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${shiftColors[req.targetShift!] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {req.targetShift}
                      </span>
                      <p className="mt-1 font-medium text-xs">{req.targetDate}</p>
                    </div>
                  </>
                )}
                {req.type === 'cover' && req.returnDate && (
                  <>
                    <ArrowRightLeft size={14} className="text-gray-300" />
                    <div className="text-center">
                      <p className="text-[10px] uppercase font-bold text-purple-400">คืนกะวันที่</p>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-purple-50 text-purple-700 border-purple-200">
                        {req.returnDate}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {req.requesterId !== member.id ? (
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
