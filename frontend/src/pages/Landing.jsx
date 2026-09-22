import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight } from 'lucide-react';

const Landing = () => {
  return (
    <>
      <Helmet>
        <title>Linkly - Advanced URL Shortener</title>
      </Helmet>

      <div className="bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 min-h-screen">
        {/* Navigation */}
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Linkly</h1>
          <div className="flex gap-4">
            <Link to="/login" className="btn bg-white text-blue-600 hover:bg-gray-100">
              Login
            </Link>
            <Link to="/register" className="btn btn-primary">
              Sign Up
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center text-white">
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            Shorten URLs with Advanced Analytics
          </h2>
          <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Create, track, and manage your links with detailed analytics, QR codes, custom domains, and more
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="btn btn-primary text-lg px-8 flex items-center justify-center gap-2">
              Get Started Free <ArrowRight size={20} />
            </Link>
            <Link to="/login" className="btn bg-white text-blue-600 hover:bg-gray-100 text-lg px-8">
              Sign In
            </Link>
          </div>

          {/* Features Preview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24">
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-8 text-left">
              <div className="text-4xl mb-4">🔗</div>
              <h3 className="text-2xl font-semibold mb-2">Smart Shortening</h3>
              <p className="text-blue-100">Create short, memorable links with custom aliases</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-lg p-8 text-left">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-2xl font-semibold mb-2">Advanced Analytics</h3>
              <p className="text-blue-100">Track clicks, devices, browsers, countries, and more</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-lg p-8 text-left">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-2xl font-semibold mb-2">QR Codes & More</h3>
              <p className="text-blue-100">Auto-generate QR codes, custom domains, and UTM tracking</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Landing;
