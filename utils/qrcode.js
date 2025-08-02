const QRCode = require('qrcode');
require('dotenv').config();

// QR Code configuration
const qrConfig = {
  width: parseInt(process.env.QR_CODE_SIZE) || 200,
  margin: parseInt(process.env.QR_CODE_MARGIN) || 2,
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  },
  errorCorrectionLevel: 'M'
};

// Generate QR Code as Data URL (base64)
const generateQRCode = async (data) => {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(data, qrConfig);
    return {
      success: true,
      data: qrCodeDataURL
    };
  } catch (error) {
    console.error('QR Code generation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Generate QR Code as Buffer (for file saving)
const generateQRCodeBuffer = async (data) => {
  try {
    const buffer = await QRCode.toBuffer(data, qrConfig);
    return {
      success: true,
      data: buffer
    };
  } catch (error) {
    console.error('QR Code buffer generation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Generate QR Code as SVG
const generateQRCodeSVG = async (data) => {
  try {
    const svg = await QRCode.toString(data, {
      ...qrConfig,
      type: 'svg'
    });
    return {
      success: true,
      data: svg
    };
  } catch (error) {
    console.error('QR Code SVG generation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Create QR Code data for profile
const createProfileQRData = (profileId, profileName) => {
  const qrData = {
    type: 'profile',
    id: profileId,
    name: profileName,
    timestamp: new Date().toISOString(),
    app: 'lansia-health'
  };
  
  return JSON.stringify(qrData);
};

// Parse QR Code data
const parseQRData = (qrString) => {
  try {
    const data = JSON.parse(qrString);
    
    // Validate QR code structure
    if (!data.type || !data.id || data.app !== 'lansia-health') {
      return {
        success: false,
        error: 'Invalid QR code format'
      };
    }
    
    return {
      success: true,
      data: data
    };
  } catch (error) {
    // Try to parse as simple ID (backward compatibility)
    if (/^QR\d+$/.test(qrString)) {
      return {
        success: true,
        data: {
          type: 'profile',
          id: qrString.replace('QR', ''),
          legacy: true
        }
      };
    }
    
    return {
      success: false,
      error: 'Invalid QR code data'
    };
  }
};

// Generate unique QR code identifier
const generateQRId = (profileId) => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `QR${profileId}_${timestamp}_${random}`;
};

// Validate QR code format
const validateQRFormat = (qrString) => {
  if (!qrString || typeof qrString !== 'string') {
    return false;
  }
  
  // Check if it's JSON format
  try {
    const data = JSON.parse(qrString);
    return data.type && data.id && data.app === 'lansia-health';
  } catch (error) {
    // Check if it's legacy format
    return /^QR\d+/.test(qrString);
  }
};

// Create printable QR code with profile info
const createPrintableQR = async (profile) => {
  try {
    const qrData = createProfileQRData(profile.id, profile.nama);
    const qrCodeResult = await generateQRCode(qrData);
    
    if (!qrCodeResult.success) {
      return qrCodeResult;
    }
    
    return {
      success: true,
      data: {
        qr_code: generateQRId(profile.id),
        qrCode: qrCodeResult.data,
        profile: {
          id: profile.id,
          nama: profile.nama,
          usia: profile.usia,
          alamat: profile.alamat,
          no_telepon: profile.no_telepon,
          kontak_darurat: profile.kontak_darurat,
          riwayat_medis: profile.riwayat_medis,
          obat_rutin: profile.obat_rutin,
          alergi: profile.alergi
        },
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// Batch generate QR codes for multiple profiles
const batchGenerateQR = async (profiles) => {
  const results = [];
  
  for (const profile of profiles) {
    const result = await createPrintableQR(profile);
    results.push({
      profileId: profile.id,
      ...result
    });
  }
  
  return results;
};

module.exports = {
  generateQRCode,
  generateQRCodeBuffer,
  generateQRCodeSVG,
  createProfileQRData,
  parseQRData,
  generateQRId,
  validateQRFormat,
  createPrintableQR,
  batchGenerateQR
};
