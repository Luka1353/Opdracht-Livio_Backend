const express = require('express');
const { getConnection, sql } = require('../config/database');

const router = express.Router();

// Get client dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(400).json({ error: 'User ID required in x-user-id header' });
        }

        const pool = await getConnection();

        const result = await new sql.Request(pool)
            .input('user_id', sql.UniqueIdentifier, userId)
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
router.get('/tasks', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(400).json({ error: 'User ID required in x-user-id header' });
        }

        const pool = await getConnection();

        const result = await new sql.Request(pool)
            .input('user_id', sql.UniqueIdentifier, userId)
            .query(`
        SELECT 
          t.id,
          t.title,
          t.description,
          t.image_url,
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
router.post('/tasks/:taskId/complete', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(400).json({ error: 'User ID required in x-user-id header' });
        }

        const pool = await getConnection();
        const { taskId } = req.params;

        // Get client ID
        const clientResult = await new sql.Request(pool)
            .input('user_id', sql.UniqueIdentifier, userId)
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
router.get('/rewards', async (req, res) => {
    try {
        const pool = await getConnection();

        const result = await new sql.Request(pool)
            .query(`
        SELECT 
          id,
          name,
          description,
          cost_points,
          image_url,
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

// Redeem reward
router.post('/rewards/:rewardId/redeem', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(400).json({ error: 'User ID required in x-user-id header' });
        }

        const pool = await getConnection();
        const { rewardId } = req.params;

        // Get client ID and current points
        const clientResult = await new sql.Request(pool)
            .input('user_id', sql.UniqueIdentifier, userId)
            .query('SELECT id, points FROM dbo.Clients WHERE user_id = @user_id');

        if (clientResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const clientId = clientResult.recordset[0].id;
        const currentPoints = clientResult.recordset[0].points;

        // Get reward details
        const rewardResult = await new sql.Request(pool)
            .input('reward_id', sql.UniqueIdentifier, rewardId)
            .query('SELECT cost_points FROM dbo.Rewards WHERE id = @reward_id');

        if (rewardResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Reward not found' });
        }

        const costPoints = rewardResult.recordset[0].cost_points;

        // Check if client has enough points
        if (currentPoints < costPoints) {
            return res.status(400).json({ error: 'Not enough points' });
        }

        // Deduct points and create redemption record
        const { v4: uuidv4 } = require('uuid');
        const redemptionId = uuidv4();
        const newPoints = currentPoints - costPoints;

        await new sql.Request(pool)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .input('new_points', sql.Int, newPoints)
            .input('redemption_id', sql.UniqueIdentifier, redemptionId)
            .input('reward_id', sql.UniqueIdentifier, rewardId)
            .input('cost_points', sql.Int, costPoints)
            .query(`
        UPDATE dbo.Clients SET points = @new_points WHERE id = @client_id;
        INSERT INTO dbo.RewardRedemptions (id, reward_id, client_id, cost_points, status)
        VALUES (@redemption_id, @reward_id, @client_id, @cost_points, 'pending')
      `);

        res.json({ message: 'Reward redeemed successfully', pointsDeducted: costPoints, remainingPoints: newPoints });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
