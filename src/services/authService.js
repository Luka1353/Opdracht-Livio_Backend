const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getConnection, sql } = require('../config/database');

const generateTokens = (userId, role) => {
    const accessToken = jwt.sign(
        { userId, role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRES }
    );

    const refreshToken = jwt.sign(
        { userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES }
    );

    return { accessToken, refreshToken };
};

const hashPassword = async (password) => {
    return bcryptjs.hash(password, 10);
};

const comparePassword = async (password, hash) => {
    return bcryptjs.compare(password, hash);
};

const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
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

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);

    // Store refresh token hash
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    const tokenHash = hashToken(refreshToken);
    const transactionId = uuidv4();

    await new sql.Request(pool)
        .input('id', sql.UniqueIdentifier, transactionId)
        .input('user_id', sql.UniqueIdentifier, user.id)
        .input('token_hash', sql.NVarChar(128), tokenHash)
        .input('expires_at', sql.DateTime2, expiresAt)
        .input('created_ip', sql.NVarChar(64), '')
        .input('user_agent', sql.NVarChar(300), '')
        .query(`
      INSERT INTO dbo.RefreshTokens (id, user_id, token_hash, expires_at, created_ip, user_agent)
      VALUES (@id, @user_id, @token_hash, @expires_at, @created_ip, @user_agent)
    `);

    return {
        userId: user.id,
        email: user.email,
        role: user.role,
        accessToken,
        refreshToken,
    };
};

const refreshAccessToken = async (refreshToken) => {
    const pool = await getConnection();

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const tokenHash = hashToken(refreshToken);

        const result = await new sql.Request(pool)
            .input('token_hash', sql.NVarChar(128), tokenHash)
            .query(`
        SELECT user_id, expires_at, revoked_at
        FROM dbo.RefreshTokens
        WHERE token_hash = @token_hash
      `);

        if (result.recordset.length === 0) {
            throw new Error('Refresh token not found');
        }

        const tokenRecord = result.recordset[0];

        if (tokenRecord.revoked_at) {
            throw new Error('Refresh token has been revoked');
        }

        if (new Date() > new Date(tokenRecord.expires_at)) {
            throw new Error('Refresh token has expired');
        }

        // Get user role
        const userResult = await new sql.Request(pool)
            .input('user_id', sql.UniqueIdentifier, decoded.userId)
            .query('SELECT role FROM dbo.Users WHERE id = @user_id');

        const userRole = userResult.recordset[0]?.role;
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
            generateTokens(decoded.userId, userRole);

        // Revoke old token and store new one
        const newTokenHash = hashToken(newRefreshToken);
        const newTokenId = uuidv4();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            await new sql.Request(transaction)
                .input('revoked_at', sql.DateTime2, new Date())
                .input('replaced_by_hash', sql.NVarChar(128), newTokenHash)
                .input('token_hash', sql.NVarChar(128), tokenHash)
                .query(`
          UPDATE dbo.RefreshTokens
          SET revoked_at = @revoked_at, replaced_by_hash = @replaced_by_hash
          WHERE token_hash = @token_hash
        `);

            await new sql.Request(transaction)
                .input('id', sql.UniqueIdentifier, newTokenId)
                .input('user_id', sql.UniqueIdentifier, decoded.userId)
                .input('token_hash', sql.NVarChar(128), newTokenHash)
                .input('expires_at', sql.DateTime2, expiresAt)
                .query(`
          INSERT INTO dbo.RefreshTokens (id, user_id, token_hash, expires_at)
          VALUES (@id, @user_id, @token_hash, @expires_at)
        `);

            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        };
    } catch (err) {
        throw new Error('Invalid refresh token: ' + err.message);
    }
};

const logout = async (refreshToken) => {
    const pool = await getConnection();
    const tokenHash = hashToken(refreshToken);

    await new sql.Request(pool)
        .input('revoked_at', sql.DateTime2, new Date())
        .input('token_hash', sql.NVarChar(128), tokenHash)
        .query(`
      UPDATE dbo.RefreshTokens
      SET revoked_at = @revoked_at
      WHERE token_hash = @token_hash
    `);
};

module.exports = {
    register,
    login,
    refreshAccessToken,
    logout,
    generateTokens,
};
