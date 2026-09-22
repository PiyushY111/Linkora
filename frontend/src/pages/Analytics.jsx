import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from '../components/Navbar';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Globe, Monitor, Chrome, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { analyticsService } from '../services';

const Analytics = () => {
  const { linkId } = useParams();
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7d');

  useEffect(() => {
    fetchAnalytics();
  }, [linkId, dateRange]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      if (linkId === 'all') {
        const data = await analyticsService.getAnalyticsSummary();
        setAnalytics(data.summary);
      } else {
        const data = await analyticsService.getLinkAnalytics(linkId);
        setAnalytics(data.analytics);
      }
    } catch (error) {
      toast.error('Failed to fetch analytics');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="flex justify-center items-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Analytics - Linkly</title>
      </Helmet>
      <Navbar />

      <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Analytics</h1>
              <p className="text-gray-600 dark:text-gray-400">Track your link performance</p>
            </div>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="input w-32"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Total Clicks</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {analytics?.totalClicks || 0}
                  </p>
                </div>
                <TrendingUp size={40} className="text-blue-600" />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Total Links</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {analytics?.totalLinks || 0}
                  </p>
                </div>
                <Globe size={40} className="text-green-600" />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Top Device</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {analytics?.topDevices?.[0]?.device || 'N/A'}
                  </p>
                </div>
                <Monitor size={40} className="text-purple-600" />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Top Browser</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {analytics?.topBrowsers?.[0]?.browser || 'N/A'}
                  </p>
                </div>
                <Chrome size={40} className="text-orange-600" />
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Top Countries */}
            {analytics?.topCountries && analytics.topCountries.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">Top Countries</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.topCountries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="country" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="clicks" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Device Distribution */}
            {analytics?.topDevices && analytics.topDevices.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">Device Distribution</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analytics.topDevices}
                      dataKey="clicks"
                      nameKey="device"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {analytics.topDevices.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={['#3B82F6', '#10B981', '#F59E0B'][index % 3]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Browser Distribution */}
            {analytics?.topBrowsers && analytics.topBrowsers.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">Top Browsers</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.topBrowsers}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="browser" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="clicks" fill="#8B5CF6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Clicks by Day */}
            {analytics?.clicksByDay && analytics.clicksByDay.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">Clicks Over Time</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.clicksByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="clicks" stroke="#3B82F6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default Analytics;
