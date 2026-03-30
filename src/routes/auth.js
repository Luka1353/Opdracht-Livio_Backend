const express = require('express');
const authService = require('../services/authService');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, password, fullName, role } = req.body;

        if (!email || !password || !fullName || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!['client', 'family'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const user = await authService.register(email, password, fullName, role);

        res.status(201).json({
            message: 'User registered successfully',
            user,
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const result = await authService.login(email, password);

        res.json({
            message: 'Login successful',
            data: result,
        });
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

// Refresh token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        const tokens = await authService.refreshAccessToken(refreshToken);

        res.json({
            message: 'Token refreshed',
            data: tokens,
        });
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

// Logout
router.post('/logout', verifyToken, async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        await authService.logout(refreshToken);

        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
