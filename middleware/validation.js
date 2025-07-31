const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User validation rules
const validateUserRegistration = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  body('posyandu_name')
    .isLength({ min: 3, max: 100 })
    .withMessage('Posyandu name must be between 3 and 100 characters'),
  
  body('pin')
    .optional()
    .isLength({ min: 4, max: 6 })
    .withMessage('PIN must be between 4 and 6 digits')
    .isNumeric()
    .withMessage('PIN must contain only numbers'),
  
  handleValidationErrors
];

const validateUserLogin = [
  body('username')
    .notEmpty()
    .withMessage('Username is required'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors
];

// Profile validation rules
const validateProfileCreation = [
  body('nama')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s\.]+$/)
    .withMessage('Name can only contain letters, spaces, and dots'),

  body('usia')
    .isInt({ min: 45, max: 120 })
    .withMessage('Age must be between 45 and 120 years'),

  body('alamat')
    .isLength({ min: 10, max: 500 })
    .withMessage('Address must be between 10 and 500 characters'),

  body('no_telepon')
    .optional()
    .matches(/^[0-9+\-\s()]+$/)
    .withMessage('Phone number can only contain numbers, +, -, spaces, and parentheses')
    .isLength({ min: 8, max: 20 })
    .withMessage('Phone number must be between 8 and 20 characters'),

  body('kontak_darurat')
    .optional()
    .matches(/^[0-9+\-\s()]+$/)
    .withMessage('Emergency contact can only contain numbers, +, -, spaces, and parentheses')
    .isLength({ min: 8, max: 20 })
    .withMessage('Emergency contact must be between 8 and 20 characters'),

  body('riwayat_penyakit')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Medical history must not exceed 1000 characters'),

  body('obat_rutin')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Regular medications must not exceed 1000 characters'),

  body('alergi')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Allergies must not exceed 500 characters'),

  handleValidationErrors
];

const validateProfileUpdate = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid profile ID'),
  
  body('nama')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('usia')
    .optional()
    .isInt({ min: 45, max: 120 })
    .withMessage('Age must be between 45 and 120 years'),
  
  body('alamat')
    .optional()
    .isLength({ min: 10, max: 500 })
    .withMessage('Address must be between 10 and 500 characters'),
  
  body('riwayat_medis')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Medical history must not exceed 1000 characters'),
  
  handleValidationErrors
];

// Checkup validation rules
const validateCheckupCreation = [
  body('profile_id')
    .isInt({ min: 1 })
    .withMessage('Valid profile ID is required'),
  
  body('tekanan_darah')
    .matches(/^\d{2,3}\/\d{2,3}$/)
    .withMessage('Blood pressure must be in format XXX/YY (e.g., 120/80)'),
  
  body('gula_darah')
    .isInt({ min: 50, max: 500 })
    .withMessage('Blood sugar must be between 50 and 500 mg/dL'),
  
  body('tanggal')
    .isISO8601()
    .withMessage('Date must be in valid ISO format (YYYY-MM-DD)')
    .custom((value) => {
      const date = new Date(value);
      const today = new Date();
      if (date > today) {
        throw new Error('Date cannot be in the future');
      }
      return true;
    }),
  
  body('catatan')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters'),
  
  handleValidationErrors
];

// Query parameter validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors
];

const validateSearch = [
  query('search')
    .optional()
    .custom((value) => {
      // Allow empty string or valid search term
      if (value === '' || (typeof value === 'string' && value.length >= 1 && value.length <= 100)) {
        return true;
      }
      throw new Error('Search term must be between 1 and 100 characters');
    })
    .escape(),

  handleValidationErrors
];

// ID parameter validation
const validateId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid ID parameter'),
  
  handleValidationErrors
];

// QR Code validation
const validateQRCode = [
  body('qr_code')
    .notEmpty()
    .withMessage('QR code is required')
    .isLength({ min: 3, max: 255 })
    .withMessage('QR code must be between 3 and 255 characters'),
  
  handleValidationErrors
];

// Custom validation for blood pressure format
const validateBloodPressure = (value) => {
  const parts = value.split('/');
  if (parts.length !== 2) return false;
  
  const systolic = parseInt(parts[0]);
  const diastolic = parseInt(parts[1]);
  
  return systolic >= 70 && systolic <= 250 && 
         diastolic >= 40 && diastolic <= 150 &&
         systolic > diastolic;
};

module.exports = {
  handleValidationErrors,
  validateUserRegistration,
  validateUserLogin,
  validateProfileCreation,
  validateProfileUpdate,
  validateCheckupCreation,
  validatePagination,
  validateSearch,
  validateId,
  validateQRCode,
  validateBloodPressure
};
