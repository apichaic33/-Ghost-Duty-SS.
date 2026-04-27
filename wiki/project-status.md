# Project Status — ระบบยำกะผี

> อัปเดตล่าสุด: 2026-04-26

## สถานะรวม

**Deploy แล้ว + ระบบคำนวณกะทำงานถูกต้อง** — Hosting ขึ้นแล้ว, ล้าง shift overrides แล้ว, position selection ใช้วันที่ 1 ของเดือนเป็น reference

---

## ✅ เสร็จแล้ว

- โค้ดครบ build ผ่าน มีโฟลเดอร์ `dist/` พร้อม deploy
- Firebase CLI v15.14.0 ติดตั้งและ login ด้วย `q.apichai@gmail.com` แล้ว
- Admin email ใน `.env.production` = `q.apichai@gmail.com`
- EmailJS สมัครแล้ว เชื่อม Outlook (`ApichaiC.583986@outlook.co.th`)
- Email Template สร้างแล้ว (subject, to_email, message)
- **[2026-04-26] แก้การคำนวณกะ**: Debug Panel ใน Dashboard, ล้าง shift overrides (S11/S12/S13 เก่าใน Firestore), position selection ใช้วันที่ 1 ของเดือนเป็น reference (`cycleStartDate = firstOfMonth - index`)
- **[2026-04-26] Members.tsx**: Doc ID indicator (green=UID match, red=GAS empId warning), duplicate detection + bulk delete

---

## ❌ ยังค้าง

1. **เก็บค่า EmailJS** — ต้องไปดูที่ emailjs.com แล้วเก็บ 3 ค่า:
   - Service ID → หน้า Email Services
   - Template ID → หน้า Email Templates
   - Public Key → Account → General

2. ~~**แก้โค้ดใส่ EmailJS**~~ ✅ เสร็จแล้ว (2026-04-18)
   - `src/components/Requests.tsx` — แทน Line Notify ด้วย EmailJS
   - `src/components/TeamSchedule.tsx` — เพิ่ม notification ตอน admin แก้ shift
   - `src/types.ts` — เพิ่ม `email?: string` ใน Member

3. ~~**แก้ `firebase.json`**~~ ✅ สร้างใหม่แล้ว (2026-04-18)

4. ~~**`npm run build` + `firebase deploy --only hosting`**~~ ✅ Deploy สำเร็จ (2026-04-18)

5. **เปิด Google Authentication** ใน Firebase Console → Authentication → Sign-in method

6. **ทดสอบระบบ** ที่ `https://gen-lang-client-0528383957.web.app`

---

## Firebase Project

| Key | Value |
|---|---|
| Project ID | `gen-lang-client-0528383957` |
| Hosting URL | `https://gen-lang-client-0528383957.web.app` |
| Admin Email | `q.apichai@gmail.com` |
| Firestore DB ID | `ai-studio-01987361-573e-4f30-9681-1e83b5c491e3` |

## EmailJS

| Key | Value |
|---|---|
| Account | `ApichaiC.583986@outlook.co.th` |
| Service ID | ⚠️ ยังไม่ได้เก็บ |
| Template ID | ⚠️ ยังไม่ได้เก็บ |
| Public Key | ⚠️ ยังไม่ได้เก็บ |

---

## หมายเหตุสำคัญ

- Firebase Functions **ไม่ deploy** เพราะต้องใช้ Blaze Plan → ใช้ EmailJS แทน (client-side)
- `firebase.json` ปัจจุบันยังมี functions config → ต้องแก้ก่อน deploy
