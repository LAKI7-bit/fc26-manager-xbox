# FC26 MANAGER – Xbox (UWP wrapper)

Ten folder to **minimalny wrapper UWP dla Xbox** (bez `runFullTrust`). Uruchamia Twoją aplikację hostowaną na Firebase:

- Start URL: https://fc26-manager-xbox.web.app/
- Privacy: https://fc26-manager-xbox.web.app/privacy.html

## Wymagania
- Windows 10/11
- (Opcja A) Visual Studio z workload: **Universal Windows Platform development**
- (Opcja B) Bez Visual Studio lokalnie: **GitHub Actions (cloud build)**

## Kroki (Partner Center / Store)
1. Partner Center → FC26 MANAGER → **Tożsamość produktu** → skopiuj:
   - **Package/Identity name** (np. `LAKIseven.FC26MANAGER`)
   - **Publisher** (`CN=...`)

2. Otwórz rozwiązanie:
   - `xbox-uwp-wrapper/FC26ManagerXbox.sln`

3. W Visual Studio:
   - Otwórz `Package.appxmanifest` i wklej swoje wartości **Identity Name** i **Publisher** (dokładnie 1:1 jak w Partner Center).

4. **Project → Store → Associate App with the Store…**
   - Wybierz istniejącą aplikację `FC26 MANAGER`.

5. **Project → Publish → Create App Packages…**
   - Wybierz: **Microsoft Store**
   - Architektura: **x64**
   - Docelowa rodzina urządzeń: **Windows.Xbox**

6. Partner Center → **Packages** → wgraj wygenerowany `.appxupload`/`.msixupload`.
   - Device family availability: zaznacz tylko **Windows 10/11 Xbox**.

Jeśli Visual Studio nie pokazuje opcji Xbox albo Partner Center nie pozwala na Xbox, to znaczy że konto nie ma włączonej dystrybucji na Xbox (wymaga programu/zgody Microsoft).

## Opcja B: Cloud build (bez Visual Studio na Twoim PC)

Jeśli na Twoim komputerze nie da się doinstalować narzędzi UWP/XAML, paczkę do Partner Center możesz zbudować w chmurze.

1. Wrzuć ten projekt do repozytorium na GitHub.
2. W repozytorium wejdź w: **Settings → Secrets and variables → Actions → New repository secret**
   - dodaj sekret: `PFX_PASSWORD` (dowolne hasło, np. 16+ znaków)
3. Uruchom workflow:
   - **Actions → Build Xbox UWP (Store Upload) → Run workflow**
4. Po zakończeniu pobierz artefakt: **store-upload-package**.
   - w środku będzie `.appxupload`/`.msixupload` do wgrania w Partner Center.

Ważne:
- `Package.appxmanifest` musi mieć **Identity Name** i **Publisher** dokładnie takie jak w Partner Center (Tożsamość produktu).
