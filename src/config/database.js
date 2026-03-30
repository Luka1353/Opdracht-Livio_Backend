const sql = require('mssql');

const config = {
    server: process.env.DATABASE_HOST,
    database: process.env.DATABASE_NAME,
    authentication: {
        type: 'default',
        options: {
            userName: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
        },
    },
    options: {
        encrypt: process.env.DATABASE_ENCRYPT === 'true',
        trustServerCertificate: process.env.DATABASE_TRUST_CERT === 'true',
        enableKeepAlive: true,
        keepAliveInitialDelayMs: 0,
        instanceName: undefined,
    },
    pool: {
        max: parseInt(process.env.DATABASE_POOL_SIZE) || 10,
        min: 0,
        idleTimeoutMillis: 30000,
    },
};

let connectionPool = null;

async function getConnection() {
    if (!connectionPool) {
        try {
            connectionPool = new sql.ConnectionPool(config);
            await connectionPool.connect();
            console.log('✅ Database connected successfully');

            connectionPool.on('error', (err) => {
                console.error('❌ Database connection error:', err);
                connectionPool = null;
            });
        } catch (err) {
            console.error('❌ Failed to connect to database:', err);
            connectionPool = null;
            throw err;
        }
    }
    return connectionPool;
}

async function closeConnection() {
    if (connectionPool) {
        await connectionPool.close();
        connectionPool = null;
    }
}

module.exports = {
    getConnection,
    closeConnection,
    sql,
};
