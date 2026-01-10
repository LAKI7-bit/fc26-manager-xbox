# FC26 Manager → Microsoft Store / Xbox (gotowa instrukcja)

Ta aplikacja jest PWA (HTML/CSS/JS). Jeśli chcesz **naprawdę tylko Xbox**, to nie wystarczy paczka z PWABuilder (zwykle generuje Desktop/Holo i dorzuca restricted capability `runFullTrust`).

Dla Xbox masz 2 sensowne warianty publikacji:
1) **Hosted PWA** (jeśli Twoje konto/produkt ma taką ścieżkę w Partner Center dla Xbox)
2) **UWP wrapper na Xbox** (pewna ścieżka “pakietowa” – bez `runFullTrust`)

W repo masz już:
- obsługę pada (2 kontrolery) + fokus nawigacyjny + HUD z legendą przycisków,
- ikonki przycisków (A/B/X/Y/Menu) przy kluczowych akcjach,
- Service Worker (sw.js) i dopięty manifest pod PWA/Store.

## 0) Co dokładnie znaczy „wrzucić na Xboxa?” (2 opcje)

Masz dwie realne ścieżki:

1. **Najlepsza (docelowa): Microsoft Store → Hosted PWA**
   - Dostajesz normalną aplikację w Store (kafelek, instalacja, uruchamianie jak appka).
   - To wciąż web‑app w kontenerze Edge/WebView (plus: szybkie aktualizacje, zero kompilacji natywnej).

2. **Szybki test (bez Store): Xbox → Microsoft Edge → otwórz link**
   - Działa od razu, ale to jest uruchomienie w przeglądarce.
   - Do testów przed publikacją: idealne.

3. **Xbox Store jako paczka (UWP wrapper – rekomendowane gdy Partner Center wymaga “Packages”)**
   - To jest mała aplikacja UWP na Xbox, która otwiera Twoją stronę `https://fc26-manager-xbox.web.app/` w WebView.
   - Bez `runFullTrust`, z `TargetDeviceFamily=Windows.Xbox`.
   - Projekt wrappera jest w folderze: `xbox-uwp-wrapper/`.

W tej kopii „XBOX” domyślnie włączony jest **Tryb TV** (możesz go wyłączyć w sidebarze).

## 0.2) Ważne: ta wersja NIE ma zastąpić Twojej apki „telefon/PC”

Jeśli w innym folderze masz już działającą apkę i zrobiłeś tam `firebase deploy`, to:
- **Nie deployuj tej wersji na ten sam Hosting site/URL**, bo nadpiszesz zawartość (Hosting działa jak „wrzucenie nowych plików” pod dany adres).

Najbezpieczniej (i to rekomenduję):
1. **Osobny Firebase project** dla wersji XBOX (osobne `...web.app`).

Alternatywa:
2. Osobny Hosting site w tym samym projekcie (działa, ale łatwiej się pomylić).

Zabezpieczenia w tym folderze:
- W [firebase.json](firebase.json) jest `"target": "xbox"`.
- W [\.firebaserc](.firebaserc) nie ma ustawionego `default` (żeby przypadkowy deploy nie poszedł na stary projekt).

## 0.1) Wymagania (Windows)

- Konto deweloperskie w **Partner Center** (płatne, jednorazowo) – potrzebne do publikacji w Store.
- Node.js (LTS) + npm.
- Firebase CLI (`firebase-tools`).
- Hosting HTTPS (np. Firebase Hosting).

Polecane: Chrome/Edge na PC do testów (DevTools → Application → Manifest / Service Worker).

## 1) Sterowanie padem (Xbox)

**Globalnie (wszędzie):**
- **D‑Pad / Lewy drążek**: poruszanie fokusem (podświetlenie zieloną ramką).
- **A**: wybierz / kliknij (aktywny element).
- **B**: wstecz (zamyka modal/overlay/sidebar, wraca ekranem, anuluje).
- **MENU (Start/Menu)**: otwiera/zamyka sidebar.
- **VIEW (Back/View)**: pokazuj/ukrywaj HUD z podpowiedziami.

