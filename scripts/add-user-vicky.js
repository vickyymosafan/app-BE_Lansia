const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'app_lansia',
  port: process.env.DB_PORT || 3306
};

async function addUserVicky() {
  let connection;
  
  try {
    // Create database connection
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');

    // User data
    const userData = {
      username: 'vicky1',
      password: 'vicky123',
      role: 'kader', // Using 'kader' since schema only supports 'admin' and 'kader'
      posyandu_name: 'Posyandu Vicky Test',
      pin: '654321'
    };

    // Check if user already exists
    const [existingUsers] = await connection.execute(
      'SELECT id, username FROM users WHERE username = ?',
      [userData.username]
    );

    if (existingUsers.length > 0) {
      console.log('⚠️  User "vicky" already exists');
      console.log('Existing user:', existingUsers[0]);
      return;
    }

    // Hash the password
    console.log('🔐 Hashing password...');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
    console.log('✅ Password hashed successfully');
    console.log('Hash:', hashedPassword);

    // Insert new user
    const [result] = await connection.execute(
      `INSERT INTO users (username, password, role, posyandu_name, pin, is_active, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        userData.username,
        hashedPassword,
        userData.role,
        userData.posyandu_name,
        userData.pin,
        true
      ]
    );

    console.log('✅ User "vicky" added successfully!');
    console.log('User ID:', result.insertId);
    console.log('Details:');
    console.log('- Username:', userData.username);
    console.log('- Password:', userData.password, '(plaintext for testing)');
    console.log('- Role:', userData.role);
    console.log('- Posyandu:', userData.posyandu_name);
    console.log('- PIN:', userData.pin);

    // Verify the user was created
    const [newUser] = await connection.execute(
      'SELECT id, username, role, posyandu_name, pin, is_active, created_at FROM users WHERE username = ?',
      [userData.username]
    );

    if (newUser.length > 0) {
      console.log('\n📋 Verification - User created:');
      console.log(newUser[0]);
    }

  } catch (error) {
    console.error('❌ Error adding user:', error.message);
    console.error('Full error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the script
if (require.main === module) {
  console.log('🚀 Starting user creation script...');
  addUserVicky()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { addUserVicky };
