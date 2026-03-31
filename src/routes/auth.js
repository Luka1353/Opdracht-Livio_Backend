const express = require('express');
const authService = require('../services/authService');

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

module.exports = router;
