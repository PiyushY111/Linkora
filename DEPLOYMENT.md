# Linkly - Step-by-Step Deployment Guide

## Prerequisites

- GitHub account
- Vercel account
- MongoDB Atlas account
- Cloudinary account
- Git installed locally

## Step 1: Prepare Your Project

### 1.1 Create GitHub Repository

```bash
cd c:\Users\Arvind\OneDrive\Documents\Projects\Linkly

# Initialize git
git init

# Create .gitignore
echo "node_modules/" > .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo "dist/" >> .gitignore

# Add all files
git add .

# Create initial commit
git commit -m "Initial Linkly commit"

# Create GitHub repo and add origin
git remote add origin https://github.com/YOUR_USERNAME/Linkly.git
git branch -M main
git push -u origin main
```

## Step 2: Set Up MongoDB Atlas

### 2.1 Create Cluster

1. Go to MongoDB Atlas (atlas.mongodb.com)
2. Create a new project
3. Create a cluster (free tier available)
4. Wait for cluster to deploy (10-15 minutes)

### 2.2 Create Database User

1. Go to Database Access
2. Click "Add New Database User"
3. Create username and password
4. Select "Autogenerate Secure Password" for better security
5. Click "Create User"

### 2.3 Get Connection String

1. Click "Connect" on your cluster
2. Select "Connect your application"
3. Copy the connection string
4. Replace `<username>` and `<password>` with your credentials
5. Replace `myFirstDatabase` with your database name

Example: `mongodb+srv://user:password@cluster.mongodb.net/linkly?retryWrites=true&w=majority`

## Step 3: Set Up Cloudinary (Optional but Recommended)

### 3.1 Create Cloudinary Account

1. Go to cloudinary.com
2. Sign up for free account
3. Go to Dashboard
4. Copy your Cloud Name, API Key, and API Secret

## Step 4: Deploy Backend

### Option A: Deploy to Railway

#### 4.1 Install Railway CLI

```bash
npm install -g @railway/cli
```

#### 4.2 Login and Deploy

```bash
cd backend

# Login to Railway
railway login

# Initialize project
railway init

# Add environment variables
railway variable set MONGODB_URI="your_mongo_uri"
railway variable set JWT_SECRET="your_secret_key"
railway variable set CLOUDINARY_CLOUD_NAME="your_cloud_name"
railway variable set CLOUDINARY_API_KEY="your_api_key"
railway variable set CLOUDINARY_API_SECRET="your_api_secret"
railway variable set FRONTEND_URL="https://your-frontend.vercel.app"
railway variable set NODE_ENV="production"

# Deploy
railway up
```

#### 4.3 Get Your Backend URL

```bash
railway status
```

Copy the deployment URL (e.g., `https://linkly-backend.up.railway.app`)

### Option B: Deploy to Heroku

#### 4.1 Install Heroku CLI

```bash
npm install -g heroku
```

#### 4.2 Login and Deploy

```bash
cd backend

# Login
heroku login

# Create app
heroku create linkly-backend

# Set environment variables
heroku config:set MONGODB_URI="your_mongo_uri"
heroku config:set JWT_SECRET="your_secret_key"
heroku config:set CLOUDINARY_CLOUD_NAME="your_cloud_name"
heroku config:set CLOUDINARY_API_KEY="your_api_key"
heroku config:set CLOUDINARY_API_SECRET="your_api_secret"
heroku config:set FRONTEND_URL="https://your-frontend.vercel.app"

# Deploy
git push heroku main
```

## Step 5: Deploy Frontend to Vercel

### 5.1 Push Code to GitHub

```bash
git push origin main
```

### 5.2 Deploy Frontend

1. Go to vercel.com
2. Click "New Project"
3. Import your GitHub repo
4. Select "Frontend" as root directory

### 5.3 Add Environment Variables

In Vercel project settings, add:

```
VITE_API_URL=https://your-backend-url.com
```

### 5.4 Deploy

