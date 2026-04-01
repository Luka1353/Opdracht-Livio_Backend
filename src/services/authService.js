const bcryptjs = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getConnection, sql } = require('../config/database');

const hashPassword = async (password) => {
    return bcryptjs.hash(password, 10);
};

const comparePassword = async (password, hash) => {
    return bcryptjs.compare(password, hash);
};

const DEFAULT_CLIENT_TASKS = [
    {
        title: 'Ga 5 minuten wandelen',
        description: 'Zelf 5 minuten wandelen, startknop aan, per minuut 1 ster verdienen',
        image_url: 'https://photos1.blogger.com/x/blogger/387/3031/1600/818020/Wandelen(1).jpg',
        points: 5,
        category_name: 'Lichaamsfuncties / Meedoen',
        layer: 'zelf',
    },
    {
        title: 'Activiteit naar keuze',
        description: 'Kies zelf een activiteit, in overleg met zorgpersoneel',
        image_url: 'https://easyauti.nl/wp-content/uploads/2022/06/kiezen.png',
        points: 5,
        category_name: 'Lichaamsfuncties / Meedoen',
        layer: 'zelf',
    },
    {
        title: 'Handoefeningen doen',
        description: 'Voer handoefeningen uit aan de hand van uitlegfilmpje, startknop aan, per minuut 1 ster',
        image_url: 'https://www.sclera.be/resources/pictos/handen%20klappen.png',
        points: 5,
        category_name: 'Lichaamsfuncties / Meedoen',
        layer: 'zelf',
    },
    {
        title: 'Stoeloefeningen doen',
        description: 'Voer stoeloefeningen uit aan de hand van filmpje',
        image_url: 'https://www.sclera.be/resources/pictos/zitten%20aandachtspunten.png',
        points: 5,
        category_name: 'Lichaamsfuncties / Meedoen',
        layer: 'zelf',
    },
    {
        title: 'Zelf aankleden',
        description: 'Zelfstandig aankleden',
        image_url: 'https://easyauti.nl/wp-content/uploads/2022/06/aankleden.png',
        points: 3,
        category_name: 'Dagelijks Functioneren / Kwaliteit van Leven',
        layer: 'zelf',
    },
    {
        title: 'Zelfstandig wassen',
        description: 'Zelfstandig jezelf wassen',
        image_url: 'https://easyauti.nl/product/losse-picto-jezelf-wassen/',
        points: 3,
        category_name: 'Dagelijks Functioneren / Kwaliteit van Leven',
        layer: 'zelf',
    },
    {
        title: 'Zelfstandig ontbijt klaarmaken',
        description: 'Een ontbijt zelfstandig klaarmaken',
        image_url: 'https://easyauti.nl/wp-content/uploads/2022/06/jezelf-wassen.png',
        points: 3,
        category_name: 'Dagelijks Functioneren / Kwaliteit van Leven',
        layer: 'zelf',
    },
    {
        title: 'Medicatie innemen',
        description: 'Medicatie innemen onder begeleiding of zelfstandig',
        image_url: 'https://easyauti.nl/wp-content/uploads/2022/06/medicijnen-innemen-pillen-en-flesjes.png',
        points: 3,
        category_name: 'Dagelijks Functioneren / Kwaliteit van Leven',
        layer: 'zelf',
    },
    {
        title: 'Met een vriend bellen',
        description: 'Bel zelf een vriend op',
        image_url: 'https://easyauti.nl/wp-content/uploads/2022/06/bellen-1.png',
        points: 4,
        category_name: 'Zingeving / Mentaal Welbevinden',
        layer: 'sociaal_netwerk',
    },
    {
        title: 'Met familie op pad',
        description: 'Ga met familie op uit',
        image_url: 'https://easyauti.nl/wp-content/uploads/2022/06/op-bezoek-1.png',
        points: 4,
        category_name: 'Zingeving / Mentaal Welbevinden',
        layer: 'sociaal_netwerk',
    },
    {
        title: 'Met vrijwilliger naar muziek',
        description: 'Luister naar muziek met vrijwilliger',
        image_url: 'https://easyauti.nl/wp-content/uploads/2023/10/muziek-10x10cm-600x600.png',
        points: 4,
        category_name: 'Zingeving / Mentaal Welbevinden',
        layer: 'sociaal_netwerk',
    },
];

const insertDefaultClientTasks = async (transaction, clientId) => {
    for (const task of DEFAULT_CLIENT_TASKS) {
        await new sql.Request(transaction)
            .input('id', sql.UniqueIdentifier, uuidv4())
            .input('client_id', sql.UniqueIdentifier, clientId)
            .input('title', sql.NVarChar(200), task.title)
            .input('description', sql.NVarChar(1000), task.description)
            .input('image_url', sql.NVarChar(sql.MAX), task.image_url)
            .input('points', sql.Int, task.points)
            .input('category_name', sql.NVarChar(200), task.category_name)
            .input('layer', sql.NVarChar(20), task.layer)
            .query(`
                INSERT INTO dbo.Tasks (id, client_id, title, description, image_url, points, category_name, layer, is_active)
                VALUES (@id, @client_id, @title, @description, @image_url, @points, @category_name, @layer, 1)
            `);
    }
};

const register = async (email, password, fullName, role) => {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        // Check if email exists
        const existingUser = await new sql.Request(transaction)
            .input('email', sql.NVarChar(255), email)
            .query('SELECT id FROM dbo.Users WHERE email = @email');

        if (existingUser.recordset.length > 0) {
            throw new Error('Email already exists');
        }

        // Create user
        const userId = uuidv4();
        const passwordHash = await hashPassword(password);

        await new sql.Request(transaction)
            .input('id', sql.UniqueIdentifier, userId)
            .input('email', sql.NVarChar(255), email)
            .input('password_hash', sql.NVarChar(255), passwordHash)
            .input('role', sql.NVarChar(20), role)
            .query(
                'INSERT INTO dbo.Users (id, email, password_hash, role) VALUES (@id, @email, @password_hash, @role)'
            );

        // Create user profile
        await new sql.Request(transaction)
            .input('user_id', sql.UniqueIdentifier, userId)
            .input('full_name', sql.NVarChar(200), fullName)
            .query(
                'INSERT INTO dbo.UserProfiles (user_id, full_name) VALUES (@user_id, @full_name)'
            );

        // If client, create client record
        if (role === 'client') {
            const clientId = uuidv4();
            await new sql.Request(transaction)
                .input('id', sql.UniqueIdentifier, clientId)
                .input('user_id', sql.UniqueIdentifier, userId)
                .query(
                    'INSERT INTO dbo.Clients (id, user_id) VALUES (@id, @user_id)'
                );

            await insertDefaultClientTasks(transaction, clientId);
        }

        await transaction.commit();

        return { userId, email, fullName, role };
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
};

const login = async (email, password) => {
    const pool = await getConnection();

    const result = await new sql.Request(pool)
        .input('email', sql.NVarChar(255), email)
        .query(`
      SELECT u.id, u.email, u.password_hash, u.role, u.is_active
      FROM dbo.Users u
      WHERE u.email = @email
    `);

    if (result.recordset.length === 0) {
        throw new Error('User not found');
    }

    const user = result.recordset[0];

    if (!user.is_active) {
        throw new Error('User account is inactive');
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
        throw new Error('Incorrect password');
    }

    return {
        userId: user.id,
        email: user.email,
        role: user.role,
    };
};



module.exports = {
    register,
    login,
};
