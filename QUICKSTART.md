# Linkly - Quick Start Guide

Get up and running with Linkly in under 10 minutes!

## 🚀 Local Development Setup

### Step 1: Install Dependencies (5 minutes)

#### Backend

```bash
cd backend
npm install
```

#### Frontend

```bash
cd frontend
npm install
```

### Step 2: Configure Environment Variables (2 minutes)

#### Backend (.env)

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```
MONGODB_URI=mongodb://localhost:27017/linkly
JWT_SECRET=your_local_secret_key_here
JWT_EXPIRE=7d
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

#### Frontend (.env.local)

```bash
cd frontend
echo 'VITE_API_URL=http://localhost:5000/api' > .env.local
```

### Step 3: Start Development Servers (3 minutes)

#### Terminal 1 - Backend

```bash
cd backend
npm run dev
```

Expected output:

```
Server running in development mode on port 5000
MongoDB Connected: localhost
```

#### Terminal 2 - Frontend

```bash
cd frontend
npm run dev
```

Expected output:

```
VITE v... running at:

  ➜  Local:   http://localhost:3000/
```

### Step 4: Open in Browser

Visit: `http://localhost:3000`

## 📝 First Steps in the App

### 1. Create Account

- Click "Sign Up"
- Enter name, email, password
- Click "Sign Up"

### 2. Create Your First Link

- Click "Create New Link"
- Paste a long URL
- (Optional) Add custom alias, title, tags
- Click "Create Link"

### 3. View Analytics

- Click on a link card
- See real-time analytics
- Check click counts, device types, browsers

## 🔑 Key Features to Try

### URL Creation

```bash
# Try creating these links:
- https://github.com/torvalds/linux
- https://www.notion.so/
- https://www.github.com/
```

### Custom Aliases

- Create link with alias: `my-project`
- Short URL becomes: `http://localhost:3000/my-project`

### Analytics

- Click your short link multiple times from different devices
- Analytics update in real-time

### QR Codes

- Each link has an auto-generated QR code
- Right-click and save for sharing

## 📚 Project Structure Quick Reference

```
frontend/
├── pages/           # Login, Register, Dashboard, Analytics
├── components/      # Navbar, LinkCard, Forms
├── services/        # API calls (authService, linkService)
└── context/         # State management (authStore, linkStore)

backend/
├── routes/          # API endpoints
├── controllers/     # Business logic
├── models/          # Database schemas
└── middleware/      # Auth, validation
```

## 🔄 Common Development Tasks

### Add a New Feature

#### 1. Create API Endpoint (Backend)

```javascript
// backend/src/routes/newFeature.js
import express from "express";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/", protect, async (req, res) => {
  // Your code here
});

export default router;
```

#### 2. Add to Server (Backend)

```javascript
// backend/src/index.js
import newFeatureRoutes from "./routes/newFeature.js";
app.use("/api/newfeature", newFeatureRoutes);
```

#### 3. Create Service (Frontend)

```javascript
// frontend/src/services/index.js
export const newFeatureService = {
  getData: async () => {
    return await api.get("/newfeature");
  },
};
```

#### 4. Create Component (Frontend)

```javascript
// frontend/src/components/NewFeature.jsx
import { newFeatureService } from "../services";

export default function NewFeature() {
  const [data, setData] = useState(null);

  useEffect(() => {
    newFeatureService.getData().then(setData);
  }, []);

  return <div>{/* Your UI */}</div>;
}
```

## 🐛 Troubleshooting

### Issue: "Cannot connect to MongoDB"

```bash
# Make sure MongoDB is running
mongod

# Or use MongoDB Atlas connection string in .env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/linkly
```

### Issue: "CORS error"

```bash
# Check frontend .env.local has correct API URL
VITE_API_URL=http://localhost:5000/api

# Restart frontend dev server
```

### Issue: "Port 5000 already in use"

```bash
# Change port in .env
PORT=5001

# Or kill process on port 5000
lsof -ti:5000 | xargs kill -9
```

### Issue: "Cloudinary errors"

```bash
# For local development, you can:
# 1. Skip QR codes (comment out in controller)
# 2. Or add valid Cloudinary credentials
```

## 📦 Build for Production

### Frontend

```bash
cd frontend
npm run build
# Output in dist/ folder
```

### Backend

No build needed, runs with Node directly.

## 🚀 Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment guide.

Quick deploy:

```bash
# Frontend to Vercel
cd frontend
npm install -g vercel
vercel

# Backend to Railway
cd backend
npm install -g @railway/cli
railway login
railway up
```

## 📖 API Examples

### Register User

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Create Link

```bash
curl -X POST http://localhost:5000/api/links \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "originalUrl": "https://example.com",
    "customAlias": "mylink",
    "title": "My Project"
  }'
```

### Get Links

```bash
curl http://localhost:5000/api/links \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Access Short Link

```bash
curl http://localhost:5000/api/r/mylink \
  -L  # Follow redirects
```

## 🎨 Customization Tips

### Change Brand Colors

Edit `frontend/tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      primary: '#YOUR_COLOR',
      secondary: '#YOUR_COLOR',
    },
  },
}
```

### Change App Name

1. `frontend/index.html` - Change `<title>`
2. `frontend/src/components/Navbar.jsx` - Change logo text
3. `README.md` - Update project description

### Add Google Analytics

```javascript
// frontend/src/App.jsx
import ReactGA from "react-ga4";
ReactGA.initialize("YOUR_GA_ID");
```

## 📊 Database Schema Quick Reference

### User

- name, email, password
- avatar, bio
- links (array of Link IDs)
- totalClicks, apiKey
- preferences (theme, notifications)

### Link

- originalUrl, shortCode
- user (User ID), title, description
- tags, category, customDomain
- qrCode, clicks, isActive
- expiryDate, password

### Analytics

- link (Link ID), clicks[]
- clicks contain: timestamp, device, browser, country, etc.
- topCountries, topDevices, topBrowsers

## 🔐 Authentication Flow

1. User registers → Password hashed → JWT token generated
2. User logs in → Credentials verified → JWT token sent
3. API requests → Token in Authorization header → Verified by `protect` middleware
4. Invalid token → 401 Unauthorized → Redirect to login

## 💡 Pro Tips

1. **Use Thunder Client or Postman** to test APIs before UI
2. **Enable Redux DevTools** to debug state (add to Zustand)
3. **Use `console.log`** in components for debugging
4. **Check browser DevTools** → Network tab for API requests
5. **Restart servers** after changing .env files

## 🆘 Getting Help

1. Check [README.md](./README.md) for full documentation
2. Check [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment issues
3. Check backend logs: `npm run dev` output
4. Check browser console: F12 → Console tab
5. Test APIs manually: curl or Postman

## 📝 Next Steps

After local setup works:

1. ✅ Understand the folder structure
2. ✅ Make a small change to see hot reload
3. ✅ Create a test link and check analytics
4. ✅ Try the API with Postman
5. ✅ Read through controllers to understand logic
6. ✅ Add a new feature
7. ✅ Deploy to production

## 🎓 Learning Path

1. **Day 1**: Set up locally, create links, explore dashboard
2. **Day 2**: Understand API structure, test endpoints
3. **Day 3**: Add a simple feature (e.g., new field to link)
4. **Day 4**: Deploy backend
5. **Day 5**: Deploy frontend
6. **Day 6**: Add advanced features

---

**You're all set! Start building. 🚀**

Questions? Check the full documentation or open an issue on GitHub.
