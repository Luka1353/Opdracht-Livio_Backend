const express = require('express');
const { getConnection, sql } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const allowedRelations = ['son', 'daughter', 'partner', 'other'];

// Get all clients (admin only)
router.get('/clients', async (req, res) => {
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

// Get all family members (admin only)
router.get('/families', async (req, res) => {
    try {
        const pool = await getConnection();

        const result = await new sql.Request(pool)
            .query(`
        SELECT
          u.id AS user_id,
          u.email,
          u.is_active,
          p.full_name,
          COUNT(fcl.client_id) AS linked_clients
        FROM dbo.Users u
        INNER JOIN dbo.UserProfiles p ON p.user_id = u.id
        LEFT JOIN dbo.FamilyClientLinks fcl ON fcl.family_user_id = u.id
        WHERE u.role = 'family'
        GROUP BY u.id, u.email, u.is_active, p.full_name
        ORDER BY p.full_name
      `);

        res.json({ data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get family-client links (admin only)
router.get('/family-links', async (req, res) => {
    try {
        const pool = await getConnection();
        const clientId = req.query.clientId || null;
        const familyUserId = req.query.familyUserId || null;

        const result = await new sql.Request(pool)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .input('family_user_id', sql.UniqueIdentifier, familyUserId)
            .query(`
        SELECT
          fcl.id,
          fcl.family_user_id,
          fcl.client_id,
          fcl.relation,
          fcl.created_at,
          fp.full_name AS family_name,
          fu.email AS family_email,
          cp.full_name AS client_name,
          c.room_number
        FROM dbo.FamilyClientLinks fcl
        INNER JOIN dbo.Users fu ON fu.id = fcl.family_user_id
        INNER JOIN dbo.UserProfiles fp ON fp.user_id = fu.id
        INNER JOIN dbo.Clients c ON c.id = fcl.client_id
        INNER JOIN dbo.UserProfiles cp ON cp.user_id = c.user_id
        WHERE fu.role = 'family'
          AND (@client_id IS NULL OR fcl.client_id = @client_id)
          AND (@family_user_id IS NULL OR fcl.family_user_id = @family_user_id)
        ORDER BY cp.full_name, fp.full_name
      `);

        res.json({ data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create family-client link (admin only)
router.post('/family-links', async (req, res) => {
    try {
        const pool = await getConnection();
        const { familyUserId, clientId, relation } = req.body;
        const safeRelation = relation || 'other';

        if (!familyUserId || !clientId) {
            return res.status(400).json({ error: 'familyUserId and clientId are required' });
        }

        if (!allowedRelations.includes(safeRelation)) {
            return res.status(400).json({ error: 'Invalid relation value' });
        }

        const familyExists = await new sql.Request(pool)
            .input('family_user_id', sql.UniqueIdentifier, familyUserId)
            .query(`
          SELECT id
          FROM dbo.Users
          WHERE id = @family_user_id AND role = 'family'
        `);

        if (familyExists.recordset.length === 0) {
            return res.status(404).json({ error: 'Family member not found' });
        }

        const clientExists = await new sql.Request(pool)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .query('SELECT id FROM dbo.Clients WHERE id = @client_id');

        if (clientExists.recordset.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const linkId = uuidv4();

        await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, linkId)
            .input('family_user_id', sql.UniqueIdentifier, familyUserId)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .input('relation', sql.NVarChar(20), safeRelation)
            .query(`
        INSERT INTO dbo.FamilyClientLinks (id, family_user_id, client_id, relation)
        VALUES (@id, @family_user_id, @client_id, @relation)
      `);

        res.status(201).json({ message: 'Link created successfully', id: linkId });
    } catch (err) {
        if (err.number === 2627 || err.number === 2601) {
            return res.status(409).json({ error: 'This family member is already linked to this client' });
        }

        res.status(500).json({ error: err.message });
    }
});

// Delete family-client link (admin only)
router.delete('/family-links/:linkId', async (req, res) => {
    try {
        const pool = await getConnection();
        const { linkId } = req.params;

        const result = await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, linkId)
            .query('DELETE FROM dbo.FamilyClientLinks WHERE id = @id');

        if (!result.rowsAffected[0]) {
            return res.status(404).json({ error: 'Link not found' });
        }

        res.json({ message: 'Link deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update client (admin only)
router.put('/clients/:clientId', async (req, res) => {
    try {
        const adminUserId = req.headers['x-user-id'];
        if (!adminUserId) {
            return res.status(400).json({ error: 'Admin ID required in x-user-id header' });
        }

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
                    .input('changed_by_user_id', sql.UniqueIdentifier, adminUserId)
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
                    .input('changed_by_user_id', sql.UniqueIdentifier, adminUserId)
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
router.get('/tasks', async (req, res) => {
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
router.post('/tasks', async (req, res) => {
    try {
        const adminUserId = req.headers['x-user-id'];
        if (!adminUserId) {
            return res.status(400).json({ error: 'Admin ID required in x-user-id header' });
        }

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
            .input('created_by_user_id', sql.UniqueIdentifier, adminUserId)
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
router.post('/rewards', async (req, res) => {
    try {
        const adminUserId = req.headers['x-user-id'];
        if (!adminUserId) {
            return res.status(400).json({ error: 'Admin ID required in x-user-id header' });
        }

        const pool = await getConnection();
        const { name, description, costPoints } = req.body;

        const rewardId = uuidv4();

        await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, rewardId)
            .input('name', sql.NVarChar(200), name)
            .input('description', sql.NVarChar(1000), description || null)
            .input('cost_points', sql.Int, costPoints)
            .input('created_by_user_id', sql.UniqueIdentifier, adminUserId)
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
