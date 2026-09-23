# 🚀 Hostinger-এ GitHub থেকে ডিপ্লয় করার নির্দেশিকা (Live Arena Counter)

আপনার প্রজেক্টটি এখন **Hostinger Web App (Node.js)**, **Hostinger Git Deployment (Shared/Cloud)**, এবং **Hostinger Docker/VPS** তিনটির জন্যই শতভাগ প্রস্তুত। 

নিচে আপনার সুবিধা অনুযায়ী যেকোনো একটি পদ্ধতি বেছে নিয়ে খুব সহজে লাইভ করুন:

---

## 📌 মেথড ১: Hostinger "Web Apps / Node.js" দিয়ে ডিপ্লয় (সবচেয়ে সহজ ও অটোমেটিক)

যদি আপনার Hostinger প্ল্যানে **Node.js** বা **Web Apps** অপশন থাকে:

1. **Hostinger hPanel**-এ লগইন করুন।
2. আপনার ডোমেইন বা হোস্টিং ড্যাশবোর্ডে গিয়ে বাম পাশের মেনু থেকে **Websites** > **Web Apps** (অথবা **Advanced** > **Node.js**) সিলেক্ট করুন।
3. **Connect GitHub** বা **Create Web App** বাটনে ক্লিক করুন:
   - **Repository:** আপনার গিটহাব একাউন্ট সিলেক্ট করে `mehedihasanmondol-online/live-counter-website` বেছে নিন।
   - **Branch:** `main`
   - **Node.js Version:** `20.x` বা `18.x` (যেকোনো রিকমেন্ডেড ভার্সন)
   - **Application Root:** `/` (রুট ডিরেক্টরি)
   - **Application Startup File:** `server.js`
   - **Build Command:** `npm install` (অথবা খালি রাখতে পারেন)
   - **Start Command:** `npm start`
4. **Deploy** বাটনে ক্লিক করুন। 
5. হোস্টইঙ্গার স্বয়ংক্রিয়ভাবে গিটহাব থেকে কোড ক্লোন করে `npm install` রান করবে এবং সাইট লাইভ করে দেবে!

---

## 📌 মেথড ২: Hostinger Git Deployment (Shared ও Cloud Hosting-এর জন্য)

যদি আপনার সাধারণ Hostinger Shared বা Cloud Web Hosting থাকে এবং আপনি সরাসরি `public_html`-এ রাখতে চান:

1. **Hostinger hPanel**-এ যান এবং কাঙ্ক্ষিত ডোমেইনের ড্যাশবোর্ডে প্রবেশ করুন।
2. বাম পাশের মেনু থেকে **Advanced** > **Git** অপশনে ক্লিক করুন।
3. **Create a Repository** ফর্মে নিচের তথ্যগুলো দিন:
   - **Repository:** `https://github.com/mehedihasanmondol-online/live-counter-website.git`
   - **Branch:** `main`
   - **Install Directory:** `public_html` (যদি সাবফোল্ডারে চান তবে সাবফোল্ডারের নাম)
4. **Create** বাটনে ক্লিক করুন। Hostinger গিটহাব থেকে সরাসরি আপনার ওয়েবসাইট ফাইলগুলো নামিয়ে আনবে।
5. **Auto Deployment (স্বয়ংক্রিয় আপডেট):**
   - রিপোজিটরি তৈরি হওয়ার পর সেখানে একটি **Webhook URL** দেখতে পাবেন।
   - এই Webhook URL কপি করে নিন।
   - আপনার GitHub রিপোজিটরির **Settings** > **Webhooks** > **Add webhook**-এ যান।
   - **Payload URL**-এ Hostinger-এর কপি করা Webhook URL পেস্ট করুন এবং Content type হিসেবে `application/json` দিন।
   - **Add Webhook** চাপুন।
   - এখন থেকে আপনি যখনই গিটহাবে `git push` করবেন, সাথে সাথে Hostinger-এর ওয়েবসাইট স্বয়ংক্রিয়ভাবে আপডেট হয়ে যাবে!

---

## 📌 মেথড ৩: Hostinger VPS / Docker দিয়ে ডিপ্লয়

প্রজেক্টে ইতিমধ্যেই অপ্টিমাইজড `Dockerfile` তৈরি করে দেওয়া হয়েছে:
- Hostinger VPS-এ `docker build -t live-counter .`
- রান করতে: `docker run -d -p 80:3000 --name live-counter-app live-counter`

---

## 🛠 প্রজেক্টে যুক্ত হওয়া নতুন ফাইলসমূহ:

1. **`server.js`**: প্রোডাকশন-রেডি এক্সপ্রেস সার্ভার। এতে `process.env.PORT` সাপোর্ট, `/health` মনিটরিং এবং এক্সপ্রেস না থাকলেও সরাসরি নোড বিল্ট-ইন সার্ভারে চলার ফলব্যাক সিস্টেম আছে।
2. **`package.json`**: ডিপেন্ডেন্সি (`express`), নোড ইঞ্জিন (`>=18.0.0`), এবং `start` স্ক্রিপ্ট সংজ্ঞায়িত করা।
3. **`.htaccess`**: Hostinger লাইটস্পিড/অ্যাপাচি সার্ভারের জন্য ফোর্স HTTPS, ব্রাউজার ক্যাশিং, Gzip কম্প্রেশন এবং সিকিউরিটি হেডার।
4. **`.gitignore`**: `node_modules`, ক্যাশ এবং লগ ফাইল গিট থেকে আলাদা রাখা।
5. **`Dockerfile` & `.dockerignore`**: ডকার কন্টেইনারে এক ক্লিকে রান করার সুবিধা।
6. **PWA সাপোর্ট (`manifest.webmanifest`, `sw.js`, `pwa.js`, `assets/icon*.png`)**: ডেক্সটপ ও মোবাইলে অ্যাপ হিসেবে ইনস্টল করার সুবিধা এবং ১০০% অফলাইনে কাজ করার জন্য ক্যাশিং ইঞ্জিন।
