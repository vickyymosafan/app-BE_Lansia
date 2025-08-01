const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'app_lansia',
  port: process.env.DB_PORT || 3306
};

async function cleanupUsers() {
  let connection;
  
  try {
    // Create database connection
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');

    // First, list all current users
    console.log('\n📋 Current users in database:');
    const [currentUsers] = await connection.execute(
      'SELECT id, username, role, posyandu_name, is_active, created_at FROM users ORDER BY id'
    );
    
    if (currentUsers.length === 0) {
      console.log('⚠️  No users found in database');
      return;
    }

    console.table(currentUsers);
    console.log(`Total users: ${currentUsers.length}`);

    // Find admin user
    const adminUsers = currentUsers.filter(user => user.username === 'admin');
    if (adminUsers.length === 0) {
      console.log('❌ ERROR: No admin user found! Cannot proceed with cleanup.');
      console.log('Please ensure an admin user exists before running this script.');
      return;
    }

    if (adminUsers.length > 1) {
      console.log('⚠️  WARNING: Multiple admin users found:');
      console.table(adminUsers);
    }

    const adminUser = adminUsers[0];
    console.log(`\n🔐 Admin user identified: ${adminUser.username} (ID: ${adminUser.id})`);

    // Count non-admin users
    const nonAdminUsers = currentUsers.filter(user => user.username !== 'admin');
    console.log(`\n🗑️  Users to be deleted: ${nonAdminUsers.length}`);
    
    if (nonAdminUsers.length === 0) {
      console.log('✅ No non-admin users found. Database is already clean.');
      return;
    }

    console.log('Users that will be deleted:');
    console.table(nonAdminUsers.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      posyandu_name: user.posyandu_name
    })));

    // Perform deletion
    console.log('\n🚀 Starting user cleanup...');
    const [deleteResult] = await connection.execute(
      'DELETE FROM users WHERE username != ?',
      ['admin']
    );

    console.log(`✅ Cleanup completed successfully!`);
    console.log(`📊 Users deleted: ${deleteResult.affectedRows}`);

    // Verify cleanup
    console.log('\n🔍 Verifying cleanup...');
    const [remainingUsers] = await connection.execute(
      'SELECT id, username, role, posyandu_name, is_active, created_at FROM users ORDER BY id'
    );

    console.log('\n📋 Remaining users after cleanup:');
    console.table(remainingUsers);
    console.log(`Total remaining users: ${remainingUsers.length}`);

    if (remainingUsers.length === 1 && remainingUsers[0].username === 'admin') {
      console.log('🎉 SUCCESS: Only admin user remains in the database!');
      console.log('✅ User cleanup completed successfully.');
    } else {
      console.log('⚠️  WARNING: Unexpected users remain after cleanup.');
    }

  } catch (error) {
    console.error('❌ Error during user cleanup:', error.message);
    console.error('Full error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run the cleanup
console.log('🧹 Starting User Cleanup Script');
console.log('================================');
console.log('This script will remove all users except the admin user.');
console.log('Database:', dbConfig.database);
console.log('Host:', dbConfig.host);
console.log('================================\n');

cleanupUsers()
  .then(() => {
    console.log('\n✅ Script execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script execution failed:', error);
    process.exit(1);
  });
