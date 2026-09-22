# 🎨 LINKLY - VISUAL ARCHITECTURE & FLOW DIAGRAMS

## 1. Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   React Application (Vite)                   │   │
│  │                                                               │   │
│  │  Pages:                                                       │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐        │   │
│  │  │  Landing    │ │   Login &   │ │    Dashboard    │        │   │
│  │  │             │ │  Register   │ │  (Create Links) │        │   │
│  │  └─────────────┘ └─────────────┘ └─────────────────┘        │   │
│  │                                                               │   │
│  │  ┌──────────────────────┐  ┌─────────────────────────┐      │   │
│  │  │   Analytics Page     │  │  Settings Page (Profile) │      │   │
│  │  │  (View Statistics)   │  │ (API Keys, Preferences)  │      │   │
│  │  └──────────────────────┘  └─────────────────────────┘      │   │
│  │                                                               │   │
│  │  Components:                                                 │   │
│  │  - Navbar (Navigation)                                       │   │
│  │  - LinkCard (Link Display)                                   │   │
│  │  - Charts (Analytics Visualization)                          │   │
│  │  - Forms (User Input)                                        │   │
│  │                                                               │   │
│  │  State Management:                                           │   │
│  │  - Zustand (authStore, linkStore)                           │   │
│  │  - Axios (API calls)                                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                    HTTPS/REST API
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│   API SERVER (Node.js)   │    │  SHORT LINK REDIRECT    │
│   Express.js             │    │  (Quick Redirect)        │
│                          │    │                          │
│ Routes:                  │    │ /api/r/:shortCode       │
│ ├─ /api/auth            │    │ └─ Redirect 301         │
│ │  ├─ POST /register    │    │    to original URL       │
│ │  ├─ POST /login       │    │                          │
│ │  └─ GET /me           │    └──────────────────────────┘
│ │                        │
│ ├─ /api/links           │
│ │  ├─ POST / (create)   │
│ │  ├─ GET / (list)      │
│ │  ├─ GET /:id          │
│ │  ├─ PUT /:id          │
│ │  └─ DELETE /:id       │
│ │                        │
│ └─ /api/analytics       │
│    ├─ GET /link/:id     │
│    └─ GET /summary      │
│                          │
│ Middleware:             │
│ - JWT Auth              │
│ - Validation            │
│ - Error Handling        │
│ - Rate Limiting         │
│ - CORS                  │
└──────────┬───────┬──────┬──────────────────┐
           │       │      │                  │
     ┌─────▼┐  ┌───▼──┐ ┌──▼────┐     ┌─────▼──────┐
     │      │  │      │ │       │     │            │
     ▼      ▼  ▼      ▼ ▼       ▼     ▼            ▼
  ┌──────────────────┐  ┌─────────┐ ┌──────────────────┐
  │  MongoDB Atlas   │  │Cloudinary│ │   IP-API.com     │
  │  (Database)      │  │(Images)  │ │ (Geolocation)    │
  │                  │  │          │ │                  │
  │ Collections:     │  │ - QR     │ │ - Country        │
  │ - users          │  │   Codes  │ │ - City           │
  │ - links          │  │ - Avatars│ │ - Timezone       │
  │ - analytics      │  │          │ │                  │
  │ - customdomains  │  └─────────┘ └──────────────────┘
  │                  │
  │ Indexes:         │
  │ - user, created  │
  │ - shortCode      │
  │ - link, timestamp│
  └──────────────────┘
```

---

## 2. User Journey Flow

```
START
  │
  ▼
┌─────────────────────┐
│   Landing Page      │
│                     │
│ - Sign Up button    │
│ - Features showcase │
│ - Call to action    │
└────────┬──────┬─────┘
         │      │
         │      └────────────────────────┐
         │                               │
         ▼                               ▼
    ┌─────────────┐              ┌─────────────┐
    │ Sign Up     │              │ Sign In     │
    │ - New User  │              │ - Existing  │
    │ - Create    │              │ - Login     │
    │   Account   │              │ - Password  │
    └──────┬──────┘              └──────┬──────┘
           │                            │
           └──────────────┬─────────────┘
                          │
                          ▼
                  ┌──────────────────┐
                  │   Dashboard      │
                  │                  │
                  │ - View links     │
                  │ - Create link    │
                  │ - Link cards     │
                  │ - Stats          │
                  └────────┬─────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
      ┌──────────┐  ┌────────────┐  ┌────────────┐
      │ Create   │  │ View Link  │  │ Settings   │
      │ New Link │  │ Analytics  │  │ (Profile)  │
      │          │  │            │  │            │
      │ - Paste  │  │ - Charts   │  │ - API Keys │
      │   URL    │  │ - Stats    │  │ - Theme    │
      │ - Custom │  │ - Geography│  │ - Prefs    │
      │   alias  │  │ - Browsers │  │            │
      │ - QR     │  │ - Devices  │  │            │
      │ - Tags   │  └────────────┘  └────────────┘
      └──────────┘
            │
            ▼
      ┌──────────────────┐
      │ Link Created     │
      │ (Short URL)      │
      │ (QR Code)        │
      │ (Shareable)      │
      └────────┬─────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
    ┌─────────┐  ┌──────────┐
    │ Copy &  │  │ Share on │
    │ Share   │  │ Social   │
    │         │  │ Media    │
    └────┬────┘  └────┬─────┘
         │            │
         │      ┌─────┘
         │      │
         └──────┴──────────┐
                           │
                           ▼
                  ┌──────────────────┐
                  │ Someone Clicks   │
                  │ Short Link       │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ Analytics Tracked│
                  │ - Device         │
                  │ - Browser        │
                  │ - Country        │
                  │ - Timestamp      │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ 301 Redirect     │
                  │ to Original URL  │
                  └──────────────────┘
