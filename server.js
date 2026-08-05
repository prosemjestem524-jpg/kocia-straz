const express = require('express');
const multer = require('multer');
const exifParser = require('exif-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Konfiguracja zapisu przesyłanych plików
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Pamięć podręczna na zgłoszenia (w prawdziwym projekcie używa się bazy danych np. MongoDB/SQL)
let zgloszenia = [];

// Endpoint do obsługi przesyłania zdjęć i metadanych
app.post('/api/zgloszenie', upload.single('zdjecieKotka'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ sukces: false, wiadowosc: 'Nie przesłano żadnego zdjęcia!' });
        }

        let szerokosc = null;
        let dlugosc = null;

        // Próba odczytu danych EXIF ze zdjęcia
        try {
            const parser = exifParser.create(req.file.buffer);
            const wynikExif = parser.parse();
            
            if (wynikExif.tags && wynikExif.tags.GPSLatitude && wynikExif.tags.GPSLongitude) {
                szerokosc = wynikExif.tags.GPSLatitude;
                dlugosc = wynikExif.tags.GPSLongitude;
            }
        } catch (exifError) {
            console.log('Brak danych EXIF lub zdjęcie ich nie zawiera.');
        }

        // Zapis informacji o zgłoszeniu
        const noweZgloszenie = {
            id: Date.now(),
            opis: req.body.opis || 'Kot w potrzebie',
            szerokosc: szerokosc,
            dlugosc: dlugosc,
            data: new Date().toLocaleString('pl-PL'),
            nazwaPliku: req.file.originalname
        };

        zgloszenia.unshift(noweZgloszenie); // Dodaj na początek listy

        res.json({
            sukces: true,
            wiadowosc: 'Dziękujemy! Zgłoszenie zostało zapisane, a lokalizacja kotka została pomyślnie zlokalizowana w systemie fundacji.',
            dane: noweZgloszenie
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ sukces: false, wiadowosc: 'Wystąpił błąd serwera podczas przetwarzania zdjęcia.' });
    }
});

// Endpoint do pobierania listy zgłoszeń
app.get('/api/zgloszenia', (req, res) => {
    res.json(zgloszenia);
});

app.listen(PORT, () => {
    console.log(`Serwer Kociiej Straży działa na http://localhost:${PORT}`);
});