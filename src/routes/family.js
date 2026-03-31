const express = require('express');
const { getConnection, sql } = require('../config/database');

const router = express.Router();

// Get linked clients
router.get('/clients', async (req, res) => {
    try {
        const familyUserId = req.headers['x-user-id'];
        if (!familyUserId) {
            return res.status(400).json({ error: 'User ID required in x-user-id header' });
        }

        const pool = await getConnection();

        const result = await new sql.Request(pool)
            .input('family_user_id', sql.UniqueIdentifier, familyUserId)
            .query(`
        SELECT 
          c.id,
          c.user_id,
          p.full_name,
          c.room_number,
          c.points,
          c.streak_current,
          c.streak_best,
          fcl.relation
        FROM dbo.FamilyClientLinks fcl
        INNER JOIN dbo.Clients c ON c.id = fcl.client_id
        INNER JOIN dbo.Users u ON u.id = c.user_id
        INNER JOIN dbo.UserProfiles p ON p.user_id = u.id
        WHERE fcl.family_user_id = @family_user_id
      `);

        res.json({ data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get client profile by ID
router.get('/clients/:clientId', async (req, res) => {
    try {
        const familyUserId = req.headers['x-user-id'];
        if (!familyUserId) {
            return res.status(400).json({ error: 'User ID required in x-user-id header' });
        }

        const pool = await getConnection();
        const { clientId } = req.params;

        // Verify that the logged-in family member has access to this client
        const accessCheck = await new sql.Request(pool)
            .input('family_user_id', sql.UniqueIdentifier, familyUserId)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .query(`
        SELECT 1 FROM dbo.FamilyClientLinks
        WHERE family_user_id = @family_user_id AND client_id = @client_id
      `);

        if (accessCheck.recordset.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get client data
        const result = await new sql.Request(pool)
            .input('client_id', sql.UniqueIdentifier, clientId)
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
          (SELECT COUNT(*) FROM dbo.TaskCompletions tc 
           WHERE tc.client_id = c.id 
           AND CONVERT(DATE, tc.completed_at) = CONVERT(DATE, GETUTCDATE())) AS tasks_today,
          (SELECT COUNT(*) FROM dbo.TaskCompletions tc 
           WHERE tc.client_id = c.id) AS tasks_total
        FROM dbo.Clients c
        INNER JOIN dbo.Users u ON u.id = c.user_id
        INNER JOIN dbo.UserProfiles p ON p.user_id = u.id
        WHERE c.id = @client_id
      `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        res.json({ data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get client tasks
router.get('/clients/:clientId/tasks', async (req, res) => {
    try {
        const familyUserId = req.headers['x-user-id'];
        if (!familyUserId) {
            return res.status(400).json({ error: 'User ID required in x-user-id header' });
        }

        const pool = await getConnection();
        const { clientId } = req.params;

        // Verify access
        const accessCheck = await new sql.Request(pool)
            .input('family_user_id', sql.UniqueIdentifier, familyUserId)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .query(`
        SELECT 1 FROM dbo.FamilyClientLinks
        WHERE family_user_id = @family_user_id AND client_id = @client_id
      `);

        if (accessCheck.recordset.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await new sql.Request(pool)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .query(`
        SELECT TOP 10
          tc.id,
          t.title,
          t.points,
          tc.earned_points,
          tc.completed_at
        FROM dbo.TaskCompletions tc
        INNER JOIN dbo.Tasks t ON t.id = tc.task_id
        WHERE tc.client_id = @client_id
        ORDER BY tc.completed_at DESC
      `);

        res.json({ data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