**Ekran losowania (Drawing) – 2 pady naraz:**
- **Pad 1 (P1)** steruje Drużyną 1:
  - **A** = „Biorę”
  - **X** = „Przelosuj”
  - **Y** = „Wybierz ręcznie”
- **Pad 2 (P2)** steruje Drużyną 2:
  - **A** = „Biorę”
  - **X** = „Przelosuj”
  - **Y** = „Wybierz ręcznie”

Na dole ekranu pojawia się HUD z legendą, a przy przyciskach w UI są etykiety typu **P1 A**, **P2 X** itd.

### Tryb TV (większy interfejs)
- Po wykryciu pada aplikacja automatycznie włącza **Tryb TV** (większe cele, większa czytelność z kanapy).
- Możesz to ręcznie przełączyć w sidebarze: **📺 Tryb TV (ON/OFF)**.
- Ustawienie jest zapamiętywane lokalnie.

## 2) Droga do Microsoft Store: „Hosted PWA”

To rekomendowana opcja: Store instaluje „apkę”, ale content jest z Twojego HTTPS hostingu.

### Krok A — utwórz osobny projekt Firebase dla wersji XBOX (REKOMENDOWANE)

To jest najpewniejsze, bo wtedy ta wersja **nigdy** nie nadpisze Twojej apki telefon/PC.

1. Wejdź w Firebase Console i utwórz nowy projekt (np. `fc26-manager-xbox`).
2. W nowym projekcie włącz to, czego używa ta aplikacja (konkretnie):
   - **Authentication** (Gość/Anonymous + e‑mail)
   - **Firestore** (tu trzymane są dane)

Ta wersja **nie korzysta** z Realtime Database (RTDB) ani Firebase Storage, więc nie musisz ich włączać.
3. Dodaj aplikację typu **Web app** (żeby dostać `firebaseConfig`).
4. Skopiuj `firebaseConfig` i wklej go w [script.js](script.js) w miejscu "KONFIGURACJA FIREBASE - WKLEJ SWOJE DANE TUTAJ".
   - Ważne: ta wersja ma osobny identyfikator danych: `appId = 'fc26-manager-xbox'`.
   - Jeśli Twoje `firebaseConfig` nie ma pola `databaseURL`, to jest OK (RTDB nie jest używane).
5. Auth → Settings → Authorized domains:
   - po deploy dodaj domenę `...web.app`/`...firebaseapp.com` (Firebase zwykle dodaje automatycznie, ale sprawdź).

### Krok B — podłącz ten folder do nowego projektu (Firebase CLI)

Masz już `firebase.json`, więc robisz tylko powiązanie projektu i deploy.

1. Otwórz PowerShell w folderze tego projektu (XBOX).
   - Najprościej: w VS Code → Terminal → New Terminal.

2. Sprawdź, czy masz Node i npm:
   - `node -v`
   - `npm -v`

3. Zainstaluj Firebase CLI (jeśli jeszcze nie masz):
   - `npm i -g firebase-tools`

4. Zaloguj się do Firebase (otworzy przeglądarkę):
   - `firebase login`

5. Sprawdź, czy CLI widzi Twoje projekty:
   - `firebase projects:list`
   - Na liście powinieneś widzieć swój projekt `fc26-manager-xbox`.

6. Teraz „podpinamy folder” pod projekt XBOX przez alias.
   - Wpisz: `firebase use --add`
   - CLI uruchomi kreator i zapyta mniej więcej tak:
     - "Which project do you want to add?" → wybierz z listy **fc26-manager-xbox** (strzałki + Enter)
     - "What alias do you want to use for this project?" → wpisz dokładnie: `xbox`

