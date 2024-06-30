const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const cors = require('cors');

const app = express();
const port = 3000;

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        const allowedOriginPattern = /\.?screwltd\.com$/;
        if (allowedOriginPattern.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    credentials: true 
};

app.use(cors(corsOptions));
app.use(express.json());

const supabase = createClient(process.env.API_URL, process.env.API_KEY);

const axios = require('axios');

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization token is required' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Invalid Authorization format. Token missing.' });
    }

    try {
        const response = await axios.get('https://login.xsolla.com/api/users/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.data || response.data.error) {
            return res.status(401).json({ error: response.data.error?.description || 'Invalid token' });
        }

        req.user = response.data;
        next();
    } catch (error) {
        if (error.response && error.response.data && error.response.data.error) {
            console.log('Error response from Xsolla:', error.response.data);
            return res.status(401).json({ error: error.response.data.error.description });
        }
        console.error('An error occurred during authentication:', error);
        return res.status(500).json({ error: 'An error occurred during authentication' });
    }
};

app.get('/', (req, res) => {
    res.status(200).json({ SCREWAPI: "v3.0.0", status: 'ok' });
});

app.get('/v3/editor/download', (req, res) => {
    const downloadUrls = {
        win32: 'https://screwltd.com/editor/editor-2024.6.20-win32.exe',
        win64: 'https://screwltd.com/editor/editor-2024.6.20-win64.exe',
        arm_exe: 'https://screwltd.com/editor/editor-2024.6.20-arm64.exe',
        arm_zip: 'https://screwltd.com/editor/editor-2024.6.20-embed-arm64.zip',
        win64_zip: 'https://screwltd.com/editor/editor-2024.6.20-embed-win64.zip'
    };

    const { win32, win64, arm_exe, arm_zip, win64_zip } = req.query;

    let downloadLink = null;

    if (win32) downloadLink = downloadUrls.win32;
    else if (win64) downloadLink = downloadUrls.win64;
    else if (arm_exe) downloadLink = downloadUrls.arm_exe;
    else if (arm_zip) downloadLink = downloadUrls.arm_zip;
    else if (win64_zip) downloadLink = downloadUrls.win64_zip;

    if (downloadLink) {
        res.status(200).json({ url: downloadLink });
    } else {
        res.status(400).json({ error: 'Invalid argument provided' });
    }
});

app.get('/v3/marketplace/fetch', async (req, res) => {
    const { limit = 10, page = 1, sort } = req.query;
    const offset = (page - 1) * limit;
    const sortBy = sort || 'created_at';
    const { data, error, count } = await supabase
        .from('marketplace')
        .select('*', { count: 'exact' })
        .order(sortBy, { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    const totalPages = Math.ceil(count / limit);

    res.json({
        data,
        totalPages,
        currentPage: page,
        totalItems: count
    });
});

app.post('/v3/marketplace/insert', authenticate, async (req, res) => {
    const { user } = req;
    const { type, name, description, image, projectData } = req.body;

    const newData = {
        type,
        name,
        description,
        image,
        projectData,
        downloads: 0,
        owner: user.id
    };

    const { data, error } = await supabase
        .from('marketplace')
        .insert([newData]);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ message: 'Data inserted successfully' });
});

app.post('/v3/marketplace/download', authenticate, async (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'ID is required' });
    }

    try {
        const { data, error } = await supabase
            .from('marketplace')
            .select('downloads')
            .eq('id', id)
            .single();

        if (error) {
            throw error;
        }

        if (!data) {
            return res.status(404).json({ error: 'Item not found' });
        }

        const currentDownloads = data.downloads;

        const { data: updatedData, error: updateError } = await supabase
            .from('marketplace')
            .update({ downloads: currentDownloads + 1 })
            .eq('id', id);

        if (updateError) {
            throw updateError;
        }

        return res.status(200).json({ message: 'Downloads incremented successfully' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.options('*', cors(corsOptions));

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = app;
