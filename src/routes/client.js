const express = require('express');
const { getConnection, sql } = require('../config/database');
const { verifyToken, verifyRole } = require('../middleware/auth');

const router = express.Router();

// Get client dashboard
router.get('/dashboard', verifyToken, verifyRole(['client']), async (req, res) => {
    try {
        const pool = await getConnection();

        const result = await new sql.Request(pool)
            .input('user_id', sql.UniqueIdentifier, req.user.userId)
            .query(`
        SELECT 
          c.points,
          c.streak_current,
          c.streak_best,
          p.full_name,
          c.room_number,
          (SELECT COUNT(*) FROM dbo.TaskCompletions tc 
           WHERE tc.client_id = c.id 
           AND CONVERT(DATE, tc.completed_at) = CONVERT(DATE, GETUTCDATE())) AS tasks_today,
          (SELECT COUNT(*) FROM dbo.TaskCompletions tc 
           WHERE tc.client_id = c.id) AS tasks_total
        FROM dbo.Clients c
        INNER JOIN dbo.Users u ON u.id = c.user_id
        INNER JOIN dbo.UserProfiles p ON p.user_id = u.id
        WHERE c.user_id = @user_id
      `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Client dashboard not found' });
        }

        res.json({ data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get client tasks
router.get('/tasks', verifyToken, verifyRole(['client']), async (req, res) => {
    try {
        const pool = await getConnection();

        const result = await new sql.Request(pool)
            .input('user_id', sql.UniqueIdentifier, req.user.userId)
            .query(`
        SELECT 
          t.id,
          t.title,
          t.description,
          t.points,
          t.layer,
          t.is_active
        FROM dbo.Tasks t
        INNER JOIN dbo.Clients c ON c.id = t.client_id
        WHERE c.user_id = @user_id AND t.is_active = 1
        ORDER BY t.created_at DESC
      `);

        res.json({ data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Complete task
router.post('/tasks/:taskId/complete', verifyToken, verifyRole(['client']), async (req, res) => {
    try {
        const pool = await getConnection();
        const { taskId } = req.params;

        // Get client ID
        const clientResult = await new sql.Request(pool)
            .input('user_id', sql.UniqueIdentifier, req.user.userId)
            .query('SELECT id FROM dbo.Clients WHERE user_id = @user_id');

        if (clientResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const clientId = clientResult.recordset[0].id;

        // Insert task completion
        const { v4: uuidv4 } = require('uuid');
        const completionId = uuidv4();

        await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, completionId)
            .input('task_id', sql.UniqueIdentifier, taskId)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .query(`
        INSERT INTO dbo.TaskCompletions (id, task_id, client_id)
        VALUES (@id, @task_id, @client_id)
      `);

        res.json({ message: 'Task completed', id: completionId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get rewards
router.get('/rewards', verifyToken, verifyRole(['client']), async (req, res) => {
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
        WHERE is_active = 1
        ORDER BY cost_points ASC
      `);

        res.json({ data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