7. Sprawdź, czy alias się ustawił:
   - `firebase use`
   - Powinieneś zobaczyć coś w stylu:
     - `xbox (fc26-manager-xbox)`

8. (Opcjonalnie) Jeśli chcesz, żeby wszystkie kolejne komendy same celowały w XBOX:
   - `firebase use xbox`

Po tym w [\.firebaserc](.firebaserc) zobaczysz mapowanie aliasu `xbox` → ID Twojego projektu.

Jeśli utkniesz na tym kroku (najczęstsze problemy):
- `firebase` nie działa → zamknij terminal i otwórz nowy (albo zrestartuj VS Code), ewentualnie `npm i -g firebase-tools` jeszcze raz.
- `firebase projects:list` nie pokazuje projektu → zaloguj się na właściwe konto Google (to samo, na którym masz projekt w Firebase Console).
- Masz już inne aliasy/projekty w tym folderze → sprawdź [\.firebaserc](.firebaserc) i upewnij się, że nie ma `default`.

### Krok C — skonfiguruj Hosting w tym nowym projekcie

Tu chodzi o to, żeby projekt XBOX miał włączony Hosting i żeby `hosting:xbox` miał wskazany konkretny site.

0. Upewnij się, że działasz na projekcie XBOX:
   - `firebase use` (zobacz czy aktywny jest `xbox`)
   - albo dopnij `--project xbox` do komend.

1. Włącz Hosting w tym projekcie (jeśli jeszcze nie jest włączony):
   - `firebase init hosting`

2. Kreator zada kilka pytań. Odpowiedz tak:
   - "Please select an option" → wybierz **Use an existing project** (jeśli pyta)
   - Wybierz projekt: **fc26-manager-xbox**
   - "What do you want to use as your public directory?" → wpisz: `.`
   - "Configure as a single-page app (rewrite all urls to /index.html)?" → **N** (nie)
   - "Set up automatic builds and deploys with GitHub?" → **N** (nie)
   - Jeśli pyta o overwrite plików → zazwyczaj **N** (nie), bo te pliki już masz

3. Utwórz (albo wybierz) Hosting site.
   Najpierw zobacz, jakie site’y istnieją w projekcie XBOX:
   - `firebase hosting:sites:list --project xbox`

   Jeśli lista jest pusta albo chcesz mieć czytelną nazwę:
   - `firebase hosting:sites:create fc26-manager-xbox --project xbox`

4. Podepnij site pod target `xbox` (to jest jednorazowe):
   - `firebase target:apply hosting xbox fc26-manager-xbox --project xbox`

5. Sprawdź, czy target jest poprawnie ustawiony:
   - `firebase target --project xbox`
   - albo po prostu zajrzyj do [\.firebaserc](.firebaserc) i sprawdź, czy w sekcji `targets` masz `hosting.xbox` ustawiony na `fc26-manager-xbox`.

Po tym `hosting:xbox` będzie kierował deploy na `fc26-manager-xbox`.

### Krok D — deploy (bezpieczny)

Zawsze deployuj tylko hosting XBOX:
- `firebase deploy --only hosting:xbox --project xbox`

Po deploy dostaniesz adres typu `https://<SITE_ID>.web.app`.

Ważne: w tym projekcie [firebase.json](firebase.json) ma ustawione cache:
- HTML jest `no-cache` (aktualizacje wchodzą szybko)
- assety (JS/CSS/obrazy) są długo cache’owane, ale mamy cache-busting w linkach `?v=...`.

### STOP — gdzie jesteś teraz (żeby się nie pogubić)

Jeśli udało Ci się wykonać:
- `firebase deploy --only hosting:xbox --project xbox`

…i terminal pokazał **Hosting URL**, to kroki A–D masz zrobione.
Od tego momentu nie „robisz kolejnego kroku B z jakiejś linii”, tylko lecisz w kolejności poniżej.

