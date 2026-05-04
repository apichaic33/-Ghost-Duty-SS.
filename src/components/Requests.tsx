import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, writeBatch, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, SwapRequest } from '../types';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Check, X, ArrowRightLeft, Repeat, RotateCcw, History } from 'lucide-react';
import { toast } from 'sonner';
import emailjs from '@emailjs/browser';
import { useShiftProperties } from '../hooks/useShiftProperties';

const EMAILJS_SERVICE_ID = 'service_yamka';
const EMAILJS_TEMPLATE_ID = 'template_nfo6sld';
const EMAILJS_PUBLIC_KEY = 'YY8IVNkVN-qhgglkU';
const ADMIN_EMAIL = 'ApichaiC.583986@outlook.co.th';

interface RequestsProps {
  member: Member;
}


export default function Requests({ member }: RequestsProps) {
  const { getShiftStyle } = useShiftProperties();
  const [incoming, setIncoming] = useState<SwapRequest[]>([]);
  const [outgoing, setOutgoing] = useState<SwapRequest[]>([]);
  const [history, setHistory] = useState<SwapRequest[]>([]);

  useEffect(() => {
    const q1 = query(
      collection(db, 'swapRequests'),
      where('targetId', '==', member.id),
      where('status', '==', 'pending')
    );
    const q2 = query(
      collection(db, 'swapRequests'),
      where('requesterId', '==', member.id),
      where('status', '==', 'pending')
    );
    const q3 = query(
      collection(db, 'swapRequests'),
      where('requesterId', '==', member.id),
      where('status', '==', 'approved')
    );
    const q4 = query(
      collection(db, 'swapRequests'),
      where('targetId', '==', member.id),
      where('status', '==', 'approved')
    );

    const unsub1 = onSnapshot(q1, snap =>
      setIncoming(snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    );
    const unsub2 = onSnapshot(q2, snap =>
      setOutgoing(snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    );

    // Merge approved from both queries, deduplicate by id
    let approvedAsRequester: SwapRequest[] = [];
    let approvedAsTarget: SwapRequest[] = [];
    const mergeHistory = () => {
      const all = [...approvedAsRequester, ...approvedAsTarget];
      const unique = Array.from(new Map(all.map(r => [r.id, r])).values());
      setHistory(unique.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30));
    };
    const unsub3 = onSnapshot(q3, snap => {
      approvedAsRequester = snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest));
      mergeHistory();
    });
    const unsub4 = onSnapshot(q4, snap => {
      approvedAsTarget = snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest));
      mergeHistory();
    });

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [member.id]);

  const handleAction = async (req: SwapRequest, action: 'approved' | 'rejected') => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'swapRequests', req.id), { status: action });

      if (action === 'approved') {
        if (req.type === 'swap' && req.targetId && req.targetDate) {
          batch.set(doc(db, 'shifts', `${req.requesterId}_${req.requesterDate}`), {
            memberId: req.requesterId, date: req.requesterDate,
            shiftCode: req.targetShift, originalShiftCode: req.requesterShift,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          batch.set(doc(db, 'shifts', `${req.targetId}_${req.targetDate}`), {
            memberId: req.targetId, date: req.targetDate,
            shiftCode: req.requesterShift, originalShiftCode: req.targetShift,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          if (req.returnDate && req.targetId) {
            batch.set(doc(db, 'shifts', `${req.requesterId}_${req.returnDate}`), {
              memberId: req.requesterId, date: req.returnDate,
              shiftCode: req.returnTargetShift || req.requesterShift,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
            batch.set(doc(db, 'shifts', `${req.targetId}_${req.returnDate}`), {
              memberId: req.targetId, date: req.returnDate,
              shiftCode: req.returnShift || 'X',
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          }
        } else if (req.type === 'cover' || req.type === 'cover_holiday') {
          batch.set(doc(db, 'shifts', `${req.requesterId}_${req.requesterDate}`), {
            memberId: req.requesterId, date: req.requesterDate,
            shiftCode: 'X', originalShiftCode: req.requesterShift,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          if (req.targetId && req.targetDate) {
            batch.set(doc(db, 'shifts', `${req.targetId}_${req.targetDate}`), {
              memberId: req.targetId, date: req.targetDate,
              shiftCode: req.targetShift, isDoubleShift: true,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          }
          if (req.returnDate && req.targetId) {
            if (req.type === 'cover') {
              batch.set(doc(db, 'shifts', `${req.requesterId}_${req.returnDate}`), {
                memberId: req.requesterId, date: req.returnDate,
                shiftCode: req.returnShift, isDoubleShift: true,
                updatedAt: new Date().toISOString(),
              }, { merge: true });
              batch.set(doc(db, 'shifts', `${req.targetId}_${req.returnDate}`), {
                memberId: req.targetId, date: req.returnDate,
                shiftCode: 'X', originalShiftCode: req.returnTargetShift,
                updatedAt: new Date().toISOString(),
              }, { merge: true });
            } else {
              batch.set(doc(db, 'shifts', `${req.requesterId}_${req.returnDate}`), {
                memberId: req.requesterId, date: req.returnDate,
                shiftCode: req.returnTargetShift || req.requesterShift,
                updatedAt: new Date().toISOString(),
              }, { merge: true });
              batch.set(doc(db, 'shifts', `${req.targetId}_${req.returnDate}`), {
                memberId: req.targetId, date: req.returnDate,
                shiftCode: req.returnShift || 'X',
                updatedAt: new Date().toISOString(),
              }, { merge: true });
            }
          }
        }
      }

      await batch.commit();

      const label = action === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ';
      toast.success(`${label}คำขอเรียบร้อย`);

      if (req.requesterId) {
        const typeLabel = req.type === 'swap' ? 'สลับกะ' : req.type === 'cover' ? 'ควงกะ' : 'ควงกะ+คืนวันหยุด';
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          subject: `[ระบบยำกะผี] คำขอ${typeLabel}ของคุณได้รับการ${label}`,
          from_name: 'ระบบยำกะผี',
          to_email: member.email || ADMIN_EMAIL,
          message: `ประเภท: คำขอ${typeLabel}\nผู้ขอ: ${req.requesterName}\nวันที่ขอ: ${req.requesterDate} (กะ ${req.requesterShift})${req.targetDate ? `\nวันที่แลก: ${req.targetDate} (กะ ${req.targetShift || '—'})` : ''}\nสถานะ: ${label} โดย ${member.name}\n\nตรวจสอบ: https://gen-lang-client-0528383957.web.app`,
        }, EMAILJS_PUBLIC_KEY).catch(() => {});
      }
    } catch (err: any) {
      console.error('[handleAction]', err?.code, err?.message, err);
      toast.error(`ผิดพลาด: ${err?.code || err?.message || 'unknown'}`);
    }
  };

  const handleCancel = async (reqId: string) => {
    try {
      await updateDoc(doc(db, 'swapRequests', reqId), { status: 'cancelled' });
      toast.success('ยกเลิกคำขอเรียบร้อย');
    } catch (err: any) {
      console.error('[handleCancel]', err?.code, err?.message, err);
      toast.error(`ผิดพลาด: ${err?.code || err?.message || 'unknown'}`);
    }
  };

  const handleReverseSwap = async (req: SwapRequest) => {
    if (!req.targetId || !req.targetDate || !req.targetShift) {
      toast.error('ไม่สามารถขอแลกคืนได้ — ข้อมูลไม่ครบ');
      return;
    }
    try {
      const iAmRequester = req.requesterId === member.id;
      // ถ้าฉันเป็นคนขอเดิม: ฉันมีกะของอีกฝ่าย (req.targetShift) อยู่ที่วันของฉัน (req.requesterDate)
      // ถ้าฉันเป็น target เดิม: ฉันมีกะของอีกฝ่าย (req.requesterShift) อยู่ที่วันของฉัน (req.targetDate)
      const newReq = {
        requesterId:    member.id,
        requesterName:  member.name,
        targetId:       iAmRequester ? req.targetId   : req.requesterId,
        targetName:     iAmRequester ? req.targetName : req.requesterName,
        type:           'swap' as const,
        status:         'pending' as const,
        requesterDate:  iAmRequester ? req.requesterDate : req.targetDate,
        requesterShift: iAmRequester ? req.targetShift  : req.requesterShift,
        targetDate:     iAmRequester ? req.targetDate   : req.requesterDate,
        targetShift:    iAmRequester ? req.requesterShift : req.targetShift,
        isReverseOf:    req.id,
        createdAt:      new Date().toISOString(),
      };
      await addDoc(collection(db, 'swapRequests'), newReq);
      toast.success('ส่งคำขอแลกคืนกะเรียบร้อย');

      emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        subject: `[ระบบยำกะผี] คำขอแลกคืนกะจาก ${member.name}`,
        from_name: 'ระบบยำกะผี',
        to_email: ADMIN_EMAIL,
        message: `ประเภท: คำขอแลกคืนกะ\nผู้ขอ: ${member.name}\nส่งถึง: ${newReq.targetName}\nวันที่ขอคืน: ${newReq.requesterDate} (กะ ${newReq.requesterShift})\nวันที่แลก: ${newReq.targetDate} (กะ ${newReq.targetShift})\n\nตรวจสอบ: https://gen-lang-client-0528383957.web.app`,
      }, EMAILJS_PUBLIC_KEY).catch(() => {});
    } catch (err: any) {
      console.error('[handleReverseSwap]', err?.code, err?.message, err);
      toast.error(`ผิดพลาด: ${err?.code || err?.message || 'unknown'}`);
    }
  };

  const formatDate = (d: string) => {
    try { return format(new Date(d + 'T00:00:00'), 'd MMM yyyy', { locale: th }); }
    catch { return d; }
  };

  const RequestCard: React.FC<{ req: SwapRequest; showActions: boolean }> = ({ req, showActions }) => (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Type + names */}
        <div className="flex items-center space-x-3">
          <div className={`p-2.5 rounded-full ${req.type === 'swap' ? 'bg-orange-50 text-orange-600' : 'bg-purple-50 text-purple-600'}`}>
            {req.type === 'swap' ? <ArrowRightLeft size={18} /> : <Repeat size={18} />}
          </div>
          <div>
            <p className="font-bold text-gray-800 text-sm">
              {req.type === 'swap' ? 'คำขอสลับกะ' : req.type === 'cover' ? 'คำขอควงกะ' : 'คำขอควงกะ+คืนวันหยุด'}
            </p>
            <p className="text-xs text-gray-500">
              {showActions
                ? `จาก: ${req.requesterName}`
                : `ส่งถึง: ${req.targetName || '—'}`}
            </p>
          </div>
        </div>

        {/* Dates & shifts */}
        <div className="flex items-center gap-4 text-xs">
          <div className="text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">วันผู้ขอ</p>
            <span className="px-2 py-0.5 rounded font-bold border" style={getShiftStyle(req.requesterShift)}>
              {req.requesterShift}
            </span>
            <p className="text-gray-500 mt-0.5">{formatDate(req.requesterDate)}</p>
          </div>

          {req.type === 'swap' && req.targetDate && (
            <>
              <ArrowRightLeft size={12} className="text-gray-300" />
              <div className="text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">วันที่แลก</p>
                <span className="px-2 py-0.5 rounded font-bold border" style={getShiftStyle(req.targetShift || '')}>
                  {req.targetShift}
                </span>
                <p className="text-gray-500 mt-0.5">{formatDate(req.targetDate)}</p>
              </div>
            </>
          )}

          {req.returnDate && (
            <>
              <ArrowRightLeft size={12} className="text-gray-300" />
              <div className="text-center">
                <p className="text-[10px] font-bold text-purple-400 uppercase mb-0.5">{req.type === 'cover_holiday' ? 'คืนวันหยุด' : 'วันคืน'}</p>
                <span className="px-2 py-0.5 rounded font-bold border bg-purple-50 text-purple-700 border-purple-200">
                  คืน
                </span>
                <p className="text-gray-500 mt-0.5">{formatDate(req.returnDate)}</p>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          {showActions ? (
            <>
              <button onClick={() => handleAction(req, 'approved')}
                className="flex items-center space-x-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm font-bold border border-green-200">
                <Check size={16} />
                <span>อนุมัติ</span>
              </button>
              <button onClick={() => handleAction(req, 'rejected')}
                className="flex items-center space-x-1.5 px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-bold border border-red-200">
                <X size={16} />
                <span>ปฏิเสธ</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 text-xs font-bold rounded-full">
                รอการยืนยัน
              </span>
              <button onClick={() => handleCancel(req.id)}
                className="px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 border border-red-200 rounded-full transition-colors">
                ยกเลิก
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const HistoryCard: React.FC<{ req: SwapRequest }> = ({ req }) => {
    const iAmRequester = req.requesterId === member.id;
    const counterpart = iAmRequester ? req.targetName : req.requesterName;
    const canReverse = req.type === 'swap' && req.targetId && req.targetDate;

    return (
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-full bg-green-50 text-green-600">
              <Check size={18} />
            </div>
            <div>
              <p className="font-bold text-gray-800 text-sm">
                {req.type === 'swap' ? 'สลับกะ' : req.type === 'cover' ? 'ควงกะ' : 'ควงกะ+คืนวันหยุด'}
                {(req as any).isReverseOf && (
                  <span className="ml-1.5 text-[10px] font-normal text-blue-500 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">แลกคืน</span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                {iAmRequester ? `ส่งถึง: ${counterpart}` : `จาก: ${counterpart}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">วันผู้ขอ</p>
              <span className="px-2 py-0.5 rounded font-bold border" style={getShiftStyle(req.requesterShift)}>
                {req.requesterShift}
              </span>
              <p className="text-gray-500 mt-0.5">{formatDate(req.requesterDate)}</p>
            </div>
            {req.type === 'swap' && req.targetDate && (
              <>
                <ArrowRightLeft size={12} className="text-gray-300" />
                <div className="text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">วันที่แลก</p>
                  <span className="px-2 py-0.5 rounded font-bold border" style={getShiftStyle(req.targetShift || '')}>
                    {req.targetShift}
                  </span>
                  <p className="text-gray-500 mt-0.5">{formatDate(req.targetDate)}</p>
                </div>
              </>
            )}
            {req.returnDate && (
              <>
                <ArrowRightLeft size={12} className="text-gray-300" />
                <div className="text-center">
                  <p className="text-[10px] font-bold text-purple-400 uppercase mb-0.5">{req.type === 'cover_holiday' ? 'คืนวันหยุด' : 'วันคืน'}</p>
                  <span className="px-2 py-0.5 rounded font-bold border bg-purple-50 text-purple-700 border-purple-200">คืน</span>
                  <p className="text-gray-500 mt-0.5">{formatDate(req.returnDate)}</p>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 bg-green-50 text-green-600 border border-green-200 text-xs font-bold rounded-full">
              อนุมัติแล้ว
            </span>
            {canReverse && (
              <button onClick={() => handleReverseSwap(req)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-full transition-colors">
                <RotateCcw size={13} />
                ขอแลกคืน
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">คำขอสลับกะ</h2>

      {/* Incoming — needs action */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <h3 className="text-sm font-bold text-gray-700">รอการอนุมัติจากคุณ</h3>
          {incoming.length > 0 && (
            <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">{incoming.length}</span>
          )}
        </div>
        {incoming.length === 0 ? (
          <div className="py-8 text-center bg-white rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
            ไม่มีคำขอรอการอนุมัติ
          </div>
        ) : (
          incoming.map(req => <RequestCard key={req.id} req={req} showActions={true} />)
        )}
      </div>

      {/* Outgoing — waiting for others */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700">คำขอที่ส่งออกไป</h3>
        {outgoing.length === 0 ? (
          <div className="py-8 text-center bg-white rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
            ไม่มีคำขอที่รอการตอบกลับ
          </div>
        ) : (
          outgoing.map(req => <RequestCard key={req.id} req={req} showActions={false} />)
        )}
      </div>

      {/* History — approved requests */}
      {history.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <History size={14} className="text-gray-400" />
            <h3 className="text-sm font-bold text-gray-700">ประวัติที่อนุมัติแล้ว</h3>
            <span className="text-[10px] text-gray-400">(30 รายการล่าสุด)</span>
          </div>
          {history.map(req => <HistoryCard key={req.id} req={req} />)}
        </div>
      )}
    </div>
  );
}
