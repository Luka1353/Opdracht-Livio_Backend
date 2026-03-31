const bcryptjs = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getConnection, sql } = require('../config/database');

const hashPassword = async (password) => {
    return bcryptjs.hash(password, 10);
};

const comparePassword = async (password, hash) => {
    return bcryptjs.compare(password, hash);
};

const register = async (email, password, fullName, role) => {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        // Check if email exists
        const existingUser = await new sql.Request(transaction)
            .input('email', sql.NVarChar(255), email)
            .query('SELECT id FROM dbo.Users WHERE email = @email');

        if (existingUser.recordset.length > 0) {
            throw new Error('Email already exists');
        }

        // Create user
        const userId = uuidv4();
        const passwordHash = await hashPassword(password);

        await new sql.Request(transaction)
            .input('id', sql.UniqueIdentifier, userId)
            .input('email', sql.NVarChar(255), email)
            .input('password_hash', sql.NVarChar(255), passwordHash)
            .input('role', sql.NVarChar(20), role)
            .query(
                'INSERT INTO dbo.Users (id, email, password_hash, role) VALUES (@id, @email, @password_hash, @role)'
            );

        // Create user profile
        await new sql.Request(transaction)
            .input('user_id', sql.UniqueIdentifier, userId)
            .input('full_name', sql.NVarChar(200), fullName)
            .query(
                'INSERT INTO dbo.UserProfiles (user_id, full_name) VALUES (@user_id, @full_name)'
            );

        // If client, create client record
        if (role === 'client') {
            const clientId = uuidv4();
            await new sql.Request(transaction)
                .input('id', sql.UniqueIdentifier, clientId)
                .input('user_id', sql.UniqueIdentifier, userId)
                .query(
                    'INSERT INTO dbo.Clients (id, user_id) VALUES (@id, @user_id)'
                );
        }

        await transaction.commit();

        return { userId, email, fullName, role };
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
};

const login = async (email, password) => {
    const pool = await getConnection();

    const result = await new sql.Request(pool)
        .input('email', sql.NVarChar(255), email)
        .query(`
      SELECT u.id, u.email, u.password_hash, u.role, u.is_active
      FROM dbo.Users u
      WHERE u.email = @email
    `);

    if (result.recordset.length === 0) {
        throw new Error('User not found');
    }

    const user = result.recordset[0];

    if (!user.is_active) {
        throw new Error('User account is inactive');
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
        throw new Error('Incorrect password');
    }

    return {
        userId: user.id,
        email: user.email,
        role: user.role,
    };
};



module.exports = {
    register,
    login,
};
