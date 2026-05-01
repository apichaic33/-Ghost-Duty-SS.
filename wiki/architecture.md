# Architecture — ระบบยำกะผี

> อัปเดตล่าสุด: 2026-04-18

## ภาพรวม

ระบบจัดการและสลับกะการทำงานของ **นายสถานี (Station Master)** พร้อมระบบแจ้งเตือน

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| UI Components | Lucide React, Motion (Framer), Sonner (toast) |
| Forms | React Hook Form + Zod |
| Backend/DB | Firebase Firestore |
| Auth | Firebase Authentication (Google Sign-in) |
| Hosting | Firebase Hosting |
| Notification | EmailJS (แทน Line Notify เดิม) |
| Dev Server | Express + tsx (server.ts) |

---

## Firestore Collections

### `/members/{memberId}`
สมาชิก/นายสถานี

| Field | Type | คำอธิบาย |
|---|---|---|
| uid | string | Firebase Auth UID |
| name | string | ชื่อ-นามสกุล |
| station | string | สถานีประจำ |
| zone | string | โซนสถานี |
| role | 'admin' \| 'user' | สิทธิ์ |
| quotaA | number | โควต้าลาพักร้อน |
| quotaH | number | โควต้าวันหยุด |
| quotaX | number | โควต้า X |
| shiftPattern | string | รูปแบบกะ (comma-separated ShiftCode) |
| cycleStartDate | string | วันเริ่มนับกะ (YYYY-MM-DD) |
| lineToken | string? | Line Notify Token (legacy) |

### `/shifts/{shiftId}`
ตารางกะรายวัน (shiftId = `memberId_date`)

| Field | Type | คำอธิบาย |
|---|---|---|
| memberId | string | ID สมาชิก |
| date | string | วันที่ (YYYY-MM-DD) |
| shiftCode | ShiftCode | รหัสกะปัจจุบัน |
| originalShiftCode | ShiftCode? | รหัสกะเดิมก่อนสลับ |
| isDoubleShift | boolean? | ควงกะหรือเปล่า |
| updatedAt | string | datetime อัปเดตล่าสุด |

### `/swapRequests/{requestId}`
คำขอสลับกะ

| Field | Type | คำอธิบาย |
|---|---|---|
| fromMemberId | string | ผู้ขอ |
| toMemberId | string? | ผู้รับ |
| type | 'swap' \| 'double' \| 'dayoff' | ประเภทคำขอ |
| status | 'pending' \| 'approved' \| 'rejected' \| 'cancelled' | สถานะ |
| fromDate / toDate | string | วันที่ |
| fromShiftCode / toShiftCode | ShiftCode | กะ |

---

## Shift Codes

`S11`, `S12`, `S13` — กะปกติ 3 กะ  
`AL-S11`, `AL-S12`, `AL-S13` — ลาพักร้อน  
`S78` — กะพิเศษ  
`X` — วันหยุด  
`A` — ลา  
`H` — วันหยุดนักขัตฤกษ์

---

## Auth Flow

1. Login ด้วย Google (Firebase Auth)
2. ดึง `members/{uid}` จาก Firestore
3. ถ้า email = `q.apichai@gmail.com` และยังไม่มี record → สร้าง Admin อัตโนมัติ
4. ถ้าไม่มี record → แสดงหน้า "รอการอนุมัติ" พร้อมแสดง UID ให้ส่งให้ Admin

---

## โครงสร้างไฟล์

```
src/
├── App.tsx              — Auth flow, routing หลัก
├── firebase.ts          — Firebase init
├── types.ts             — TypeScript types ทั้งหมด
├── components/
│   ├── Layout.tsx       — Shell + navigation
│   ├── Dashboard.tsx    — ปฏิทินกะส่วนตัว
│   ├── TeamSchedule.tsx — ตารางกะทีม (admin only)
│   ├── Requests.tsx     — คำขอสลับกะ
│   ├── Members.tsx      — จัดการสมาชิก (admin only)
│   ├── Settings.tsx     — ตั้งค่าระบบ (admin only)
│   └── scheduleUtils.ts — logic คำนวณกะ
```