```

---

## 3. Authentication Flow

```
CLIENT                          SERVER                    DATABASE
  │                              │                           │
  ├─── POST /register ──────────>│                           │
  │ {name,email,password}        │                           │
  │                              ├─ Hash Password           │
  │                              ├─ Validate Input          │
  │                              │                           │
  │                              ├─ Create User ────────────>│
  │                              │  (in users collection)    │
  │                              │<─ User ID ────────────────┤
  │                              │                           │
  │                              ├─ Generate JWT            │
  │<───── JWT Token ─────────────┤                           │
  │       user data              │                           │
  │                              │                           │
  │ (Saves token to localStorage)│                           │
  │                              │                           │
  ├─ GET /api/links ────────────>│                           │
  │ {Authorization: Bearer JWT}  │                           │
  │                              ├─ Verify JWT              │
  │                              ├─ Get User ID             │
  │                              │                           │
  │                              ├─ Find User Links ───────>│
  │                              │  (where user = userId)   │
  │                              │<─ Links Array ────────────┤
  │<───── Links Data ────────────┤                           │
  │                              │                           │
  │                              │                           │
  │ (User Logout)                │                           │
  │                              │                           │
  │ (Clear localStorage)         │                           │
  │ Redirect to Login            │                           │
```

---

## 4. Link Creation to Analytics Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ LINK CREATION FLOW                                               │
└──────────────────────────────────────────────────────────────────┘

USER INPUT
  │
  ├─ originalUrl: "https://example.com/very/long/url"
  ├─ customAlias: "my-link" (optional)
  ├─ title: "My Project"
  ├─ description: "Cool project"
  └─ tags: ["marketing", "campaign"]
  │
  ▼
VALIDATION
  │
  ├─ Is URL valid? ✓
  ├─ Is alias unique? ✓
  ├─ Is user authenticated? ✓
  │
  ▼
GENERATE SHORT CODE
  │
  ├─ If customAlias provided: use that
  └─ Else: generate random 6-char code
  │
  ▼
CREATE DATABASE RECORDS
  │
  ├─ Link document (links collection)
  │  ├─ originalUrl
  │  ├─ shortCode
  │  ├─ user (userId)
  │  ├─ clicks: 0
  │  └─ createdAt: now
  │
  └─ Analytics document (analytics collection)
     ├─ link (linkId)
     ├─ user (userId)
     ├─ clicks: []
     └─ summary: {}
  │
  ▼
GENERATE QR CODE
  │
  ├─ Upload to Cloudinary
  ├─ Get secure URL
  └─ Save to Link document
  │
  ▼
RESPONSE TO USER
  │
  └─ Return created link with:
     ├─ shortUrl: "http://localhost:3000/my-link"
     ├─ qrCode: "https://cloudinary.com/..."
     └─ shortCode: "my-link"

┌──────────────────────────────────────────────────────────────────┐
│ CLICK & ANALYTICS FLOW                                           │
└──────────────────────────────────────────────────────────────────┘

USER CLICKS LINK
  │
  ├─ http://localhost:3000/api/r/my-link
  │
  ▼
FIND LINK IN DATABASE
  │
  ├─ Query: Link.findOne({shortCode: "my-link"})
  ├─ Found: yes
  ├─ Is active: yes
  └─ Not expired: yes
  │
  ▼
INCREMENT CLICK COUNTER
  │
  └─ link.clicks += 1
  │
  ▼
COLLECT VISITOR DATA
  │
  ├─ User Agent: "Mozilla/5.0 Chrome/120..."
  ├─ IP Address: "192.168.1.1"
  ├─ Referer: "google.com"
  ├─ Timestamp: "2024-01-03T10:30:00Z"
  ├─ Language: "en-US"
  │
  ▼
DETECT DEVICE & BROWSER
  │
  ├─ Parse User Agent
  ├─ Device: "desktop" | "mobile" | "tablet"
  └─ Browser: "Chrome" | "Firefox" | "Safari"
  │
  ▼
GET GEOLOCATION
  │
  ├─ Call: ip-api.com with IP
  ├─ Get: Country, City, Timezone
  │
  ▼
CREATE CLICK RECORD
  │
  └─ analytics.clicks.push({
       timestamp: "2024-01-03T10:30:00Z",
       device: "desktop",
       browser: "Chrome",
       country: "US",
       city: "New York",
       ipAddress: "192.168.1.1",
       referer: "google.com",
       ...
     })
  │
  ▼
UPDATE SUMMARY STATS
  │
  ├─ summary.totalClicks += 1
  ├─ Update topCountries
  ├─ Update topDevices
  └─ Update topBrowsers
  │
  ▼
PERFORM REDIRECT
  │
  └─ res.redirect(301, "https://example.com/very/long/url")

┌──────────────────────────────────────────────────────────────────┐
│ ANALYTICS VIEW FLOW                                              │
└──────────────────────────────────────────────────────────────────┘

USER VIEWS ANALYTICS
  │
  ├─ GET /api/r/link/:linkId
  │
  ▼
FETCH FROM DATABASE
  │
  ├─ Query: Analytics.findOne({link: linkId})
  ├─ Get: clicks array, summary, top stats
  │
  ▼
DISPLAY ON DASHBOARD
  │
  ├─ Total Clicks: 1,234
  ├─ Top Countries: US (456), UK (123), ...
  ├─ Device Distribution: Desktop (70%), Mobile (25%), Tablet (5%)
  ├─ Browsers: Chrome (600), Firefox (300), Safari (200), ...
  ├─ Timeline: Click count by day (line chart)
  │
  ▼
USER CAN
  │
  ├─ Filter by date range
  ├─ Export data
  ├─ Share analytics
  └─ Delete link
```