### Krok E — włącz wymagane usługi w Firebase (TO MUSISZ ZROBIĆ W KONSOLI)

Wejdź do Firebase Console projektu `fc26-manager-xbox`:
1. **Authentication → Sign-in method**:
   - włącz **Anonymous** (Gość)
   - włącz **Email/Password**
2. **Firestore Database**:
   - utwórz bazę (Start in test mode na chwilę do testów albo production, jeśli ogarniasz reguły)

Bez tego logowanie/zapis w chmurze nie zadziała.

### Krok F — test na PC (czy wszystko działa)
1. Otwórz swój Hosting URL w Edge/Chrome.
2. Sprawdź:
   - logowanie Gość działa
   - nie ma czerwonych błędów w konsoli
   - Step1/Step2/Losowanie działają
3. DevTools → Application:
   - Manifest się ładuje
   - Service Worker `sw.js` jest zarejestrowany

### Krok G — test na Xbox (przed Store)
1. Xbox → Microsoft Edge → wejdź na Hosting URL.
2. Sprawdź pada (HUD/fokus) i Tryb TV.

### Krok H — publikacja w Partner Center (PWA)
1. Wejdź na Partner Center: https://partner.microsoft.com/
2. Zrób (jeśli trzeba) „Developer account” i uzupełnij dane firmy/osoby.
    - Możesz logować się na swoje główne konto Microsoft (nie trzeba zakładać nowego).
    - Jeśli podczas rejestracji wyskoczy ekran „W jaki sposób chcesz zostać partnerem firmy Microsoft?” z checkboxami:
       - wybierz: **Opracowywanie aplikacji konsumenckich, takich jak gry dla konsoli Xbox i aplikacje dla systemu Windows (Developer produktów dla konsumentów)**
       - to jest najbliższe temu, co robisz (apka na Windows/Xbox)
    - Jeśli wyskoczy ekran „Dołącz do programu, aby odblokować nowe szanse sprzedaży” z listą (Minecraft / FlightSim / Bethesda / Windows and Xbox):
       - wybierz: **Windows and Xbox** (to rejestracja dewelopera aplikacji do Microsoft marketplaces)

#### Jak utworzyć aplikację w Partner Center (klik po kliku)

To jest część, w której najłatwiej się pogubić, bo Microsoft ma kilka „portali” wyglądających podobnie.

**Najpierw upewnij się, że jesteś w portalu do publikacji aplikacji (a nie w marketingowym partner program):**
- Wejdź na https://partner.microsoft.com/dashboard
- Szukaj kafelka/sekcji typu **Apps and games** albo **Windows and Xbox**.

Jeśli nie widzisz **Apps and games / Windows and Xbox**:
- Najczęściej oznacza to, że rejestracja deweloperska nie jest dokończona (dane/zgody/opłata).
- Dokończ rejestrację dla **Windows and Xbox**, dopiero potem pojawia się część do publikacji.

**Masz już utworzoną aplikację (tak jak na screenie „FC26 MANAGER → Wydanie produktu”)?**
Wtedy robisz to tak, dokładnie w tej kolejności:

1. Wejdź w **Wydanie produktu** (to co masz na screenie) i klikaj po kolei sekcje z listy:
   - **Właściwości** → uzupełnij dane aplikacji
   - **Klasyfikacje wiekowe** → wypełnij IARC
   - **Ceny i dostępność** → ustaw rynki i cenę (np. Darmowa)

2. W **Właściwości** ustaw/upewnij się, że to jest PWA/Hosted i wklej URL:
   - `https://fc26-manager-xbox.web.app`
   Jeśli jest pole „Privacy policy URL”, wpisz:
   - `https://fc26-manager-xbox.web.app/privacy.html`

3. W **Klasyfikacje wiekowe (IARC)** wypełnij ankietę zgodnie z prawdą.
   - To jest wymagane, inaczej przycisk „Prześlij do certyfikacji” zwykle nie przejdzie.

