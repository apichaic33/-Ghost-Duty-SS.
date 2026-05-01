# Deploy Guide — ระบบยำกะผี

> อัปเดตล่าสุด: 2026-04-18  
> โปรเจกต์อยู่ที่: `~/Downloads/yamka`

## ขั้นตอน (ทำตามลำดับ)

### Step 1 — เปิด Terminal
```bash
cd ~/Downloads/yamka
```

### Step 2 — เก็บค่า EmailJS จาก emailjs.com
- **Service ID** → หน้า Email Services → ชื่อ Outlook
- **Template ID** → หน้า Email Templates
- **Public Key** → Account → General

แจ้ง Claude ค่าทั้ง 3 อย่าง → Claude จะแก้โค้ดใน `Requests.tsx` และ `TeamSchedule.tsx`

### Step 3 — แก้ firebase.json เป็น Hosting only
```bash
cat > ~/Downloads/yamka/firebase.json << 'EOF'
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
EOF
```

### Step 4 — Build + Deploy
```bash
npm run build
firebase deploy --only hosting
```

### Step 5 — เปิด Google Authentication
Firebase Console → Authentication → Sign-in method → เปิด **Google**

### Step 6 — ทดสอบ
เปิด `https://gen-lang-client-0528383957.web.app`  
Login ด้วย `q.apichai@gmail.com` → ทดสอบ Swap Request → เช็ค email

---

## หมายเหตุ

- Firebase Functions **ไม่ได้ deploy** — ใช้ Blaze Plan → ใช้ EmailJS แทน (client-side)
- `functions/index.ts` มีโค้ด Line Notify เก่า → จะไม่ใช้แล้ว
