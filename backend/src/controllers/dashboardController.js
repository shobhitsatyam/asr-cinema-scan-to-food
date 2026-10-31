const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Seat = require('../models/Seat');
const { store } = require('../data/memoryStore');

const getDashboardStats = async (req, res) => {
  try {
    let orders = [];
    let productsCount = 0;
    let seats = [];

    if (mongoose.connection.readyState === 1) {
      orders = await Order.find().sort({ createdAt: -1 }).lean();
      productsCount = await Product.countDocuments({ isActive: true });
      seats = await Seat.find().lean();
    } else {
      orders = store.orders || [];
      productsCount = (store.products || []).filter(p => p.isActive !== false).length;
      seats = store.seats || [];
    }

    // Filter operational orders: Paid orders only
    const paidOrders = orders.filter(o => o.paymentStatus === 'Paid');

    // Date calculations for today
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayPaidOrders = paidOrders.filter(o => {
      const orderDate = new Date(o.createdAt || Date.now());
      return orderDate >= todayStart;
    });

    const todayRevenue = todayPaidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const todayOrdersCount = todayPaidOrders.length;

    const pendingOrdersCount = paidOrders.filter(o => o.status === 'Pending').length;
    const preparingOrdersCount = paidOrders.filter(o => o.status === 'Preparing' || o.status === 'Accepted').length;
    const completedOrdersCount = paidOrders.filter(o => o.status === 'Completed' || o.status === 'Served').length;

    const activeSeatsCount = seats.filter(s => s.status !== 'inactive' && s.status !== 'Blocked').length;
    const totalSeatsCount = seats.length || 180;

    // Calculate 7-day trend
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const trendMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayLabel = days[d.getDay()];
      trendMap[dayLabel] = { label: dayLabel, revenue: 0, orders: 0 };
    }

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    paidOrders.forEach(o => {
      const oDate = new Date(o.createdAt || Date.now());
      if (oDate >= sevenDaysAgo) {
        const dayLabel = days[oDate.getDay()];
        if (trendMap[dayLabel]) {
          trendMap[dayLabel].revenue += Number(o.total) || 0;
          trendMap[dayLabel].orders += 1;
        }
      }
    });

    const revenueTrend = Object.values(trendMap);

    // Calculate popular items
    const itemSales = {};
    paidOrders.forEach(o => {
      (o.items || []).forEach(item => {
        const key = item.name || item.productName || item.id;
        if (!itemSales[key]) {
          itemSales[key] = {
            name: key,
            quantity: 0,
            revenue: 0,
            image: item.image || '',
            category: item.type === 'Non-Veg' ? 'Non-Veg' : 'Snacks',
          };
        }
        itemSales[key].quantity += Number(item.quantity) || 1;
        itemSales[key].revenue += Number(item.total || (item.price * item.quantity)) || 0;
      });
    });

    const popularItems = Object.values(itemSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return res.json({
      success: true,
      stats: {
        todayRevenue,
        todayOrders: todayOrdersCount,
        pendingOrders: pendingOrdersCount,
        preparingOrders: preparingOrdersCount,
        completedOrders: completedOrdersCount,
        activeFoods: productsCount,
        activeSeats: activeSeatsCount,
        totalSeats: totalSeatsCount,
        revenueTrend,
        popularItems,
      },
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve dashboard stats.' });
  }
};

const getAnalyticsReports = async (req, res) => {
  try {
    const period = req.query.period || '7days';
    let orders = [];

    if (mongoose.connection.readyState === 1) {
      orders = await Order.find().sort({ createdAt: -1 }).lean();
    } else {
      orders = store.orders || [];
    }

    const paidOrders = orders.filter(o => o.paymentStatus === 'Paid');
    const now = new Date();
    let startDate = new Date();

    if (period === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === '7days') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === '30days') {
      startDate.setDate(now.getDate() - 30);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      startDate.setDate(now.getDate() - 7);
    }

    const periodOrders = paidOrders.filter(o => new Date(o.createdAt || Date.now()) >= startDate);

    const totalRevenue = periodOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const totalOrders = periodOrders.length;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Trend
    let trend = [];
    if (period === 'today') {
      const hours = ['11 AM', '01 PM', '03 PM', '05 PM', '07 PM', '09 PM', '11 PM'];
      trend = hours.map(h => ({ label: h, revenue: 0, orders: 0 }));
      periodOrders.forEach(o => {
        const d = new Date(o.createdAt || Date.now());
        const hr = d.getHours();
        let idx = 0;
        if (hr >= 23) idx = 6;
        else if (hr >= 21) idx = 5;
        else if (hr >= 19) idx = 4;
        else if (hr >= 17) idx = 3;
        else if (hr >= 15) idx = 2;
        else if (hr >= 13) idx = 1;
        else idx = 0;
        trend[idx].revenue += Number(o.total) || 0;
        trend[idx].orders += 1;
      });
    } else if (period === '7days') {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayMap = {};
      days.forEach(d => { dayMap[d] = { label: d, revenue: 0, orders: 0 }; });
      periodOrders.forEach(o => {
        const d = new Date(o.createdAt || Date.now());
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const name = dayNames[d.getDay()];
        if (dayMap[name]) {
          dayMap[name].revenue += Number(o.total) || 0;
          dayMap[name].orders += 1;
        }
      });
      trend = days.map(d => dayMap[d]);
    } else {
      trend = [
        { label: 'Week 1', revenue: 0, orders: 0 },
        { label: 'Week 2', revenue: 0, orders: 0 },
        { label: 'Week 3', revenue: 0, orders: 0 },
        { label: 'Week 4', revenue: 0, orders: 0 },
      ];
      periodOrders.forEach(o => {
        const d = new Date(o.createdAt || Date.now());
        const dayOfMonth = d.getDate();
        const weekIdx = Math.min(3, Math.floor((dayOfMonth - 1) / 7));
        trend[weekIdx].revenue += Number(o.total) || 0;
        trend[weekIdx].orders += 1;
      });
    }

    // Category sales
    const categoryTotals = {
      Popcorn: 0,
      Combos: 0,
      Beverages: 0,
      'Food & Snacks': 0,
      Coffee: 0,
    };
    const categoryColors = {
      Popcorn: '#E31B23',
      Combos: '#B5121B',
      Beverages: '#F59E0B',
      'Food & Snacks': '#3B82F6',
      Coffee: '#8B5CF6',
    };

    const itemAgg = {};

    periodOrders.forEach(o => {
      (o.items || []).forEach(it => {
        const cat = it.category || (it.name && it.name.toLowerCase().includes('popcorn') ? 'Popcorn' :
                     it.name && it.name.toLowerCase().includes('combo') ? 'Combos' :
                     it.name && (it.name.toLowerCase().includes('coke') || it.name.toLowerCase().includes('water')) ? 'Beverages' :
                     it.name && it.name.toLowerCase().includes('coffee') ? 'Coffee' : 'Food & Snacks');
        const itemRev = Number(it.total || (it.price * it.quantity)) || 0;
        categoryTotals[cat] = (categoryTotals[cat] || 0) + itemRev;

        const name = it.name || it.productName || it.id;
        if (!itemAgg[name]) {
          itemAgg[name] = {
            name,
            quantity: 0,
            revenue: 0,
            image: it.image || 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?w=120&auto=format&fit=crop&q=60',
            category: cat,
          };
        }
        itemAgg[name].quantity += Number(it.quantity) || 1;
        itemAgg[name].revenue += itemRev;
      });
    });

    const grandTotalCat = Object.values(categoryTotals).reduce((a, b) => a + b, 0) || 1;
    const categorySales = Object.entries(categoryTotals).map(([cat, amt]) => ({
      category: cat,
      amount: amt,
      percentage: Math.round((amt / grandTotalCat) * 100),
      color: categoryColors[cat] || '#888888',
    }));

    const topSellingFoods = Object.values(itemAgg)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6);

    return res.json({
      success: true,
      report: {
        totalRevenue,
        totalOrders,
        avgOrderValue,
        revenueTrend: trend,
        categorySales,
        topSellingFoods,
      },
    });
  } catch (err) {
    console.error('Error fetching analytics report:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve analytics report.' });
  }
};

module.exports = {
  getDashboardStats,
  getAnalyticsReports,
};

