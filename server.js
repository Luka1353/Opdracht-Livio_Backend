require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getConnection, closeConnection } = require('./src/config/database');

const authRoutes = require('./src/routes/auth');
const clientRoutes = require('./src/routes/client');
const familyRoutes = require('./src/routes/family');
const adminRoutes = require('./src/routes/admin');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Health check
app.get('/health', (req, res) => {
    res.json({ message: 'Backend is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await getConnection();
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
};

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n Shutting down gracefully...');
    await closeConnection();
    process.exit(0);
});
