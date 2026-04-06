# ระบบบริหารจัดการสวนสัตว์ (Firebase)

เว็บแอปตัวอย่างสำหรับจัดการข้อมูลสวนสัตว์:

- ข้อมูลพื้นฐาน (ประเภทสัตว์, สายพันธุ์, กรง, อาหาร)
- ข้อมูลสัตว์
- สุขภาพสัตว์
- การให้อาหาร, สต็อกอาหาร, คำร้องขอจัดซื้อ
- รายงานสรุป
- ผู้ใช้งานและบทบาท

ฝั่งฐานข้อมูลใช้ **Firebase (Firestore + Auth)** เขียนด้วย HTML + Vanilla JS ไม่ต้อง build ใช้ไฟล์จากโฟลเดอร์นี้เปิดได้เลย

---

## 1. เตรียม Firebase Project

1. เข้าไปที่ `https://console.firebase.google.com` แล้วสร้าง Project ใหม่
2. เพิ่ม Web App (ไอคอน `</>`) แล้วจดค่า config เอาไว้
3. เปิดใช้งาน:
   - Firestore Database (โหมด test ช่วงพัฒนา)
   - Authentication (Email/Password)

### ตัวอย่างโครงสร้าง Collection หลักใน Firestore

- `animalTypes`  
  `name`, `description`
- `breeds`  
  `name`, `description`
- `enclosures`  
  `name`, `description`
- `feedItems`  
  `name`, `description`
- `animals`  
  `name`, `typeId`, `breedId`, `enclosureId`, `caretakerId`, `birthdate`, `note`
- `healthRecords`  
  `animalId`, `date`, `status`, `note`, `treatment`, `nextCheckDate`, `createdAt`
- `feedingLogs`  
  `animalId`, `feedItemId`, `date`, `time`, `amount`, `createdAt`
- `inventory`  
  `feedItemId`, `quantity`
- `purchaseRequests`  
  `feedItemId`, `quantity`, `note`, `status`, `createdAt`, `createdBy`
- `appUsers`  
  `uid (optional)`, `email`, `displayName`, `role (admin/vet/keeper/food)`

> คุณสามารถปรับ field เพิ่มเติมตาม requirement งานได้

---

## 2. ตั้งค่า Firebase ในไฟล์ `main.js`

เปิดไฟล์ `main.js` แล้วแก้ส่วน config:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

ให้ตรงกับค่าจาก Firebase Console (หน้า Web App ที่สร้าง)

---

## 3. การรันโปรเจกต์

### วิธีง่ายสุด (เปิดไฟล์ตรง ๆ)

ดับเบิลคลิกเปิด `index.html` ด้วย Chrome/Edge ส่วนใหญ่จะทำงานได้ (ถ้ามีปัญหาเรื่อง CORS/โมดูล แนะนำใช้วิธี dev server ด้านล่าง)

### รันผ่าน dev server (แนะนำ)

ต้องมี Node.js ก่อน (ดาวน์โหลดจาก `https://nodejs.org`)

```bash
cd c:\Users\Daow Tanyapak\Desktop\SA
npm install
npm run start
```

แล้วเปิดเบราว์เซอร์ไปที่ลิงก์ที่ `serve` แสดง (เช่น `http://localhost:3000`)

> ใน `package.json` ใช้คำสั่ง `npx serve .` แค่เปิด static file เฉย ๆ ไม่ได้มี backend อะไรเพิ่ม

---

## 4. การใช้งานฟีเจอร์หลัก

- **เข้าสู่ระบบ (Login)**: ใช้ email/password จาก Firebase Auth
- **ข้อมูลพื้นฐาน**: CRUD ประเภทสัตว์, สายพันธุ์, กรง, อาหาร
- **ข้อมูลสัตว์**: ลงทะเบียนสัตว์, แก้ไข, ค้นหา, กำหนดกรงและผู้ดูแล
- **สุขภาพสัตว์**: บันทึกตรวจสุขภาพ, รักษา, นัดถัดไป + แสดงแจ้งเตือนง่าย ๆ
- **อาหารสัตว์**: บันทึกการให้อาหาร, ปรับปรุงสต็อก, คำร้องจัดซื้อ
- **รายงาน**: แสดงสรุปจำนวนสัตว์ตามประเภท, สถานะสุขภาพ, การใช้อาหาร 30 วัน, summary
- **ผู้ใช้งาน/บทบาท**: จัดการข้อมูลผู้ใช้ใน collection `appUsers` (ใช้คู่กับ Firebase Auth)

---

## 5. ขยายต่อ / ปรับปรุง

- ปรับปรุง rule ของ Firestore ให้ปลอดภัย (เช็ค role จาก `appUsers`)
- แยกหน้า UI ตาม role (admin / vet / keeper / food)
- เพิ่ม validation / การคำนวณปริมาณอาหารอัตโนมัติ
- เขียนรายงานเพิ่ม หรือ export เป็นไฟล์ (Excel / PDF) ตาม requirement