---

## 5. Component Hierarchy

```
App
│
├─ Landing
│  ├─ Navbar
│  └─ Hero Section
│
├─ Login
│  ├─ Form
│  └─ Error Messages
│
├─ Register
│  ├─ Form
│  └─ Validation
│
├─ Dashboard
│  ├─ Navbar
│  ├─ Create Link Form
│  └─ LinkCard (multiple)
│     ├─ Link Info
│     ├─ Short URL Display
│     ├─ QR Code
│     ├─ Stats
│     └─ Actions Menu
│
├─ Analytics
│  ├─ Navbar
│  ├─ Stats Cards
│  │  ├─ Total Clicks
│  │  ├─ Total Links
│  │  ├─ Top Device
│  │  └─ Top Browser
│  └─ Charts
│     ├─ Top Countries (Bar)
│     ├─ Device Distribution (Pie)
│     ├─ Top Browsers (Bar)
│     └─ Clicks Over Time (Line)
│
├─ Settings
│  ├─ Navbar
│  ├─ Profile Form
│  ├─ API Key Section
│  └─ Preferences
│
└─ NotFound (404)
```

---

## 6. Database Relationships

```
┌─────────────┐
│    User     │
│  (1:Many)   │
└──────┬──────┘
       │
       ├──────────────────────────┐
       │                          │
       ▼                          ▼
   ┌────────┐              ┌────────────────┐
   │  Link  │              │  CustomDomain  │
   │(1:Many)│              │    (1:Many)    │
   └────┬───┘              └────────────────┘
        │
        ├──────────────────┐
        │                  │
        ▼                  ▼
   ┌───────────┐      ┌──────────────┐
   │ Analytics │      │ CustomDomain │
   │  (1:1)    │      │ Verified:    │
   └───────────┘      │ - Domain     │
                      │ - User       │
   Analytics:         │ - SSL Cert   │
   - clicks[]         │ - Status     │
   - summary          └──────────────┘
   - topCountries
   - topDevices
   - topBrowsers
```

---

## 7. API Request/Response Example