4. Wróć do **Wydanie produktu** i dopiero wtedy kliknij **Prześlij do certyfikacji**.

Jeśli w „Właściwości” widzisz tylko upload paczek (MSIX) i nigdzie nie ma URL:
- to znaczy, że utworzyłeś aplikację jako „packaged app”. Wtedy masz 2 wyjścia:
  - utworzyć nową aplikację jako web/PWA (hosted)
   - albo iść ścieżką **UWP wrapper na Xbox** (sekcja 3)

## 3) Xbox ONLY: UWP wrapper (bez runFullTrust)

Jeśli w Partner Center jesteś w zakładce **Packages** i widzisz upload `.msix/.msixbundle/.appx/.appxbundle`, to ta instrukcja jest dla Ciebie.

W tym repo masz gotowy minimalny wrapper UWP:
- `xbox-uwp-wrapper/FC26ManagerXbox.sln`

### 3.1) Co skopiować z Partner Center
Partner Center → FC26 MANAGER → **Tożsamość produktu**:
- `Package/Identity name` → wklejasz jako `Identity Name`
- `Publisher` (`CN=...`) → wklejasz jako `Publisher`

### 3.2) Visual Studio (wymagane)
1. Zainstaluj Visual Studio 2022 + workload **Universal Windows Platform development**.
2. Otwórz `xbox-uwp-wrapper/FC26ManagerXbox.sln`.
3. Otwórz `Package.appxmanifest` i upewnij się, że masz:
    - `TargetDeviceFamily Name="Windows.Xbox"`
    - `internetClient`
    - brak `runFullTrust`

### 3.3) Skojarzenie ze Store i wygenerowanie paczki
1. Visual Studio → **Project → Store → Associate App with the Store…** → wybierz istniejący produkt `FC26 MANAGER`.
2. Visual Studio → **Project → Publish → Create App Packages…** → **Microsoft Store**.
3. Architektura: **x64**.
4. Wygeneruje Ci plik `.appxupload`/`.msixupload`.

### 3.4) Upload do Partner Center
Partner Center → **Packages** → wrzuć `.appxupload`/`.msixupload`.
Ustaw device family availability na **Windows 10/11 Xbox**.

Tip: jeśli chcesz najpierw sprawdzić na własnym Xboxie, a dopiero potem publikować „publicznie”, to:
- najpierw testuj przez Edge na Xbox (patrz sekcja 4A)
- dopiero po poprawkach idź w submission do Store

### Alternatywa (mniej polecana): osobny Hosting site w tym samym projekcie

Jeśli koniecznie chcesz ten sam projekt Firebase (wspólne Auth/Firestore), to zrób osobny site + target i deployuj zawsze `--only hosting:xbox`.
Ta opcja jest już opisana wyżej, ale dla „100% pewności” lepszy jest osobny projekt.

Plusy: nie martwisz się o podpisywanie paczek. Minusy: musi działać hosting.

## 3) Alternatywa: MSIX z PWABuilder (też działa w Store)

To opcja, gdy wolisz wysłać paczkę MSIX.

1. Wejdź na PWABuilder:
   - https://www.pwabuilder.com/
2. Wklej URL Twojej aplikacji (z Firebase Hosting).
3. Wybierz „**Windows**” → wygeneruj paczkę.
4. Pobierz MSIX.
5. W Partner Center wybierz aplikację typu „Packaged app” i wgraj MSIX.

**Uwaga o podpisie:**
- Do Store zwykle **Partner Center** ogarnia podpisywanie w procesie publikacji.
- Jeśli chcesz instalować MSIX lokalnie „poza Store”, wtedy potrzebujesz podpisu/certyfikatu developerskiego (inna ścieżka).

**Uwaga o Xbox:** MSIX jest super na Windows. Na Xbox najpewniejszą drogą i tak jest publikacja przez Store jako PWA/hosted (czyli sekcja 2).

