const express = require('express');
const multer = require('multer');
const ExifReader = require('exifreader');
const path = require('path');

const app = express();

// Konfiguracja Multer (pamięć RAM, limit 10 MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limitu
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
// Używamy funkcji opakowującej Multera, aby wyłapać błąd za dużego pliku
app.post('/api/zgloszenie', (req, res) => {
    upload.single('zdjecieKotka')(req, res, async (err) => {

        // 1. Obsługa błędów przesyłania pliku (np. za duży plik)
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    sukces: false,
                    wiadomosc: 'Zdjęcie jest za duże! Maksymalny rozmiar to 10 MB.'
                });
            }
            return res.status(400).json({ sukces: false, wiadomosc: `Błąd przesyłania: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ sukces: false, wiadomosc: 'Wystąpił nieoczekiwany błąd podczas wczytywania pliku.' });
        }

        if (!req.file) {
            return res.status(400).json({ sukces: false, wiadomosc: 'Nie przesłano żadnego zdjęcia!' });
        }

        let szerokosc = null;
        let dlugosc = null;
        let dataZdjecia = null;
        let aparat = null;

        // 2. Bezpieczny odczyt EXIF przy użyciu ExifReader
        try {
            const tags = ExifReader.load(req.file.buffer, { expanded: true });

            // Współrzędne GPS
            if (tags.gps && tags.gps.Latitude && tags.gps.Longitude) {
                szerokosc = tags.gps.Latitude;
                dlugosc = tags.gps.Longitude;
            }

            // Data wykonania zdjęcia
            if (tags.exif && tags.exif.DateTimeOriginal) {
                dataZdjecia = tags.exif.DateTimeOriginal.description;
            }

            // Model aparatu
            if (tags.exif && tags.exif.Model) {
                aparat = tags.exif.Model.description;
            }
        } catch (exifErr) {
            // Jeśli plik nie ma EXIF lub nie jest wspierany, kod przechodzi dalej bez błędu
            console.log('Brak danych EXIF lub nie udało się ich odczytać:', exifErr.message);
        }

        try {
            const miniatura = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

            const noweZgloszenie = {
                id: Date.now(),
                opis: req.body.opis || 'Kot w potrzebie',
                szerokosc,
                dlugosc,
                dataZdjecia,
                aparat,
                data: new Date().toLocaleString('pl-PL'),
                nazwaPliku: req.file.originalname,
                miniatura
            };

            zgloszenia.unshift(noweZgloszenie);

            res.json({
                sukces: true,
                wiadomosc: 'Dziękujemy! Zgłoszenie zostało zapisane.',
                dane: {
                    id: noweZgloszenie.id,
                    opis: noweZgloszenie.opis,
                    szerokosc: noweZgloszenie.szerokosc,
                    dlugosc: noweZgloszenie.dlugosc
                }
            });
        } catch (error) {
            console.error('Błąd podczas tworzenia zgłoszenia:', error);
            res.status(500).json({ sukces: false, wiadomosc: 'Błąd serwera podczas zapisywania danych.' });
        }
    });
});

// ---------- Publiczna lista zgłoszeń ----------
app.get('/api/zgloszenia', (req, res) => {
    const publiczne = zgloszenia.map(z => ({
        id: z.id,
        opis: z.opis,
        szerokosc: z.szerokosc,
        dlugosc: z.dlugosc,
        data: z.data
    }));
    res.json(publiczne);
});

// ---------- Panel admina ----------
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
    app.listen(PORT, () => console.log(`Serwer Kociej Straży działa na port http://localhost:${PORT}`));
}

module.exports = app;
