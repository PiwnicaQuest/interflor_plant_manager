# PlantManager Print Agent

Agent drukujący dla systemu PlantManager. Działa na Windows i macOS.

## Szybka instalacja

### Windows
1. Pobierz folder `print-agent` na komputer z drukarkami
2. Kliknij dwukrotnie na **`install-windows.bat`**
3. Postępuj zgodnie z instrukcjami na ekranie

### macOS
1. Pobierz folder `print-agent` na komputer z drukarkami
2. Kliknij dwukrotnie na **`install-mac.command`**
3. Jeśli pojawi się ostrzeżenie, kliknij prawym przyciskiem → Otwórz
4. Postępuj zgodnie z instrukcjami na ekranie

## Wymagania

- **Node.js 18+** - pobierz z https://nodejs.org/ (wersja LTS)
- Podłączone drukarki (systemowe)

## Uruchamianie

Po instalacji:
- **Windows**: Kliknij dwukrotnie `start-agent.bat`
- **macOS**: Kliknij dwukrotnie `start-agent.command`

## Co robi Print Agent?

```
[Web Panel] → [Serwer PlantManager] → [Print Agent] → [Drukarka]
```

1. **Wykrywa drukarki** - automatycznie znajduje wszystkie drukarki w systemie
2. **Łączy się z serwerem** - zgłasza dostępne drukarki do PlantManager
3. **Pobiera zadania** - co 5 sekund sprawdza czy są nowe wydruki
4. **Drukuje automatycznie** - bez okna dialogowego, na właściwą drukarkę

## Konfiguracja w PlantManager

Po uruchomieniu agenta, drukarki będą widoczne w:
**Ustawienia → Drukarki**

Możesz przypisać różne drukarki do różnych dokumentów:
- Drukarka termiczna → Etykiety z kodami kreskowymi
- Drukarka laserowa → Faktury, zamówienia, raporty

## Autostart

### Windows
Podczas instalacji zostaniesz zapytany czy dodać do autostartu.
Możesz też ręcznie skopiować `start-agent.bat` do:
`C:\Users\[TwojeImie]\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`

### macOS
1. Otwórz: **Ustawienia systemowe → Ogólne → Logowanie**
2. Kliknij **+** i dodaj `start-agent.command`

## Rozwiązywanie problemów

### Agent nie wykrywa drukarek
- **Windows**: Sprawdź w Panel sterowania → Urządzenia i drukarki
- **macOS**: Sprawdź w Ustawienia systemowe → Drukarki i skanery

### Błąd połączenia z serwerem
- Sprawdź czy adres serwera w pliku `.env` jest poprawny
- Sprawdź czy serwer PlantManager jest uruchomiony
- Sprawdź firewall/zaporę sieciową

### Wydruki nie wychodzą
- Sprawdź czy drukarka jest włączona i online
- Sprawdź kolejkę drukarki w systemie
- Sprawdź logi Print Agent w konsoli

## Pliki konfiguracyjne

- `.env` - konfiguracja (adres serwera, nazwa agenta)
- `agent-config.json` - unikalny ID agenta (tworzony automatycznie)

## Wsparcie

Problemy zgłaszaj na: https://github.com/[repo]/issues
