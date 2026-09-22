# Linkly - Advanced URL Shortener with Analytics

A production-grade, scalable URL shortener built with MERN stack, featuring advanced analytics, QR codes, custom domains, and more.

## Features

### Core Features

- **URL Shortening**: Create short, memorable URLs with custom aliases
- **Advanced Analytics**: Track clicks, devices, browsers, countries, languages, timezones
- **QR Code Generation**: Auto-generate scannable QR codes for every link
- **Custom Domains**: Use your own domain for branded short links
- **Link Management**: Organize links with tags, categories, titles, and descriptions
- **Password Protection**: Protect sensitive links with passwords
- **Link Expiry**: Set expiration dates for temporary links
- **UTM Parameters**: Built-in UTM tracking for marketing campaigns

### User Features

- **Authentication**: Secure JWT-based authentication
- **User Dashboard**: Manage all your links in one place
- **API Access**: Programmatic access with API keys
- **Profile Management**: Customize your account settings
- **Real-time Analytics**: Interactive charts and statistics
- **Export Data**: Download analytics reports

### Advanced Features (Extras beyond Bitly)

- **Bulk Operations**: Create multiple links at once
- **Link Cloning**: Duplicate existing links with different targets
- **Custom Branding**: White-label your links
- **Team Management**: Collaborate with team members
- **Rate Limiting**: Built-in rate limiting and DDoS protection
- **Webhooks**: Receive notifications on link events
- **IP Tracking**: Detailed IP-based geolocation
- **Device Fingerprinting**: Identify unique visitors

## Tech Stack

### Backend

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: bcryptjs, helmet, express-rate-limit
- **File Storage**: Cloudinary
- **QR Code**: qrcode library
- **IP Geolocation**: ip-api
- **ID Generation**: nanoid

### Frontend

- **Framework**: React 18
- **Router**: React Router v6
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **HTTP Client**: Axios
- **Notifications**: React Hot Toast
- **Build Tool**: Vite
- **Animations**: Framer Motion

## Project Structure

```
Linkly/
├── backend/
│   ├── src/
│   │   ├── config/         # Database, Cloudinary config
│   │   ├── models/         # MongoDB schemas
│   │   ├── controllers/    # Business logic
│   │   ├── routes/         # API endpoints
│   │   ├── middleware/     # Auth, validation, error handling
│   │   ├── services/       # Business services
│   │   ├── utils/          # Helper functions
│   │   └── index.js        # Entry point
│   ├── package.json
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── pages/          # Page components
    │   ├── components/     # Reusable components
    │   ├── context/        # Zustand stores
    │   ├── services/       # API services
    │   ├── utils/          # Helper functions
    │   ├── styles/         # Global styles
    │   ├── App.jsx         # Root component
    │   └── main.jsx        # Entry point
    ├── index.html
    ├── vite.config.js
    └── tailwind.config.js
```

## Setup Instructions

### Prerequisites

- Node.js 16+
- MongoDB (local or Atlas)
- Cloudinary account (optional, for QR code hosting)
- npm or yarn

### Backend Setup

1. **Navigate to backend directory**

   ```bash
   cd backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create .env file**

   ```bash
   cp .env.example .env
   ```

4. **Update environment variables**

   ```
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_super_secret_key
   PORT=5000
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

### Frontend Setup

1. **Navigate to frontend directory**

   ```bash
   cd frontend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create .env.local file**

   ```
   VITE_API_URL=http://localhost:5000/api
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

The app will be available at `http://localhost:3000`

## API Documentation

### Authentication Endpoints

#### Register

```
POST /api/auth/register
Body: { name, email, password }
```

#### Login

```
POST /api/auth/login
Body: { email, password }
```

#### Get Current User

```
GET /api/auth/me
Headers: { Authorization: Bearer <token> }
```

### Links Endpoints

#### Create Link

```
POST /api/links
Headers: { Authorization: Bearer <token> }
Body: {
  originalUrl,
  customAlias?,
  title?,
  description?,
  tags?,
  category?,
  expiryDate?,
  password?
}
```

#### Get User Links

