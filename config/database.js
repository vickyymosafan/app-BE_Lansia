const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'app_lansia',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// Execute query with error handling
const executeQuery = async (query, params = []) => {
  try {
    const [results] = await pool.execute(query, params);
    return { success: true, data: results };
  } catch (error) {
    console.error('Database query error:', error);
    return { success: false, error: error.message };
  }
};

// Get single record
const getOne = async (query, params = []) => {
  const result = await executeQuery(query, params);
  if (result.success && result.data.length > 0) {
    return { success: true, data: result.data[0] };
  }
  return { success: false, error: 'Record not found' };
};

// Get multiple records
const getMany = async (query, params = []) => {
  return await executeQuery(query, params);
};

// Insert record
const insert = async (table, data) => {
  const fields = Object.keys(data).join(', ');
  const placeholders = Object.keys(data).map(() => '?').join(', ');
  const values = Object.values(data);
  
  const query = `INSERT INTO ${table} (${fields}) VALUES (${placeholders})`;
  const result = await executeQuery(query, values);
  
  if (result.success) {
    return { success: true, insertId: result.data.insertId };
  }
  return result;
};

// Update record
const update = async (table, data, whereClause, whereParams = []) => {
  const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
  const values = [...Object.values(data), ...whereParams];
  
  const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
  return await executeQuery(query, values);
};

// Delete record
const deleteRecord = async (table, whereClause, whereParams = []) => {
  const query = `DELETE FROM ${table} WHERE ${whereClause}`;
  return await executeQuery(query, whereParams);
};

// Transaction wrapper
const transaction = async (callback) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return { success: true, data: result };
  } catch (error) {
    await connection.rollback();
    console.error('Transaction error:', error);
    return { success: false, error: error.message };
  } finally {
    connection.release();
  }
};

module.exports = {
  pool,
  testConnection,
  executeQuery,
  getOne,
  getMany,
  insert,
  update,
  deleteRecord,
  transaction
};
