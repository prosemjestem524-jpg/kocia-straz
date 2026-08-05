const express = require('express');
const multer = require('multer');
const exifParser = require('exif-parser');
const path = require('path');

const app = express();

// Limit pamięci ustalony na 3.5 MB, aby uniknąć przekroczenia limitów Vercel (4.5 MB zapytania)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3.5 * 1024 * 1024 } 
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// Hasło do panelu admina (zmienna środowiskowa lub wartość domyślna)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zmien-to-haslo';

// Pamięć podręczna w RAM na zgłoszenia (ulotna na Vercel/Serverless)
let zgloszenia = [];

// Middleware sprawdzający uprawnienia administratora
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

        // exif-parser działa stabilnie tylko dla plików JPEG/JPG
        const czyJpeg = req.file.mimetype === 'image/jpeg' || req.file.mimetype === 'image/jpg';

        if (czyJpeg) {
            try {
                const parser = exifParser.create(req.file.buffer);
                const wynikExif = parser.parse();

                if (wynikExif && wynikExif.tags) {
                    // Weryfikacja współrzędnych GPS
                    if (typeof wynikExif.tags.GPSLatitude === 'number') {
                        szerokosc = wynikExif.tags.GPSLatitude;
                    }
                    if (typeof wynikExif.tags.GPSLongitude === 'number') {
                        dlugosc = wynikExif.tags.GPSLongitude;
                    }

                    // Weryfikacja daty wykonania zdjęcia
                    if (wynikExif.tags.DateTimeOriginal) {
                        const timestamp = Number(wynikExif.tags.DateTimeOriginal);
                        if (!isNaN(timestamp)) {
                            dataZdjecia = new Date(timestamp * 1000).toLocaleString('pl-PL');
                        }
                    }

                    // Model aparatu
                    if (wynikExif.tags.Model) {
                        aparat = String(wynikExif.tags.Model);
                    }
                }
            } catch (exifError) {
                // Przechwycenie błędu odczytu EXIF — pozwala kontynuować zapis zgłoszenia
                console.warn('Nie udało się odczytać danych EXIF:', exifError.message);
            }
        }

        // Generowanie ciągu Base64 do podglądu zdjęcia w panelu admina
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

        // Zwrot odpowiedzi bez pełnego base64 w obiekcie danych dla oszczędności transferu
        res.json({
            sukces: true,
            wiadomosc: 'Dziękujemy! Zgłoszenie zostało zapisane, a dane zlokalizowane w systemie.',
            dane: {
                id: noweZgloszenie.id,
                opis: noweZgloszenie.opis,
                szerokosc: noweZgloszenie.szerokosc,
                dlugosc: noweZgloszenie.dlugosc,
                dataZdjecia: noweZgloszenie.dataZdjecia
            }
        });
    } catch (error) {
        console.error('Błąd serwera podczas przetwarzania:', error);
        res.status(500).json({ sukces: false, wiadomosc: 'Wystąpił błąd serwera podczas przetwarzania zdjęcia.' });
    }
});

// ---------- Publiczna lista zgłoszeń (anonimizowana) ----------
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

// ---------- Panel admina: pobieranie wszystkich zgłoszeń z miniaturami ----------
app.get('/api/admin/zgloszenia', sprawdzHaslo, (req, res) => {
    res.json(zgloszenia);
});

// ---------- Panel admina: usuwanie zgłoszenia ----------
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
