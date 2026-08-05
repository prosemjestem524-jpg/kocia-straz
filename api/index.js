const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();

// Limit pamięci — pamiętaj o limitach Vercela (max 4.5 MB na całe zapytanie)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3.5 * 1024 * 1024 } 
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

// ---------- Zgłoszenie nowego kota ----------
app.post('/api/zgloszenie', (req, res) => {
    upload.single('zdjecieKotka')(req, res, (err) => {

        // Wyłapanie błędu rozmiaru pliku
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    sukces: false,
                    wiadomosc: 'Zdjęcie jest za duże! Maksymalny rozmiar to 3.5 MB.'
                });
            }
            return res.status(400).json({ sukces: false, wiadomosc: `Błąd przesyłania: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ sukces: false, wiadomosc: 'Wystąpił nieoczekiwany błąd serwera.' });
        }

        if (!req.file) {
            return res.status(400).json({ sukces: false, wiadomosc: 'Nie przesłano żadnego zdjęcia!' });
        }

        try {
            // Zamiana bufora pliku na Base64 (oryginalne metadane EXIF zostają wewnątrz pliku!)
            const miniatura = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

            const noweZgloszenie = {
                id: Date.now(),
                opis: req.body.opis || 'Kot w potrzebie',
                data: new Date().toLocaleString('pl-PL'),
                nazwaPliku: req.file.originalname,
                miniatura // Zdjecie wraz z nienaruszonymi danymi EXIF
            };

            zgloszenia.unshift(noweZgloszenie);

            res.json({
                sukces: true,
                wiadomosc: 'Dziękujemy! Zgłoszenie zostało zapisane.',
                dane: {
                    id: noweZgloszenie.id,
                    opis: noweZgloszenie.opis,
                    data: noweZgloszenie.data
                }
            });
        } catch (error) {
            console.error('Błąd zapisywania zgłoszenia:', error);
            res.status(500).json({ sukces: false, wiadomosc: 'Błąd serwera podczas zapisywania danych.' });
        }
    });
});

// ---------- Publiczna lista zgłoszeń ----------
app.get('/api/zgloszenia', (req, res) => {
    const publiczne = zgloszenia.map(z => ({
        id: z.id,
        opis: z.opis,
        data: z.data
    }));
    res.json(publiczne);
});

// ---------- Panel admina (pobiera zdjęcia z EXIF) ----------
app.get('/api/admin/zgloszenia', sprawdzHaslo, (req, res) => {
    res.json(zgloszenia);
});

app.delete('/api/admin/zgloszenia/:id', sprawdzHaslo, (req, res) => {
    const id = Number(req.params.id);
    const dlugoscPrzed = zgloszenia.length;
    zgloszenia = zgloszenia.filter(z => z.id !== id);
    res.json({ sukces: zgloszenia.length < dlugoscPrzed });
});

// Uruchomienie lokalne
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Serwer Kociej Straży działa na http://localhost:${PORT}`));
}

module.exports = app;
