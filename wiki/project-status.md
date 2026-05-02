# Project Status — ระบบยำกะผี

> อัปเดตล่าสุด: 2026-05-02

## สถานะรวม

**ระบบพร้อมใช้งานเต็มรูปแบบ** — GAS เชื่อมต่อแล้ว, Google Auth เปิดแล้ว, EmailJS ครบ, Deploy ล่าสุดแล้ว

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

~~**เก็บค่า EmailJS**~~ ✅ เสร็จแล้ว (2026-05-02)
   - Service ID: `service_yamka`
   - Template ID: `template_nfo6sld`
   - Public Key: `YY8IVNkVN-qhgglkU`

~~**เปิด Google Authentication**~~ ✅ เสร็จแล้ว (2026-05-02)

~~**GAS เชื่อมต่อ + Sync สมาชิก**~~ ✅ เสร็จแล้ว (2026-05-02) — Sync แล้ว 18 คน (ใหม่ 1, อัปเดต 17)

1. **ทดสอบระบบ** ที่ `https://gen-lang-client-0528383957.web.app` — login, ดูกะ, ยื่น swap request, ทดสอบ email notification

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
