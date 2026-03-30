const express = require('express');
const { getConnection, sql } = require('../config/database');
const { verifyToken, verifyRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Get all clients (admin only)
router.get('/clients', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        const pool = await getConnection();

        const result = await new sql.Request(pool)
            .query(`
        SELECT 
          c.id,
          c.user_id,
          p.full_name,
          c.room_number,
          c.birth_date,
          c.points,
          c.streak_current,
          c.streak_best,
          u.is_active
        FROM dbo.Clients c
        INNER JOIN dbo.Users u ON u.id = c.user_id
        INNER JOIN dbo.UserProfiles p ON p.user_id = u.id
        ORDER BY p.full_name
      `);

        res.json({ data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update client (admin only)
router.put('/clients/:clientId', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        const pool = await getConnection();
        const { clientId } = req.params;
        const { birthDate, roomNumber, points, streakCurrent, streakBest } = req.body;

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Get old values for audit
            const oldResult = await new sql.Request(transaction)
                .input('id', sql.UniqueIdentifier, clientId)
                .query(`
          SELECT birth_date, room_number, points, streak_current, streak_best
          FROM dbo.Clients WHERE id = @id
        `);

            const oldData = oldResult.recordset[0] || {};

            // Update client
            await new sql.Request(transaction)
                .input('id', sql.UniqueIdentifier, clientId)
                .input('birth_date', sql.Date, birthDate || null)
                .input('room_number', sql.NVarChar(50), roomNumber || null)
                .input('points', sql.Int, points !== undefined ? points : oldData.points)
                .input('streak_current', sql.Int, streakCurrent !== undefined ? streakCurrent : oldData.streak_current)
                .input('streak_best', sql.Int, streakBest !== undefined ? streakBest : oldData.streak_best)
                .query(`
          UPDATE dbo.Clients
          SET 
            birth_date = @birth_date,
            room_number = @room_number,
            points = @points,
            streak_current = @streak_current,
            streak_best = @streak_best
          WHERE id = @id
        `);

            // Log changes to audit table
            if (birthDate !== undefined && birthDate !== oldData.birth_date) {
                await new sql.Request(transaction)
                    .input('id', sql.UniqueIdentifier, uuidv4())
                    .input('client_id', sql.UniqueIdentifier, clientId)
                    .input('changed_by_user_id', sql.UniqueIdentifier, req.user.userId)
                    .input('field_name', sql.NVarChar(100), 'birth_date')
                    .input('old_value', sql.NVarChar(1000), oldData.birth_date?.toString() || null)
                    .input('new_value', sql.NVarChar(1000), birthDate?.toString() || null)
                    .query(`
            INSERT INTO dbo.ClientAuditLogs (id, client_id, changed_by_user_id, field_name, old_value, new_value)
            VALUES (@id, @client_id, @changed_by_user_id, @field_name, @old_value, @new_value)
          `);
            }

            if (roomNumber !== undefined && roomNumber !== oldData.room_number) {
                await new sql.Request(transaction)
                    .input('id', sql.UniqueIdentifier, uuidv4())
                    .input('client_id', sql.UniqueIdentifier, clientId)
                    .input('changed_by_user_id', sql.UniqueIdentifier, req.user.userId)
                    .input('field_name', sql.NVarChar(100), 'room_number')
                    .input('old_value', sql.NVarChar(1000), oldData.room_number || null)
                    .input('new_value', sql.NVarChar(1000), roomNumber || null)
                    .query(`
            INSERT INTO dbo.ClientAuditLogs (id, client_id, changed_by_user_id, field_name, old_value, new_value)
            VALUES (@id, @client_id, @changed_by_user_id, @field_name, @old_value, @new_value)
          `);
            }

            await transaction.commit();
            res.json({ message: 'Client updated successfully' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all tasks (admin)
router.get('/tasks', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        const pool = await getConnection();

        const result = await new sql.Request(pool)
            .query(`
        SELECT 
          t.id,
          t.client_id,
          t.title,
          t.description,
          t.points,
          t.layer,
          t.is_active
        FROM dbo.Tasks t
        ORDER BY t.created_at DESC
      `);

        res.json({ data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create task (admin)
router.post('/tasks', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        const pool = await getConnection();
        const { clientId, title, description, points, layer } = req.body;

        const taskId = uuidv4();

        await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, taskId)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .input('title', sql.NVarChar(200), title)
            .input('description', sql.NVarChar(1000), description || null)
            .input('points', sql.Int, points)
            .input('layer', sql.NVarChar(20), layer)
            .input('created_by_user_id', sql.UniqueIdentifier, req.user.userId)
            .query(`
        INSERT INTO dbo.Tasks (id, client_id, title, description, points, layer, created_by_user_id)
        VALUES (@id, @client_id, @title, @description, @points, @layer, @created_by_user_id)
      `);

        res.status(201).json({ message: 'Task created', id: taskId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all rewards (admin)
router.get('/rewards', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        const pool = await getConnection();

        const result = await new sql.Request(pool)
            .query(`
        SELECT 
          id,
          name,
          description,
          cost_points,
          is_active
        FROM dbo.Rewards
        ORDER BY cost_points ASC
      `);

        res.json({ data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create reward (admin)
router.post('/rewards', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        const pool = await getConnection();
        const { name, description, costPoints } = req.body;

        const rewardId = uuidv4();

        await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, rewardId)
            .input('name', sql.NVarChar(200), name)
            .input('description', sql.NVarChar(1000), description || null)
            .input('cost_points', sql.Int, costPoints)
            .input('created_by_user_id', sql.UniqueIdentifier, req.user.userId)
            .query(`
        INSERT INTO dbo.Rewards (id, name, description, cost_points, created_by_user_id)
        VALUES (@id, @name, @description, @cost_points, @created_by_user_id)
      `);

        res.status(201).json({ message: 'Reward created', id: rewardId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