1. Click "Deploy"
2. Wait for deployment to complete (2-5 minutes)
3. Copy your Vercel URL (e.g., `https://linkly.vercel.app`)

### 5.5 Update Backend FRONTEND_URL

Go back to Railway/Heroku and update:

```bash
railway variable set FRONTEND_URL="https://linkly.vercel.app"
```

## Step 6: Post-Deployment Testing

### 6.1 Test Health Check

```bash
curl https://your-backend-url.com/health
```

Expected response:

```json
{ "success": true, "message": "Server is running" }
```

### 6.2 Test API Endpoints

#### Register

```bash
curl -X POST https://your-backend-url.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'
```

#### Create Link

```bash
curl -X POST https://your-backend-url.com/api/links \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "originalUrl": "https://example.com",
    "customAlias": "test123",
    "title": "Test Link"
  }'
```

## Step 7: Custom Domain Setup (Optional)

### 7.1 Update Vercel Domain

1. In Vercel project settings
2. Go to "Domains"
3. Add your custom domain
4. Follow DNS setup instructions

### 7.2 Update Environment Variables

Update in both Railway/Heroku and Vercel:

```
FRONTEND_URL=https://your-custom-domain.com
```

## Step 8: Enable HTTPS

Both Vercel and Railway/Heroku provide free HTTPS by default. ✅

## Step 9: Set Up Monitoring (Optional)

### 9.1 Add Error Tracking

Update backend to use Sentry:

```bash
npm install --save @sentry/node
```

### 9.2 Configure Sentry

```javascript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "your_sentry_dsn",
  environment: process.env.NODE_ENV,
});
```

## Step 10: Final Checklist

- [ ] MongoDB cluster running
- [ ] Backend deployed and accessible
- [ ] Frontend deployed and accessible
- [ ] Environment variables configured
- [ ] CORS enabled
- [ ] HTTPS working
- [ ] API endpoints responding
- [ ] Database connections working
- [ ] File uploads to Cloudinary working
- [ ] QR codes generating
- [ ] Analytics tracking working

## 🎉 Deployment Complete!

Your Linkly application is now live:

- **Frontend**: https://your-app.vercel.app
- **Backend API**: https://your-backend-url.com
- **Admin Dashboard**: https://your-app.vercel.app/dashboard

## Troubleshooting

### Backend Connection Issues

```bash
# Check logs
railway logs
# or
heroku logs -t
```

### Frontend Build Issues

```bash
# Clear cache and rebuild
rm -rf .next
npm run build
```

### Database Connection Issues

1. Check MongoDB Atlas IP whitelist
2. Verify connection string
3. Check database user credentials

### CORS Issues

Update backend:

```javascript
app.use(
  cors({
    origin: "https://your-frontend-url.vercel.app",
    credentials: true,
  })
);
```

## Performance Optimization

### Frontend

```bash
# Build optimization
npm run build
# Check bundle size
npm install -g vite-plugin-visualizer
```

### Backend

- Add caching headers
- Enable gzip compression
- Optimize database queries
- Use connection pooling

## Security Checklist

- [ ] JWT secrets are strong
- [ ] Passwords are hashed
- [ ] CORS is properly configured
- [ ] Rate limiting is enabled
- [ ] HTTPS is enforced
- [ ] Security headers are set
- [ ] Database credentials are secure
- [ ] API keys are hidden in .env

## Next Steps

1. **Monitor Performance**: Use Vercel Analytics
2. **Set Up CI/CD**: Configure GitHub Actions
3. **Database Backups**: Enable MongoDB automated backups
4. **Team Collaboration**: Add team members
5. **Custom Features**: Add additional features
6. **SEO Optimization**: Add metadata and sitemap
7. **Analytics Upgrade**: Connect Google Analytics

## Support

For deployment issues:

1. Check Railway/Heroku logs
2. Check Vercel deployment logs
3. Verify environment variables
4. Test API endpoints manually
5. Check network connectivity

---

**Happy Deploying! 🚀**
