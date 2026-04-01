const express = require('express');
const { getConnection, sql } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const authService = require('../services/authService');

const router = express.Router();

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

// Create a new client (admin only)
router.post('/clients', async (req, res) => {
    try {
        const adminUserId = req.headers['x-user-id'];
        if (!adminUserId) {
            return res.status(400).json({ error: 'Admin ID required in x-user-id header' });
        }

        const { fullName, email, password, roomNumber, birthDate } = req.body;

        if (!fullName || !email) {
            return res.status(400).json({ error: 'Naam en e-mail zijn vereist' });
        }

        const newUser = await authService.register(
            email,
            password || 'Livio2024!',
            fullName,
            'client'
        );

        const pool = await getConnection();
        const clientResult = await new sql.Request(pool)
            .input('user_id', sql.UniqueIdentifier, newUser.userId)
            .query('SELECT id FROM dbo.Clients WHERE user_id = @user_id');

        const clientId = clientResult.recordset[0]?.id;
        if (clientId) {
            await new sql.Request(pool)
                .input('id', sql.UniqueIdentifier, clientId)
                .input('birth_date', sql.Date, birthDate || null)
                .input('room_number', sql.NVarChar(50), roomNumber || null)
                .query(`
                UPDATE dbo.Clients
                SET birth_date = @birth_date, room_number = @room_number
                WHERE id = @id
            `);
        }

        res.status(201).json({ message: 'Client created', userId: newUser.userId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new family user (admin only)
router.post('/families', async (req, res) => {
    try {
        const adminUserId = req.headers['x-user-id'];
        if (!adminUserId) {
            return res.status(400).json({ error: 'Admin ID required in x-user-id header' });
        }

        const { fullName, email, password } = req.body;

        if (!fullName || !email) {
            return res.status(400).json({ error: 'Naam en e-mail zijn vereist' });
        }

        const newUser = await authService.register(
            email,
            password || 'Livio2024!',
            fullName,
            'family'
        );

        res.status(201).json({ message: 'Family created', userId: newUser.userId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all family members (admin)
router.get('/families', async (req, res) => {
    try {
        const pool = await getConnection();

        const result = await new sql.Request(pool)
            .query(`
        SELECT
          u.id AS user_id,
          p.full_name,
          u.email,
          u.is_active,
          ISNULL(fc.client_count, 0) AS client_count
        FROM dbo.Users u
        INNER JOIN dbo.UserProfiles p ON p.user_id = u.id
        LEFT JOIN (
          SELECT family_user_id, COUNT(*) AS client_count
          FROM dbo.FamilyClientLinks
          GROUP BY family_user_id
        ) fc ON fc.family_user_id = u.id
        WHERE u.role = 'family'
        ORDER BY p.full_name
      `);

        res.json({ data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get clients connected to a family member (admin)
router.get('/families/:familyUserId/clients', async (req, res) => {
    try {
        const pool = await getConnection();
        const { familyUserId } = req.params;

        const result = await new sql.Request(pool)
            .input('family_user_id', sql.UniqueIdentifier, familyUserId)
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
          fcl.relation
        FROM dbo.FamilyClientLinks fcl
        INNER JOIN dbo.Clients c ON c.id = fcl.client_id
        INNER JOIN dbo.Users u ON u.id = c.user_id
        INNER JOIN dbo.UserProfiles p ON p.user_id = u.id
        WHERE fcl.family_user_id = @family_user_id
        ORDER BY p.full_name
      `);

        res.json({ data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Link a client to a family member (admin)
router.post('/families/:familyUserId/clients', async (req, res) => {
    try {
        const adminUserId = req.headers['x-user-id'];
        if (!adminUserId) {
            return res.status(400).json({ error: 'Admin ID required in x-user-id header' });
        }

        const pool = await getConnection();
        const { familyUserId } = req.params;
        const { clientId, relation } = req.body;

        const existing = await new sql.Request(pool)
            .input('family_user_id', sql.UniqueIdentifier, familyUserId)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .query(`
        SELECT id FROM dbo.FamilyClientLinks
        WHERE family_user_id = @family_user_id AND client_id = @client_id
      `);

        if (existing.recordset.length > 0) {
            await new sql.Request(pool)
                .input('family_user_id', sql.UniqueIdentifier, familyUserId)
                .input('client_id', sql.UniqueIdentifier, clientId)
                .input('relation', sql.NVarChar(20), relation || 'other')
                .query(`
            UPDATE dbo.FamilyClientLinks
            SET relation = @relation
            WHERE family_user_id = @family_user_id AND client_id = @client_id
          `);

            return res.json({ message: 'Family-client link updated' });
        }

        await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, uuidv4())
            .input('family_user_id', sql.UniqueIdentifier, familyUserId)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .input('relation', sql.NVarChar(20), relation || 'other')
            .query(`
        INSERT INTO dbo.FamilyClientLinks (id, family_user_id, client_id, relation)
        VALUES (@id, @family_user_id, @client_id, @relation)
      `);

        res.status(201).json({ message: 'Family-client link created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Unlink a client from a family member (admin)
router.delete('/families/:familyUserId/clients/:clientId', async (req, res) => {
    try {
        const adminUserId = req.headers['x-user-id'];
        if (!adminUserId) {
            return res.status(400).json({ error: 'Admin ID required in x-user-id header' });
        }

        const pool = await getConnection();
        const { familyUserId, clientId } = req.params;

        await new sql.Request(pool)
            .input('family_user_id', sql.UniqueIdentifier, familyUserId)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .query(`
        DELETE FROM dbo.FamilyClientLinks
        WHERE family_user_id = @family_user_id AND client_id = @client_id
      `);

        res.json({ message: 'Family-client link removed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete task (admin only)
router.delete('/tasks/:taskId', async (req, res) => {
    try {
        const adminUserId = req.headers['x-user-id'];
        if (!adminUserId) {
            return res.status(400).json({ error: 'Admin ID required in x-user-id header' });
        }

        const pool = await getConnection();
        const { taskId } = req.params;

        await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, taskId)
            .query(`
        DELETE FROM dbo.Tasks
        WHERE id = @id
      `);

        res.json({ message: 'Task deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update reward (admin only)
router.put('/rewards/:rewardId', async (req, res) => {
    try {
        const adminUserId = req.headers['x-user-id'];
        if (!adminUserId) {
            return res.status(400).json({ error: 'Admin ID required in x-user-id header' });
        }

        const pool = await getConnection();
        const { rewardId } = req.params;
        const { name, description, costPoints, imageUrl } = req.body;

        await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, rewardId)
            .input('name', sql.NVarChar(200), name)
            .input('description', sql.NVarChar(1000), description || null)
            .input('image_url', sql.NVarChar(sql.MAX), imageUrl || null)
            .input('cost_points', sql.Int, costPoints)
            .query(`
        UPDATE dbo.Rewards
        SET name = @name,
            description = @description,
            image_url = @image_url,
            cost_points = @cost_points
        WHERE id = @id
      `);

        res.json({ message: 'Reward updated successfully' });
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
          t.image_url,
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

// Get tasks for a specific client (admin)
router.get('/clients/:clientId/tasks', async (req, res) => {
    try {
        const pool = await getConnection();
        const { clientId } = req.params;

        const result = await new sql.Request(pool)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .query(`
        SELECT 
          t.id,
          t.client_id,
          t.title,
          t.description,
          t.image_url,
          t.points,
          t.layer,
          t.is_active
        FROM dbo.Tasks t
        WHERE t.client_id = @client_id
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
        const { clientId, title, description, points, layer, imageUrl } = req.body;

        const taskId = uuidv4();

        await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, taskId)
            .input('client_id', sql.UniqueIdentifier, clientId)
            .input('title', sql.NVarChar(200), title)
            .input('description', sql.NVarChar(1000), description || null)
            .input('image_url', sql.NVarChar(sql.MAX), imageUrl || null)
            .input('points', sql.Int, points)
            .input('layer', sql.NVarChar(20), layer)
            .input('created_by_user_id', sql.UniqueIdentifier, adminUserId)
            .query(`
        INSERT INTO dbo.Tasks (id, client_id, title, description, image_url, points, layer, created_by_user_id)
        VALUES (@id, @client_id, @title, @description, @image_url, @points, @layer, @created_by_user_id)
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
        const { name, description, costPoints, imageUrl } = req.body;

        const rewardId = uuidv4();

        await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, rewardId)
            .input('name', sql.NVarChar(200), name)
            .input('description', sql.NVarChar(1000), description || null)
            .input('image_url', sql.NVarChar(sql.MAX), imageUrl || null)
            .input('cost_points', sql.Int, costPoints)
            .input('created_by_user_id', sql.UniqueIdentifier, adminUserId)
            .query(`
        INSERT INTO dbo.Rewards (id, name, description, image_url, cost_points, created_by_user_id)
        VALUES (@id, @name, @description, @image_url, @cost_points, @created_by_user_id)
      `);

        res.status(201).json({ message: 'Reward created', id: rewardId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
