# CLAUDE.md — ระบบยำกะผี

## อ่านก่อนทุกสนทนา

อ่านไฟล์เหล่านี้ตอนเริ่มต้นทุกครั้ง:
1. `wiki/index.md` — index และ log
2. `wiki/project-status.md` — สถานะปัจจุบัน + สิ่งที่ค้าง
3. `wiki/architecture.md` — โครงสร้างระบบ

## โปรเจกต์คืออะไร

ระบบจัดการและสลับกะการทำงานของนายสถานี ชื่อ **ระบบยำกะผี**  
Stack: React 19 + TypeScript + Firebase Firestore + Firebase Hosting + EmailJS

## Admin

- Email: `q.apichai@gmail.com`
- Firebase Project: `gen-lang-client-0528383957`

## Git Hook

ทุกครั้งที่แก้ไขไฟล์ Claude Code จะ `git add → commit → push` อัตโนมัติ

## Wiki

- `wiki/` — knowledge base ของโปรเจกต์ (Claude เป็นคนดูแล)
- อัปเดต `wiki/project-status.md` ทุกครั้งที่สถานะเปลี่ยน
- บันทึก log ใน `wiki/index.md` ทุกครั้งที่ทำงาน