## 4) Xbox: uruchomienie (test) i instalacja (Store)

### 4A — test na Xbox bez Store (najpierw to zrób)
1. Na Xbox otwórz **Microsoft Edge**.
2. Wejdź na URL z hostingu: `https://...web.app`.
3. Podłącz pada/pady.
4. Sterowanie:
   - D‑Pad/drążek = fokus
   - A = wybierz
   - B = wstecz
   - MENU = sidebar
   - VIEW = HUD

Jeśli tu działa dobrze, to publikacja w Store zwykle przechodzi bez „niespodzianek”.

### 4B — po publikacji w Microsoft Store
1. Na Xbox → Microsoft Store → wyszukaj nazwę aplikacji.
2. Zainstaluj.
3. Uruchom.
4. Podłącz 1–2 pady Xbox.
5. HUD + fokus włączają się automatycznie.

## Czy to działa jak „pełnoprawna apka” na Xbox?

Tak — z perspektywy użytkownika końcowego w Microsoft Store to jest **instalowana aplikacja**:
- Masz kafelek, możesz przypiąć, uruchamiasz jak normalną aplikację.
- Otwiera się w **pełnym ekranie** (kontener Edge/WebView). Nie wygląda jak „strona w przeglądarce”.
- Działa z padem dzięki **Gamepad API**.
- Aktualizacje: przy **Hosted PWA** zmiany na hostingu wchodzą bez reinstalacji, a Service Worker przyspiesza start i utrzymuje „app shell” w cache.

Różnice względem natywnej aplikacji:
- To nadal web‑app w sandboxie: brak typowego dostępu do systemu plików/urządzeń jak w natywnych grach.
- Gdy nie ma internetu, aplikacja może wystartować z cache (app‑shell), ale dane z chmury (Firebase/CDN) wymagają połączenia.
- Brak pracy w tle jak w natywnych usługach systemowych.

## 5) Ważne uwagi (żeby certyfikacja przeszła)
- Hosting musi być **HTTPS**.
- Unikaj błędów w konsoli (szczególnie przy starcie aplikacji).
- Podaj politykę prywatności w Partner Center (link).
- PWA w Store to w praktyce wrapper na Edge/WebView — połączenia z Firebase i CDN muszą być stabilne.

## 6) Aktualizacje i „czemu Xbox ma starą wersję?”

W tej apce są 3 warstwy cache:
1. Firebase Hosting (HTML jest `no-cache`, ale JS/CSS są długo cache’owane)
2. Cache-busting w URL (`style.css?v=...`, `script.js?v=...`) – to jest OK
3. Service Worker (`sw.js`) – trzyma app-shell

Jeśli wypchnąłeś nową wersję i na Xbox dalej jest stara:
- podbij `CACHE_VERSION` w [sw.js](sw.js) (np. `fc26mgr-vYYYYMMDD-N`) i zrób `firebase deploy`
- na Xbox wejdź w ustawienia strony w Edge i wyczyść dane dla witryny (jeśli trzeba)
- ewentualnie w samej apce wciśnij `B` kilka razy (zamyka modale) i odśwież

## 7) Minimalny checklist „gotowe do Store”

- [ ] URL działa na Xbox Edge
- [ ] Brak krytycznych błędów w konsoli na starcie
- [ ] `manifest.json` i `sw.js` działają
- [ ] Masz: privacy policy URL + support/contact
- [ ] Masz screenshoty 16:9
- [ ] Wybrany target: Windows + Xbox

## Pliki istotne
- `sw.js` – cache app-shell
- `manifest.json` – ustawienia PWA/Store
- `script.js` – `window.GamepadManager` (2 pady + fokus + mapowanie)
- `style.css` – HUD, ikonki przycisków, focus ring TV

W tej kopii XBOX jest już: ekran pomocy sterowania, skróty X/Y, paging LB/RB, oraz pełny TV layout.