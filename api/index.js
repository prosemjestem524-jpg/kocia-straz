const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();

// Limit wielkości pliku dostosowany do darmowego limitu Vercel (4.5 MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3.8 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zmien-to-haslo';
let zgloszenia = [];

function sprawdzHaslo(req, res, next) {
    const haslo = req.headers['x-admin-haslo'] || req.query.haslo;
    if (haslo !== ADMIN_PASSWORD) {
        return res.status(401).json({ sukces: false, wiadomosc: 'Nieprawidłowe hasło administratora.' });
    }
    next();
}

// Odbiór zgłoszenia
app.post('/api/zgloszenie', (req, res) => {
    upload.single('zdjecieKotka')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    sukces: false,
                    wiadomosc: 'Zdjęcie jest za duże! Maksymalny rozmiar to 3.8 MB.'
                });
            }
            return res.status(400).json({ sukces: false, wiadomosc: `Błąd przesyłania: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ sukces: false, wiadomosc: 'Wystąpił błąd serwera.' });
        }

        if (!req.file) {
            return res.status(400).json({ sukces: false, wiadomosc: 'Brak zdjęcia!' });
        }

        try {
            const miniatura = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

            const szerokosc = req.body.szerokosc ? parseFloat(req.body.szerokosc) : null;
            const dlugosc = req.body.dlugosc ? parseFloat(req.body.dlugosc) : null;

            const noweZgloszenie = {
                id: Date.now(),
                opis: req.body.opis || 'Kot w potrzebie',
                szerokosc,
                dlugosc,
                data: new Date().toLocaleString('pl-PL'),
                nazwaPliku: req.file.originalname,
                miniatura
            };

            zgloszenia.unshift(noweZgloszenie);

            res.json({ sukces: true, wiadomosc: 'Zgłoszenie zapisane.' });
        } catch (error) {
            console.error('Błąd zapisu zgłoszenia:', error);
            res.status(500).json({ sukces: false, wiadomosc: 'Błąd przetwarzania zgłoszenia.' });
        }
    });
});

// Zgłoszenia dla panelu admina
app.get('/api/admin/zgloszenia', sprawdzHaslo, (req, res) => {
    res.json(zgloszenia);
});

// Usuwanie zgłoszeń
app.delete('/api/admin/zgloszenia/:id', sprawdzHaslo, (req, res) => {
    const id = Number(req.params.id);
    const dlugoscPrzed = zgloszenia.length;
    zgloszenia = zgloszenia.filter(z => z.id !== id);
    res.json({ sukces: zgloszenia.length < dlugoscPrzed });
});

// Działanie na środowisku lokalnym
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Serwer działa na http://localhost:${PORT}`));
}

module.exports = app;
