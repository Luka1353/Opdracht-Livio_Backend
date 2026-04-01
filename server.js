try {
    require('dotenv').config();
} catch (err) {
    console.warn('dotenv not available, using host environment variables');
}
const express = require('express');
const cors = require('cors');
const { getConnection, closeConnection } = require('./src/config/database');

const authRoutes = require('./src/routes/auth');
const clientRoutes = require('./src/routes/client');
const familyRoutes = require('./src/routes/family');
const adminRoutes = require('./src/routes/admin');

const app = express();
let databaseReady = false;

// Middleware
app.use(express.json());
app.use(cors());

// Health check
app.get('/health', (req, res) => {
    res.status(databaseReady ? 200 : 503).json({
        message: 'Backend is running',
        database: databaseReady ? 'connected' : 'disconnected',
    });
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
    app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
    });

    try {
        await getConnection();
        databaseReady = true;
    } catch (err) {
        databaseReady = false;
        console.error('❌ Database connection failed at startup:', err);
    }
};

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n Shutting down gracefully...');
    await closeConnection();
    process.exit(0);
});
