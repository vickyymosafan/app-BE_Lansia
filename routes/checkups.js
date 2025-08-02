const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { 
  validateCheckupCreation, 
  validateId,
  validatePagination 
} = require('../middleware/validation');
const { getOne, getMany, insert, update, deleteRecord } = require('../config/database');

// @route   GET /api/checkups
// @desc    Get all checkups with pagination
// @access  Private
router.get('/', authenticate, validatePagination, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const profileId = req.query.profile_id;
    const offset = (page - 1) * limit;

    let query = `
      SELECT c.*, p.nama, p.usia 
      FROM checkups c
      JOIN profiles p ON c.profile_id = p.id
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM checkups c
      JOIN profiles p ON c.profile_id = p.id
    `;
    
    let params = [];

    if (profileId) {
      query += ' WHERE c.profile_id = ?';
      countQuery += ' WHERE c.profile_id = ?';
      params.push(profileId);
    }

    query += ` ORDER BY c.tanggal DESC, c.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    // Get checkups
    const checkupsResult = await getMany(query, params);
    
    // Get total count
    const countParams = profileId ? [profileId] : [];
    const countResult = await getOne(countQuery, countParams);

    if (!checkupsResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch checkups'
      });
    }

    const totalRecords = countResult.success ? countResult.data.total : 0;
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      data: {
        checkups: checkupsResult.data,
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
    console.error('Get checkups error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch checkups'
    });
  }
});

// @route   GET /api/checkups/:id
// @desc    Get single checkup
// @access  Private
router.get('/:id', authenticate, validateId, async (req, res) => {
  try {
    const checkupId = req.params.id;

    const checkupResult = await getOne(`
      SELECT c.*, p.nama, p.usia, p.alamat 
      FROM checkups c
      JOIN profiles p ON c.profile_id = p.id
      WHERE c.id = ?
    `, [checkupId]);

    if (!checkupResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Checkup not found'
      });
    }

    res.json({
      success: true,
      data: checkupResult.data
    });

  } catch (error) {
    console.error('Get checkup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch checkup'
    });
  }
});

// @route   POST /api/checkups
// @desc    Create new checkup
// @access  Private
router.post('/', authenticate, validateCheckupCreation, async (req, res) => {
  try {
    const {
      profile_id,
      tekanan_darah,
      gula_darah,
      berat_badan,
      tinggi_badan,
      keluhan,
      tanggal,
      catatan
    } = req.body;

    // Verify profile exists
    const profileResult = await getOne(
      'SELECT id, nama FROM profiles WHERE id = ?',
      [profile_id]
    );

    if (!profileResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Create checkup
    const checkupData = {
      profile_id,
      tekanan_darah,
      gula_darah,
      berat_badan: berat_badan || null,
      tinggi_badan: tinggi_badan || null,
      keluhan: keluhan || null,
      tanggal,
      catatan: catatan || null
    };

    const result = await insert('checkups', checkupData);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create checkup'
      });
    }

    // Get created checkup with profile info
    const checkupResult = await getOne(`
      SELECT c.*, p.nama, p.usia 
      FROM checkups c
      JOIN profiles p ON c.profile_id = p.id
      WHERE c.id = ?
    `, [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Checkup created successfully',
      data: checkupResult.data
    });

  } catch (error) {
    console.error('Create checkup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkup'
    });
  }
});

// @route   PUT /api/checkups/:id
// @desc    Update checkup
// @access  Private
router.put('/:id', authenticate, validateId, async (req, res) => {
  try {
    const checkupId = req.params.id;
    const updateData = {};

    // Only include provided fields
    const allowedFields = ['tekanan_darah', 'gula_darah', 'berat_badan', 'tinggi_badan', 'keluhan', 'tanggal', 'catatan'];
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

    // Validate blood pressure format if provided
    if (updateData.tekanan_darah && !/^\d{2,3}\/\d{2,3}$/.test(updateData.tekanan_darah)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid blood pressure format'
      });
    }

    // Validate blood sugar range if provided
    if (updateData.gula_darah && (updateData.gula_darah < 50 || updateData.gula_darah > 500)) {
      return res.status(400).json({
        success: false,
        message: 'Blood sugar must be between 50 and 500 mg/dL'
      });
    }

    const result = await update('checkups', updateData, 'id = ?', [checkupId]);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update checkup'
      });
    }

    // Get updated checkup
    const checkupResult = await getOne(`
      SELECT c.*, p.nama, p.usia 
      FROM checkups c
      JOIN profiles p ON c.profile_id = p.id
      WHERE c.id = ?
    `, [checkupId]);

    res.json({
      success: true,
      message: 'Checkup updated successfully',
      data: checkupResult.data
    });

  } catch (error) {
    console.error('Update checkup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update checkup'
    });
  }
});

// @route   DELETE /api/checkups/:id
// @desc    Delete checkup
// @access  Private (Admin only)
router.delete('/:id', authenticate, validateId, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can delete checkups'
      });
    }

    const checkupId = req.params.id;

    // Check if checkup exists
    const checkupResult = await getOne(
      'SELECT id FROM checkups WHERE id = ?',
      [checkupId]
    );

    if (!checkupResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Checkup not found'
      });
    }

    // Delete checkup
    const result = await deleteRecord('checkups', 'id = ?', [checkupId]);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete checkup'
      });
    }

    res.json({
      success: true,
      message: 'Checkup deleted successfully'
    });

  } catch (error) {
    console.error('Delete checkup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete checkup'
    });
  }
});

module.exports = router;
