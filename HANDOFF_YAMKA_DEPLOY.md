# HANDOFF — Deploy ระบบยำกะผี
**วันที่:** 10 เมษายน 2569  
**สถานะ:** กำลัง Deploy — หยุดพักระหว่างทาง  

---

## ✅ สิ่งที่ทำเสร็จแล้ว

- [x] Download โค้ดจาก AI Studio → แตก zip ไว้ที่ `~/Downloads/yamka`
- [x] ติดตั้ง Firebase CLI v15.14.0
- [x] Login Firebase ด้วย `q.apichai@gmail.com`
- [x] วางไฟล์ Deploy Package เข้าโปรเจกต์
- [x] แก้ Admin Email ใน `.env.production`
- [x] `npm install` โปรเจกต์หลัก + functions
- [x] `npm run build` สำเร็จ → มีโฟลเดอร์ `dist/` แล้ว
- [x] สมัคร EmailJS + เชื่อมต่อ Outlook (`ApichaiC.583986@outlook.co.th`)
- [x] สร้าง Email Template พร้อมใช้งาน

---

## ❌ ยังไม่ได้ทำ

- [ ] เก็บค่า EmailJS (Service ID, Template ID, Public Key)
- [ ] แก้โค้ดใส่ EmailJS แทน Line Notify
- [ ] Build + Deploy ขึ้น Firebase Hosting
- [ ] ทดสอบระบบ

---

## 📁 โครงสร้างไฟล์ปัจจุบัน

```
~/Downloads/yamka/
├── .env.production        ← VITE_ADMIN_EMAIL=q.apichai@gmail.com
├── .firebaserc            ← ชี้ไปที่ project: gen-lang-client-0528383957
├── firebase.json          ← Hosting config (ยังไม่ได้แก้เป็น hosting-only)
├── functions/
│   ├── index.ts           ← Line Notify Function (จะแทนที่ด้วย EmailJS)
│   ├── package.json
│   └── tsconfig.json
├── src/
│   ├── App.tsx            ← แก้แล้ว (admin email อ่านจาก env)
│   └── components/
│       ├── Requests.tsx   ← ต้องแก้ใส่ EmailJS
│       ├── TeamSchedule.tsx ← ต้องแก้ใส่ EmailJS
│       └── ...
├── dist/                  ← Build output พร้อม deploy
└── package.json
```

---

## 🔑 ข้อมูล Firebase Project

| Key | Value |
|---|---|
| Project ID | `gen-lang-client-0528383957` |
| App ID | `1:77866909714:web:e1fc89b78830597b9958cb` |
| Auth Domain | `gen-lang-client-0528383957.firebaseapp.com` |
| Hosting URL (หลัง deploy) | `https://gen-lang-client-0528383957.web.app` |
| Firestore DB ID | `ai-studio-01987361-573e-4f30-9681-1e83b5c491e3` |

---

## 📧 EmailJS Setup

| Key | Value |
|---|---|
| Account Email | `ApichaiC.583986@outlook.co.th` |
| Service | Outlook Personal |
| Service ID | ⚠️ **ยังไม่ได้เก็บ** — ดูที่ emailjs.com → Email Services |
| Template ID | ⚠️ **ยังไม่ได้เก็บ** — ดูที่ emailjs.com → Email Templates |
| Public Key | ⚠️ **ยังไม่ได้เก็บ** — ดูที่ emailjs.com → Account → General |

### Template ที่ตั้งค่าไว้:
```
Subject: {{subject}}
To Email: {{to_email}}
Content:
  {{message}}
  ---
  ระบบยำกะผี — แจ้งเตือนอัตโนมัติ
```

---

## 📋 ขั้นตอนพรุ่งนี้ (ทำตามลำดับ)

### Step 1 — เปิด Terminal
```bash
cd ~/Downloads/yamka
```

### Step 2 — เก็บค่า EmailJS
ไปที่ [emailjs.com](https://emailjs.com) แล้วเก็บ:
- **Service ID** → หน้า Email Services ดูใต้ชื่อ Outlook
- **Template ID** → หน้า Email Templates ดูใต้ชื่อ template
- **Public Key** → Account → General

### Step 3 — แจ้ง Claude ค่าทั้ง 3 อย่าง
Claude จะแก้โค้ดใส่ EmailJS ให้ครบทุก action:
- มีคนขอ Swap Request
- อนุมัติ / ปฏิเสธ Swap
- Admin แก้ไข Shift

### Step 4 — แก้ firebase.json เป็น Hosting only
```bash
cat > ~/Downloads/yamka/firebase.json << 'EOF'
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
EOF
```

### Step 5 — Build + Deploy
```bash
npm run build
firebase deploy --only hosting
```

### Step 6 — เปิดใช้งาน Firebase Authentication
Firebase Console → Authentication → Sign-in method → เปิด **Google**

### Step 7 — ทดสอบ
- เปิด `https://gen-lang-client-0528383957.web.app`
- Login ด้วย `q.apichai@gmail.com`
- ทดสอบ Swap Request → เช็คว่าได้รับ Email

---

## ⚠️ หมายเหตุสำคัญ

- Firebase Functions **ยังไม่ได้ deploy** เพราะต้องใช้ Blaze Plan → ใช้ EmailJS แทน
- `firebase.json` ปัจจุบันยังมี functions config อยู่ → ต้องแก้ใน Step 4
- โค้ดใน `functions/index.ts` เป็น Line Notify → จะไม่ใช้แล้ว

---

*HANDOFF สร้างโดย Claude — 10 เมษายน 2569*
