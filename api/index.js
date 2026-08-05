const express = require('express');
const multer = require('multer');
const exifParser = require('exif-parser');
const path = require('path');

const app = express();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 } // max 8 MB na zdjęcie
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// Hasło do panelu admina.
// NA VERCEL ustaw je w: Project → Settings → Environment Variables → ADMIN_PASSWORD
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zmien-to-haslo';

// Pamięć podręczna na zgłoszenia.
// UWAGA: na Vercel funkcje serverless nie mają stałej pamięci — po "zimnym starcie"
// (np. po dłuższym braku ruchu, albo bo trafisz na inną instancję) ta tablica się zeruje.
// Do produkcji podmień to na Vercel KV / Postgres / MongoDB Atlas.
let zgloszenia = [];

function sprawdzHaslo(req, res, next) {
    const haslo = req.headers['x-admin-haslo'] || req.query.haslo;
    if (haslo !== ADMIN_PASSWORD) {
        return res.status(401).json({ sukces: false, wiadomosc: 'Nieprawidłowe hasło administratora.' });
    }
    next();
}

// ---------- Zgłoszenie nowego kota ----------
app.post('/api/zgloszenie', upload.single('zdjecieKotka'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ sukces: false, wiadomosc: 'Nie przesłano żadnego zdjęcia!' });
        }

        let szerokosc = null;
        let dlugosc = null;
        let dataZdjecia = null;
        let aparat = null;

        // Próba odczytu danych EXIF ze zdjęcia
        // Próba odczytu danych EXIF ze zdjęcia
        try {
            const parser = exifParser.create(req.file.buffer);
            const wynikExif = parser.parse();

            if (wynikExif && wynikExif.tags) {
                // exif-parser udostępnia gotowe przeliczone wartości w GPSLatitude / GPSLongitude, 
                // ale bezpieczniej jest sprawdzić ich typ lub odczytać je bezpośrednio.
                if (typeof wynikExif.tags.GPSLatitude === 'number' && typeof wynikExif.tags.GPSLongitude === 'number') {
                    szerokosc = wynikExif.tags.GPSLatitude;
                    dlugosc = wynikExif.tags.GPSLongitude;
                }

                if (wynikExif.tags.DateTimeOriginal) {
                    // Sprawdzamy czy to timestamp (sekundy) czy napis
                    const timestamp = Number(wynikExif.tags.DateTimeOriginal);
                    if (!isNaN(timestamp)) {
                        dataZdjecia = new Date(timestamp * 1000).toLocaleString('pl-PL');
                    }
                }

                if (wynikExif.tags.Model) {
                    aparat = String(wynikExif.tags.Model);
                }
            }
        } catch (exifError) {
            console.error('Błąd podczas odczytu EXIF:', exifError.message);
            // Nie wywolujemy throw — błąd EXIF nie powinien blokować zapisu zgłoszenia!
        }

        // Zdjęcie trzymamy jako base64 tylko do podglądu w panelu admina
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

        zgloszenia.unshift(noweZgloszenie); // dodaj na początek listy

        res.json({
            sukces: true,
            wiadomosc: 'Dziękujemy! Zgłoszenie zostało zapisane, a lokalizacja kotka została pomyślnie zlokalizowana w systemie fundacji.',
            dane: { ...noweZgloszenie, miniatura: undefined }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ sukces: false, wiadomosc: 'Wystąpił błąd serwera podczas przetwarzania zdjęcia.' });
    }
});

// ---------- Publiczna lista zgłoszeń (bez zdjęć — te widzi tylko admin) ----------
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

// ---------- Panel admina: pełne dane, zdjęcia i metadane EXIF ----------
app.get('/api/admin/zgloszenia', sprawdzHaslo, (req, res) => {
    res.json(zgloszenia);
});

app.delete('/api/admin/zgloszenia/:id', sprawdzHaslo, (req, res) => {
    const id = Number(req.params.id);
    const dlugoscPrzed = zgloszenia.length;
    zgloszenia = zgloszenia.filter(z => z.id !== id);
    res.json({ sukces: zgloszenia.length < dlugoscPrzed });
});

// Uruchomienie lokalne: node api/index.js
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Serwer Kociej Straży działa na http://localhost:${PORT}`));
}

module.exports = app;