```
GET /api/links?page=1&limit=10&sort=-createdAt
Headers: { Authorization: Bearer <token> }
```

#### Get Link Analytics

```
GET /api/r/:shortCode
```

#### Delete Link

```
DELETE /api/links/:id
Headers: { Authorization: Bearer <token> }
```

### Analytics Endpoints

#### Get Link Analytics

```
GET /api/r/link/:linkId
Headers: { Authorization: Bearer <token> }
```

#### Get Summary Analytics

```
GET /api/r/summary/all?startDate=2024-01-01&endDate=2024-12-31
Headers: { Authorization: Bearer <token> }
```

## Deployment

### Deploy to Vercel

#### Frontend Deployment

1. **Push code to GitHub**

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Connect to Vercel**
   - Go to vercel.com
   - Click "New Project"
   - Import your GitHub repo
   - Select `frontend` directory
   - Add environment variables
   - Deploy

#### Backend Deployment (Heroku/Railway)

1. **Deploy to Railway/Heroku**

   ```bash
   cd backend
   # Follow Railway/Heroku CLI instructions
   ```

2. **Set environment variables on platform**

## Security Best Practices

- JWT tokens with expiration
- Password hashing with bcryptjs
- Rate limiting on all endpoints
- CORS configuration
- Helmet for HTTP headers
- Input validation and sanitization
- MongoDB injection prevention
- HTTPS enforcement in production

## Analytics Tracking

The system tracks:

- **Click Count**: Total and unique clicks
- **Device Type**: Mobile, tablet, desktop
- **Browser**: Chrome, Firefox, Safari, Edge
- **Operating System**: Windows, macOS, Linux, Android, iOS
- **Country & City**: Geolocation data
- **Referer**: Source of traffic
- **User Agent**: Complete device information
- **Language & Timezone**: User preferences
- **UTM Parameters**: Marketing campaign data

## UI/UX Features

- **Modern Design**: Clean, professional interface
- **Dark Mode**: Built-in dark/light theme
- **Responsive**: Mobile-first design
- **Real-time Updates**: Live analytics dashboard
- **Charts & Graphs**: Visual data representation
- **Smooth Animations**: Framer motion transitions
- **Toast Notifications**: User feedback system
- **Loading States**: Better user experience

## Extra Features (Beyond Bitly)

1. **Bulk Link Creation**: Create multiple links at once
2. **Link Categories**: Organize links by category
3. **Custom Tagging**: Tag-based link organization
4. **Link Cloning**: Duplicate and modify existing links
5. **Webhooks**: Event-driven notifications
6. **API Keys**: Programmatic access
7. **Team Collaboration**: Multi-user support
8. **Custom Branding**: Brand your links
9. **Password Protection**: Secure sensitive links
10. **Link Preview**: Preview before redirecting
11. **Social Media Integration**: Share link statistics
12. **Advanced Reporting**: Export analytics data

## Workflow

### Creating a Short Link

1. User logs in to dashboard
2. Enters original URL
3. (Optional) Customizes alias, title, tags
4. System generates QR code automatically
5. Link is created and displayed
6. User can copy/share link

### Tracking Analytics

1. When someone clicks a short link
2. System records visitor information
3. Geolocation is determined
4. Analytics are updated in real-time
5. Dashboard shows updated statistics

## Testing

### Run Backend Tests

```bash
cd backend
npm test
```

### Run Frontend Tests

```bash
cd frontend
npm test
```

## Git Workflow

```bash
# Clone repository
git clone https://github.com/yourusername/linkly.git

# Create feature branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "Add your feature"

# Push to GitHub
git push origin feature/your-feature

# Create pull request
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Support

For issues or questions:

- Create a GitHub issue
- Contact: arvind42005@gmail.com

## Learning Resources

- [Express.js Documentation](https://expressjs.com)
- [React Documentation](https://react.dev)
- [MongoDB Documentation](https://docs.mongodb.com)
- [Tailwind CSS](https://tailwindcss.com)
- [Vite Guide](https://vitejs.dev)

---

**Happy Shortening**

Build your next URL shortener project with Linkly.
