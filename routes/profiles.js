const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { 
  validateProfileCreation, 
  validateProfileUpdate, 
  validateId,
  validatePagination,
  validateSearch 
} = require('../middleware/validation');
const { getOne, getMany, insert, update, deleteRecord, transaction } = require('../config/database');
const { createPrintableQR, generateQRId } = require('../utils/qrcode');

// @route   GET /api/profiles
// @desc    Get all profiles with pagination and search
// @access  Private
router.get('/', authenticate, validatePagination, validateSearch, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.*, 
             COUNT(c.id) as total_checkups,
             MAX(c.tanggal) as last_checkup_date
      FROM profiles p
      LEFT JOIN checkups c ON p.id = c.profile_id
    `;
    
    let countQuery = 'SELECT COUNT(*) as total FROM profiles p';
    let params = [];

    if (search) {
      const searchCondition = ' WHERE p.nama LIKE ? OR p.alamat LIKE ?';
      query += searchCondition;
      countQuery += searchCondition;
      params = [`%${search}%`, `%${search}%`];
    }

    query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    // Get profiles
    const profilesResult = await getMany(query, params);
    
    // Get total count
    const countResult = await getOne(countQuery, search ? [`%${search}%`, `%${search}%`] : []);

    if (!profilesResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch profiles'
      });
    }

    const totalRecords = countResult.success ? countResult.data.total : 0;
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      data: {
        profiles: profilesResult.data,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords,
          limit,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get profiles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profiles'
    });
  }
});

// @route   GET /api/profiles/:id
// @desc    Get single profile with checkup history
// @access  Private
router.get('/:id', authenticate, validateId, async (req, res) => {
  try {
    const profileId = req.params.id;

    // Get profile
    const profileResult = await getOne(
      'SELECT * FROM profiles WHERE id = ?',
      [profileId]
    );

    if (!profileResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Get checkup history
    const checkupsResult = await getMany(
      'SELECT * FROM checkups WHERE profile_id = ? ORDER BY tanggal DESC',
      [profileId]
    );

    // Get statistics
    const statsResult = await getOne(`
      SELECT 
        COUNT(*) as total_checkups,
        AVG(gula_darah) as avg_gula_darah,
        MIN(tanggal) as first_checkup,
        MAX(tanggal) as last_checkup
      FROM checkups 
      WHERE profile_id = ?
    `, [profileId]);

    res.json({
      success: true,
      data: {
        profile: profileResult.data,
        checkups: checkupsResult.success ? checkupsResult.data : [],
        statistics: statsResult.success ? statsResult.data : null
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// @route   POST /api/profiles
// @desc    Create new profile
// @access  Private
router.post('/', authenticate, validateProfileCreation, async (req, res) => {
  try {
    const {
      nama,
      usia,
      alamat,
      no_telepon,
      kontak_darurat,
      riwayat_penyakit,
      obat_rutin,
      alergi,
      checkup_data
    } = req.body;

    const result = await transaction(async (connection) => {
      // Insert profile
      const [profileResult] = await connection.execute(
        'INSERT INTO profiles (nama, usia, alamat, no_telepon, kontak_darurat, riwayat_medis, obat_rutin, alergi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [nama, usia, alamat, no_telepon || null, kontak_darurat || null, riwayat_penyakit || null, obat_rutin || null, alergi || null]
      );

      const profileId = profileResult.insertId;

      // Generate QR code
      const qrId = generateQRId(profileId);
      await connection.execute(
        'UPDATE profiles SET qr_code = ? WHERE id = ?',
        [qrId, profileId]
      );

      // Insert initial checkup if provided
      if (checkup_data) {
        const { tekanan_darah, gula_darah, tanggal, catatan } = checkup_data;
        await connection.execute(
          'INSERT INTO checkups (profile_id, tekanan_darah, gula_darah, tanggal, catatan) VALUES (?, ?, ?, ?, ?)',
          [profileId, tekanan_darah, gula_darah, tanggal, catatan || null]
        );
      }

      return { profileId, qrId };
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create profile'
      });
    }

    // Get created profile
    const profileResult = await getOne(
      'SELECT * FROM profiles WHERE id = ?',
      [result.data.profileId]
    );

    // Generate QR code for response
    const qrResult = await createPrintableQR(profileResult.data);

    res.status(201).json({
      success: true,
      message: 'Profile created successfully',
      data: {
        profile: profileResult.data,
        qrCode: qrResult.success ? qrResult.data : null
      }
    });

  } catch (error) {
    console.error('Create profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create profile'
    });
  }
});

// @route   PUT /api/profiles/:id
// @desc    Update profile
// @access  Private
router.put('/:id', authenticate, validateProfileUpdate, async (req, res) => {
  try {
    const profileId = req.params.id;
    const updateData = {};

    // Only include provided fields
    const allowedFields = ['nama', 'usia', 'alamat', 'no_telepon', 'kontak_darurat', 'riwayat_medis', 'obat_rutin', 'alergi'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    const result = await update('profiles', updateData, 'id = ?', [profileId]);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update profile'
      });
    }

    // Get updated profile
    const profileResult = await getOne(
      'SELECT * FROM profiles WHERE id = ?',
      [profileId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: profileResult.data
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// @route   DELETE /api/profiles/:id
// @desc    Delete profile
// @access  Private (Admin only)
router.delete('/:id', authenticate, validateId, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can delete profiles'
      });
    }

    const profileId = req.params.id;

    // Check if profile exists
    const profileResult = await getOne(
      'SELECT id, nama FROM profiles WHERE id = ?',
      [profileId]
    );

    if (!profileResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Delete profile (checkups will be deleted automatically due to CASCADE)
    const result = await deleteRecord('profiles', 'id = ?', [profileId]);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete profile'
      });
    }

    res.json({
      success: true,
      message: 'Profile deleted successfully'
    });

  } catch (error) {
    console.error('Delete profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete profile'
    });
  }
});

// @route   GET /api/profiles/:id/qr
// @desc    Get QR code for profile
// @access  Private
router.get('/:id/qr', authenticate, validateId, async (req, res) => {
  try {
    const profileId = req.params.id;

    const profileResult = await getOne(
      'SELECT * FROM profiles WHERE id = ?',
      [profileId]
    );

    if (!profileResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const qrResult = await createPrintableQR(profileResult.data);

    if (!qrResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate QR code'
      });
    }

    res.json({
      success: true,
      data: qrResult.data
    });

  } catch (error) {
    console.error('Get QR code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code'
    });
  }
});

// @route   GET /api/profiles/:id/charts
// @desc    Get chart data for profile
// @access  Private
router.get('/:id/charts', authenticate, validateId, async (req, res) => {
  try {
    const profileId = req.params.id;
    const period = req.query.period || '3m'; // Default to 3 months

    // Verify profile exists
    const profileResult = await getOne(
      'SELECT id, nama, usia FROM profiles WHERE id = ?',
      [profileId]
    );

    if (!profileResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Calculate date range based on period
    let dateFilter = '';
    switch (period) {
      case '1m':
        dateFilter = 'tanggal >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
        break;
      case '3m':
        dateFilter = 'tanggal >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)';
        break;
      case '6m':
        dateFilter = 'tanggal >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)';
        break;
      case '1y':
        dateFilter = 'tanggal >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
        break;
      default:
        dateFilter = 'tanggal >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)';
    }

    // Get checkup data for charts
    const checkupsResult = await getMany(`
      SELECT
        tanggal,
        gula_darah,
        tekanan_darah,
        berat_badan,
        tinggi_badan,
        DATE_FORMAT(tanggal, '%d/%m') as formatted_date,
        DATE_FORMAT(tanggal, '%Y-%m') as month_year
      FROM checkups
      WHERE profile_id = ? AND ${dateFilter}
      ORDER BY tanggal ASC
    `, [profileId]);

    if (!checkupsResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch checkup data'
      });
    }

    const checkups = checkupsResult.data;

    // Process data for charts
    const labels = checkups.map(c => c.formatted_date);
    const bloodSugarData = checkups.map(c => c.gula_darah);

    // Parse blood pressure data
    const bloodPressureData = checkups.map(c => {
      if (c.tekanan_darah && typeof c.tekanan_darah === 'string') {
        const parts = c.tekanan_darah.split('/');
        return parts.length === 2 ? parseInt(parts[0]) : 0;
      }
      return 0;
    });

    // Calculate BMI data
    const bmiData = checkups.map(c => {
      if (c.berat_badan && c.tinggi_badan && c.berat_badan > 0 && c.tinggi_badan > 0) {
        const heightInMeters = c.tinggi_badan / 100;
        return parseFloat((c.berat_badan / (heightInMeters * heightInMeters)).toFixed(1));
      }
      return 0;
    });

    // Get monthly stats
    const monthlyStatsResult = await getMany(`
      SELECT
        DATE_FORMAT(tanggal, '%m/%y') as month_label,
        COUNT(*) as checkup_count
      FROM checkups
      WHERE profile_id = ? AND ${dateFilter}
      GROUP BY DATE_FORMAT(tanggal, '%Y-%m')
      ORDER BY DATE_FORMAT(tanggal, '%Y-%m') ASC
    `, [profileId]);

    const monthlyStats = monthlyStatsResult.success ? monthlyStatsResult.data : [];

    res.json({
      success: true,
      data: {
        profile: profileResult.data,
        bloodSugarTrend: {
          labels: labels,
          datasets: [{
            data: bloodSugarData.length > 0 ? bloodSugarData : [0]
          }]
        },
        bloodPressureTrend: {
          labels: labels,
          datasets: [{
            data: bloodPressureData.length > 0 ? bloodPressureData : [0]
          }]
        },
        bmiTrend: {
          labels: labels,
          datasets: [{
            data: bmiData.length > 0 ? bmiData : [0]
          }]
        },
        monthlyStats: {
          labels: monthlyStats.map(m => m.month_label),
          datasets: [{
            data: monthlyStats.map(m => m.checkup_count)
          }]
        }
      }
    });

  } catch (error) {
    console.error('Charts generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate charts data'
    });
  }
});

// @route   POST /api/profiles/scan
// @desc    Get profile by QR code scan
// @access  Private
router.post('/scan', authenticate, async (req, res) => {
  try {
    const { qr_data } = req.body;

    if (!qr_data) {
      return res.status(400).json({
        success: false,
        message: 'QR data is required'
      });
    }

    // Try to parse QR data
    let profileId;
    try {
      const qrObj = JSON.parse(qr_data);
      profileId = qrObj.id;
    } catch (error) {
      // Handle legacy format
      if (qr_data.startsWith('QR')) {
        profileId = qr_data.replace('QR', '');
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid QR code format'
        });
      }
    }

    // Get profile
    const profileResult = await getOne(
      'SELECT * FROM profiles WHERE id = ?',
      [profileId]
    );

    if (!profileResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Get recent checkups
    const checkupsResult = await getMany(
      'SELECT * FROM checkups WHERE profile_id = ? ORDER BY tanggal DESC LIMIT 5',
      [profileId]
    );

    res.json({
      success: true,
      data: {
        profile: profileResult.data,
        recentCheckups: checkupsResult.success ? checkupsResult.data : []
      }
    });

  } catch (error) {
    console.error('QR scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process QR scan'
    });
  }
});

module.exports = router;