```
REQUEST
┌────────────────────────────────────────────────────────────┐
│ POST /api/links                                            │
│                                                            │
│ Headers:                                                   │
│ - Content-Type: application/json                          │
│ - Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI... │
│                                                            │
│ Body:                                                      │
│ {                                                          │
│   "originalUrl": "https://github.com/example/repo",      │
│   "customAlias": "my-github",                            │
│   "title": "My GitHub Repo",                             │
│   "tags": ["github", "open-source"],                     │
│   "category": "personal"                                  │
│ }                                                          │
└────────────────────────────────────────────────────────────┘

RESPONSE
┌────────────────────────────────────────────────────────────┐
│ Status: 201 Created                                        │
│                                                            │
│ Body:                                                      │
│ {                                                          │
│   "success": true,                                        │
│   "link": {                                               │
│     "_id": "672a1b3c4d5e6f7g8h9i0j1",                    │
│     "originalUrl": "https://github.com/example/repo",    │
│     "shortCode": "my-github",                            │
│     "shortUrl": "http://localhost:3000/my-github",       │
│     "customAlias": "my-github",                          │
│     "user": "672a1b3c4d5e6f7g8h9i0j2",                  │
│     "title": "My GitHub Repo",                           │
│     "tags": ["github", "open-source"],                   │
│     "category": "personal",                              │
│     "qrCode": "https://cloudinary.com/image.png",        │
│     "clicks": 0,                                          │
│     "isActive": true,                                     │
│     "createdAt": "2024-01-03T10:30:00Z",                 │
│     "updatedAt": "2024-01-03T10:30:00Z"                  │
│   }                                                        │
│ }                                                          │
└────────────────────────────────────────────────────────────┘
```

---

## 8. File Upload & QR Code Flow

```
User Creates Link
        │
        ▼
Generate QR Code Image
        │
        ├─ Create PNG in memory
        ├─ Save to temporary file
        │
        ▼
Upload to Cloudinary
        │
        ├─ POST to cloudinary.com
        ├─ Folder: "linkly/qrcodes"
        │
        ▼
Receive Secure URL
        │
        ├─ URL: "https://res.cloudinary.com/..."
        │
        ▼
Save URL to Database
        │
        └─ Link.qrCode = "https://res.cloudinary.com/..."
        │
        ▼
Display in UI
        │
        └─ <img src={link.qrCode} />
```

---

## 9. Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    YOUR CUSTOM DOMAIN                        │
│                   (optional, recommended)                    │
│                     linkly.yourdomain.com                    │
│                            │                                 │
│                            ▼                                 │
│                      DNS Records                             │
│                      (CNAME/A Record)                        │
└──────────────────────────┬─────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌──────────────┐
    │  Vercel    │  │  Railway   │  │  MongoDB     │
    │(Frontend)  │  │(Backend)   │  │   Atlas      │
    │            │  │            │  │              │
    │- React App │  │- Node.js   │  │- Database    │
    │- Static    │  │- Express   │  │- Collections │
    │- CDN       │  │- API       │  │- Backups     │
    │- SSL       │  │- SSL       │  │- SSL         │
    │            │  │            │  │              │
    │✓ Deployed  │  │✓ Deployed  │  │✓ Deployed    │
    └────────────┘  └────────────┘  └──────────────┘
           │               │               │
           │               │               │
           └───────────────┼───────────────┘
                           │
                           ▼
                    Live Application
                  www.your-linkly.com

                  Users can:
                  - Create links
                  - View analytics
                  - Share globally
                  - Access 24/7
```

---

## 10. Development to Production Pipeline

```
LOCAL DEVELOPMENT
        │
        ├─ Write Code
        │  ├─ Backend (backend/)
        │  └─ Frontend (frontend/)
        │
        ├─ Test Locally
        │  ├─ npm run dev
        │  ├─ Visit localhost:3000
        │  └─ Test features
        │
        ├─ Commit & Push
        │  └─ git push origin main
        │
        ▼
GITHUB REPOSITORY
        │
        ├─ Code stored
        ├─ Version control
        └─ Deploy triggers
        │
        ▼
VERCEL DEPLOYMENT (Frontend)
        │
        ├─ Auto-deploy on push
        ├─ Build: npm run build
        ├─ Output: dist/
        ├─ Deploy to CDN
        └─ Live at: your-app.vercel.app
        │
        ▼
RAILWAY DEPLOYMENT (Backend)
        │
        ├─ Auto-deploy on push
        ├─ Install: npm install
        ├─ Start: npm start (or npm run dev)
        ├─ Port: 5000
        └─ Live at: backend-url.railway.app
        │
        ▼
PRODUCTION ENVIRONMENT
        │
        ├─ Frontend: vercel.app
        ├─ Backend: railway.app
        ├─ Database: MongoDB Atlas
        ├─ Storage: Cloudinary
        ├─ Users access: your-domain.com
        │
        ▼
LIVE APPLICATION ✅
```

---

**These diagrams cover the complete architecture and flow of the Linkly application!**

Use these as reference when:

- 🎯 Understanding how components work
- 🚀 Deploying the application
- 🔧 Adding new features
- 🐛 Debugging issues
- 📚 Learning the codebase

---

Created: January 3, 2026
Last Updated: January 3, 2026
