# Components — ระบบยำกะผี

> อัปเดตล่าสุด: 2026-04-18

## App.tsx
Entry point หลัก จัดการ:
- Firebase Auth state (onAuthStateChanged)
- 3 states: loading / ไม่มี user / รอ approve / logged in
- Routing ด้วย `activeTab` state (ไม่ใช้ React Router)
- Auto-create Admin ถ้า email = `q.apichai@gmail.com`

## Layout.tsx
Shell ของแอพ — navigation bar และ wrapper

## Dashboard.tsx
ปฏิทินกะส่วนตัวของ user ที่ login
- แสดงกะรายวันทั้งเดือน
- ดึงข้อมูลจาก Firestore `/shifts` + fallback คำนวณจาก shiftPattern
- มี refresh button
- กดที่วันเพื่อสร้าง SwapRequest (navigate ไปหน้า Requests)
- ตรวจสอบ warnings (เช่น quota เกิน)

## TeamSchedule.tsx (admin only)
ตารางกะรวมของสมาชิกทั้งทีม
- เห็นกะทุกคน
- **⚠️ ต้องแก้ใส่ EmailJS** — ตอนนี้ยังใช้ Line Notify

## Requests.tsx
จัดการคำขอสลับกะ/ควงกะ/แลกวันหยุด
- สร้างคำขอใหม่ (swap, double, dayoff)
- Admin อนุมัติ/ปฏิเสธ
- **⚠️ ต้องแก้ใส่ EmailJS** — ส่ง notification เมื่อ:
  - มีคำขอใหม่
  - อนุมัติ/ปฏิเสธ

## Members.tsx (admin only)
จัดการข้อมูลสมาชิก — เพิ่ม/แก้ไข/อนุมัติ member

## Settings.tsx (admin only)
ตั้งค่าระบบ — shift properties, quota defaults, etc.

## scheduleUtils.ts
Logic คำนวณกะจาก shiftPattern + cycleStartDate
- `generateSchedule()` — สร้าง schedule จาก pattern
- `validateShifts()` — ตรวจ warnings
