const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getOne, getMany } = require('../config/database');

// @route   GET /api/dashboard/stats
// @desc    Get dashboard statistics
// @access  Private
router.get('/stats', authenticate, async (req, res) => {
  try {
    // Get total profiles
    const totalProfilesResult = await getOne(
      'SELECT COUNT(*) as total FROM profiles'
    );

    // Get total checkups today
    const todayCheckupsResult = await getOne(
      'SELECT COUNT(*) as total FROM checkups WHERE DATE(tanggal) = CURDATE()'
    );

    // Get total checkups this month
    const monthlyCheckupsResult = await getOne(
      'SELECT COUNT(*) as total FROM checkups WHERE MONTH(tanggal) = MONTH(CURDATE()) AND YEAR(tanggal) = YEAR(CURDATE())'
    );

    // Get average age
    const avgAgeResult = await getOne(
      'SELECT AVG(usia) as average FROM profiles'
    );

    // Get health statistics
    const healthStatsResult = await getOne(`
      SELECT 
        AVG(gula_darah) as avg_gula_darah,
        COUNT(CASE WHEN gula_darah > 200 THEN 1 END) as high_sugar_count,
        COUNT(CASE WHEN gula_darah < 70 THEN 1 END) as low_sugar_count
      FROM checkups 
      WHERE DATE(tanggal) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);

    // Get recent activities
    const recentActivitiesResult = await getMany(`
      SELECT 
        'checkup' as type,
        c.id,
        p.nama,
        c.tanggal as date,
        c.created_at
      FROM checkups c
      JOIN profiles p ON c.profile_id = p.id
      ORDER BY c.created_at DESC
      LIMIT 10
    `);

    // Get age distribution
    const ageDistributionResult = await getMany(`
      SELECT 
        CASE 
          WHEN usia BETWEEN 45 AND 54 THEN '45-54'
          WHEN usia BETWEEN 55 AND 64 THEN '55-64'
          WHEN usia BETWEEN 65 AND 74 THEN '65-74'
          WHEN usia >= 75 THEN '75+'
        END as age_group,
        COUNT(*) as count
      FROM profiles
      GROUP BY age_group
      ORDER BY age_group
    `);

    // Get monthly checkup trends (last 6 months)
    const monthlyTrendsResult = await getMany(`
      SELECT 
        DATE_FORMAT(tanggal, '%Y-%m') as month,
        COUNT(*) as checkup_count,
        AVG(gula_darah) as avg_gula_darah
      FROM checkups
      WHERE tanggal >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(tanggal, '%Y-%m')
      ORDER BY month DESC
    `);

    res.json({
      success: true,
      data: {
        overview: {
          totalProfiles: totalProfilesResult.success ? totalProfilesResult.data.total : 0,
          todayCheckups: todayCheckupsResult.success ? todayCheckupsResult.data.total : 0,
          monthlyCheckups: monthlyCheckupsResult.success ? monthlyCheckupsResult.data.total : 0,
          averageAge: avgAgeResult.success ? Math.round(avgAgeResult.data.average) : 0
        },
        healthStats: healthStatsResult.success ? {
          avgGulaDarah: Math.round(healthStatsResult.data.avg_gula_darah || 0),
          highSugarCount: healthStatsResult.data.high_sugar_count || 0,
          lowSugarCount: healthStatsResult.data.low_sugar_count || 0
        } : null,
        recentActivities: recentActivitiesResult.success ? recentActivitiesResult.data : [],
        ageDistribution: ageDistributionResult.success ? ageDistributionResult.data : [],
        monthlyTrends: monthlyTrendsResult.success ? monthlyTrendsResult.data : []
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
});

// @route   GET /api/dashboard/alerts
// @desc    Get health alerts and warnings
// @access  Private
router.get('/alerts', authenticate, async (req, res) => {
  try {
    // Get profiles with high blood sugar (last checkup > 200)
    const highSugarResult = await getMany(`
      SELECT 
        p.id,
        p.nama,
        p.usia,
        c.gula_darah,
        c.tanggal,
        'high_sugar' as alert_type,
        'Gula darah tinggi' as alert_message
      FROM profiles p
      JOIN checkups c ON p.id = c.profile_id
      WHERE c.id = (
        SELECT MAX(id) FROM checkups WHERE profile_id = p.id
      )
      AND c.gula_darah > 200
      ORDER BY c.gula_darah DESC
    `);

    // Get profiles with low blood sugar (last checkup < 70)
    const lowSugarResult = await getMany(`
      SELECT 
        p.id,
        p.nama,
        p.usia,
        c.gula_darah,
        c.tanggal,
        'low_sugar' as alert_type,
        'Gula darah rendah' as alert_message
      FROM profiles p
      JOIN checkups c ON p.id = c.profile_id
      WHERE c.id = (
        SELECT MAX(id) FROM checkups WHERE profile_id = p.id
      )
      AND c.gula_darah < 70
      ORDER BY c.gula_darah ASC
    `);

    // Get profiles without checkups in last 30 days
    const noRecentCheckupResult = await getMany(`
      SELECT 
        p.id,
        p.nama,
        p.usia,
        MAX(c.tanggal) as last_checkup,
        'no_recent_checkup' as alert_type,
        'Belum ada pemeriksaan dalam 30 hari' as alert_message
      FROM profiles p
      LEFT JOIN checkups c ON p.id = c.profile_id
      GROUP BY p.id, p.nama, p.usia
      HAVING last_checkup IS NULL OR last_checkup < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      ORDER BY last_checkup ASC
    `);

    // Combine all alerts
    const allAlerts = [
      ...(highSugarResult.success ? highSugarResult.data : []),
      ...(lowSugarResult.success ? lowSugarResult.data : []),
      ...(noRecentCheckupResult.success ? noRecentCheckupResult.data : [])
    ];

    res.json({
      success: true,
      data: {
        alerts: allAlerts,
        summary: {
          highSugar: highSugarResult.success ? highSugarResult.data.length : 0,
          lowSugar: lowSugarResult.success ? lowSugarResult.data.length : 0,
          noRecentCheckup: noRecentCheckupResult.success ? noRecentCheckupResult.data.length : 0,
          total: allAlerts.length
        }
      }
    });

  } catch (error) {
    console.error('Dashboard alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alerts'
    });
  }
});

// @route   GET /api/dashboard/reports
// @desc    Get health reports and analytics
// @access  Private
router.get('/reports', authenticate, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let dateFilter;
    switch (period) {
      case 'week':
        dateFilter = 'DATE(tanggal) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
        break;
      case 'month':
        dateFilter = 'DATE(tanggal) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
        break;
      case 'quarter':
        dateFilter = 'DATE(tanggal) >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)';
        break;
      case 'year':
        dateFilter = 'DATE(tanggal) >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)';
        break;
      default:
        dateFilter = 'DATE(tanggal) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    // Get blood sugar trends
    const sugarTrendsResult = await getMany(`
      SELECT 
        DATE(tanggal) as date,
        AVG(gula_darah) as avg_sugar,
        MIN(gula_darah) as min_sugar,
        MAX(gula_darah) as max_sugar,
        COUNT(*) as checkup_count
      FROM checkups
      WHERE ${dateFilter}
      GROUP BY DATE(tanggal)
      ORDER BY date DESC
    `);

    // Get blood pressure analysis
    const bpAnalysisResult = await getMany(`
      SELECT 
        tekanan_darah,
        COUNT(*) as count,
        DATE(tanggal) as date
      FROM checkups
      WHERE ${dateFilter}
      GROUP BY tekanan_darah, DATE(tanggal)
      ORDER BY date DESC
    `);

    // Get profile performance (most/least active)
    const profilePerformanceResult = await getMany(`
      SELECT 
        p.id,
        p.nama,
        p.usia,
        COUNT(c.id) as checkup_count,
        AVG(c.gula_darah) as avg_sugar,
        MAX(c.tanggal) as last_checkup
      FROM profiles p
      LEFT JOIN checkups c ON p.id = c.profile_id AND ${dateFilter}
      GROUP BY p.id, p.nama, p.usia
      ORDER BY checkup_count DESC
      LIMIT 20
    `);

    res.json({
      success: true,
      data: {
        period,
        sugarTrends: sugarTrendsResult.success ? sugarTrendsResult.data : [],
        bloodPressureAnalysis: bpAnalysisResult.success ? bpAnalysisResult.data : [],
        profilePerformance: profilePerformanceResult.success ? profilePerformanceResult.data : []
      }
    });

  } catch (error) {
    console.error('Dashboard reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
});

module.exports = router;
