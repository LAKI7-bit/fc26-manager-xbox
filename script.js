
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDocs, deleteDoc, collectionGroup } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// Zastąp starą linię z "firebase-auth.js" tą poniższą:
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

        // Teams catalog will be loaded from Firestore; keep a small fallback only if needed
        window.Catalog = { teams: [] };

        const Haptics = {
            supported: null,
            lastTap: 0,
            intensity: 2.2, // overall strength multiplier
            vibrate(p) {
                try {
                    if (this.supported !== false && navigator && typeof navigator.vibrate === 'function') {
                        const scaled = Array.isArray(p)
                            ? p.map(v => Math.max(1, Math.round(v * this.intensity)))
                            : Math.max(1, Math.round(p * this.intensity));
                        navigator.vibrate(scaled);
                        this.supported = true;
                        return;
                    }
                    this.supported = false;
                    const isArray = Array.isArray(p);
                    const isMajor = isArray || (typeof p === 'number' && p >= 15);
                    if (!window.Sound?.muted) {
                        const k = Math.max(1, this.intensity);
                        if (isMajor) {
                            window.Sound?.playOsc(160, 'sine', 0.06 * k, 0.05 * k);
                            setTimeout(() => window.Sound?.playOsc(120, 'sine', 0.05 * k, 0.05 * k), 60);
                        } else {
                            window.Sound?.playOsc(240, 'sine', 0.03 * k, 0.03 * k);
                        }
                    }
                } catch (_) { /* no-op */ }
            },
            tap() {
                const now = performance.now();
                if (now - this.lastTap < 60) return; // prevent double-taps from stacking
                this.lastTap = now;
                this.vibrate(14);
            }
        };

        function updateTopbarCssVars() {
            try {
                const tb = document.getElementById('top-bar');
                if (!tb) return;
                const h = Math.max(0, Math.round(tb.getBoundingClientRect().height));
                if (h) document.documentElement.style.setProperty('--topbar-h', `${h}px`);
            } catch (_) { /* no-op */ }
        }

        function safeScrollToEl(el, behavior = 'smooth') {
            if (!el) return;
            updateTopbarCssVars();
            const topbarH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 96;
            const extra = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scroll-offset')) || 14;
            const y = window.scrollY + el.getBoundingClientRect().top - (topbarH + extra);
            window.scrollTo({ top: Math.max(0, Math.round(y)), behavior });
        }

        window.Sound = {
            ctx: null,
            muted: false,
            _tickBuf: null,
            init() {
                if (!this.ctx) { 
                    this.ctx = new (window.AudioContext || window.webkitAudioContext)(); 
                } 
                if (this.ctx.state === 'suspended') { 
                    this.ctx.resume(); 
                } 
            },
            playBuffer(buf, duration = 0.05, vol = 0.1) {
                if (this.muted) return;
                if (!buf) return;
                if (!this.ctx) this.init();
                const src = this.ctx.createBufferSource();
                const g = this.ctx.createGain();
                src.buffer = buf;
                g.gain.setValueAtTime(vol, this.ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
                src.connect(g);
                g.connect(this.ctx.destination);
                src.start();
                src.stop(this.ctx.currentTime + duration);
            },
            _ensureTickBuf() {
                if (this._tickBuf || this.muted) return;
                if (!this.ctx) this.init();
                try {
                    const sr = this.ctx.sampleRate || 44100;
                    const len = Math.max(1, Math.floor(sr * 0.045));
                    const b = this.ctx.createBuffer(1, len, sr);
                    const d = b.getChannelData(0);
                    // short low “thump” with fast decay
                    for (let i = 0; i < len; i++) {
                        const t = i / len;
                        const env = Math.pow(1 - t, 3);
                        // blend of noise + low sine-ish component
                        const noise = (Math.random() * 2 - 1) * 0.22;
                        const toneA = Math.sin(2 * Math.PI * 85 * (i / sr)) * 0.65;
                        const toneB = Math.sin(2 * Math.PI * 58 * (i / sr)) * 0.25;
                        const tone = toneA + toneB;
                        d[i] = (noise + tone) * env;
                    }
                    this._tickBuf = b;
                } catch (_) {
                    this._tickBuf = null;
                }
            },
            playOsc(freq, type, duration, vol=0.1) { 
                if (this.muted) return;
                if(!this.ctx) this.init(); // Auto-init check
                const o = this.ctx.createOscillator(); 
                const g = this.ctx.createGain(); 
                o.type = type; 
                o.frequency.setValueAtTime(freq, this.ctx.currentTime); 
                g.gain.setValueAtTime(vol, this.ctx.currentTime); 
                g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration); 
                o.connect(g); 
                g.connect(this.ctx.destination); 
                o.start(); 
                o.stop(this.ctx.currentTime + duration); 
            },
            click() {
                if (this.muted) return;
                this.playOsc(160, 'sine', 0.10, 0.28);
                setTimeout(()=>this.playOsc(120, 'sine', 0.09, 0.25), 80);
                Haptics.vibrate([20, 40, 22]);
            }
        };
        Sound.keep = function(){
            this.playOsc(120, 'sine', 0.08, 0.20);
            setTimeout(()=>this.playOsc(160, 'sine', 0.08, 0.18), 60);
            Haptics.vibrate(28);
        };
        // Simple tick for subtle feedback
        Sound.tick = function(){
            if (this.muted) return;
            this.playOsc(90, 'sine', 0.05, 0.08);
        };

        // Roulette card-skip: short "puk" + haptic per item
        Sound.rouletteTick = function(){
            if (this.muted) return;
            // throttle: roulette can be very fast at the start
            const now = performance.now();
            if (this._lastRouletteTick && (now - this._lastRouletteTick) < 46) return;
            this._lastRouletteTick = now;

            // lower, duller “puk” (buffer click is cheaper than osc-per-tick)
            this._ensureTickBuf();
            if (this._tickBuf) {
                this.playBuffer(this._tickBuf, 0.045, 0.22);
            } else {
                this.playOsc(150, 'square', 0.020, 0.09);
                setTimeout(()=>this.playOsc(105, 'sine', 0.018, 0.05), 10);
            }
            // Prevent stutter on desktop: no haptic fallback audio for roulette ticks
            if (navigator && typeof navigator.vibrate === 'function') {
                Haptics.vibrate(14);
            }
        };
        // Draw start: brief rolling sequence
        Sound.drawStart = function(){
            if (this.muted) return;
            this.playOsc(140, 'sine', 0.10, 0.12);
            setTimeout(()=>this.playOsc(180, 'sine', 0.10, 0.12), 90);
            setTimeout(()=>this.playOsc(220, 'sine', 0.10, 0.12), 180);
            Haptics.vibrate([12, 18, 14]);
        };
        // Draw win: short fanfare
        Sound.drawWin = function(){
            if (this.muted) return;
            this.playOsc(180, 'sine', 0.12, 0.16);
            setTimeout(()=>this.playOsc(220, 'sine', 0.12, 0.16), 120);
            setTimeout(()=>this.playOsc(260, 'sine', 0.12, 0.16), 240);
            Haptics.vibrate([20, 36, 22]);
        };
        // Clash: VS overlay thump
        Sound.clash = function(){
            if (this.muted) return;
            this.playOsc(80, 'sine', 0.20, 0.22);
            setTimeout(()=>this.playOsc(60, 'sine', 0.18, 0.22), 120);
            Haptics.vibrate([30, 60, 40]);
        };

        function setupMuteButton(){
            const btn = document.getElementById('mute-sound-btn');
                if (!btn) return;
                const render = () => { btn.innerText = Sound.muted ? '🔇' : '🔈'; btn.title = Sound.muted ? 'Włącz dźwięk' : 'Wyłącz dźwięk'; };
            render();
            btn.onclick = () => { Sound.muted = !Sound.muted; render(); Haptics.vibrate(8); };
};

// Global abort controller
        window.abortController = { aborted: false };

        const shuffleInPlace = (arr) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = arr[i];
                arr[i] = arr[j];
                arr[j] = tmp;
            }
            return arr;
        };
        const getDrawPlaceholderHTML = () => {
            return `
                <div class="draw-placeholder w-full h-full flex items-center justify-center">
                    <div class="draw-placeholder-card">
                        <div class="draw-placeholder-mark" aria-hidden="true"></div>
                        <div class="draw-placeholder-title">Gotowi na losowanie?</div>
                        <div class="draw-placeholder-sub">Kliknij <span class="font-black text-white">LOSUJ DRUŻYNY</span> lub wybierz ręcznie</div>
                    </div>
                </div>
            `;
        };
        const resetMatchUI = () => {
    ['team1-panel', 'team2-panel'].forEach(id => { 
        const el = document.getElementById(id);
        el.className = 'fut-card-empty rounded-3xl p-3 relative transition-all duration-500 flex flex-grow flex-col items-center justify-center overflow-hidden h-full';
        el.style.background = '';
        el.innerHTML = getDrawPlaceholderHTML();
    });
    document.documentElement.classList.remove('allow-x-scroll');
    document.body.classList.remove('allow-x-scroll');
    document.getElementById('draw-teams-btn').classList.remove('hidden', 'opacity-50');
    document.getElementById('draw-teams-btn').disabled = false;
    document.getElementById('team1-actions').classList.add('hidden');
    document.getElementById('team1-actions').classList.remove('invisible');
    document.getElementById('team2-actions').classList.add('hidden');
    document.getElementById('team2-actions').classList.remove('invisible');
    document.getElementById('results-container').classList.add('hidden');
    document.getElementById('abort-draw-btn').classList.add('hidden');
    document.getElementById('manual-btn-1').classList.remove('hidden');
    document.getElementById('manual-btn-2').classList.remove('hidden');
};

        // --- CACHED DATA STORE (Sync with Firebase) ---
        const Store = {
            players: ['Gracz 1', 'Gracz 2'],
            matches: [],
            session: [],
            state: null,
            meta: {}, 
            loaded: { players: false, matches: false, session: false, state: false, meta: false, catalog: false }
        };

        const DataManager = {
            db: null,
            auth: null,
            userId: null,
            appId: null,

            async init() {
                // KONFIGURACJA FIREBASE - WKLEJ SWOJE DANE TUTAJ
                const firebaseConfig = {
    apiKey: "AIzaSyAAIfg6lyAzK7m_RSVXo3zV0vjlZVycS9w",
    authDomain: "fc26-manager-xbox.firebaseapp.com",
    projectId: "fc26-manager-xbox",
    storageBucket: "fc26-manager-xbox.firebasestorage.app",
    messagingSenderId: "851120384448",
    appId: "1:851120384448:web:b29c7466bfb313a3c8c025"
};

                const app = initializeApp(firebaseConfig);
                this.auth = getAuth(app);
                this.db = getFirestore(app);
                
                // Stała nazwa Twojej aplikacji w bazie danych
                this.appId = 'fc26-manager-xbox';

                // Usunięto logikę __initial_auth_token (jest tylko dla środowiska testowego)

                onAuthStateChanged(this.auth, (user) => {
    if (user) {
        // Pozwól wejść każdemu zalogowanemu (gość lub email, nawet bez weryfikacji)
        this.userId = user.uid;

        // Ukryj ekran logowania
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('loading-screen').style.display = 'flex';

        // Pokaż info w pasku bocznym
        const emailLabel = document.getElementById('sb-user-email');
        const statusLabel = document.getElementById('sb-user-status');
        if(emailLabel) emailLabel.innerText = user.isAnonymous ? "Konto Gościa" : (user.email || "");
        if(statusLabel) statusLabel.innerText = user.isAnonymous ? "Niezapisane w chmurze" : (user.emailVerified ? "Zweryfikowany" : "Niezweryfikowany");
        const sbHeader = document.querySelector('.sidebar-header');
        if (sbHeader) {
            const isUnverified = user.isAnonymous || !user.emailVerified;
            sbHeader.classList.toggle('unverified', !!isUnverified);
        }

        this.setupListeners();
        this.setupCatalog();
    } else {
        // Brak użytkownika - pokaż ekran logowania
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
    }
});
            },
            // Jednorazowe wgranie katalogu (seed) z pliku JSON hostowanego w appce
            async seedFromUrl(url) {
                // Upewnij się, że mamy użytkownika (w razie czego zaloguj jako Gość)
                if (!this.userId) {
                    try {
                        await signInAnonymously(this.auth);
                    } catch (e) {
                        console.error('Guest login failed for seed:', e);
                        this.showToast("Błąd logowania (Gość)", 'error');
                        return;
                    }
                    // Poczekaj na onAuthStateChanged, który uzupełni userId, ale idź dalej
                }
                try {
                    const resp = await fetch(url, { cache: 'no-cache' });
                    const items = await resp.json();
                    await this.seedCatalog(items);
                    this.showToast("Katalog drużyn wgrany!");
                } catch (e) {
                    console.error('Seed error:', e);
                    const msg = (e && (e.message || e.code)) ? e.message || e.code : 'Błąd wgrywania katalogu';
                    this.showToast(msg, 'error');
                }
            },
            async seedCatalog(items) {
                if (!Array.isArray(items) || items.length === 0) { this.showToast("Pusty plik seed", 'error'); return; }
                const makeId = (name) => name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_\-]/g,'');
                const batchWrites = [];
                for (const t of items) {
                    // Walidacja wymaganych pól
                    if (!t || !t.name || !t.league) continue;
                    const id = makeId(t.name);
                    const data = {
                        name: t.name,
                        stars: Number(t.stars || 3.5),
                        league: t.league,
                        colors: (t.colors && t.colors.p && t.colors.s) ? t.colors : { p: '#1f2937', s: '#374151' }
                    };
                    // Sofifa ID też zapisujemy, jeśli jest
                    if (t.id) data.id = t.id;
                    // Dodaj tylko istniejące pola (Firestore nie akceptuje undefined)
                    if (t.logo) data.logo = t.logo;
                    // Nie zapisuj flag dla reprezentacji (National)
                    if (t.flag && t.league !== 'National') data.flag = t.flag;

                    // zapis TYLKO do gałęzi catalog_leagues
                    const leagueCol = collection(this.db, 'artifacts', this.appId, 'catalog_leagues', t.league, 'teams');
                    batchWrites.push(setDoc(doc(leagueCol, id), data));
                }
                await Promise.all(batchWrites);
            },
            async applyLogoMapping(url) {
                // Uzupełnij/brakujące loga dla reprezentacji według mapy nazw -> logo URL
                // 1) upewnij się, że jesteś zalogowany (Gość ok)
                if (!this.userId) {
                    try { await signInAnonymously(this.auth); } catch(e){ this.showToast('Błąd logowania (Gość)', 'error'); return; }
                }
                try {
                    const resp = await fetch(url, { cache: 'no-cache' });
                    const map = await resp.json();
                    if (!Array.isArray(map) || map.length === 0) { this.showToast('Mapa logotypów jest pusta', 'error'); return; }
                    const makeId = (name) => name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_\-]/g,'');
                    let updated = 0;
                    for (const item of map) {
                        if (!item || !item.name || !item.logo) continue;
                        const id = makeId(item.name);
                        const data = { logo: item.logo };
                        // Znajdź ligę tej drużyny z bieżącego katalogu
                        const found = (window.Catalog.teams || []).find(t => (t.name||'').toLowerCase() === item.name.toLowerCase());
                        if (found && found.league) {
                            await updateDoc(doc(this.db, 'artifacts', this.appId, 'catalog_leagues', found.league, 'teams', id), data).catch(()=>{});
                            updated++;
                        }
                    }
                    this.showToast(`Zaktualizowano loga: ${updated}`);
                } catch (e) {
                    console.error('applyLogoMapping error:', e);
                    const msg = (e && (e.message || e.code)) ? e.message || e.code : 'Błąd aktualizacji logotypów';
                    this.showToast(msg, 'error');
                }
            },
            setupCatalog() {
                // Proste i odporne: collectionGroup subskrypcja wszystkich 'teams' spod catalog_leagues
                try {
                    const teamsGroup = collectionGroup(this.db, 'teams');
                    const fallbackColors = { p: '#1f2937', s: '#374151' };
                    onSnapshot(teamsGroup, (snap) => {
                        const teams = snap.docs
                          .filter(d => {
                              try {
                                  const teamsCol = d.ref.parent; // 'teams'
                                  const leagueDoc = teamsCol.parent; // {league}
                                  const leaguesCol = leagueDoc?.parent; // 'catalog_leagues'
                                  const appDoc = leaguesCol?.parent; // {appId}
                                  const artifactsCol = appDoc?.parent; // 'artifacts'
                                  return artifactsCol?.id === 'artifacts' && appDoc?.id === this.appId && leaguesCol?.id === 'catalog_leagues';
                              } catch(_) { return false; }
                          })
                          .map(d => {
                              const t = d.data() || {};
                              // league z pola albo z nazwy dokumentu ligi w ścieżce
                              let league = t.league;
                              try { const leagueId = d.ref.parent.parent?.id; if (!league) league = leagueId; } catch(_) {}
                              return {
                                  name: t.name || 'Unknown',
                                  stars: Number(t.stars || 3.5),
                                  league: league || 'Rest of World',
                                  id: t.id || undefined,
                                  logo: t.logo || undefined,
                                  flag: t.flag || undefined,
                                  colors: t.colors && t.colors.p && t.colors.s ? t.colors : fallbackColors
                              };
                          });
                        window.Catalog.teams = teams;
                        teams.forEach(t => preloadImage(getTeamLogoUrl(t)));
                        Store.loaded.catalog = true;
                        this.checkLoaded();
                    }, (err) => {
                        console.error('Catalog collectionGroup error:', err);
                        Store.loaded.catalog = true;
                        this.checkLoaded();
                    });
                } catch (e) {
                    console.error('Catalog setup failed:', e);
                    Store.loaded.catalog = true;
                    this.checkLoaded();
                }
            },
            // Opcjonalne czyszczenie: usuń całą gałąź catalog_leagues (uruchamiane ręcznie z konsoli)
            async cleanupCatalogLeagues() {
                if (!this.userId) {
                    try { await signInAnonymously(this.auth); } catch(e) { this.showToast('Błąd logowania (Gość)', 'error'); return; }
                }
                try {
                    const base = collection(this.db, 'artifacts', this.appId, 'catalog_leagues');
                    // Z listy lig weź unikalne z aktualnego katalogu, aby przejść tylko po istniejących
                    const leagues = [...new Set((window.Catalog.teams||[]).map(t => t.league))];
                    let removed = 0;
                    for (const lg of leagues) {
                        const colRef = collection(this.db, 'artifacts', this.appId, 'catalog_leagues', lg, 'teams');
                        const snap = await getDocs(colRef);
                        const dels = [];
                        snap.forEach(d => dels.push(deleteDoc(doc(this.db, 'artifacts', this.appId, 'catalog_leagues', lg, 'teams', d.id)).catch(()=>{})));
                        await Promise.all(dels);
                        removed += snap.size;
                    }
                    this.showToast(`Usunięto dokumenty z catalog_leagues: ${removed}`);
                } catch (e) {
                    console.error('cleanupCatalogLeagues error:', e);
                    this.showToast('Błąd czyszczenia catalog_leagues', 'error');
                }
            },
             setupListeners() {
                if (!this.userId) return;
                const dataCol = collection(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data');

                onSnapshot(doc(dataCol, 'players'), (docSnap) => {
                    if (docSnap.exists()) {
                        Store.players = docSnap.data().list || [];
                    } else {
                        this.savePlayers(['Gracz 1', 'Gracz 2']);
                    }
                    Store.loaded.players = true;
                    this.checkLoaded();
                    if(PlayerManager.renderPool) PlayerManager.renderPool();
                });

                onSnapshot(doc(dataCol, 'matches'), (docSnap) => {
                    if (docSnap.exists()) {
                        Store.matches = docSnap.data().history || [];
                    }
                    Store.loaded.matches = true;
                    this.checkLoaded();
                    // If modal is open, refresh logic
                    if(!document.getElementById('stats-modal').classList.contains('hidden') && window.Stats.activeTab === 'history') {
                        window.Stats.switchTab('history');
                    }
                });

                onSnapshot(doc(dataCol, 'session'), (docSnap) => {
                    if (docSnap.exists()) {
                        Store.session = docSnap.data().used || [];
                    }
                    Store.loaded.session = true;
                    this.checkLoaded();
                    AppState.usedTeams = Store.session;
                    const el = document.getElementById('session-info');
                    if(el) el.innerText = `Drużyny użyte w sesji: ${Store.session.length}`;
                });

                 onSnapshot(doc(dataCol, 'state'), (docSnap) => {
                    if (docSnap.exists()) {
                        Store.state = docSnap.data();
                        if(PlayerManager.loadState) PlayerManager.loadState(); 
                    }
                    Store.loaded.state = true;
                    this.checkLoaded();
                });
                
                onSnapshot(doc(dataCol, 'player_meta'), (docSnap) => {
                    if (docSnap.exists()) {
                        Store.meta = docSnap.data();
                    } else {
                        Store.meta = {};
                    }
                    Store.loaded.meta = true;
                    this.checkLoaded();
                });
            },

            checkLoaded() {
                if(Store.loaded.players && Store.loaded.matches && Store.loaded.session && Store.loaded.state && Store.loaded.meta && Store.loaded.catalog) {
                     const loader = document.getElementById('loading-screen');
                     if(loader) {
                         loader.style.opacity = 0;
                         setTimeout(() => { 
                             loader.style.display = 'none'; 
                             document.getElementById('app-container').classList.remove('hidden');
                             PlayerManager.init(); 
                             MatchRecorder.init();
                             Stats.init(); 
                             MatchEditor.init();
                             AvatarEditor.init();
                             setupMuteButton();
                         }, 500);
                     }
                }
            },

            getPlayers() { return Store.players; },
            getMeta() { return Store.meta; },
            async savePlayers(players) { if(!this.userId) return; Store.players = players; await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'players'), { list: players }); this.showToast("Zapisano graczy!"); },
            async saveMeta(meta) { if(!this.userId) return; Store.meta = meta; await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'player_meta'), meta); this.showToast("Zapisano awatar!"); },
            getMatches() { return Store.matches; },
            async saveMatch(match) { if(!this.userId) { this.showToast("Błąd: Brak autoryzacji.", 'error'); return false; } const newHistory = [...Store.matches, match]; Store.matches = newHistory; await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'matches'), JSON.parse(JSON.stringify({ history: newHistory }))); this.showToast("Zapisano mecz!"); return true; },
            async updateMatchHistory(newHistory) {
                 if (!this.userId) return;
                 Store.matches = newHistory;
                 await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'matches'), JSON.parse(JSON.stringify({ history: newHistory })));
                 this.showToast("Zaktualizowano historię.");
            },
            async clearHistory() { if(!this.userId) return; await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'matches'), { history: [] }); location.reload(); },
            async deleteMatch(id) {
                if (!this.userId) return;
                const newHistory = Store.matches.filter(m => m.id !== id);
                await this.updateMatchHistory(newHistory);
                window.Stats.switchTab('history'); // Refresh history tab
            },
            getSessionUsedTeams() { return Store.session; },
            async addToSession(teamName) { if(!this.userId) return; if(!Store.session.includes(teamName)) { const newSession = [...Store.session, teamName]; Store.session = newSession; await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'session'), { used: newSession }); } },
            async resetSession() { if(!this.userId) return; await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'session'), { used: [] }); this.showToast("Czarna lista drużyn zresetowana!"); },
            getState() { return Store.state; },
            async saveState(state) { if(!this.userId) return; Store.state = state; await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'state'), state); },
            
            async hardReset() { 
                if(!this.userId) return; 
                const settings = document.getElementById('settings-modal');
                if (settings) settings.classList.add('hidden'); 
                const modal = document.getElementById('confirm-reset-modal');
                modal.classList.remove('hidden');

                const confirmAction = document.getElementById('confirm-reset-action');
                const cancelAction = document.getElementById('cancel-reset-action');

                const cleanUp = () => {
                    modal.classList.add('hidden');
                    confirmAction.onclick = null;
                    cancelAction.onclick = null;
                };

                confirmAction.onclick = async () => {
                    Sound.click();
                    confirmAction.innerText = "RESETOWANIE...";
                    confirmAction.disabled = true;
                    
                    try {
                        await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'players'), { list: ['Gracz 1', 'Gracz 2'] });
                        await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'matches'), { history: [] });
                        await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'session'), { used: [] });
                        await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'state'), {}); 
                        await setDoc(doc(this.db, 'artifacts', this.appId, 'users', this.userId, 'fc26_data', 'player_meta'), {});
                        
                        DataManager.showToast("Pełny Reset Zakończony!");
                        cleanUp();
                        setTimeout(() => location.reload(), 1500);
                    } catch (error) {
                        console.error("Błąd podczas twardego resetu:", error);
                        DataManager.showToast("Błąd resetu! Sprawdź konsolę.", 'error');
                        confirmAction.innerText = "Tak, Resetuj!";
                        confirmAction.disabled = false;
                        cleanUp();
                    }
                };
                
                cancelAction.onclick = () => { Sound.click(); cleanUp(); };
            },
            
            showToast(message, type = 'success') { const t = document.getElementById('toast-notification'); t.querySelector('span').innerText = message; t.classList.remove('bg-green-600/90', 'border-green-400', 'bg-red-600/90', 'border-red-400'); if (type === 'error') { t.style.background = 'rgba(239, 68, 68, 0.9)'; t.style.borderColor = '#FCA5A5'; } else { t.style.background = 'rgba(16, 185, 129, 0.9)'; t.style.borderColor = '#34d399'; } t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }
        };

        DataManager.init();

        const AppState = { finalTeam1: null, finalTeam2: null, playersTeam1: [], playersTeam2: [], minStars: 2.5, maxStars: 5, rerolls: { p1: 3, p2: 3 }, rerollSettings: 3, selectedLeague: "All", recordingGoals: { t1: [], t2: [] }, usedTeams: [], drawSelection: [], lastFacts: {} };

// --- LOGIKA LOGOWANIA (MOCK) ---
        window.AuthManager = {
    // Przełączanie widoków w okienku
    switchForm(formName) {
        ['login', 'register', 'reset'].forEach(f => {
            const el = document.getElementById(f + '-form');
            if(el) el.classList.add('hidden');
        });
        document.getElementById(formName + '-form').classList.remove('hidden');
        Sound.click();
    },

    // 1. Logowanie Email/Hasło
    async login() {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-pass').value;
        
        if(!email || !pass) {
            DataManager.showToast("Podaj email i hasło", "error");
            return;
        }

        try {
            const userCredential = await signInWithEmailAndPassword(DataManager.auth, email, pass);
            // Sukces obsłuży onAuthStateChanged w DataManagerze
            
        } catch (error) {
            console.error(error);
            let msg = "Błąd logowania.";
            if (error.code === 'auth/invalid-credential') msg = "Błędny email lub hasło.";
            if (error.code === 'auth/too-many-requests') msg = "Konto tymczasowo zablokowane. Spróbuj później.";
            DataManager.showToast(msg, "error");
        }
    },

    // 2. Rejestracja
    async register() {
        const email = document.getElementById('reg-email').value;
        const pass = document.getElementById('reg-pass').value;

        if (pass.length < 6) {
            DataManager.showToast("Hasło musi mieć min. 6 znaków", "error");
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(DataManager.auth, email, pass);
            await sendEmailVerification(userCredential.user);
            
            DataManager.showToast("Konto utworzone! Sprawdź email i kliknij link.");
            await signOut(DataManager.auth); // Wyloguj, żeby wymusić ponowne logowanie po weryfikacji
            this.switchForm('login');
            
        } catch (error) {
            let msg = "Błąd rejestracji.";
            if (error.code === 'auth/email-already-in-use') msg = "Ten email jest już zajęty.";
            if (error.code === 'auth/invalid-email') msg = "Nieprawidłowy format emaila.";
            DataManager.showToast(msg, "error");
        }
    },

    // 3. Logowanie jako Gość
    async guestLogin() {
        try {
            await signInAnonymously(DataManager.auth);
            DataManager.showToast("Zalogowano jako Gość");
        } catch (error) {
            DataManager.showToast("Błąd logowania gościa", "error");
        }
    },

    // 4. Reset Hasła
    async resetPassword() {
        const email = document.getElementById('reset-email-input').value;
        if (!email) {
            DataManager.showToast("Podaj email.", "error");
            return;
        }

        try {
            await sendPasswordResetEmail(DataManager.auth, email);
            DataManager.showToast("Link wysłany! Sprawdź skrzynkę.");
            this.switchForm('login');
        } catch (error) {
            DataManager.showToast("Błąd. Sprawdź czy email jest poprawny.", "error");
        }
    },

    logout() {
        signOut(DataManager.auth).then(() => {
            location.reload();
        });
    }
};

        // --- LOGIKA PANELU BOCZNEGO ---
        window.Sidebar = {
            open() {
                document.getElementById('sidebar').classList.remove('-translate-x-full');
                const overlay = document.getElementById('sidebar-overlay');
                overlay.classList.remove('hidden');
                setTimeout(() => overlay.classList.add('opacity-100'), 10);
                Sound.click();
            },
            close() {
                document.getElementById('sidebar').classList.add('-translate-x-full');
                const overlay = document.getElementById('sidebar-overlay');
                overlay.classList.remove('opacity-100');
                setTimeout(() => overlay.classList.add('hidden'), 300);
            },
            openProfile() {
                this.close();
                const matches = DataManager.getMatches();
                const totalMinutes = matches.length * 20;
                const hoursNum = Math.round((totalMinutes / 60) * 10) / 10;
                const hours = hoursNum.toFixed(1);
                const books = (totalMinutes / 240).toFixed(1); // Zakładamy 4h na książkę
                const booksNum = parseFloat(books);
                const declBooks = (n) => {
                    const i = Math.abs(n) % 100; const j = i % 10;
                    if (i > 10 && i < 20) return 'książek';
                    if (j === 1) return 'książkę';
                    if (j >= 2 && j <= 4) return 'książki';
                    return 'książek';
                };
                const booksInt = Math.max(1, Math.round(booksNum));
                const readingTiers = [
                    { max: 0.0, title: 'Start', desc: 'Nowy manager. Czas na pierwszy mecz.' },
                    { max: 2, title: 'Rozgrzewka', desc: 'Krótka sesja. Pad jeszcze ciepły.' },
                    { max: 10, title: 'Weekendowy rytm', desc: 'Da się pogodzić granie i czytanie.' },
                    { max: 25, title: 'Wkręcony', desc: 'Widać nawyk. Rozdział dziennie? Może po meczu.' },
                    { max: 50, title: 'Pół-sezon', desc: 'Tu już robi się poważnie.' },
                    { max: 80, title: 'Tryb kariera', desc: 'Kalendarz napięty. 10 stron przerwy dobrze zrobi.' },
                    { max: 120, title: 'Maraton', desc: 'Dużo grania. Mała rutyna czytania się przyda.' },
                    { max: 160, title: 'Ultra', desc: 'To już styl życia. Książka jako cooldown?' },
                    { max: 200, title: 'Legendarny', desc: 'Szacun. Wyzwanie: czytanie między turniejami.' },
                    { max: Infinity, title: 'GOAT', desc: 'Masz własną ligę. Bibliotekarz byłby dumny… albo przerażony.' },
                ];
                const tier = readingTiers.find(t => hoursNum <= t.max) || readingTiers[readingTiers.length - 1];
                const booksLongNote = `W ${hours} godzin grania można byłoby przeczytać ok. ${booksInt} ${declBooks(booksInt)}.`;

                const progressHours = Math.min(200, Math.max(0, hoursNum));
                const progressPct = Math.round((progressHours / 200) * 100);
                const stepHours = [0, 25, 50, 75, 100, 125, 150, 175, 200];
                const markers = stepHours.map(h => {
                    const active = progressHours >= h;
                    return `<div class="flex flex-col items-center gap-1">
                        <div class="w-2.5 h-2.5 rounded-full ${active ? 'bg-yellow-400' : 'bg-white/15'} border border-white/10"></div>
                        <div class="text-[9px] font-bold ${active ? 'text-yellow-300' : 'text-gray-500'}">${h}h</div>
                    </div>`;
                }).join('');

                const content = `
    <div class="p-5">
        <div class="mb-5 flex items-center justify-between">
            <div>
                <h2 class="text-2xl font-black text-blue-300 uppercase tracking-wider">Panel Managera</h2>
                <div class="text-[11px] text-gray-400 font-bold mt-1 uppercase tracking-widest">Twoje podsumowanie i narzędzia</div>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-5">
            <div class="stat-card"><div class="stat-val">${hours}h</div><div class="stat-label">Godziny gry</div></div>
            <div class="stat-card"><div class="stat-val">${matches.length}</div><div class="stat-label">Rozegrane mecze</div></div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="profile-card">
                <div class="text-[11px] text-gray-400 font-bold mb-3 border-b border-gray-700/80 pb-2 uppercase tracking-widest">Zarządzanie danymi</div>
                <div class="flex flex-col gap-2">
                    <button onclick="window.Settings.copyToClipboard()" class="compare-btn text-sm">Eksport (JSON)</button>
                    <button onclick="document.getElementById('profile-import-area').classList.toggle('hidden')" class="select-pill text-sm">Importuj dane</button>
                    <button onclick="window.DataManager.hardReset()" class="select-pill text-sm text-red-400 border-red-400/40">Pełny reset danych</button>
                </div>
                <div id="profile-import-area" class="hidden mt-3">
                    <textarea id="data-textarea-profile" placeholder="Wklej tutaj kod JSON..." class="w-full h-28 bg-black text-green-400 text-[10px] font-mono p-2 rounded border border-gray-700 mb-2"></textarea>
                    <button onclick="window.Settings.loadFromTextarea('data-textarea-profile')" class="select-pill w-full text-sm">Zatwierdź import</button>
                </div>
            </div>

            <div class="profile-card">
                <div class="text-[11px] text-gray-400 font-bold mb-3 border-b border-gray-700/80 pb-2 uppercase tracking-widest">Czytelnicza skala</div>

                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div class="stat-card"><div class="stat-val">${books}</div><div class="stat-label">Równowartość książek</div></div>
                    <div class="stat-card"><div class="stat-val">${progressPct}%</div><div class="stat-label">Postęp</div></div>
                </div>

                <div class="bg-black/25 rounded-xl p-3 border border-white/5">
                    <div class="text-[10px] text-yellow-300 font-black uppercase tracking-widest mb-2">${tier.title}</div>
                    <div class="w-full h-2.5 rounded-full bg-white/10 border border-white/10 overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-yellow-400 to-amber-500" style="width:${progressPct}%;"></div>
                    </div>
                    <div class="grid grid-cols-9 gap-1 mt-2">${markers}</div>
                    <div class="text-[12px] text-gray-200 font-bold leading-relaxed mt-2">${tier.desc}</div>
                    <div class="text-[11px] text-gray-400 font-bold mt-1 leading-relaxed">${booksLongNote}</div>
                </div>
            </div>
        </div>
    </div>
`;
                document.getElementById('player-profile-content').innerHTML = content;
                document.getElementById('player-profile-modal').classList.remove('hidden');
                Sound.click();
            }
        };
        
        function stringToHslColor(str, s, l) { let hash = 0; for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); } const h = hash % 360; return `hsl(${h}, ${s}%, ${l}%)`; }
        function getLeagueLogoHTML(name) { const colors = { 'Premier League': 'bg-purple-900 text-purple-200 border-purple-500', 'La Liga': 'bg-orange-900 text-orange-200 border-orange-500', 'Bundesliga': 'bg-red-900 text-red-200 border-red-500', 'Serie A': 'bg-blue-900 text-blue-200 border-blue-500', 'Ligue 1': 'bg-lime-900 text-lime-200 border-lime-500', 'Saudi Pro League': 'bg-green-900 text-green-200 border-green-500', 'National': 'bg-gray-700 text-white border-white', 'Clubs': 'bg-indigo-900 text-indigo-200 border-indigo-500', 'Rest of World': 'bg-yellow-900 text-yellow-200 border-yellow-500' }; const mapName = { 'National': 'Reprezentacje', 'Clubs': 'Kluby', 'Saudi Pro League': 'Saudi League', 'Rest of World': 'Reszta Świata' }; const displayName = mapName[name] || name; const baseStyle = "text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border mt-0 inline-block shadow-sm tracking-wider";
const cls = `${colors[name] || 'bg-gray-800 text-gray-400 border-gray-600'} ${baseStyle}`; return `<div class="league-badge ${cls}">${displayName}</div>`; }
        
        function getTeamLogoUrl(t) { 
            if (t.id) return `https://cdn.sofifa.net/teams/${t.id}/360.png`;
            if (t.logo) return t.logo;
            return null; 
        }

        function encodeTeamDataAttr(teamObj) {
            try {
                return encodeURIComponent(JSON.stringify(teamObj || {}));
            } catch (_) {
                return '';
            }
        }

        function parseTeamDataAttr(raw) {
            if (!raw) return null;
            // New format: URI-encoded JSON to keep HTML attributes safe.
            try {
                return JSON.parse(decodeURIComponent(raw));
            } catch (_) {
                // Backward compatibility: raw JSON stored directly.
                try {
                    return JSON.parse(raw);
                } catch (_) {
                    return null;
                }
            }
        }

        window.handleImgError = (img) => { 
            const d = parseTeamDataAttr(img.getAttribute('data-team')) || { name: 'CLUB', logo: null };
            const currentSrc = img.src;
            const fallbackSrc = d.logo;
            if (fallbackSrc && currentSrc !== fallbackSrc && !img.hasAttribute('data-fallback-tried')) {
                img.setAttribute('data-fallback-tried', 'true');
                img.src = fallbackSrc;
                return;
            }
            const isBig = img.classList.contains('vs-crest-img');
            const sizeClass = isBig ? 'w-32 h-32 md:w-48 md:h-48' : 'w-20 h-20 md:w-32 md:h-32';
            const safeName = (d && typeof d.name === 'string' && d.name.trim()) ? d.name.trim() : 'CLUB';
            const initials = (safeName.match(/\b\w/g) || [safeName[0]]).join('').substring(0,2).toUpperCase();
            const wrapper = document.createElement('div');
            wrapper.className = `${sizeClass} flex items-center justify-center mx-auto mb-2 shrink-0 animate-pop bg-gray-800 rounded-full border-2 border-white/20`;
            wrapper.innerHTML = `<span class="text-3xl font-black text-gray-500">${initials}</span>`;
            img.parentNode.replaceChild(wrapper, img);
        };
        
        function preloadImage(url) {
            if (!url) return;
            const img = new Image();
            img.src = url;
        }

        const SPECIAL_TEAMS_SET = new Set([
            "Real Madrid",
            "Francja",
            "Chelsea XI",
            "Bayern XI",
            "Real Madrid XI",
            "Juventus XI",
            "LA LIGA XI",
            "LIGUE 1 XI",
            "Liverpool XI",
            "Premier League XI",
            "Serie A XI",
            "Soccer Aid",
            "Zlatan FC",
            "Klasyczna XI",
            "BUNDESLIGA XI",
        ]);

        function getRarityClass(team) {
            if (SPECIAL_TEAMS_SET.has(team.name)) return "rarity-special";
            if (team.stars === 5) return "rarity-legendary";
            if (team.stars === 4.5) return "rarity-epic";
            if (team.stars === 4) return "rarity-rare";
            return "rarity-common";
        }

        const Settings = {
    init() {
        // Ta funkcja może teraz zostać pusta lub możesz ją usunąć, 
        // bo wywołujemy funkcje bezpośrednio
    },
    async copyToClipboard() {
        Sound.click();
        const exportData = JSON.stringify({ 
            players: DataManager.getPlayers(), 
            matches: DataManager.getMatches(), 
            session: DataManager.getSessionUsedTeams(), 
            meta: DataManager.getMeta() 
        });
        try {
            await navigator.clipboard.writeText(exportData);
            DataManager.showToast("Skopiowano do schowka!");
        } catch (err) {
            DataManager.showToast("Błąd kopiowania", 'error');
        }
    },
    async loadFromTextarea(id) {
        Sound.click();
        const val = document.getElementById(id).value;
        try {
            const data = JSON.parse(val);
            const tasks = [];
            // Players
            if (Array.isArray(data.players)) tasks.push(DataManager.savePlayers(data.players));

            // Matches (history) with migration
            let history = [];
            if (Array.isArray(data.matches)) history = data.matches;
            else if (data.matches && Array.isArray(data.matches.history)) history = data.matches.history;

            const normalizeMethod = (m) => {
                const s = (m||'').toString().trim().toLowerCase();
                // wolny
                if (s.includes('woln')) return 'Rzut Wolny';
                // karny: wymagaj słowa "rzut" lub dokładnych form, aby nie złapać "pola karnego"
                if (
                    (s.includes('rzut') && s.includes('karn')) ||
                    s === 'karny' || s === 'rzut karny'
                ) return 'Rzut Karny';
                // dystans
                if (s.includes('dystans')) return 'Z dystansu';
                // pole karne
                if (s.includes('pola karnego') || s.includes('pole karne') || s.includes('z pola')) return 'Z pola karnego';
                // znane dokładne formy
                if (['rzut wolny','rzut karny','z dystansu','z pola karnego'].includes(s)) {
                    if (s === 'rzut wolny') return 'Rzut Wolny';
                    if (s === 'rzut karny') return 'Rzut Karny';
                    if (s === 'z dystansu') return 'Z dystansu';
                    if (s === 'z pola karnego') return 'Z pola karnego';
                }
                // domyślnie traktuj jako gol z pola karnego
                return 'Z pola karnego';
            };
            if (history.length) {
                const migrated = history.map(match => {
                    const mm = JSON.parse(JSON.stringify(match));
                    ['team1','team2'].forEach(key => {
                        if (mm[key] && Array.isArray(mm[key].goals)) {
                            mm[key].goals = mm[key].goals.map(g => ({
                                ...g,
                                method: normalizeMethod(g.method)
                            }));
                        }
                    });
                    return mm;
                });
                tasks.push(DataManager.updateMatchHistory(migrated));
            }

            // Session
            if (Array.isArray(data.session)) {
                tasks.push(setDoc(doc(DataManager.db, 'artifacts', DataManager.appId, 'users', DataManager.userId, 'fc26_data', 'session'), { used: data.session }));
            }
            // State
            if (data.state && typeof data.state === 'object') tasks.push(DataManager.saveState(data.state));
            // Player meta
            if (data.meta && typeof data.meta === 'object') tasks.push(DataManager.saveMeta(data.meta));

            await Promise.all(tasks);
            DataManager.showToast("Dane zaimportowane! (nadpisano bazę)");
            setTimeout(() => location.reload(), 800);
        } catch(e) {
            console.error(e);
            DataManager.showToast("Błędny format JSON!", 'error');
        }
    }
};

        const AvatarEditor = {
            currentPlayer: null,
            init() {
                document.getElementById('save-avatar-btn').onclick = () => this.save();
                const emojiInput = document.getElementById('avatar-emoji-input');
                const colorInput = document.getElementById('avatar-color-input');
                
                emojiInput.addEventListener('input', () => this.updatePreview());
                colorInput.addEventListener('input', () => this.updatePreview());
            },
            open(playerName) {
                Sound.click();
                this.currentPlayer = playerName;
                const modal = document.getElementById('avatar-modal');
                const meta = DataManager.getMeta()[playerName] || {};
                
                // Defaults
                const defaultColor = stringToHslColor(playerName, 70, 50);
                
                document.getElementById('avatar-emoji-input').value = meta.emoji || '';
                document.getElementById('avatar-color-input').value = meta.color || '#333333'; 
                
                // Trigger preview update immediately
                this.updatePreview();
                modal.classList.remove('hidden');
            },
            updatePreview() {
                const preview = document.getElementById('avatar-preview-circle');
                const emoji = document.getElementById('avatar-emoji-input').value;
                const color = document.getElementById('avatar-color-input').value;
                
                preview.style.backgroundColor = color;
                preview.innerHTML = emoji || this.currentPlayer.substring(0,2).toUpperCase();
            },
            async save() {
                const emoji = document.getElementById('avatar-emoji-input').value;
                const color = document.getElementById('avatar-color-input').value;
                
                const meta = DataManager.getMeta();
                meta[this.currentPlayer] = { emoji, color };
                
                await DataManager.saveMeta(meta);
                document.getElementById('avatar-modal').classList.add('hidden');
                
                if (!document.getElementById('player-profile-modal').classList.contains('hidden')) {
                    Stats.openProfile(this.currentPlayer);
                }
            }
        };

        const MatchRecorder = {
            recentAdds: [],
            init() {
                document.getElementById('save-match-btn').onclick=()=>this.openModal();
                document.getElementById('cancel-recording').onclick=()=>document.getElementById('recording-modal').classList.add('hidden');
                document.getElementById('close-recording-x').onclick=()=>document.getElementById('recording-modal').classList.add('hidden');
                document.getElementById('confirm-recording').onclick=()=>this.save();
                document.getElementById('wizard-cancel').onclick=()=>this.closeWizard();
                const undoBtn = document.getElementById('undo-last-goal-btn');
                if (undoBtn) undoBtn.onclick = () => this.undoLast();
                
                document.getElementById('toggle-history-btn').onclick = () => {
                    const list = document.getElementById('goal-history-wrapper');
                    list.classList.toggle('hidden');
                    Sound.click();
                };
            },
            openModal() {
                this.recentAdds = [];
                // Safety: never enter recording modal with wizard overlay visible
                this.closeWizard();
                document.getElementById('recording-modal').classList.remove('hidden');
                document.getElementById('goal-history-wrapper').classList.add('hidden'); 
                document.getElementById('modal-t1-name').innerText=`${AppState.finalTeam1.name}`;
                document.getElementById('modal-t2-name').innerText=`${AppState.finalTeam2.name}`;
                const sub1 = document.getElementById('add-goal-sub-1');
                const sub2 = document.getElementById('add-goal-sub-2');
                if (sub1) sub1.innerText = AppState.playersTeam1.join(' & ');
                if (sub2) sub2.innerText = AppState.playersTeam2.join(' & ');
                this.renderAll();
            },
            wizardData: {},
            addGoal(tid) { this.wizardData = { team: tid, scorer: '', assist: 'Brak', method: '' }; document.getElementById('goal-wizard-modal').classList.remove('hidden'); this.wizardStep1_Method(); },
            closeWizard() { document.getElementById('goal-wizard-modal').classList.add('hidden'); },
            renderWizardButtons(title, items, callback) { document.getElementById('wizard-title').innerText = title; const c = document.getElementById('wizard-buttons'); c.innerHTML = ''; items.forEach(item => { const btn = document.createElement('button'); btn.className = 'wizard-btn'; btn.innerHTML = item.html || item.label; if(item.color) btn.style.borderColor = item.color; btn.onclick = () => { Sound.click(); callback(item.value); }; c.appendChild(btn); }); },
            wizardStep1_Method() { const methods = [ { label: 'Z Pola Karnego (1pkt)', value: 'Z pola karnego', html: '<span class="text-2xl">⚽</span> Z Pola' }, { label: 'Z Dystansu (2pkt)', value: 'Z dystansu', html: '<span class="text-2xl">🚀</span> Z Dystansu' }, { label: 'Rzut Karny (1pkt)', value: 'Rzut Karny', html: '<span class="text-2xl">🥅</span> Karny' }, { label: 'Rzut Wolny (2pkt)', value: 'Rzut Wolny', html: '<span class="text-2xl">🎯</span> Wolny' }, { label: 'Samobój', value: 'Samobój', html: '<span class="text-2xl">🤡</span> Samobój', color: '#ef4444' } ]; this.renderWizardButtons("Wybierz Typ Gola", methods, (val) => { this.wizardData.method = val; if(val === 'Samobój') { this.wizardData.scorer = 'Samobój'; this.wizardData.assist = 'Brak'; this.finalizeWizard(); } else { this.wizardStep2_Scorer(); } }); },
            wizardStep2_Scorer() { const players = this.wizardData.team === 1 ? AppState.playersTeam1 : AppState.playersTeam2; const items = players.map(p => ({ label: p, value: p, html: `<span class="text-lg font-bold">${p}</span>` })); this.renderWizardButtons("Kto Strzelił?", items, (val) => { this.wizardData.scorer = val; if (['Rzut Karny', 'Rzut Wolny'].includes(this.wizardData.method) || players.length === 1) { this.wizardData.assist = 'Brak'; this.finalizeWizard(); } else { this.wizardStep3_Assist(); } }); },
            wizardStep3_Assist() { const players = this.wizardData.team === 1 ? AppState.playersTeam1 : AppState.playersTeam2; const teammates = players.filter(p => p !== this.wizardData.scorer); const items = [ { label: 'BRAK ASYSTY', value: 'Brak', html: '<span class="text-gray-400">BRAK ASYSTY</span>' }, ...teammates.map(p => ({ label: p, value: p, html: `<span class="text-lg font-bold text-blue-300">${p}</span>` })) ]; this.renderWizardButtons("Kto Asystował?", items, (val) => { this.wizardData.assist = val; this.finalizeWizard(); }); },
            finalizeWizard() { const g = { id: Date.now() + Math.random(), team: this.wizardData.team, scorer: this.wizardData.scorer, assist: this.wizardData.assist, method: this.wizardData.method }; if(this.wizardData.team === 1) AppState.recordingGoals.t1.push(g); else AppState.recordingGoals.t2.push(g); this.recentAdds.push({team: g.team, id: g.id}); this.closeWizard(); this.renderAll(); Sound.goal(); },
            removeGoal(tid,gid) { Sound.click(); if(tid===1)AppState.recordingGoals.t1=AppState.recordingGoals.t1.filter(g=>g.id!==gid); else AppState.recordingGoals.t2=AppState.recordingGoals.t2.filter(g=>g.id!==gid); this.renderAll(); },
            undoLast() { const last = this.recentAdds.pop(); if(!last){ Sound.tick(); return; } Sound.click(); if(last.team===1){ AppState.recordingGoals.t1 = AppState.recordingGoals.t1.filter(g=>g.id!==last.id); } else { AppState.recordingGoals.t2 = AppState.recordingGoals.t2.filter(g=>g.id!==last.id); } this.renderAll(); },
            updateGoal(tid,gid,f,v) { 
                Sound.click();
                const l=tid===1?AppState.recordingGoals.t1:AppState.recordingGoals.t2; 
                const g=l.find(x=>x.id===gid); 
                if(g){ 
                    g[f]=v; 
                    if(f==='method'&&(v==='Samobój'||v==='Rzut Karny'||v==='Rzut Wolny'))g.assist='Brak'; 
                    if(f==='scorer'&&v==='Samobój'){g.method='Samobój';g.assist='Brak';} 
                    if(f==='scorer'&&g.assist===v)g.assist='Brak'; 
                    this.renderAll(); 
                } 
            },
            calc(tid) { return (tid===1?AppState.recordingGoals.t1:AppState.recordingGoals.t2).reduce((a,b)=>a+(b.method==='Z dystansu'||b.method==='Rzut Wolny'?2:1),0); },
            renderAll() {
                const c=document.getElementById('goal-details-container'); c.innerHTML='';
                const all=[...AppState.recordingGoals.t1.map(g=>({...g,_t:1})),...AppState.recordingGoals.t2.map(g=>({...g,_t:2}))].sort((a,b)=>a.id-b.id);
                if(all.length===0)document.getElementById('no-goals-msg').classList.remove('hidden'); else document.getElementById('no-goals-msg').classList.add('hidden');
                all.forEach((g,i)=>{
                    const tn=g._t===1?AppState.finalTeam1.name:AppState.finalTeam2.name;
                    const tp=g._t===1?AppState.playersTeam1:AppState.playersTeam2;
                    const sc=tp.map(p=>`<option value="${p}" ${p===g.scorer?'selected':''}>${p}</option>`).join('');
                    const as=`<option value="Brak" ${g.assist==='Brak'?'selected':''}>Brak</option>`+tp.filter(p=>p!==g.scorer).map(p=>`<option value="${p}" ${p===g.assist?'selected':''}>${p}</option>`).join('');
                    const pts=g.method==='Z dystansu'||g.method==='Rzut Wolny'?2:1;
                    c.innerHTML+=`<div class="goal-card border-${g._t===1?'blue':'red'}-500">
                        <div class="delete-goal-btn" onclick="window.MatchRecorder.removeGoal(${g._t},${g.id})">&times;</div>
                        <div class="flex justify-between items-center mb-2 pr-6"><span class="text-xs font-bold bg-gray-700 px-2 py-1 rounded text-gray-300">Gol #${i+1} (${pts}pkt)</span><span class="text-xs font-bold uppercase text-gray-400 truncate max-w-[150px]">${tn}</span></div>
                        <div class="mb-2"><label class="text-[10px] uppercase text-gray-500 font-bold block mb-1">Strzelec</label><select class="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg block w-full p-2.5" onchange="window.MatchRecorder.updateGoal(${g._t},${g.id},'scorer',this.value)"><option value="">-- Wybierz --</option>${sc}<option value="Samobój" ${g.scorer==='Samobój'?'selected':''}>Samobój (Przeciwnik)</option></select></div>
                        <div class="flex gap-2"><div class="w-1/2"><label class="text-[10px] uppercase text-gray-500 font-bold block mb-1">Typ</label><select class="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg block w-full p-2.5" onchange="window.MatchRecorder.updateGoal(${g._t},${g.id},'method',this.value)"><option value="Z pola karnego" ${g.method==='Z pola karnego'?'selected':''}>Z pola karnego (1pkt)</option><option value="Z dystansu" ${g.method==='Z dystansu'?'selected':''}>Z dystansu (2pkt)</option><option value="Rzut Karny" ${g.method==='Rzut Karny'?'selected':''}>Rzut Karny (1pkt)</option><option value="Rzut Wolny" ${g.method==='Rzut Wolny'?'selected':''}>Rzut Wolny (2pkt)</option><option value="Samobój" ${g.method==='Samobój'?'selected':''}>Samobój (1pkt)</option></select></div><div class="w-1/2"><label class="text-[10px] uppercase text-gray-500 font-bold block mb-1">Asysta</label><select class="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg block w-full p-2.5" ${(g.method==='Samobój'||g.method==='Rzut Karny'||g.method==='Rzut Wolny')?'disabled':''} onchange="window.MatchRecorder.updateGoal(${g._t},${g.id},'assist',this.value)">${as}</select></div></div>
                    </div>`;
                });
                document.getElementById('calc-score-1').innerText=this.calc(1); document.getElementById('calc-score-2').innerText=this.calc(2);
            },
            async save() {
                const md={id:Date.now(),date:new Date().toLocaleString(),team1:{name:AppState.finalTeam1.name,players:AppState.playersTeam1,score:this.calc(1),goals:AppState.recordingGoals.t1},team2:{name:AppState.finalTeam2.name,players:AppState.playersTeam2,score:this.calc(2),goals:AppState.recordingGoals.t2}};
                const btn = document.getElementById('confirm-recording'); const originalText = btn.innerText; btn.innerText = "ZAPISYWANIE..."; btn.disabled = true;
                try {
                    const success = await DataManager.saveMatch(md); 
                    if (success) { DataManager.addToSession(AppState.finalTeam1.name); DataManager.addToSession(AppState.finalTeam2.name); AppState.usedTeams = DataManager.getSessionUsedTeams(); document.getElementById('session-info').innerText=`Drużyny użyte w sesji: ${AppState.usedTeams.length}`; document.getElementById('recording-modal').classList.add('hidden'); document.getElementById('post-match-modal').classList.remove('hidden'); }
                } catch (e) { console.error(e); DataManager.showToast("Wystąpił błąd podczas zapisu.", 'error'); } finally { btn.innerText = originalText; btn.disabled = false; }
            }
        };
        
        const MatchEditor = {
            currentMatchId: null,
            draftGoals: { t1: [], t2: [] },
            init() {
                document.getElementById('save-edit-match-btn').onclick = () => this.saveChanges();
            },
            _calcFromGoals(list) {
                return (list || []).reduce((a, g) => a + ((g.method === 'Z dystansu' || g.method === 'Rzut Wolny') ? 2 : 1), 0);
            },
            _ensureGoalIds(list) {
                (list || []).forEach(g => {
                    if (g && (g.id === undefined || g.id === null)) g.id = Date.now() + Math.random();
                });
            },
            _getPlayersFromUI(teamId) {
                const cls = teamId === 1 ? '.p1-chk:checked' : '.p2-chk:checked';
                return Array.from(document.querySelectorAll(cls)).map(c => c.value);
            },
            _methodOptions(selected) {
                const opts = [
                    { v: 'Z pola karnego', l: 'Z pola karnego (1pkt)' },
                    { v: 'Z dystansu', l: 'Z dystansu (2pkt)' },
                    { v: 'Rzut Karny', l: 'Rzut Karny (1pkt)' },
                    { v: 'Rzut Wolny', l: 'Rzut Wolny (2pkt)' },
                    { v: 'Samobój', l: 'Samobój (1pkt)' },
                ];
                return opts.map(o => `<option value="${o.v}" ${o.v === selected ? 'selected' : ''}>${o.l}</option>`).join('');
            },
            _renderGoals(teamId) {
                const players = this._getPlayersFromUI(teamId);
                const list = teamId === 1 ? this.draftGoals.t1 : this.draftGoals.t2;
                if (!list || list.length === 0) {
                    return `<div class="text-xs text-gray-500 italic opacity-80">Brak bramek w raporcie.</div>`;
                }

                return list.map((g, i) => {
                    const scorerOpts = players.map(p => `<option value="${p}" ${p === g.scorer ? 'selected' : ''}>${p}</option>`).join('');

                    const allowAssist = !(g.method === 'Samobój' || g.method === 'Rzut Karny' || g.method === 'Rzut Wolny');
                    const assistPlayers = players.filter(p => p !== g.scorer);
                    const assistOpts = `<option value="Brak" ${g.assist === 'Brak' ? 'selected' : ''}>Brak</option>` +
                        assistPlayers.map(p => `<option value="${p}" ${p === g.assist ? 'selected' : ''}>${p}</option>`).join('');

                    const pts = (g.method === 'Z dystansu' || g.method === 'Rzut Wolny') ? 2 : 1;
                    const tn = teamId === 1 ? (document.getElementById('edit-t1-name')?.value || 'Drużyna 1') : (document.getElementById('edit-t2-name')?.value || 'Drużyna 2');

                    return `
                        <div class="goal-card border-${teamId === 1 ? 'blue' : 'red'}-500">
                            <div class="delete-goal-btn" onclick="window.MatchEditor.removeGoal(${teamId},${g.id})">&times;</div>
                            <div class="flex justify-between items-center mb-2 pr-6">
                                <span class="text-xs font-bold bg-gray-700 px-2 py-1 rounded text-gray-300">Gol #${i + 1} (${pts}pkt)</span>
                                <span class="text-xs font-bold uppercase text-gray-400 truncate max-w-[150px]">${tn}</span>
                            </div>
                            <div class="mb-2">
                                <label class="text-[10px] uppercase text-gray-500 font-bold block mb-1">Strzelec</label>
                                <select class="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg block w-full p-2.5" onchange="window.MatchEditor.updateGoal(${teamId},${g.id},'scorer',this.value)">
                                    <option value="">-- Wybierz --</option>
                                    ${scorerOpts}
                                    <option value="Samobój" ${g.scorer === 'Samobój' ? 'selected' : ''}>Samobój (Przeciwnik)</option>
                                </select>
                            </div>
                            <div class="flex gap-2">
                                <div class="w-1/2">
                                    <label class="text-[10px] uppercase text-gray-500 font-bold block mb-1">Typ</label>
                                    <select class="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg block w-full p-2.5" onchange="window.MatchEditor.updateGoal(${teamId},${g.id},'method',this.value)">
                                        ${this._methodOptions(g.method)}
                                    </select>
                                </div>
                                <div class="w-1/2">
                                    <label class="text-[10px] uppercase text-gray-500 font-bold block mb-1">Asysta</label>
                                    <select class="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg block w-full p-2.5" ${(allowAssist ? '' : 'disabled')} onchange="window.MatchEditor.updateGoal(${teamId},${g.id},'assist',this.value)">
                                        ${assistOpts}
                                    </select>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            },
            _syncScoresFromDraft() {
                const s1 = this._calcFromGoals(this.draftGoals.t1);
                const s2 = this._calcFromGoals(this.draftGoals.t2);
                const i1 = document.getElementById('edit-s1');
                const i2 = document.getElementById('edit-s2');
                if (i1) i1.value = String(s1);
                if (i2) i2.value = String(s2);
            },
            renderGoalsUI() {
                const c1 = document.getElementById('edit-goals-t1');
                const c2 = document.getElementById('edit-goals-t2');
                if (c1) c1.innerHTML = this._renderGoals(1);
                if (c2) c2.innerHTML = this._renderGoals(2);
                this._syncScoresFromDraft();
            },
            onPlayersChanged(teamId) {
                const players = this._getPlayersFromUI(teamId);
                const list = teamId === 1 ? this.draftGoals.t1 : this.draftGoals.t2;
                (list || []).forEach(g => {
                    if (g.scorer && g.scorer !== 'Samobój' && !players.includes(g.scorer)) {
                        g.scorer = players[0] || '';
                    }
                    if (g.assist && g.assist !== 'Brak' && !players.includes(g.assist)) {
                        g.assist = 'Brak';
                    }
                    if (g.assist && g.assist === g.scorer) g.assist = 'Brak';
                });
                this.renderGoalsUI();
            },
            addGoal(teamId) {
                Sound.click();
                const players = this._getPlayersFromUI(teamId);
                const list = teamId === 1 ? this.draftGoals.t1 : this.draftGoals.t2;
                const id = Date.now() + Math.random();
                list.push({
                    id,
                    team: teamId,
                    scorer: players[0] || '',
                    assist: 'Brak',
                    method: 'Z pola karnego'
                });
                this.renderGoalsUI();
            },
            removeGoal(teamId, goalId) {
                Sound.click();
                if (teamId === 1) this.draftGoals.t1 = this.draftGoals.t1.filter(g => g.id !== goalId);
                else this.draftGoals.t2 = this.draftGoals.t2.filter(g => g.id !== goalId);
                this.renderGoalsUI();
            },
            updateGoal(teamId, goalId, field, value) {
                Sound.click();
                const list = teamId === 1 ? this.draftGoals.t1 : this.draftGoals.t2;
                const g = (list || []).find(x => x.id === goalId);
                if (!g) return;
                g[field] = value;
                if (field === 'method' && (value === 'Samobój' || value === 'Rzut Karny' || value === 'Rzut Wolny')) g.assist = 'Brak';
                if (field === 'scorer' && value === 'Samobój') { g.method = 'Samobój'; g.assist = 'Brak'; }
                if (field === 'scorer' && g.assist === value) g.assist = 'Brak';
                this.renderGoalsUI();
            },
            open(id) {
                this.currentMatchId = id;
                const match = DataManager.getMatches().find(m => m.id === id);
                if (!match) return;
                
                Sound.click();
                const container = document.getElementById('edit-match-content');
                const allPlayers = DataManager.getPlayers();
                const allTeams = window.Catalog.teams.map(t => t.name).sort();
                
                const teamOpts = (sel) => allTeams.map(t => `<option value="${t}" ${t === sel ? 'selected' : ''}>${t}</option>`).join('');
                
                const renderPlayerChecks = (current, labelId) => {
                    return allPlayers.map(p => {
                        const checked = current.includes(p) ? 'checked' : '';
                        return `<label class="edit-player-pill inline-flex items-center bg-gray-800/60 p-2 rounded-xl cursor-pointer border border-white/10">
                            <input type="checkbox" class="form-checkbox h-4 w-4 text-blue-600 ${labelId}-chk" value="${p}" ${checked} onchange="window.MatchEditor.onPlayersChanged(${labelId === 'p1' ? 1 : 2})">
                            <span class="ml-2 text-xs text-white">${p}</span>
                        </label>`;
                    }).join('');
                };

                // Prepare draft goals (editable)
                this.draftGoals = {
                    t1: Array.isArray(match.team1.goals) ? JSON.parse(JSON.stringify(match.team1.goals)) : [],
                    t2: Array.isArray(match.team2.goals) ? JSON.parse(JSON.stringify(match.team2.goals)) : [],
                };
                this._ensureGoalIds(this.draftGoals.t1);
                this._ensureGoalIds(this.draftGoals.t2);

                container.innerHTML = `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div class="edit-team-block edit-team-1">
                            <div class="edit-team-head">
                                <div class="edit-team-title">Drużyna 1</div>
                                <div class="edit-score-pill"><span>Wynik</span><input type="number" id="edit-s1" value="${match.team1.score}" class="edit-score-input"></div>
                            </div>
                            <select id="edit-t1-name" class="edit-team-select">${teamOpts(match.team1.name)}</select>
                            <div class="edit-players-list edit-players-list--wide">${renderPlayerChecks(match.team1.players, 'p1')}</div>

                            <div class="mt-4">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="text-xs uppercase tracking-widest text-gray-400 font-bold">Raport bramek</div>
                                    <button class="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border-b-2 border-blue-800 active:border-b-0 active:translate-y-0.5" onclick="window.MatchEditor.addGoal(1)">+ Gol</button>
                                </div>
                                <div id="edit-goals-t1" class="space-y-3"></div>
                            </div>
                        </div>
                        <div class="edit-team-block edit-team-2">
                            <div class="edit-team-head">
                                <div class="edit-team-title">Drużyna 2</div>
                                <div class="edit-score-pill"><span>Wynik</span><input type="number" id="edit-s2" value="${match.team2.score}" class="edit-score-input"></div>
                            </div>
                            <select id="edit-t2-name" class="edit-team-select">${teamOpts(match.team2.name)}</select>
                            <div class="edit-players-list edit-players-list--wide">${renderPlayerChecks(match.team2.players, 'p2')}</div>

                            <div class="mt-4">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="text-xs uppercase tracking-widest text-gray-400 font-bold">Raport bramek</div>
                                    <button class="bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border-b-2 border-red-800 active:border-b-0 active:translate-y-0.5" onclick="window.MatchEditor.addGoal(2)">+ Gol</button>
                                </div>
                                <div id="edit-goals-t2" class="space-y-3"></div>
                            </div>
                        </div>
                    </div>
                    <p class="edit-match-note">Edytujesz wynik, składy oraz raport bramek (strzelcy/asysty/typ bramki). Wynik jest automatycznie wyliczany z raportu.</p>
                `;

                this.renderGoalsUI();
                
                document.getElementById('edit-match-modal').classList.remove('hidden');
            },
            async saveChanges() {
                const btn = document.getElementById('save-edit-match-btn');
                const originalText = btn ? btn.innerText : '';
                if (btn) { btn.innerText = 'ZAPISYWANIE...'; btn.disabled = true; }
                try {
                    const s1 = parseInt(document.getElementById('edit-s1').value) || 0;
                    const s2 = parseInt(document.getElementById('edit-s2').value) || 0;
                    const t1Name = document.getElementById('edit-t1-name').value;
                    const t2Name = document.getElementById('edit-t2-name').value;
                    
                    const p1 = Array.from(document.querySelectorAll('.p1-chk:checked')).map(c => c.value);
                    const p2 = Array.from(document.querySelectorAll('.p2-chk:checked')).map(c => c.value);
                    
                    if (p1.length === 0 || p2.length === 0) {
                        DataManager.showToast("Wybierz graczy dla obu drużyn!", 'error');
                        return;
                    }
                    const overlap = p1.filter(x => p2.includes(x));
                    if (overlap.length) {
                        DataManager.showToast(`Ten sam gracz nie może być w obu drużynach: ${overlap.join(', ')}`, 'error');
                        return;
                    }

                    const matches = DataManager.getMatches();
                    const idx = matches.findIndex(m => m.id === this.currentMatchId);
                    if (idx === -1) return;

                    const updatedMatch = { ...matches[idx] };
                    updatedMatch.team1.score = s1;
                    updatedMatch.team1.name = t1Name;
                    updatedMatch.team1.players = p1;
                    updatedMatch.team1.goals = Array.isArray(this.draftGoals.t1) ? this.draftGoals.t1.map(g => ({
                        id: g.id,
                        team: 1,
                        scorer: g.scorer || '',
                        assist: g.assist || 'Brak',
                        method: g.method || 'Z pola karnego'
                    })) : [];
                    
                    updatedMatch.team2.score = s2;
                    updatedMatch.team2.name = t2Name;
                    updatedMatch.team2.players = p2;
                    updatedMatch.team2.goals = Array.isArray(this.draftGoals.t2) ? this.draftGoals.t2.map(g => ({
                        id: g.id,
                        team: 2,
                        scorer: g.scorer || '',
                        assist: g.assist || 'Brak',
                        method: g.method || 'Z pola karnego'
                    })) : [];

                    // Prefer consistent score derived from goal report
                    updatedMatch.team1.score = this._calcFromGoals(updatedMatch.team1.goals);
                    updatedMatch.team2.score = this._calcFromGoals(updatedMatch.team2.goals);
                    
                    const newHistory = [...matches];
                    newHistory[idx] = updatedMatch;
                    
                    Sound.confirm();
                    await DataManager.updateMatchHistory(newHistory);
                    DataManager.showToast('Zapisano zmiany meczu!');

                    // Refresh history tab if Stats Center is open.
                    const statsModal = document.getElementById('stats-modal');
                    if (statsModal && !statsModal.classList.contains('hidden') && window.Stats && typeof window.Stats.switchTab === 'function') {
                        window.Stats.switchTab('history');
                    }
                    document.getElementById('edit-match-modal').classList.add('hidden');
                } catch (e) {
                    console.error(e);
                    DataManager.showToast('Wystąpił błąd podczas zapisu zmian.', 'error');
                } finally {
                    if (btn) { btn.innerText = originalText; btn.disabled = false; }
                }
            }
        };

        const PlayerManager = {
            currentPickerMode: null, // 'team1', 'team2', 'pool'
            deleteMode: false,

            init() {
                // Initialize Buttons
                document.getElementById('goto-step2-btn').onclick = () => {
                    if (this.validateStart()) {
                        Sound.click();
                        document.getElementById('preview-team1').innerText = AppState.playersTeam1.join(' & ');
                        document.getElementById('preview-team2').innerText = AppState.playersTeam2.join(' & ');
                        document.getElementById('step1-screen').classList.add('hidden');
                        document.getElementById('step2-screen').classList.remove('hidden');
                    }
                };
                document.getElementById('back-to-step1-btn').onclick = () => { Sound.click(); document.getElementById('step2-screen').classList.add('hidden'); document.getElementById('step1-screen').classList.remove('hidden'); };
                
                // Picker Modal Events
                document.getElementById('picker-add-btn').onclick = () => { Sound.click(); document.getElementById('picker-add-row').classList.toggle('hidden'); document.getElementById('picker-new-name').focus(); };
                document.getElementById('picker-confirm-add').onclick = () => this.addNewPlayer();
                document.getElementById('picker-done-btn').onclick = () => { Sound.click(); document.getElementById('universal-picker-modal').classList.add('hidden'); this.renderTeamInputs(); };
                
                const delModeBtn = document.getElementById('picker-delete-mode-btn');
                delModeBtn.onclick = () => {
                    Sound.click();
                    this.deleteMode = !this.deleteMode;
                    delModeBtn.classList.toggle('bg-red-600');
                    delModeBtn.classList.toggle('text-white');
                    this.renderPickerGrid();
                };

                // Format Modal Logic (for Draw flow)
                // Need to ensure format buttons call the new flow
                // This is handled by renderFormatModal in older code, but we override functionality via HTML onclicks in modal if needed or just use executeDraw
                
                this.loadState();
                this.renderTeamInputs();
            },

            // --- RENDER INPUT FIELDS ON MAIN SCREEN ---
            renderTeamInputs() {
                const render = (teamArr, elId) => {
                    const container = document.getElementById(elId);
                    const wrapper = container.parentElement;
                    
                    if (teamArr.length > 0) {
                        wrapper.classList.add('has-players');
                        // ZMIANA: Usunięto ikonę "X" i zmieniono justify na center
                        container.innerHTML = teamArr.map(p => 
                            `<span onclick="event.stopPropagation(); window.PlayerManager.removePlayerFromTeam('${p}')" 
                                class="bg-gray-800 hover:bg-red-900/80 border border-gray-600 hover:border-red-500 px-4 py-2 rounded-xl text-base font-bold text-white shadow-md flex items-center justify-center cursor-pointer transition-all group min-w-[80px]">
                                ${p} 
                            </span>`
                        ).join('');
                    } else {
                        wrapper.classList.remove('has-players');
                        container.innerHTML = `<span class="text-gray-500 text-sm italic opacity-50">Kliknij, by dodać</span>`;
                    }
                };
                render(AppState.playersTeam1, 'team1-display-list');
                render(AppState.playersTeam2, 'team2-display-list');
                
                const c1 = document.getElementById('count-t1'); if(c1) c1.innerText = AppState.playersTeam1.length;
                const c2 = document.getElementById('count-t2'); if(c2) c2.innerText = AppState.playersTeam2.length;
            },

            // --- OPEN PICKER LOGIC ---
            openTeamPicker(teamNum) {
                Sound.click();
                this.currentPickerMode = teamNum === 1 ? 'team1' : 'team2';
                this.deleteMode = false;
                document.getElementById('picker-delete-mode-btn').classList.remove('bg-red-600', 'text-white');
                document.getElementById('picker-title').innerText = teamNum === 1 ? "Dodaj do: Drużyna 1" : "Dodaj do: Drużyna 2";
                document.getElementById('picker-title').className = teamNum === 1 ? "text-xl font-black text-blue-400 uppercase tracking-widest" : "text-xl font-black text-red-400 uppercase tracking-widest";
                document.getElementById('universal-picker-modal').classList.remove('hidden');
                document.getElementById('picker-add-row').classList.add('hidden');
                
                document.getElementById('picker-done-btn').classList.add('hidden');
                // Usunięto ustawianie tekstu info
                this.renderPickerGrid();
            },

            // --- OPEN POOL PICKER (FOR DRAW) ---
            openPoolPicker() {
                Sound.click();
                this.currentPickerMode = 'pool';
                this.deleteMode = false;
                document.getElementById('picker-delete-mode-btn').classList.remove('bg-red-600', 'text-white');
                document.getElementById('picker-title').innerText = "Zaznacz Pulę do Losowania";
                document.getElementById('picker-title').className = "text-xl font-black text-purple-400 uppercase tracking-widest";
                document.getElementById('universal-picker-modal').classList.remove('hidden');
                document.getElementById('picker-add-row').classList.add('hidden');
                
                // ZMIANA: Pokazujemy przycisk 'Gotowe' (zmieniając tekst na Losuj)
                const doneBtn = document.getElementById('picker-done-btn');
                doneBtn.classList.remove('hidden');
                doneBtn.innerText = "LOSUJ Z WYBRANYCH"; 
                document.getElementById('picker-info-text').innerText = "Zaznacz wszystkich graczy, którzy biorą udział.";
                
                if (AppState.drawSelection.length === 0) {
                     AppState.drawSelection = DataManager.getPlayers();
                }
                
                this.renderPickerGrid();
            },

            // --- RENDER GRID WITH SORTING ---
            renderPickerGrid() {
                const container = document.getElementById('picker-grid-container');
                const allPlayers = DataManager.getPlayers();
                let displayList = [...allPlayers];
                
                const stats = window.Stats.calc(); 
                const pStats = {};
                stats.p.forEach(x => pStats[x.name] = x);

                if (this.currentPickerMode === 'team1' || this.currentPickerMode === 'team2') {
                    const currentTeamArr = this.currentPickerMode === 'team1' ? AppState.playersTeam1 : AppState.playersTeam2;
                    const otherTeamArr = this.currentPickerMode === 'team1' ? AppState.playersTeam2 : AppState.playersTeam1;
                    
                    displayList = displayList.filter(p => !otherTeamArr.includes(p));

                    if (currentTeamArr.length > 0) {
                        const partner = currentTeamArr[0];
                        const partnerStat = pStats[partner];
                        
                        displayList.sort((a, b) => {
                            const aSel = currentTeamArr.includes(a);
                            const bSel = currentTeamArr.includes(b);
                            if (aSel && !bSel) return -1;
                            if (!aSel && bSel) return 1;

                            const aWith = partnerStat && partnerStat.partners[a] ? partnerStat.partners[a] : 0;
                            const bWith = partnerStat && partnerStat.partners[b] ? partnerStat.partners[b] : 0;
                            return bWith - aWith; 
                        });
                    } else {
                        displayList.sort((a, b) => {
                             const aM = pStats[a] ? pStats[a].m : 0;
                             const bM = pStats[b] ? pStats[b].m : 0;
                             return bM - aM;
                        });
                    }
                } else if (this.currentPickerMode === 'pool') {
                     displayList.sort((a, b) => {
                             const aM = pStats[a] ? pStats[a].m : 0;
                             const bM = pStats[b] ? pStats[b].m : 0;
                             return bM - aM;
                    });
                }

                // FUNKCJA POMOCNICZA DO ODMIANY
                const decl = (n) => {
                    if (n === 1) return 'mecz';
                    const n10 = n % 10;
                    const n100 = n % 100;
                    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'mecze';
                    return 'meczów';
                };

                container.innerHTML = displayList.map(p => {
                    const stat = pStats[p] || {m:0};
                    let isSelected = false;
                    // ZMIANA: Poprawna odmiana słowa "mecz"
                    let subText = `${stat.m} ${decl(stat.m)}`;
                    let isDisabled = false;

                    if (this.currentPickerMode === 'team1') {
                        if(AppState.playersTeam1.includes(p)) isDisabled = true;
                    }
                    else if (this.currentPickerMode === 'team2') {
                         if(AppState.playersTeam2.includes(p)) isDisabled = true;
                    }
                    else if (this.currentPickerMode === 'pool') {
                        isSelected = AppState.drawSelection.includes(p);
                    }
                    
                    if (isDisabled) return ''; 

                    if ((this.currentPickerMode === 'team1' || this.currentPickerMode === 'team2') && 
                        (this.currentPickerMode === 'team1' ? AppState.playersTeam1 : AppState.playersTeam2).length > 0 &&
                         !isSelected) {
                        const partner = (this.currentPickerMode === 'team1' ? AppState.playersTeam1 : AppState.playersTeam2)[0];
                        const partnerStat = pStats[partner];
                        const together = partnerStat && partnerStat.partners[p] ? partnerStat.partners[p] : 0;
                        if (together > 0) subText = `Duo: ${together} ${decl(together)}`;
                    }

                    const selectedClass = isSelected ? 'selected ring-2 ring-indigo-500' : 'border-gray-600 hover:border-blue-400 text-gray-300';
                    const deleteOverlay = this.deleteMode ? `<div class="absolute inset-0 bg-red-900/90 flex items-center justify-center rounded-xl text-white font-bold text-sm uppercase tracking-widest backdrop-blur-[2px] z-10">USUŃ</div>` : '';

                    return `
                    <div onclick="window.PlayerManager.handlePickerClick('${p}')" class="picker-card ${selectedClass}">
                        ${deleteOverlay}
                        <div class="font-bold truncate leading-tight w-full">${p}</div>
                        <div class="picker-stat">${subText}</div>
                    </div>`;
                }).join('');
            },

            // --- CLICK HANDLER ---
            handlePickerClick(name) {
                if (this.deleteMode) {
                    this.openDeleteConfirm(name);
                    return;
                }
                Sound.click();

                // ZMIANA: Tryb wyboru drużyny (Team 1 lub 2)
                if (this.currentPickerMode === 'team1' || this.currentPickerMode === 'team2') {
                    const targetArr = this.currentPickerMode === 'team1' ? AppState.playersTeam1 : AppState.playersTeam2;
                    
                    if (targetArr.includes(name)) {
                        DataManager.showToast("Ten gracz jest już dodany!", "error");
                        return;
                    }

                    // Dodaj gracza
                    targetArr.push(name);
                    
                    // Zapisz, odśwież widok głowny i ZAMKNIJ MODAL OD RAZU
                    this.saveCurrentState();
                    this.renderTeamInputs();
                    document.getElementById('universal-picker-modal').classList.add('hidden');
                    Sound.confirm();
                }
                // Tryb Puli (zostaje po staremu - multiselect)
                else if (this.currentPickerMode === 'pool') {
                    if (AppState.drawSelection.includes(name)) AppState.drawSelection = AppState.drawSelection.filter(x => x !== name);
                    else AppState.drawSelection.push(name);
                    
                    this.saveCurrentState();
                    this.renderPickerGrid(); 
                }
            },

            removePlayerFromTeam(name) {
                Sound.click();
                if (AppState.playersTeam1.includes(name)) AppState.playersTeam1 = AppState.playersTeam1.filter(x => x !== name);
                if (AppState.playersTeam2.includes(name)) AppState.playersTeam2 = AppState.playersTeam2.filter(x => x !== name);
                this.saveCurrentState();
                this.renderTeamInputs();
            },

            // --- ADD / DELETE LOGIC ---
            addNewPlayer() {
                const name = document.getElementById('picker-new-name').value.trim();
                if (name) {
                    const current = DataManager.getPlayers();
                    if (!current.includes(name)) {
                        DataManager.savePlayers([...current, name]);
                        document.getElementById('picker-new-name').value = '';
                        document.getElementById('picker-add-row').classList.add('hidden');
                        Sound.confirm();
                        // Re-render handled by listener in DataManager, but for speed:
                        setTimeout(() => this.renderPickerGrid(), 100);
                    } else {
                        DataManager.showToast('Taki gracz już istnieje!', 'error');
                    }
                }
            },
            
            openDeleteConfirm(name) {
                Sound.click();
                const modal = document.getElementById('delete-confirm-modal');
                document.getElementById('del-player-name').innerText = name;
                modal.classList.remove('hidden');
                
                document.getElementById('del-btn-keep-stats').onclick = () => this.executeDelete(name, true);
                document.getElementById('del-btn-wipe-stats').onclick = () => this.executeDelete(name, false);
            },
            
            async executeDelete(name, keepStats) {
                Sound.click();
                // 1. Remove from Players List
                const currentPool = DataManager.getPlayers().filter(p => p !== name);
                await DataManager.savePlayers(currentPool);
                
                // 2. Remove from current state selections
                AppState.playersTeam1 = AppState.playersTeam1.filter(p => p !== name);
                AppState.playersTeam2 = AppState.playersTeam2.filter(p => p !== name);
                AppState.drawSelection = AppState.drawSelection.filter(p => p !== name);
                this.saveCurrentState();

                if (!keepStats) {
                    // Wipe Individual Stats (Clean meta + Remove from match history names if logic allows)
                    // Per request: "wipe stats from database except duos"
                    // Stats are derived from matches. To "wipe stats", we essentially need to anonymize them in match history or let them fade.
                    // Since "Duos" are just calculations based on players in a match, we can't easily keep Duo stats while deleting Player stats IF they rely on the same match data.
                    // COMPROMISE: We just remove the player from the active `players` list (already done). 
                    // To "Clean Meta" (Avatar/Color):
                    const meta = DataManager.getMeta();
                    if(meta[name]) {
                        delete meta[name];
                        await DataManager.saveMeta(meta);
                    }
                    DataManager.showToast("Gracz i dane usunięte.");
                } else {
                    DataManager.showToast("Gracz usunięty (statystyki zachowane).");
                }
                
                document.getElementById('delete-confirm-modal').classList.add('hidden');
                this.renderPickerGrid();
                this.renderTeamInputs();
            },

            // --- BUTTON ACTIONS ---
            clearTeams() {
                Sound.click();
                AppState.playersTeam1 = [];
                AppState.playersTeam2 = [];
                this.saveCurrentState();
                this.renderTeamInputs();
            },
            
            swapSides() {
                Sound.click();
                const temp = [...AppState.playersTeam1];
                AppState.playersTeam1 = [...AppState.playersTeam2];
                AppState.playersTeam2 = temp;
                this.saveCurrentState();
                this.renderTeamInputs();
                DataManager.showToast("Strony zamienione");
            },

            // --- DRAW FLOW ---
            startDrawFlow() {
                Sound.click();
                document.getElementById('format-modal').classList.remove('hidden');
            },
            
            // Triggered by Format Modal Buttons (1v1, 2v2 etc)
            executeDraw(format) {
                // Modified to OPEN PICKER first
                document.getElementById('format-modal').classList.add('hidden');
                
                // Set Draw Mode based on format for validation later? 
                // Currently just opens pool picker.
                this.drawFormat = format; // store for later
                this.openPoolPicker();
                
                // Replace "Done" button action for this specific flow
                const doneBtn = document.getElementById('picker-done-btn');
                doneBtn.onclick = () => {
                     Sound.click();
                     this.finalizeDraw();
                };
            },
            
            finalizeDraw() {
                 const format = this.drawFormat;
                 let pool = [...AppState.drawSelection];
                 
                 // Logic to pick random players
                 let count = 0;
                 if(format==='1v1') count = 2;
                 if(format==='2v2') count = 4;
                 if(format==='1v2' || format==='1v3') count = format === '1v2' ? 3 : 4;
                 
                 if(pool.length < count) {
                     DataManager.showToast(`Za mało graczy w puli! (Wymagane: ${count})`, 'error');
                     return;
                 }
                 
                 // Shuffle
                 shuffleInPlace(pool);
                 const selected = pool.slice(0, count);
                 
                 if(format==='1v1'){
                    AppState.playersTeam1=[selected[0]]; AppState.playersTeam2=[selected[1]];
                 } else if(format==='2v2'){
                    AppState.playersTeam1=[selected[0],selected[1]]; AppState.playersTeam2=[selected[2],selected[3]];
                 } else if(format==='1v2'){
                    AppState.playersTeam1=[selected[0]]; AppState.playersTeam2=[selected[1],selected[2]];
                 } else if(format==='1v3'){
                    AppState.playersTeam1=[selected[0]]; AppState.playersTeam2=[selected[1],selected[2],selected[3]];
                 }
                 
                 this.saveCurrentState();
                 document.getElementById('universal-picker-modal').classList.add('hidden');
                 this.renderTeamInputs();
                 Sound.reroll();
                 
                 // Restore default Done behavior
                 document.getElementById('picker-done-btn').onclick = () => { Sound.click(); document.getElementById('universal-picker-modal').classList.add('hidden'); this.renderTeamInputs(); };
            },

            // --- UTILS ---
            saveCurrentState() { DataManager.saveState({ playersTeam1: AppState.playersTeam1, playersTeam2: AppState.playersTeam2, minStars: AppState.minStars, maxStars: AppState.maxStars, rerollSettings: AppState.rerollSettings, selectedLeague: AppState.selectedLeague }); },
            loadState() {
                const s = DataManager.getState(); const p = DataManager.getPlayers();
                if (s) {
                    AppState.playersTeam1 = (s.playersTeam1 || []).filter(x => p.includes(x));
                    AppState.playersTeam2 = (s.playersTeam2 || []).filter(x => p.includes(x));
                    AppState.minStars = s.minStars || 2.5; AppState.maxStars = s.maxStars || 5; AppState.rerollSettings = s.rerollSettings !== undefined ? s.rerollSettings : 3; AppState.selectedLeague = s.selectedLeague || "All";
                    const minEl = document.getElementById('min-stars'); if (minEl) { minEl.value = AppState.minStars; document.getElementById('min-stars-value').textContent = AppState.minStars.toFixed(1); }
                    const maxEl = document.getElementById('max-stars'); if (maxEl) { maxEl.value = AppState.maxStars; document.getElementById('max-stars-value').textContent = AppState.maxStars.toFixed(1); }
                    const rrEl = document.getElementById('rerolls-value'); if (rrEl) rrEl.textContent = AppState.rerollSettings;
                    document.querySelectorAll('.league-btn').forEach(b => { b.classList.remove('active'); if (b.dataset.league === AppState.selectedLeague) b.classList.add('active'); });
                }
                this.renderTeamInputs();
            },
            
            getFilteredPool(drawing = false) {
                const all = window.Catalog.teams;
                let p = all.filter(t => t.stars >= AppState.minStars && t.stars <= AppState.maxStars);
                if (AppState.selectedLeague !== 'All') {
                    if (AppState.selectedLeague === 'All_NoRow') {
                        p = p.filter(t => t.league !== 'Rest of World');
                    } else {
                        p = p.filter(t => t.league === AppState.selectedLeague || (AppState.selectedLeague === 'Clubs' && t.league !== 'National'));
                    }
                }
                return p;
            },
            
            // Standard Validation
            validateStart() {
                if (AppState.playersTeam1.length === 0 || AppState.playersTeam2.length === 0) {
                    DataManager.showToast("Brakuje graczy! Przydziel ich ręcznie lub wylosuj.", 'error');
                    return false;
                }
                return true;
            },

            // Abort Draw etc.
            abortDraw() {
    Sound.click();
    window.abortController.aborted = true;
    AppState.finalTeam1 = null; AppState.finalTeam2 = null;
    resetMatchUI(); // Wywołanie nowej funkcji
    document.getElementById('drawing-screen').classList.add('hidden');
    document.getElementById('step2-screen').classList.remove('hidden');
    document.body.classList.remove('is-drawing');
    document.body.classList.remove('has-results');
},
            
            // --- PRZYWRÓCONE FUNKCJE STATYSTYK ---
            
            updateH2H() {
                const p1 = AppState.playersTeam1.slice().sort().join(',');
                const p2 = AppState.playersTeam2.slice().sort().join(',');
                const p1Arr = AppState.playersTeam1.slice().sort();
                const p2Arr = AppState.playersTeam2.slice().sort();
                
                if(!p1 || !p2) {
                     document.getElementById('h2h-stats-display').innerHTML = '';
                     document.getElementById('h2h-stats-display').classList.add('hidden');
                     return;
                }
                
                const history = DataManager.getMatches();
                let w=0, d=0, l=0;
                const same = (a,b) => a.length===b.length && a.slice().sort().join(',')===b.slice().sort().join(',');
                
                history.forEach(m => {
                    const t1 = (m.team1.players || []).slice().sort();
                    const t2 = (m.team2.players || []).slice().sort();
                    const exactA = same(p1Arr, t1) && same(p2Arr, t2);
                    const exactB = same(p1Arr, t2) && same(p2Arr, t1);

                    if (exactA || exactB) {
                        const isOrder = exactA; // p1Arr odpowiada m.team1
                        const s1 = isOrder ? m.team1.score : m.team2.score;
                        const s2 = isOrder ? m.team2.score : m.team1.score;
                        if (s1 > s2) w++;
                        else if (s1 === s2) d++;
                        else l++;
                    }
                });
                
                const total = w + d + l;
                const container = document.getElementById('h2h-stats-display');
                
                if (total === 0) {
                    container.innerHTML = `<span class="opacity-60 italic text-[11px] md:text-xs bg-black/40 px-3 py-1.5 rounded-full">Pierwsze starcie</span>`;
                    container.classList.remove('hidden', 'mb-2');
                    container.classList.add('mb-1');
                    return;
                }
                // Zawsze pokazujemy statystyki i procenty, bez progu minimalnego

                // Obliczanie procentów
                const pW = Math.round((w / total) * 100);
                const pD = Math.round((d / total) * 100);
                const pL = Math.round((l / total) * 100);

                // NOWY FORMAT: Liczba (%) - Liczba (%) - Liczba (%)
                // Jeśli liczba wynosi 0, nie pokazujemy procentów
                
                const formatStat = (val, pct, color) => {
                    const percentHtml = `<span class=\"opacity-50 text-[9px] ml-0.5 font-normal\">(${pct}%)</span>`;
                    return `<span class="${color} font-black text-xs md:text-sm">${val}${percentHtml}</span>`;
                };

                const html = `
                    <div class="flex items-center gap-3 bg-gray-900 px-5 py-1.5 rounded-full border border-gray-600 shadow-xl uppercase tracking-wider z-30 relative">
                        ${formatStat(w, pW, 'text-blue-400')}
                        <div class="text-gray-600 text-[10px]">•</div>
                        ${formatStat(d, pD, 'text-gray-400')}
                        <div class="text-gray-600 text-[10px]">•</div>
                        ${formatStat(l, pL, 'text-red-400')}
                    </div>
                `;
                
                container.innerHTML = html;
                container.classList.remove('hidden');
            },

            generateTeamFact(team, players) {
                const allMatches = DataManager.getMatches();
                const playerCount = players.length;
                const isPlural = playerCount > 1;
                const stats = window.Stats.calc();
                const pStats = {}; stats.p.forEach(x => pStats[x.name] = x);

                // Pomoc: tytuł + opis
                const make = (title, desc, tone = 'neutral') => ({ title, desc, tone });
                const meczDecl = (n) => {
                    if (n === 1) return 'mecz';
                    const n10 = n % 10; const n100 = n % 100;
                    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'mecze';
                    return 'meczów';
                };
                
                // 1. STATYSTYKI TEGO SKŁADU Z TYM KLUBEM
                // Filtrujemy mecze gdzie ten konkretny skład grał tym konkretnym klubem
                const specificMatches = allMatches.filter(m => 
                    (m.team1.name === team.name && JSON.stringify(m.team1.players.sort()) === JSON.stringify(players.slice().sort())) ||
                    (m.team2.name === team.name && JSON.stringify(m.team2.players.sort()) === JSON.stringify(players.slice().sort()))
                );
                
                const smCount = specificMatches.length;

                // Helper do obliczania winrate
                const calcStats = (matchesList, teamName) => {
                    let w=0, g=0;
                    matchesList.forEach(m => {
                        const isT1 = m.team1.name === teamName;
                        const myS = isT1 ? m.team1.score : m.team2.score;
                        const opS = isT1 ? m.team2.score : m.team1.score;
                        if(myS > opS) w++;
                        g += myS;
                    });
                    return { w, g, wr: matchesList.length ? (w/matchesList.length) : 0, avgG: matchesList.length ? (g/matchesList.length) : 0 };
                };

                const sStats = calcStats(specificMatches, team.name);
                const candidates = [];

                // --- LOGIKA DLA KONKRETNEGO SKŁADU (Priorytet) ---
                if (smCount > 0) {
                    if (smCount >= 3 && sStats.wr === 1) candidates.push(make(isPlural ? "Wasza Twierdza" : "Twoja Twierdza", `Wygrane ${smCount}/${smCount} (100%) tym składem w tym klubie`, 'positive'));
                    if (smCount >= 3 && sStats.wr === 0) candidates.push(make(isPlural ? "Wasza Klątwa" : "Twój Pech", `Przegrane ${smCount}/${smCount} (0%) tym składem w tym klubie`, 'negative'));
                    if (smCount >= 5 && sStats.wr >= 0.8) candidates.push(make("🔥 Dominacja", `WR ${(Math.round(sStats.wr*100))}% na podstawie ${smCount} meczów`, 'positive'));
                    if (smCount >= 5 && sStats.wr <= 0.2) candidates.push(make("❄️ Trudny Teren", `WR ${(Math.round(sStats.wr*100))}% na podstawie ${smCount} meczów`, 'negative'));
                    if (smCount >= 3 && sStats.avgG >= 4.0) candidates.push(make("Maszyna do Goli", `Śr. ${sStats.avgG.toFixed(1)} g/m na ${smCount} meczach`, 'positive'));
                    if (smCount >= 3 && sStats.avgG >= 3.2) candidates.push(make("Atak Totalny", `Śr. ${sStats.avgG.toFixed(1)} g/m na ${smCount} meczach`, 'positive'));
                    if (smCount >= 3 && sStats.avgG <= 0.5) candidates.push(make("Murarka", `Śr. ${sStats.avgG.toFixed(1)} g/m na ${smCount} meczach`, 'negative'));
                    if (smCount >= 3 && sStats.avgG <= 0.8) candidates.push(make("Beton", `Śr. ${sStats.avgG.toFixed(1)} g/m na ${smCount} meczach`, 'neutral'));
                    if (smCount >= 10) candidates.push(make("Weterani", `${smCount} ${meczDecl(smCount)} tym składem w tym klubie`, 'positive'));
                    const lineupMatches = allMatches.filter(m => 
                        JSON.stringify(m.team1.players.slice().sort()) === JSON.stringify(players.slice().sort()) ||
                        JSON.stringify(m.team2.players.slice().sort()) === JSON.stringify(players.slice().sort())
                    );
                    const lineupCount = lineupMatches.length;
                    if (lineupCount >= 5) {
                        const pct = Math.round((smCount / lineupCount) * 100);
                        const desc = isPlural ? `Rozegraliście tym klubem ${pct}% swoich meczów (${smCount}/${lineupCount})` : `Rozegrałeś tym klubem ${pct}% swoich meczów (${smCount}/${lineupCount})`;
                        candidates.push(make(isPlural ? "Wasz Ulubiony Klub" : "Twój Ulubiony Klub", desc, 'positive'));
                    }
                    if (candidates.length === 0) {
                        candidates.push(make(`${smCount} ${meczDecl(smCount)}`, `Śr. ${(sStats.avgG||0).toFixed(1)} g/m`, 'neutral'));
                    }
                } else {
                    // 2. STATYSTYKI GLOBALNE KLUBU
                    const globalMatches = allMatches.filter(m => m.team1.name === team.name || m.team2.name === team.name);
                    const gCount = globalMatches.length;
                    const gStats = calcStats(globalMatches, team.name);
                    if (gCount === 0) candidates.push(make("Debiut klubu", "Nikt jeszcze nie grał tą ekipą", 'neutral'));
                    const enoughGlobal = gCount >= 3;
                    if (gCount >= 20 && gStats.wr >= 0.6) candidates.push(make("Meta Pick", `Wygrana ${(Math.round(gStats.wr*100))}% w ${gCount} ${meczDecl(gCount)}`, 'positive'));
                    if (gCount >= 10 && gStats.wr <= 0.3) candidates.push(make("Słaby Pick", `Wygrana ${(Math.round(gStats.wr*100))}% w ${gCount} ${meczDecl(gCount)}`, 'negative'));
                    if (gCount >= 30) candidates.push(make("Ulubieniec", `Wybrany ${gCount} razy`, 'neutral'));
                    if (enoughGlobal && gStats.avgG >= 3.5) candidates.push(make("Ofensywny", `Śr. ${gStats.avgG.toFixed(1)} g/m`, 'positive'));
                    if (enoughGlobal && gStats.avgG <= 1.5) candidates.push(make("Defensywny", `Śr. ${gStats.avgG.toFixed(1)} g/m`, 'neutral'));
                    if (gCount >= 20 && gStats.wr >= 0.45 && gStats.wr <= 0.55) candidates.push(make("Równy", `WR ${(Math.round(gStats.wr*100))}% w ${gCount} meczach`, 'neutral'));
                    if (enoughGlobal && gCount >= 15 && gStats.avgG >= 2.0 && gStats.avgG <= 3.0) candidates.push(make("Zrównoważony", `Śr. ${gStats.avgG.toFixed(1)} g/m`, 'neutral'));
                    let favPlayer = null, favCount = 0;
                    players.forEach(p => {
                        const c = (pStats[p] && pStats[p].clubs && pStats[p].clubs[team.name]) ? pStats[p].clubs[team.name] : 0;
                        if (c > favCount) { favCount = c; favPlayer = p; }
                    });
                    if (favPlayer && favCount >= 5) candidates.push(make(`Ulubiony: ${favPlayer}`, `${favPlayer} grał tym klubem ${favCount} razy`, 'neutral'));
                    let formPlayer = null, formWr = 0, formCount = 0;
                    players.forEach(p => {
                        const pm = allMatches.filter(m => (
                            (m.team1.name === team.name && m.team1.players.includes(p)) ||
                            (m.team2.name === team.name && m.team2.players.includes(p))
                        ));
                        const ps = calcStats(pm, team.name);
                        if (pm.length >= 5 && ps.wr > formWr) { formWr = ps.wr; formCount = pm.length; formPlayer = p; }
                    });
                    if (formPlayer && formWr >= 0.7) candidates.push(make(`Mocny u ${formPlayer}`, `WR ${(Math.round(formWr*100))}% na ${formCount} meczach`, 'positive'));
                    if (formPlayer && formWr <= 0.3) candidates.push(make(`Nie idzie u ${formPlayer}`, `WR ${(Math.round(formWr*100))}% na ${formCount} meczach`, 'negative'));
                    if (team.stars <= 3.5) candidates.push(make("Underdog", "Klub z niższą oceną gwiazdek", 'neutral'));
                    if (candidates.length === 0) {
                        candidates.push(make("Pierwszy występ", isPlural ? "Nie graliście jeszcze tym klubem" : "Nie grałeś jeszcze tym klubem", 'neutral'));
                    }
                }

                // Wybór losowy z unikaniem natychmiastowych powtórek dla danego klubu
                let pool = candidates;
                const last = AppState.lastFacts[team.name];
                if (last && pool.length > 1) pool = pool.filter(x => x.title !== last);
                const pick = pool[Math.floor(Math.random() * pool.length)];
                AppState.lastFacts[team.name] = pick.title;
                return pick;
            },
        };


        const PostMatchMenu={rematch(){this.close();this.reset();document.getElementById('step2-screen').classList.remove('hidden');},newSquads(){this.close();this.reset();document.getElementById('step1-screen').classList.remove('hidden');},showStats(){this.close();this.reset();window.Stats.init();document.getElementById('stats-modal').classList.remove('hidden');window.Stats.switchTab('rankings',document.getElementById('tab-rankings'));document.getElementById('step1-screen').classList.remove('hidden');},
        reset() {
    AppState.recordingGoals = {t1: [], t2: []}; 
    AppState.finalTeam1 = null; 
    AppState.finalTeam2 = null; 
    resetMatchUI(); // Wywołanie nowej funkcji
},
        close(){['post-match-modal','results-container','drawing-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));document.documentElement.classList.remove('allow-x-scroll');document.body.classList.remove('allow-x-scroll');document.body.classList.remove('is-drawing');document.body.classList.remove('has-results');}};

        const Stats = {
            hideLowMatches: false,
            range: 'all',
            init() { 
    const closeBtn = document.getElementById('close-stats');
    if (closeBtn) {
        closeBtn.onclick = () => document.getElementById('stats-modal').classList.add('hidden');
    }
    
    const toggle = document.getElementById('hide-low-matches-toggle');
    if (toggle) {
        // Set default from DOM (checked by default)
        this.hideLowMatches = !!toggle.checked;
        toggle.addEventListener('change', (e) => {
            this.hideLowMatches = e.target.checked;
            Sound.click();
            this.switchTab(this.activeTab, document.querySelector('.stats-tab.active'));
        });
    }
    const rangeSel = document.getElementById('range-select');
    if (rangeSel) {
        this.range = rangeSel.value;
        rangeSel.addEventListener('change', (e) => {
            this.range = e.target.value;
            Sound.click();
            this.renderKpis();
            this.switchTab(this.activeTab, document.querySelector('.stats-tab.active'));
        });
    }
    this.renderKpis();
    // Ensure rankings tab renders by default when opening
    const tabBtn = document.getElementById('tab-rankings');
    this.switchTab('rankings', tabBtn);
},
            clearHistory() { DataManager.clearHistory(); },
            activeTab: 'rankings',
            switchTab(t,b) {
                this.activeTab = t;
                document.querySelectorAll('.stats-tab').forEach(x=>x.classList.remove('active','bg-indigo-600')); if(b)b.classList.add('active','bg-indigo-600');
                const c=document.getElementById('stats-content'); document.getElementById('ranking-type-container').classList.add('hidden');
                
                if(t==='history'){
                    const list = DataManager.getMatches().slice().reverse();
                    if (list.length === 0) { c.innerHTML = '<p class="text-center text-gray-500 mt-10">Brak historii meczów.</p>'; return; }
                    const groups = {};
                    const monthLabel = (d) => d.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
                    list.forEach(m => {
                        const dt = m.id ? new Date(m.id) : (m.date ? new Date(m.date) : new Date());
                        const key = `${dt.getFullYear()}-${dt.getMonth()+1}`;
                        if (!groups[key]) groups[key] = { label: monthLabel(dt), items: [] };
                        groups[key].items.push(m);
                    });
                    const html = Object.entries(groups).map(([key, g]) => {
                        const rows = g.items.map(m => {
                            const dateTxt = (m.date && m.date.split) ? m.date.split(',')[0] : new Date(m.id).toLocaleDateString('pl-PL');
                            return `
                            <div class="bg-gray-800 p-3 mb-2 rounded border border-gray-700">
                                <div class="flex justify-between items-center gap-2">
                                    <div class="text-[11px] text-gray-400">${dateTxt}</div>
                                    <div class="font-bold text-sm md:text-base text-center flex-1">
                                        <span class="text-blue-400">${m.team1.name}</span>
                                        <span class="bg-gray-900 px-2 py-0.5 rounded mx-2 inline-block">${m.team1.score} : ${m.team2.score}</span>
                                        <span class="text-red-400">${m.team2.name}</span>
                                    </div>
                                    <div class="flex-shrink-0 ml-2">
                                        <button class="ml-2 text-indigo-400 hover:text-indigo-300 font-bold px-2 text-sm" onclick="window.MatchEditor.open(${m.id})">✏️</button>
                                        <button class="ml-1 text-red-500 hover:text-red-400 font-bold px-2" onclick="window.DataManager.deleteMatch(${m.id})">🗑</button>
                                    </div>
                                </div>
                                <div class="mt-1 text-[11px] md:text-[12px] text-gray-300 leading-snug">
                                    <span class="text-blue-300">${m.team1.players.join(' & ')}</span>
                                    <span class="text-gray-500 mx-1">vs</span>
                                    <span class="text-red-300">${m.team2.players.join(' & ')}</span>
                                </div>
                            </div>`;
                        }).join('');
                        const collapsed = this.historyCollapsed[key];
                        return `<div class="mb-4">
                            <button class="sticky top-0 z-10 w-full text-left bg-slate-900/95 backdrop-blur px-2 py-1.5 rounded text-[10px] font-black uppercase tracking-widest text-gray-300 border border-white/5 mb-2 flex items-center justify-between"
                                    onclick="window.Stats.toggleHistoryGroup('${key}')">
                                <span>${g.label}</span>
                                <span class="text-gray-400 ml-2">${collapsed ? '▶' : '▼'}</span>
                            </button>
                            <div id="history-group-${key}" ${collapsed ? 'style="display:none"' : ''}>
                                ${rows}
                            </div>
                        </div>`;
                    }).join('');
                    c.innerHTML = html;
                    c.classList.remove('fade-block'); void c.offsetWidth; c.classList.add('fade-block');
                } else if(t==='rankings'){ 
                    document.getElementById('ranking-type-container').classList.remove('hidden'); 
                    this.renderRankings(); 
                }
                else if(t==='players'){ this.renderPlayerCards(); }
                else if(t==='duos' || t==='teams'){ 
                    document.getElementById('ranking-type-container').classList.remove('hidden'); 
                    this.renderRankings(); 
                }
            },
            historyCollapsed: {},
            toggleHistoryGroup(key) {
                this.historyCollapsed[key] = !this.historyCollapsed[key];
                const el = document.getElementById(`history-group-${key}`);
                if (!el) return;
                const isHidden = el.style.display === 'none';
                el.style.display = isHidden ? '' : 'none';
                // Update caret icon without full re-render
                const header = el.previousElementSibling;
                if (header) header.querySelector('span:last-child').textContent = isHidden ? '▼' : '▶';
            },
            // ZMODYFIKOWANA FUNKCJA CALC ABY PRZYJMOWAĆ NIESTANDARDOWĄ HISTORIĘ
            getMatchesFiltered() {
                const all = DataManager.getMatches();
                if (this.range === 'today') {
                    const today = new Date();
                    const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
                    const start = new Date(y, m, d, 0, 0, 0, 0);
                    const end = new Date(y, m, d, 23, 59, 59, 999);
                    return all.filter(mm => {
                        const dt = mm.id ? new Date(mm.id) : (mm.date ? new Date(mm.date) : new Date());
                        return dt >= start && dt <= end;
                    });
                }
                if (this.range === 'week') {
                    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
                    return all.filter(mm => {
                        const dt = mm.id ? new Date(mm.id) : (mm.date ? new Date(mm.date) : new Date());
                        return dt >= cutoff;
                    });
                }
                if (this.range === 'month') {
                    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 1);
                    return all.filter(mm => {
                        const dt = mm.id ? new Date(mm.id) : (mm.date ? new Date(mm.date) : new Date());
                        return dt >= cutoff;
                    });
                }
                return all;
            },
            calc(customMatches = null) {
                const ms = customMatches || this.getMatchesFiltered(); 
                const pl = DataManager.getPlayers();
                let pD={}; let dD={}; let tD={}; 
                pl.forEach(p=>pD[p]={name:p,m:0,w:0,d:0,l:0,g:0,a:0,pts:0,wg:0,dp:0,ag:0,bg:0,dg:0,pg:0,fg:0,clubs:{},nemesis:{},partners:{},allPartners:0, biggestWin:{diff: -99}, biggestLoss:{diff: 99}});
                
                ms.forEach(m=>{
                    const t1p=m.team1.score>m.team2.score?3:(m.team1.score==m.team2.score?1:0);
                    const t2p=m.team2.score>m.team1.score?3:(m.team2.score==m.team1.score?1:0);
                    
                    const proc=(t,pts,opp,oppS)=>{
                        const diff = t.score - oppS;
                        if(!tD[t.name]) tD[t.name]={name:t.name,m:0,w:0,d:0,l:0,g:0};
                        tD[t.name].m++;
                        if(pts===3) tD[t.name].w++; else if(pts===1) tD[t.name].d++; else tD[t.name].l++;
                        tD[t.name].g+=t.score;

                        if(t.players.length===2){
                            const k=t.players.slice().sort().join(" & ");
                            if(!dD[k])dD[k]={name:k,m:0,w:0,d:0,l:0,g:0,a:0,pts:0,dg:0,bg:0,pg:0,fg:0};
                            let dd=dD[k];
                            dd.m++;
                            if(pts===3) dd.w++; else if(pts===1) dd.d++; else dd.l++;
                            dd.g+=t.score;
                            dd.pts+=pts; 
                            t.goals.forEach(g=>{
                                if(g.method==='Z dystansu'){dd.dg++;} 
                                else if(g.method==='Rzut Wolny'){dd.fg++;}
                                else if(g.method==='Rzut Karny'){dd.pg++;}
                                else if(g.method==='Z pola karnego'){dd.bg++;}
                                if(g.assist!=='Brak') dd.a++;
                                if(g.scorer !== 'Samobój') {
                                     if(g.method==='Z dystansu') dd.pts+=2;
                                     else if(g.method==='Rzut Wolny') dd.pts+=4;
                                     else if(g.method==='Rzut Karny' || g.method==='Z pola karnego') dd.pts+=1;
                                     else dd.pts+=1; 
                                     if(g.assist!=='Brak') dd.pts+=1;
                                }
                            });
                        }
                        t.players.forEach(p=>{
                            if(!pD[p])return;
                            let pd=pD[p]; pd.m++; 
                            if(pts===3){ 
                                pd.w++; pd.pts+=3;
                                if(diff > pd.biggestWin.diff) pd.biggestWin = {diff: diff, myScore: t.score, oppScore: oppS, myTeam: t.name, oppTeam: opp.name, date: m.date, myPlayers: t.players, oppPlayers: opp.players};
                            } else if(pts===1){ 
                                pd.d++; pd.pts+=1; 
                            } else { 
                                pd.l++; 
                                if(diff < pd.biggestLoss.diff) pd.biggestLoss = {diff: diff, myScore: t.score, oppScore: oppS, myTeam: t.name, oppTeam: opp.name, date: m.date, myPlayers: t.players, oppPlayers: opp.players};
                            }
                            pd.clubs[t.name]=(pd.clubs[t.name]||0)+1;
                            t.players.forEach(mate=>{
                                if(mate!==p){ 
                                    pd.partners[mate]=(pd.partners[mate]||0)+1; 
                                    pd.allPartners++;
                                }
                            });
                            opp.players.forEach(op=>{
                                if(!pd.nemesis[op]) pd.nemesis[op]={w:0,d:0,l:0,count:0}; 
                                pd.nemesis[op].count++;
                                if (pts === 3) pd.nemesis[op].w++;
                                else if (pts === 1) pd.nemesis[op].d++;
                                else pd.nemesis[op].l++;
                            });
                        });
                        t.goals.forEach(g=>{
                            if(g.scorer!=='Samobój' && pD[g.scorer]){
                                let pp=pD[g.scorer]; pp.g++;
                                if(g.method==='Z dystansu'){pp.pts+=2;pp.dg++;} 
                                else if(g.method==='Rzut Wolny'){pp.pts+=4;pp.fg++;}
                                else if(g.method==='Rzut Karny'){pp.pts+=1;pp.pg++;}
                                else if(g.method==='Z pola karnego'){pp.pts+=1;pp.bg++;}
                            }
                            if(g.assist!=='Brak' && pD[g.assist] && g.scorer !== 'Samobój'){ 
                                pD[g.assist].a++; pD[g.assist].pts+=1; pD[g.assist].ag++; 
                            }
                        });
                    };
                    proc(m.team1,t1p,m.team2,m.team2.score); proc(m.team2,t2p,m.team1,m.team1.score);
                });
                return {p:Object.values(pD), d:Object.values(dD), t:Object.values(tD)};
            },
            
            // NOWA FUNKCJA DO OBLICZANIA TRENDÓW
            getTrendData(currentType, activeTab) {
                const matches = this.getMatchesFiltered();
                if (matches.length < 1) return {};
                
                // Stan poprzedni (bez ostatniego meczu)
                const prevMatches = matches.slice(0, -1);
                
                const currCalc = this.calc(matches);
                const prevCalc = this.calc(prevMatches);
                
                // Helper to retrieve source array based on tab
                const getSource = (cal) => {
                    if (activeTab === 'teams') return cal.t.filter(x => x.m > 0);
                    if (activeTab === 'duos') return cal.d.filter(x => x.m > 0);
                    return cal.p.filter(x => x.m > 0);
                };
                
                const currData = getSource(currCalc);
                const prevData = getSource(prevCalc);
                
                // Helper to sort (must duplicate renderRankings logic slightly)
                const sortLogic = (list, type) => {
                    if (activeTab === 'teams') {
                        if(type === 'team_wins') return list.sort((a,b) => (b.w/b.m) - (a.w/a.m));
                        if(type === 'team_goals') return list.sort((a,b) => (b.g/b.m) - (a.g/a.m));
                        return list.sort((a,b) => b.m - a.m);
                    } else {
                        if(type==='points') return list.sort((a,b)=> (b.pts/b.m) - (a.pts/a.m) || b.pts - a.pts);
                        if(type==='winrate') return list.sort((a,b)=>(b.w/b.m||0)-(a.w/a.m||0));
                        if(type==='goals') return list.sort((a,b)=>(b.g/b.m||0)-(a.g/a.m||0));
                        if(type==='assists') return list.sort((a,b)=>(b.a/b.m||0)-(a.a/a.m||0));
                        
                        const k={dist_goals:'dg',box_goals:'bg',pen_goals:'pg',fk_goals:'fg'}[type];
                        if(k) return list.sort((a,b)=>(b[k]/b.m||0)-(a[k]/a.m||0));
                        return list;
                    }
                };

                const currSorted = sortLogic([...currData], currentType);
                const prevSorted = sortLogic([...prevData], currentType);
                
                const trends = {};
                
                currSorted.forEach((item, index) => {
                    // Find index in previous sorted list
                    const prevIndex = prevSorted.findIndex(prev => prev.name === item.name);
                    
                    if (prevIndex === -1) {
                        trends[item.name] = 0; // New entry, neutral
                    } else {
                        // If prevIndex was 5 and now is 3, trend is +2 (UP)
                        // If prevIndex was 1 and now is 2, trend is -1 (DOWN)
                        trends[item.name] = prevIndex - index;
                    }
                });
                
                return trends;
            },

            renderRankings() {
                const type = document.getElementById('ranking-type-select').value; 
                let sourceData;
                let isTeam = false;
                
                const select = document.getElementById('ranking-type-select');
                
                if (this.activeTab === 'teams') {
                    if(!select.querySelector('option[value="team_picks"]')) {
                        select.innerHTML = `
                            <option value="team_picks">Najczęściej Wybierane</option>
                            <option value="team_wins">Skuteczność % (Kluby)</option>
                            <option value="team_goals">Średnia Goli (Kluby)</option>
                        `;
                    }
                    sourceData = this.calc().t;
                    isTeam = true;
                } else {
                    if(!select.querySelector('option[value="points"]')) {
                        select.innerHTML = `
                            <option value="points">GŁÓWNY (Punkty MVP)</option>
                            <option value="winrate">Skuteczność (%)</option>
                            <option value="goals">Król Strzelców (Śr.)</option>
                            <option value="assists">Król Asyst (Śr.)</option>
                            <option value="dist_goals">Gole z Dystansu (Śr.)</option>
                            <option value="box_goals">Gole z Pola (Śr.)</option>
                            <option value="pen_goals">Gole z Karnych (Śr.)</option>
                            <option value="fk_goals">Gole z Wolnych (Śr.)</option>
                        `;
                    }
                    sourceData = this.activeTab === 'duos' ? this.calc().d : this.calc().p;
                }
                
                // Get Trends
                const trendData = this.getTrendData(type, this.activeTab);
                
                let d = sourceData.filter(x => x.m > 0);
                
                // FILTER LOW MATCHES IF TOGGLE IS ON
                if (this.hideLowMatches) {
                    d = d.filter(x => x.m >= 10);
                }
                
                let s=[], c="", v=(p)=>"";
                
                if (isTeam) {
                    const currentType = select.value; 
                    if(currentType === 'team_wins') { 
                        s = d.sort((a,b) => (b.w/b.m) - (a.w/a.m)); 
                        c = "Win %"; 
                        v = p => `${Math.round(p.w/p.m*100)}% <span class="text-xs text-gray-500">(${p.w}/${p.m})</span>`; 
                    }
                    else if(currentType === 'team_goals') { 
                        s = d.sort((a,b) => (b.g/b.m) - (a.g/a.m)); 
                        c = "Śr. Goli"; 
                        v = p => `${(p.g/p.m).toFixed(2)} <span class="text-xs text-gray-500">(${p.g} w ${p.m})</span>`; 
                    }
                    else { s = d.sort((a,b) => b.m - a.m); c = "Wybory"; v = p => p.m; } 
                } else {
                    const currentType = select.value;
                    if(currentType==='points'){
                        s=d.sort((a,b)=> (b.pts/b.m) - (a.pts/a.m) || b.pts - a.pts);
                        c="MVP PKT";
                        v=p=>{
                            return `<div class="flex flex-col text-right text-xs font-mono">
                                    <div class="mb-1">
                                        <span class="text-yellow-400 font-bold text-lg">${(p.pts/p.m).toFixed(2)}</span>
                                        <span class="text-[10px] text-gray-500">avg</span>
                                    </div>
                                    <div class="text-[10px] text-gray-400 mt-1">
                                        <span class="text-green-400">W:${p.w}</span>-<span class="text-gray-300">R:${p.d}</span>-<span class="text-red-400">P:${p.l}</span>
                                        <span class="text-gray-500 mx-1">|</span>
                                        <span class="text-blue-300">⚽${p.g}</span> <span class="text-yellow-300">A:${p.a}</span>
                                    </div>
                                </div>`;
                        };
                    }
                    else if(currentType==='winrate'){s=d.sort((a,b)=>(b.w/b.m||0)-(a.w/a.m||0));c="Win %";v=p=>`${p.m?Math.round(p.w/p.m*100):0}% <span class="text-xs text-gray-500">(${p.w}/${p.m})</span>`;}
                    else if(currentType==='goals'){s=d.sort((a,b)=>(b.g/b.m||0)-(a.g/a.m||0));c="Śr. Goli";v=p=>`${(p.g/p.m||0).toFixed(2)} <span class="text-xs text-gray-500">(${p.g} w ${p.m})</span>`;}
                    else if(currentType==='assists'){s=d.sort((a,b)=>(b.a/b.m||0)-(a.a/a.m||0));c="Śr. Asyst";v=p=>`${(p.a/p.m||0).toFixed(2)} <span class="text-xs text-gray-500">(${p.a} w ${p.m})</span>`;}
                    else {
                        const k={dist_goals:'dg',box_goals:'bg',pen_goals:'pg',fk_goals:'fg'}[currentType];
                        const label = {dist_goals: 'Gole Dyst.', box_goals: 'Gole Pola', pen_goals: 'Gole Karn.', fk_goals: 'Gole Wol.'}[currentType];
                        if(k) {
                            s=d.sort((a,b)=>(b[k]/b.m||0)-(a[k]/a.m||0));c=`Śr. ${label.split(' ')[0]}`;v=p=>`${(p[k]/p.m||0).toFixed(2)} <span class="text-xs text-gray-500">(${p[k]} w ${p.m})</span>`;
                        } else { s=d; c="?"; }
                    }
                }
                
                let h=`<table class="w-full text-left text-sm text-gray-300"><thead class="text-xs uppercase bg-gray-700 text-gray-400"><tr><th class="px-2 py-3 w-10 text-center">#</th><th class="px-2 py-3">${isTeam ? 'Klub' : (this.activeTab === 'duos' ? 'Duet' : 'Gracz')}</th><th class="px-2 py-3 text-right">${c}</th></tr></thead><tbody>`;
                
                if (s.length === 0) h = '<p class="text-center text-gray-500 py-8">Brak danych (lub ukryte).</p>';
                else s.forEach((p,i)=> {
                    const rowClass = (this.activeTab === 'players' || this.activeTab === 'rankings') ? "border-b border-gray-700 hover:bg-gray-800 cursor-pointer" : "border-b border-gray-700 hover:bg-gray-800";
                    const clickAttr = (this.activeTab === 'players' || this.activeTab === 'rankings') ? `onclick="window.Stats.openProfile('${p.name}')"` : "";
                    
                    // --- TREND ARROW LOGIC ---
                    const trend = trendData[p.name] || 0;
                    let trendIcon = '';
                    // Only show trends if not filtering low matches, as filtering changes positions drastically
                    if (!this.hideLowMatches) {
                        if (trend > 0) {
                            trendIcon = `<span class="trend-arrow text-green-500 font-bold ml-2 text-[10px]">▲${trend}</span>`;
                        } else if (trend < 0) {
                            trendIcon = `<span class="trend-arrow text-red-500 font-bold ml-2 text-[10px]">▼${Math.abs(trend)}</span>`;
                        }
                    }
                    // -------------------------

                    h+=`<tr ${clickAttr} class="${rowClass}">
                        <td class="px-2 py-3 font-mono text-gray-500 align-middle text-center">${i+1}</td>
                        <td class="px-2 py-3 font-bold text-white text-sm md:text-base align-middle">
                            <div class="flex items-center">${p.name} ${trendIcon}${this.sparklineSvg(this.buildSeriesFor(p.name, type), 100, 24)}</div>
                        </td>
                        <td class="px-2 py-3 text-right align-middle">${v(p)}</td>
                    </tr>`;
                });
                
                const cc = document.getElementById('stats-content');
                cc.innerHTML = h+(s.length > 0 ? `</tbody></table>` : '');
                cc.classList.remove('fade-block'); void cc.offsetWidth; cc.classList.add('fade-block');
            },
            renderKpis() {
                const el = document.getElementById('stats-kpis');
                if (!el) return;
                const ms = this.getMatchesFiltered();
                const players = DataManager.getPlayers();
                const totals = ms.reduce((acc, m) => { acc.g += (m.team1.score||0) + (m.team2.score||0); return acc; }, { g: 0 });
                const calc = this.calc();
                const clubsPlayed = calc.t.filter(t => t.m > 0).length;
                const duosPlayed = calc.d.filter(d => d.m > 0).length;
                // Zakładamy 20 minut na mecz (spójnie z Profile Managera)
                const totalMinutes = ms.length * 20;
                const hours = Math.round((totalMinutes / 60) * 10) / 10; // 1 dec.
                el.innerHTML = `
                    <div class="kpi"><div class="label">Mecze</div><div class="value">${ms.length}</div></div>
                    <div class="kpi"><div class="label">Czas gry</div><div class="value">${hours} h</div></div>
                    <div class="kpi"><div class="label">Gole łącznie</div><div class="value">${totals.g}</div></div>
                    <div class="kpi"><div class="label">Gracze</div><div class="value">${players.length}</div></div>
                    <div class="kpi"><div class="label">Kluby</div><div class="value">${clubsPlayed}</div></div>
                    <div class="kpi"><div class="label">Duety</div><div class="value">${duosPlayed}</div></div>
                `;
            },
            // --- SPARKLINES ---
            sparklineSvg(series, w=80, h=24) {
                if (!series || series.length === 0) {
                    return `<svg class="sparkline ml-2" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="0" y1="${(h/2).toFixed(1)}" x2="${w}" y2="${(h/2).toFixed(1)}" stroke="#64748b" stroke-width="2" stroke-dasharray="4 3" opacity="0.5" /></svg>`;
                }
                // Hide flat/constant lines (meaningless trend)
                if (series.length < 2 || new Set(series).size <= 1) {
                    return '';
                }
                const min = Math.min(...series);
                const max = Math.max(...series);
                const span = Math.max(1, max - min);
                const step = w / Math.max(1, series.length - 1);
                const ptsArr = series.map((v, i) => {
                    const x = i * step;
                    const y = h - ((v - min) / span) * (h - 2) - 1;
                    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
                });
                const ptsStr = ptsArr.map(p => `${p.x},${p.y}`).join(' ');
                const fillPoly = `<polygon class="spark-fill" points="0,${h-1} ${ptsStr} ${w},${h-1}" />`;
                const polyline = `<polyline points="${ptsStr}" stroke="#60a5fa" stroke-width="2" fill="none" class="spark-line"/>`;
                return `<svg class="sparkline ml-2" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${fillPoly}${polyline}</svg>`;
            },
            buildSeriesFor(name, seriesType) {
                // Seria oparta o wybrany typ rankingu i aktywną zakładkę.
                const type = seriesType || (document.getElementById('ranking-type-select')?.value || 'points');
                const takeFromMatches = (matches) => {
                    const out = [];
                    if (this.activeTab === 'teams') {
                        for (let i = matches.length - 1; i >= 0 && out.length < 5; i--) {
                            const m = matches[i];
                            const isT1 = m.team1.name === name;
                            const isT2 = m.team2.name === name;
                            if (isT1 || isT2) {
                                const me = isT1 ? m.team1 : m.team2;
                                const opp = isT1 ? m.team2 : m.team1;
                                if (type === 'team_goals') out.push(me.score || 0);
                                else if (type === 'team_wins') {
                                    const pts = me.score > opp.score ? 3 : (me.score === opp.score ? 1 : 0);
                                    out.push(pts);
                                } else {
                                    // team_picks: wartość stała 1 dla każdego wystąpienia
                                    out.push(1);
                                }
                            }
                        }
                        return out.reverse();
                    }
                    if (this.activeTab === 'duos') {
                        const [a, b] = name.split('&').map(s => s.trim());
                        for (let i = matches.length - 1; i >= 0 && out.length < 5; i--) {
                            const m = matches[i];
                            const inT1 = m.team1.players.includes(a) && m.team1.players.includes(b);
                            const inT2 = m.team2.players.includes(a) && m.team2.players.includes(b);
                            if (inT1 || inT2) {
                                const me = inT1 ? m.team1 : m.team2;
                                const opp = inT1 ? m.team2 : m.team1;
                                const resultPts = me.score > opp.score ? 3 : (me.score === opp.score ? 1 : 0);
                                const goals = (me.goals || []).filter(g => g.scorer === a || g.scorer === b).length;
                                const assists = (me.goals || []).filter(g => g.assist === a || g.assist === b).length;
                                if (type === 'points') out.push(resultPts + goals + assists * 0.5);
                                else if (type === 'winrate') out.push(resultPts);
                                else if (type === 'goals') out.push(goals);
                                else if (type === 'assists') out.push(assists);
                                else {
                                    const keyMap = { dist_goals: 'Z dystansu', box_goals: 'Z pola karnego', pen_goals: 'Rzut Karny', fk_goals: 'Rzut Wolny' };
                                    const method = keyMap[type];
                                    if (method) {
                                        const cnt = (me.goals || []).filter(g => (g.scorer === a || g.scorer === b) && g.method === method).length;
                                        out.push(cnt);
                                    } else {
                                        out.push(resultPts);
                                    }
                                }
                            }
                        }
                        return out.reverse();
                    }
                    // players (rankings/gracze)
                    for (let i = matches.length - 1; i >= 0 && out.length < 5; i--) {
                        const m = matches[i];
                        const inT1 = m.team1.players.includes(name);
                        const inT2 = m.team2.players.includes(name);
                        if (inT1 || inT2) {
                            const me = inT1 ? m.team1 : m.team2;
                            const opp = inT1 ? m.team2 : m.team1;
                            const resultPts = me.score > opp.score ? 3 : (me.score === opp.score ? 1 : 0);
                            const goals = (me.goals || []).filter(g => g.scorer === name).length;
                            const assists = (me.goals || []).filter(g => g.assist === name).length;
                            if (type === 'points') out.push(resultPts + goals + assists * 0.5);
                            else if (type === 'winrate') out.push(resultPts);
                            else if (type === 'goals') out.push(goals);
                            else if (type === 'assists') out.push(assists);
                            else {
                                const keyMap = { dist_goals: 'Z dystansu', box_goals: 'Z pola karnego', pen_goals: 'Rzut Karny', fk_goals: 'Rzut Wolny' };
                                const method = keyMap[type];
                                if (method) {
                                    const cnt = (me.goals || []).filter(g => g.scorer === name && g.method === method).length;
                                    out.push(cnt);
                                } else {
                                    out.push(resultPts + goals + assists * 0.5);
                                }
                            }
                        }
                    }
                    return out.reverse();
                };

                const ranged = takeFromMatches(this.getMatchesFiltered());
                if (ranged.length > 0) return ranged;
                return takeFromMatches(DataManager.getMatches());
            },
            renderPlayerCards() {
                let d=this.calc().p.sort((a,b)=> (b.pts/b.m) - (a.pts/a.m));
                
                // FILTER LOW MATCHES IF TOGGLE IS ON
                if (this.hideLowMatches) {
                    d = d.filter(x => x.m >= 10);
                }

                // Player cards also benefit from seeing trend data (using main points rank)
                const trendData = this.getTrendData('points', 'players');

                 const declM = (n)=>{ if(n===1)return 'mecz'; const n10=n%10,n100=n%100; if(n10>=2&&n10<=4&&(n100<10||n100>=20)) return 'mecze'; return 'meczów'; };
                 const cc = document.getElementById('stats-content');
                 cc.innerHTML=`<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${d.map(p=>{
                     const trend = trendData[p.name] || 0;
                     let trendIcon = '';
                     if (!this.hideLowMatches) {
                        if (trend > 0) trendIcon = `<span class="trend-arrow text-green-400 font-black ml-1">▲</span>`;
                        else if (trend < 0) trendIcon = `<span class="trend-arrow text-red-400 font-black ml-1">▼</span>`;
                     }
                     
                     return `<div onclick="window.Stats.openProfile('${p.name}')" class="bg-gray-800 p-4 rounded-xl border border-gray-700 cursor-pointer hover:border-indigo-500 transition-colors flex justify-between items-center"><div><h3 class="text-lg font-bold text-white flex items-center gap-1">${p.name} ${trendIcon}</h3><div class="text-xs text-gray-400">${p.m} ${declM(p.m)} • ${p.g} goli</div></div><div class="text-right"><div class="text-xl font-black text-yellow-400">${(p.pts/(p.m||1)).toFixed(1)}</div><div class="text-[10px] text-gray-500 uppercase">AVG PKT</div></div></div>`
                }).join('')}</div>`;
                cc.classList.remove('fade-block'); void cc.offsetWidth; cc.classList.add('fade-block');
                
                if(d.length === 0) cc.innerHTML = '<p class="text-center text-gray-500 py-8">Brak danych (lub ukryte).</p>';
            },
            getRank(pName, key, sortType = 'desc') {
                let all = this.calc().p.filter(p=>p.m>0);
                // Filter inside rank calculation as well if needed, but ranks usually imply full pool
                // For now, let's keep rank global, but if filtered view, user sees filtered list
                // If specific filtering is requested for rank numbers too:
                if (this.hideLowMatches) {
                    all = all.filter(p => p.m >= 10);
                }

                const keyMap = {
                    'pts': (p) => p.pts/p.m, 
                    'g': 'g', 'a': 'a', 'dg': 'dg', 'bg': 'bg', 'pg': 'pg', 'fg': 'fg',
                    'g/m': (p) => p.g/p.m, 'w%': (p) => p.w/p.m, 'a/m': (p) => p.a/p.m,
                    'dg/m': (p) => p.dg/p.m, 'bg/m': (p) => p.bg/p.m, 'pg/m': (p) => p.pg/p.m, 'fg/m': (p) => p.fg/p.m
                };
                const sortFn = (a, b) => {
                    const valA = typeof keyMap[key] === 'function' ? keyMap[key](a) : a[keyMap[key]];
                    const valB = typeof keyMap[key] === 'function' ? keyMap[key](b) : b[keyMap[key]];
                    const comparison = (valB || 0) - (valA || 0);
                    return sortType === 'desc' ? comparison : -comparison;
                };
                const sorted = all.sort(sortFn);
                const rank = sorted.findIndex(p => p.name === pName) + 1;
                return rank > 0 ? rank : '-';
            },
            getSmartTagline(p) {
                // Robust, safe and varied tagline generator based on stats and recent form
                if (!p || p.m === 0) return "Gotowy na debiut";
                const avgG = (p.g || 0) / (p.m || 1);
                const avgA = (p.a || 0) / (p.m || 1);
                const winRate = (p.w || 0) / (p.m || 1);
                const ptsAvg = (p.pts || 0) / (p.m || 1);

                // Recent context
                const name = p.name;
                const ms = this.getMatchesFiltered();
                const myMatches = ms.filter(m => (m.team1?.players||[]).includes(name) || (m.team2?.players||[]).includes(name));
                const getTs = (m) => {
                    if (typeof m.id === 'number') return m.id;
                    if (m.date && m.date.split) { const d = Date.parse(m.date.split(',')[0]); if (!isNaN(d)) return d; }
                    return Date.now();
                };
                myMatches.sort((a,b)=>getTs(a)-getTs(b));
                const last5 = myMatches.slice(-5);
                const last10 = myMatches.slice(-10);
                const perMatch = (m) => {
                    const me = (m.team1?.players||[]).includes(name) ? m.team1 : m.team2;
                    const opp = me === m.team1 ? m.team2 : m.team1;
                    const goals = (me.goals||[]).filter(g=>g.scorer===name).length;
                    const assists = (me.goals||[]).filter(g=>g.assist===name).length;
                    const res = me.score>opp.score ? 'W' : (me.score===opp.score ? 'R' : 'P');
                    return {goals,assists,res};
                };
                const lastGoals = last5.reduce((s,m)=>s+perMatch(m).goals,0);
                const lastAss = last5.reduce((s,m)=>s+perMatch(m).assists,0);
                const lastWins = last5.filter(m=>perMatch(m).res==='W').length;
                const lastDraws = last5.filter(m=>perMatch(m).res==='R').length;
                const lastLoss = last5.filter(m=>perMatch(m).res==='P').length;

                // Distributions
                const gSum = Math.max(1, p.g||0);
                const bgR = (p.bg||0)/gSum, dgR=(p.dg||0)/gSum, pgR=(p.pg||0)/gSum, fgR=(p.fg||0)/gSum;

                // Helper: seeded pick for variety
                const seed = (name.length*1000) + Math.round(ptsAvg*100) + (myMatches[myMatches.length-1]?.id||0);
                const seededRand = (N) => {
                    const x = Math.sin(seed) * 10000; const r = x - Math.floor(x); return Math.floor(r * N);
                };
                const pick = (arr) => arr.length ? arr[seededRand(arr.length)] : null;

                // Candidate tagline templates by category
                const candidates = [];

                // Form/streak
                if (lastWins >= 4) candidates.push(
                    ...["W znakomitej serii", "Zwycięska passa", "Nie zwalnia tempa"]
                );
                else if (lastLoss >= 3) candidates.push(
                    ...["Szukam przełamania", "Trudniejszy okres", "Potrzebna iskra"]
                );
                else if (lastDraws >= 3) candidates.push(
                    ...["Stabilny punkt zespołu", "Kontroluje tempo gry", "Utrzymuje równowagę"]
                );

                // Scoring/assisting roles
                if (avgG >= 1.5 && avgA < 0.8) candidates.push(
                    ...["Snajper zespołu", "Finisher", "Zapach bramki wyczuwa najlepiej"]
                );
                if (avgA >= 1.2 && avgG < 1.0) candidates.push(
                    ...["Kreator gry", "Mistrz ostatniego podania", "Rozdaje asysty"]
                );
                if (avgG >= 1.0 && avgA >= 1.0) candidates.push(
                    ...["Kompletny ofensywny pakiet", "Łączy strzał z podaniem", "Wszechstronny w ataku"]
                );

                // Specialty by goal types
                if (pgR > 0.25 && p.pg >= 3) candidates.push(
                    ...["Pewny egzekutor karnych", "Z jedenastu metrów bez nerwów"]
                );
                if (fgR > 0.15 && p.fg >= 2) candidates.push(
                    ...["Specjalista od rzutów wolnych", "Ustawiona piłka to atut"]
                );
                if (dgR > 0.35 && p.dg >= 3) candidates.push(
                    ...["Groźny z dystansu", "Uderza z daleka skutecznie"]
                );
                if (bgR > 0.5 && p.bg >= 5) candidates.push(
                    ...["Łowca bramek w polu", "Zawsze tam gdzie piłka"]
                );

                // Efficiency and leadership
                if (winRate >= 0.75 && p.m >= 6) candidates.push(
                    ...["Lider zwycięstw", "Wysoka skuteczność meczowa", "Napędza drużynę"]
                );
                if (ptsAvg >= 2.0) candidates.push(
                    ...["MVP w zasięgu", "Konsekwentnie zbiera punkty MVP"]
                );

                // Recent hot/cold vs season
                const lastAvgG = (lastGoals || 0) / Math.max(1,last5.length);
                const lastAvgA = (lastAss || 0) / Math.max(1,last5.length);
                if (lastAvgG > avgG * 1.4 && lastAvgG >= 1) candidates.push(
                    ...["W gazie strzeleckiej", "Rośnie forma strzelecka"]
                );
                if (lastAvgA > avgA * 1.4 && lastAvgA >= 1) candidates.push(
                    ...["Asystuje częściej", "Dystrybutor podań"]
                );

                // Partnerships
                let bestBro = null; let maxTogether = 0;
                for (const [bro, cnt] of Object.entries(p.partners||{})) { if (cnt > maxTogether) { maxTogether = cnt; bestBro = bro; } }
                if (bestBro && maxTogether >= Math.max(3, p.m*0.4)) candidates.push(
                    ...[`Dobra współpraca z ${bestBro}`, `Chemia z ${bestBro}`]
                );

                // Nemesis (neutral phrasing)
                let toughest = null; let toughLoss = 0;
                for (const [enemy, stats] of Object.entries(p.nemesis||{})) { if (stats.l > toughLoss) { toughest = enemy; toughLoss = stats.l; } }
                if (toughest && toughLoss >= 3) candidates.push(
                    ...[`Trudne mecze z ${toughest}`, `Wyzwanie: ${toughest}`]
                );

                // Club preference
                const favClubEntry = Object.entries(p.clubs||{}).sort((a,b)=>b[1]-a[1])[0];
                if (favClubEntry && favClubEntry[1] >= 3) candidates.push(
                    ...[`Często gra dla ${favClubEntry[0]}`, `Ulubione barwy: ${favClubEntry[0]}`]
                );

                // Activity level
                if (p.m >= 20) candidates.push(
                    ...["Filar zespołu", "Zawsze do dyspozycji"]
                );
                else if (p.m >= 10) candidates.push(
                    ...["Solidna obecność", "Regularnie w składzie"]
                );

                // Rank-based polish
                const rankPts = this.getRank(p.name, 'pts');
                if (rankPts && Number(rankPts) <= 3) candidates.push(
                    ...[`Czołówka MVP (#${rankPts})`, `Top ${rankPts} w klasyfikacji MVP`]
                );

                // Fallback pool (neutral, non-repeating tone)
                const fallback = [
                    "Skupiony na jakości", "Dobra dyspozycja", "Stabilna forma", "Gotów na wyzwania",
                    "Buduje przewagę", "Myśli kreatywnie", "Pracuje dla zespołu", "Czyta grę dobrze",
                    "Aktywny bez piłki", "Poprawia statystyki"
                ];

                const chosen = pick(candidates) || pick(fallback) || "W gotowości";
                return chosen;
            },
            openProfile(n) {
                const all=this.calc().p.filter(p=>p.m>0); const p=all.find(x=>x.name===n); if(!p)return;
                const pct=v=>p.m?Math.round(v/p.m*100):0;
                const avg=(v,m)=>m?(v/m).toFixed(2):'0.00';
                const playerInitials = (p.name.match(/\b\w/g) || [p.name[0]]).join('').substring(0, 2).toUpperCase();
                const defaultColor = stringToHslColor(p.name, 70, 50);
                const tagline = this.getSmartTagline(p);
                
                const meta = DataManager.getMeta()[n] || {};
                let photoHtml = '';
                
                if (meta.emoji) {
                     const bg = meta.color || defaultColor;
                     photoHtml = `<div onclick="AvatarEditor.open('${n}')" class="w-full h-full rounded-full flex items-center justify-center text-5xl border-4 border-white/20 shadow-lg cursor-pointer hover:opacity-80 transition-opacity" style="background-color: ${bg};">${meta.emoji}</div>`;
                } else {
                     photoHtml = `<div onclick="AvatarEditor.open('${n}')" class="w-full h-full rounded-full flex items-center justify-center text-4xl font-black shadow-lg border-4 border-white/20 cursor-pointer hover:opacity-80 transition-opacity" style="background-color: ${defaultColor};">${playerInitials}</div>`;
                }

                const getTop3Clubs = (obj) => Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>`<div class="flex justify-between text-xs"><span class="text-gray-300">${x[0]}</span><span class="font-bold">${x[1]} (${pct(x[1])}%)</span></div>`).join('');
                const nemEntries = Object.entries(p.nemesis).filter(([,data])=>data.count>0).sort((a,b)=>b[1].l - a[1].l).slice(0,3);
                const renderNem = nemEntries.map(x=>`<div class="flex justify-between text-xs"><span class="text-red-300">${x[0]}</span><span class="font-bold text-white text-[10px] tracking-tighter">${x[1].w}-${x[1].d}-${x[1].l} (M:${x[1].count})</span></div>`).join('');
                const partnerEntries = Object.entries(p.partners).filter(([,count])=>count>0).sort((a,b)=>b[1]-a[1]).slice(0,3);
                const renderPartners = partnerEntries.map(x=>`<div class="flex justify-between text-xs"><span class="text-blue-300">${x[0]}</span><span class="font-bold text-white">${x[1]} mecz. (${p.allPartners?Math.round(x[1]/p.allPartners*100):0}%)</span></div>`).join('');
                const allRanks = [
                    {key: 'g/m', label: 'Śr. Goli', dataFunc: (p)=>avg(p.g,p.m), unit: 'Śr.'},
                    {key: 'a/m', label: 'Śr. Asyst', dataFunc: (p)=>avg(p.a,p.m), unit: 'Śr.'},
                    {key: 'dg/m', label: 'Gole z Dystansu', dataFunc: (p)=>avg(p.dg,p.m), unit: 'Śr.'},
                    {key: 'bg/m', label: 'Gole z Pola', dataFunc: (p)=>avg(p.bg,p.m), unit: 'Śr.'},
                    {key: 'pg/m', label: 'Gole z Karnych', dataFunc: (p)=>avg(p.pg,p.m), unit: 'Śr.'},
                    {key: 'fg/m', label: 'Gole z Wolnych', dataFunc: (p)=>avg(p.fg,p.m), unit: 'Śr.'},
                ];
                const mainRankings = [
                    {key: 'pts', label: 'Ranking MVP', value: `${p.pts} <span class="text-xs text-gray-400">(Śr. ${avg(p.pts, p.m)})</span>`, statKey: 'pts', unit: ''},
                    {key: 'w%', label: 'Skuteczność %', value: pct(p.w), statKey: 'w%', unit: '%'},
                    {key: 'g/m', label: 'Gole/Mecz', value: avg(p.g, p.m), statKey: 'g/m', unit: 'Śr.'},
                ];

                const renderMatchInfo = (m, type) => {
                    if(!m || m.diff === -99 || m.diff === 99) return '<span class="text-gray-500 italic">Brak danych</span>';
                    const color = type === 'win' ? 'text-green-400' : 'text-red-400';
                    return `
                        <div class="text-[10px] text-gray-300 mb-1">${m.date.split(',')[0]}</div>
                        <div class="font-bold ${color}">${m.myTeam} <span class="text-white">${m.myScore}:${m.oppScore}</span> ${m.oppTeam}</div>
                        <div class="text-[9px] text-gray-400 mt-0.5 tracking-tighter">${m.myPlayers.join(' & ')} vs ${m.oppPlayers.join(' & ')}</div>
                    `;
                };

                // Build mini sparkline (goals vs assists), heatmap and form bar
                const getTs = (m) => {
                    if (typeof m.id === 'number') return m.id;
                    if (m.date && m.date.split) { const d = Date.parse(m.date.split(',')[0]); if (!isNaN(d)) return d; }
                    return Date.now();
                };
                const ms = this.getMatchesFiltered();
                const myMatches = ms.filter(m => (m.team1?.players||[]).includes(n) || (m.team2?.players||[]).includes(n)).sort((a,b)=>getTs(a)-getTs(b));
                const last5 = myMatches.slice(-5);
                const last10 = myMatches.slice(-10);
                const perMatchStats = (m) => {
                    const me = (m.team1?.players||[]).includes(n) ? m.team1 : m.team2;
                    const opp = me === m.team1 ? m.team2 : m.team1;
                    const goals = (me.goals||[]).filter(g=>g.scorer===n).length;
                    const assists = (me.goals||[]).filter(g=>g.assist===n).length;
                    const res = me.score>opp.score ? 'W' : (me.score===opp.score ? 'D' : 'L');
                    return { goals, assists, res };
                };
                const goalsSeries = last5.map(m => perMatchStats(m).goals);
                const assistsSeries = last5.map(m => perMatchStats(m).assists);
                const formSeries = last10.map(m => perMatchStats(m).res);
                const buildSparkline = (g,a) => {
                    const w=140,h=28,pad=2; const len=Math.max(g.length, a.length, 1); const max=Math.max(1, ...g, ...a);
                    const xStep = (w - pad*2) / Math.max(1, len-1);
                    const yMap = v => h - pad - (v/max)*(h-pad*2);
                    const xMap = i => pad + i*xStep;
                    const toPts = (arr) => (arr.length ? arr : new Array(len).fill(0)).map((v,i)=>`${xMap(i)},${yMap(v)}`).join(' ');
                    const gPts = toPts(g);
                    const aPts = toPts(a);
                    return `<svg viewBox=\"0 0 ${w} ${h}\" width=\"100%\" height=\"28\" xmlns=\"http://www.w3.org/2000/svg\">\n                        <polyline points=\"${gPts}\" fill=\"none\" stroke=\"#60A5FA\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n                        <polyline points=\"${aPts}\" fill=\"none\" stroke=\"#F59E0B\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n                    </svg>`;
                };
                const sparklineHtml = (last5.length ? buildSparkline(goalsSeries, assistsSeries) : '<div class="text-[10px] text-gray-500">Brak ostatnich meczów.</div>');
                const heatTotals = [p.bg||0, p.dg||0, p.pg||0, p.fg||0];
                const heatSum = heatTotals.reduce((s,v)=>s+v,0);
                const heatSegment = (wPct, cls) => `<div class=\"${cls}\" style=\"width:${wPct}%;\"></div>`;
                                const heatmapBar = heatSum>0
                                        ? heatSegment(Math.round(heatTotals[0]/heatSum*100), 'heat-blue')
                                            + heatSegment(Math.round(heatTotals[1]/heatSum*100), 'heat-violet')
                                            + heatSegment(Math.round(heatTotals[2]/heatSum*100), 'heat-crimson')
                                            + heatSegment(Math.round(heatTotals[3]/heatSum*100), 'heat-amber')
                                        : '<div class="w-full h-full bg-gray-700"></div>';
                const formBox = (r) => {
                    const cls = r==='W' ? 'bg-green-500' : (r==='D' ? 'bg-gray-500' : 'bg-red-500');
                    return `<div class=\"w-2 h-2 md:w-3 md:h-3 rounded ${cls}\"></div>`;
                };
                const formBarHtml = formSeries.length ? formSeries.map(formBox).join('') : '<div class="text-[10px] text-gray-500">Brak meczów.</div>';

                document.getElementById('player-profile-content').innerHTML=`
                    <div class="flex flex-col items-center mb-6">
                        <div class="relative w-28 h-28 mb-3 group">${photoHtml}</div>
                        <h2 class="profile-title">${p.name}</h2>
                        <div class="tagline-pill">${tagline}</div>
                        <div class="mt-3 flex gap-2">
                            <button class="compare-btn" onclick="Sound.click(); window.Stats.openCompare();">Porównaj</button>
                        </div>
                    </div>


                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-center">
                        <div class="stat-card"><div class="stat-val text-white">${p.m}</div><div class="stat-label">Mecze</div></div>
                        <div class="stat-card"><div class="stat-val text-green-400">${p.w}</div><div class="stat-label">Wygrane (${pct(p.w)}%)</div></div>
                        <div class="stat-card"><div class="stat-val text-gray-400">${p.d}</div><div class="stat-label">Remisy (${pct(p.d)}%)</div></div>
                        <div class="stat-card"><div class="stat-val text-red-400">${p.l}</div><div class="stat-label">Porażki (${pct(p.l)}%)</div></div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div class="stat-card main-stat-card text-center">
                            <div class="stat-label text-yellow-200 font-bold mb-1">Ranking MVP</div>
                            <div class="main-stat-val text-yellow-400">#${this.getRank(p.name, 'pts')}</div>
                            <div class="text-sm font-bold text-white">${p.pts} <span class="text-xs text-gray-400">(Śr. ${avg(p.pts, p.m)})</span></div>
                        </div>
                        <div class="stat-card main-stat-card text-center">
                            <div class="stat-label text-yellow-200 font-bold mb-1">Skuteczność</div>
                            <div class="main-stat-val text-yellow-400">#${this.getRank(p.name, 'w%')}</div>
                            <div class="text-sm font-bold text-white">${pct(p.w)}%</div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div class="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                            <div class="text-[11px] text-gray-400 font-bold mb-2 border-b border-gray-700 pb-1">Gole i Asysty</div>
                            <div class="grid grid-cols-2 gap-2">
                                <div class="compare-card grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                    <div class="value text-blue-300 text-left">${avg(p.g, p.m)}</div>
                                    <div class="label text-center">Gole (Śr./mecz)</div>
                                    <div class="value text-white text-right">${p.g}</div>
                                </div>
                                <div class="compare-card grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                    <div class="value text-yellow-300 text-left">${avg(p.a, p.m)}</div>
                                    <div class="label text-center">Asysty (Śr./mecz)</div>
                                    <div class="value text-white text-right">${p.a}</div>
                                </div>
                            </div>
                            <div class="text-[11px] text-gray-400 font-bold pt-2 border-t border-gray-800 mt-2">Heatmapa rodzajów goli</div>
                            <div class="flex h-2 rounded overflow-hidden border border-gray-700">${heatmapBar}</div>
                            <div class="grid grid-cols-4 gap-2 mt-1 text-[10px] text-gray-400 text-center">
                                <div><span class="inline-block w-2 h-2 rounded heat-blue align-middle"></span> Pole: <span class="font-bold text-white">${p.bg}</span></div>
                                <div><span class="inline-block w-2 h-2 rounded heat-violet align-middle"></span> Dystans: <span class="font-bold text-white">${p.dg}</span></div>
                                <div><span class="inline-block w-2 h-2 rounded heat-crimson align-middle"></span> Karne: <span class="font-bold text-white">${p.pg}</span></div>
                                <div><span class="inline-block w-2 h-2 rounded heat-amber align-middle"></span> Wolne: <span class="font-bold text-white">${p.fg}</span></div>
                            </div>
                        </div>

                        <div class="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                            <div class="text-xs uppercase text-gray-500 font-bold mb-2 border-b border-gray-700 pb-1">Pozostałe Rankingi</div>
                            <div class="space-y-1">
                                ${allRanks.map(r=>`<div class="flex justify-between text-xs text-gray-300"><span>${r.label}</span><span class="font-bold text-yellow-400">${r.dataFunc(p)} ${r.unit} / mecz #${this.getRank(p.name, r.key)}</span></div>`).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div class="bg-green-900/20 p-3 rounded-lg border border-green-500/30 text-center">
                            <div class="text-[10px] text-green-400 uppercase font-bold mb-1">Najwyższa Wygrana</div>
                            ${renderMatchInfo(p.biggestWin, 'win')}
                        </div>
                        <div class="bg-red-900/20 p-3 rounded-lg border border-red-500/30 text-center">
                            <div class="text-[10px] text-red-400 uppercase font-bold mb-1">Najwyższa Porażka</div>
                            ${renderMatchInfo(p.biggestLoss, 'loss')}
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm border-t border-gray-700 pt-4">
                        <div class="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                            <div class="text-[11px] text-gray-400 font-bold mb-2">Form bar (ostatnie 10)</div>
                            <div class="flex flex-col items-center justify-center min-h-16">
                                <div class="flex justify-center gap-1 w-full">${formBarHtml}</div>
                                <div class="flex justify-center gap-3 text-[10px] text-gray-400 mt-2"><span class="flex items-center gap-1"><span class="w-2 h-2 rounded bg-green-500"></span>Z</span><span class="flex items-center gap-1"><span class="w-2 h-2 rounded bg-gray-500"></span>R</span><span class="flex items-center gap-1"><span class="w-2 h-2 rounded bg-red-500"></span>P</span></div>
                            </div>
                        </div>
                        <div class="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                            <div class="text-xs uppercase text-gray-500 font-bold mb-2 border-b border-gray-700 pb-1">Ulubione Kluby (Top 3)</div>
                            <div class="space-y-1">${getTop3Clubs(p.clubs)||'<p class="text-xs text-gray-500">Brak danych.</p>'}</div>
                        </div>
                        <div class="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                            <div class="text-xs uppercase text-gray-500 font-bold mb-2 border-b border-gray-700 pb-1">Najlepsi Partnerzy (Top 3)</div>
                            <div class="space-y-1">${renderPartners||'<p class="text-xs text-gray-500">Brak danych.</p>'}</div>
                        </div>
                        <div class="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                             <div class="text-xs uppercase text-gray-500 font-bold mb-2 border-b border-gray-700 pb-1">Nemesis (Top 3 - Bilans W-R-P)</div>
                            <div class="space-y-1">${renderNem||'<p class="text-xs text-gray-500">Brak danych.</p>'}</div>
                        </div>
                    </div>
                `;
                document.getElementById('player-profile-modal').classList.remove('hidden');
            },
            openCompare() {
                 Sound.click(); 
                 let mode = 'players';
                const p1Select = document.getElementById('compare-p1');
                const p2Select = document.getElementById('compare-p2');
                const globalBtn = document.getElementById('run-compare-btn');
                const h2hBtn = document.getElementById('run-compare-h2h-btn');
                const getSortedPlayersByMatches = () => {
                    const stats = this.calc();
                    return (stats.p||[]).slice().sort((a,b)=> b.m - a.m).map(p=>p.name);
                };
                const getSortedDuosByMatches = () => {
                    const stats = this.calc();
                    return (stats.d||[]).slice().sort((a,b)=> b.m - a.m).map(d=>d.name);
                };
                const countCoMatchesPlayers = (a,b) => {
                    if(!a || !b) return 0;
                    const all = this.getMatchesFiltered();
                    let cnt = 0;
                    all.forEach(m => {
                        const roster = [ ...(m.team1?.players||[]), ...(m.team2?.players||[]) ];
                        if (roster.includes(a) && roster.includes(b)) cnt++;
                    });
                    return cnt;
                };
                const countCoMatchesDuos = (aName,bName) => {
                    if(!aName || !bName) return 0;
                    const [a1,a2] = aName.split('&').map(s=>s.trim());
                    const [b1,b2] = bName.split('&').map(s=>s.trim());
                    const all = this.getMatchesFiltered();
                    let cnt = 0;
                    all.forEach(m => {
                        const t1 = m.team1?.players||[]; const t2 = m.team2?.players||[];
                        const hasA = (t1.includes(a1)&&t1.includes(a2)) || (t2.includes(a1)&&t2.includes(a2));
                        const hasB = (t1.includes(b1)&&t1.includes(b2)) || (t2.includes(b1)&&t2.includes(b2));
                        if (hasA && hasB) cnt++;
                    });
                    return cnt;
                };
                const renderOptions = () => {
                    const list = mode === 'players' ? getSortedPlayersByMatches() : getSortedDuosByMatches();
                    // Preserve current selection before repopulating
                    const existing = p1Select ? p1Select.value : '';
                    // Primary select: placeholder + sorted by own matches
                    if (p1Select) {
                        p1Select.innerHTML = [`<option value="">Wybierz...</option>`, ...list.map(n => `<option value="${n}">${n}</option>`)].join('');
                        // Restore selection if still present; else keep placeholder
                        if (existing && list.includes(existing)) {
                            p1Select.value = existing;
                        } else {
                            p1Select.value = '';
                        }
                    }
                    const selected = p1Select ? p1Select.value : '';
                    // Secondary select: exclude selected and sort by co-matches with/against the selected if any
                    let second = list.filter(n => n !== selected);
                    if (selected) {
                        const sorter = mode === 'players'
                            ? (n) => countCoMatchesPlayers(selected, n)
                            : (n) => countCoMatchesDuos(selected, n);
                        second = second.map(n => ({ n, c: sorter(n) }))
                                       .sort((a,b)=> b.c - a.c)
                                       .map(x=>x.n);
                    }
                    if (p2Select) {
                        const prev2 = p2Select.value;
                        p2Select.innerHTML = [`<option value="">Wybierz...</option>`, ...second.map(n => `<option value="${n}">${n}</option>`)].join('');
                        if (prev2 && second.includes(prev2) && prev2 !== selected) {
                            p2Select.value = prev2;
                        } else {
                            p2Select.value = '';
                        }
                    }
                };
                document.getElementById('compare-mode-players').onclick = () => { Sound.click(); mode = 'players'; document.getElementById('compare-mode-players').classList.replace('text-gray-400', 'bg-blue-600'); document.getElementById('compare-mode-players').classList.add('text-white'); document.getElementById('compare-mode-players').classList.remove('hover:text-white'); document.getElementById('compare-mode-duos').classList.replace('bg-blue-600', 'text-gray-400'); document.getElementById('compare-mode-duos').classList.remove('text-white'); document.getElementById('compare-mode-duos').classList.add('hover:text-white'); renderOptions(); document.getElementById('compare-content').classList.add('hidden'); };
                document.getElementById('compare-mode-duos').onclick = () => { Sound.click(); mode = 'duos'; document.getElementById('compare-mode-duos').classList.replace('text-gray-400', 'bg-blue-600'); document.getElementById('compare-mode-duos').classList.add('text-white'); document.getElementById('compare-mode-duos').classList.remove('hover:text-white'); document.getElementById('compare-mode-players').classList.replace('bg-blue-600', 'text-gray-400'); document.getElementById('compare-mode-players').classList.remove('text-white'); document.getElementById('compare-mode-players').classList.add('hover:text-white'); renderOptions(); document.getElementById('compare-content').classList.add('hidden'); };
                p1Select.onchange = () => { Sound.click(); renderOptions(); };
                renderOptions();
                document.getElementById('compare-content').classList.add('hidden'); 
                document.getElementById('compare-modal').classList.remove('hidden');
                const histBtn = document.getElementById('toggle-h2h-history-btn'); if (histBtn) histBtn.classList.add('hidden');
                const setCompareToggle = (active)=>{
                    if (!globalBtn || !h2hBtn) return;
                    // Reset both to inactive
                    globalBtn.classList.remove('active'); globalBtn.classList.add('inactive');
                    h2hBtn.classList.remove('active'); h2hBtn.classList.add('inactive');
                    // Apply active state for the chosen option
                    if (active === 'global') {
                        globalBtn.classList.add('active'); globalBtn.classList.remove('inactive');
                    } else if (active === 'h2h') {
                        h2hBtn.classList.add('active'); h2hBtn.classList.remove('inactive');
                    }
                };
                setCompareToggle(null);
                document.getElementById('run-compare-btn').onclick=()=>{
                    const n1=p1Select.value; const n2=p2Select.value;
                    if (!n1 || !n2) { DataManager.showToast("Wybierz dwóch oponentów!", 'error'); return; }
                    const sourceData = mode === 'players' ? this.calc().p.filter(p=>p.m>0) : this.calc().d.filter(d=>d.m>0);
                    const d1 = sourceData.find(x => x.name === n1); const d2 = sourceData.find(x => x.name === n2);
                    if(!d1 || !d2) { DataManager.showToast("Brak danych!", 'error'); return; }
                    if(d1 && d2) {
                        const r = (l, v1, v2, format=v=>v, inverted=false) => {
                            let c1 = 'text-white', c2 = 'text-white';
                            let o1 = '', o2 = '';
                            let arrowLeft = '', arrowRight = '';
                            if(v1 !== v2) {
                                const betterLeft = inverted ? v1 < v2 : v1 > v2;
                                c1 = betterLeft ? 'text-green-400' : 'text-red-400';
                                c2 = betterLeft ? 'text-red-400' : 'text-green-400';
                                o1 = betterLeft ? '' : ' opacity-70';
                                o2 = betterLeft ? ' opacity-70' : '';
                                arrowLeft = betterLeft ? ' <span class="ml-1 font-black text-green-400">▲</span>' : '';
                                arrowRight = (!betterLeft) ? ' <span class="ml-1 font-black text-green-400">▲</span>' : '';
                            }
                            return `<div class="value ${c1}${o1} text-base text-left">${format(v1)}${arrowLeft}</div><div class="label text-center">${l}</div><div class="value ${c2}${o2} text-base text-right">${format(v2)}${arrowRight}</div>`;
                        };
                        const card = (l, v1, v2, format=v=>v, inverted=false) => `<div class="compare-card grid grid-cols-[1fr_auto_1fr] items-center gap-2">${r(l, v1, v2, format, inverted)}</div>`;
                        const formatAvg = v => (v||0).toFixed(2);
                        const formatPct = v => `${v}%`;
                        let left = '';
                        let right = '';
                        // LEFT COLUMN: non-goal stats (requested order)
                        left += card('MVP PKT (Średnia)', d1.pts/d1.m, d2.pts/d2.m, formatAvg);
                        left += card('Wygrane (Suma)', d1.w, d2.w);
                        left += card('Skuteczność %', d1.m?Math.round(d1.w/d1.m*100):0, d2.m?Math.round(d2.w/d2.m*100):0, formatPct);
                        left += card('Porażki (Suma)', d1.l, d2.l, v=>v, true);
                        left += card('Asysty (Średnia)', d1.a/d1.m, d2.a/d2.m, formatAvg);
                        // RIGHT COLUMN: goal-related stats (swap box vs distance)
                        right += card('Gole (Średnia)', d1.g/d1.m, d2.g/d2.m, formatAvg);
                        right += card('Gole z Pola (Śr.)', d1.bg/d1.m, d2.bg/d2.m, formatAvg);
                        right += card('Gole z Dystansu (Śr.)', d1.dg/d1.m, d2.dg/d2.m, formatAvg);
                        right += card('Rzuty Karne (Śr.)', d1.pg/d1.m, d2.pg/d2.m, formatAvg);
                        right += card('Rzuty Wolne (Śr.)', d1.fg/d1.m, d2.fg/d2.m, formatAvg);
                        document.getElementById('compare-content').innerHTML = `<div class="grid gap-3">${left}</div><div class="grid gap-3">${right}</div>`;
                        document.getElementById('compare-content').classList.remove('hidden');
                        // Clear H2H blocks in global compare
                        const h2hEl = document.getElementById('compare-h2h'); if (h2hEl) { h2hEl.classList.add('hidden'); h2hEl.innerHTML=''; }
                        const histEl = document.getElementById('compare-h2h-history'); if (histEl) { histEl.classList.add('hidden'); histEl.innerHTML=''; }
                        const histBtn = document.getElementById('toggle-h2h-history-btn'); if (histBtn) histBtn.classList.add('hidden');
                        setCompareToggle('global');
                    }
                };
                // --- Porównaj H2H (statystyki liczone tylko z meczów bezpośrednich) ---
                const runH2HBtn = document.getElementById('run-compare-h2h-btn');
                if (runH2HBtn) runH2HBtn.onclick = ()=>{
                    const n1=p1Select.value; const n2=p2Select.value;
                    if (!n1 || !n2) { DataManager.showToast('Wybierz dwóch oponentów!', 'error'); return; }
                    const all = this.getMatchesFiltered();
                    const h2hList = [];
                    if (mode === 'players') {
                        all.forEach(m => {
                            const a1 = m.team1.players.includes(n1) && m.team2.players.includes(n2);
                            const a2 = m.team1.players.includes(n2) && m.team2.players.includes(n1);
                            if (a1 || a2) h2hList.push(m);
                        });
                    } else {
                        const [a1, b1] = n1.split('&').map(s=>s.trim());
                        const [a2, b2] = n2.split('&').map(s=>s.trim());
                        all.forEach(m => {
                            const t1HasD1 = m.team1.players.includes(a1) && m.team1.players.includes(b1);
                            const t2HasD1 = m.team2.players.includes(a1) && m.team2.players.includes(b1);
                            const t1HasD2 = m.team1.players.includes(a2) && m.team1.players.includes(b2);
                            const t2HasD2 = m.team2.players.includes(a2) && m.team2.players.includes(b2);
                            if ((t1HasD1 && t2HasD2) || (t2HasD1 && t1HasD2)) h2hList.push(m);
                        });
                    }
                    if (h2hList.length === 0) { DataManager.showToast('Brak bezpośrednich meczów w wybranym zakresie.', 'error'); return; }
                    // Re-render compare using only H2H matches
                    const sourceData = mode === 'players' ? this.calc(h2hList).p.filter(p=>p.m>0) : this.calc(h2hList).d.filter(d=>d.m>0);
                    const d1 = sourceData.find(x => x.name === n1); const d2 = sourceData.find(x => x.name === n2);
                    if(!d1 || !d2) { DataManager.showToast('Brak danych H2H!', 'error'); return; }
                    const r = (l, v1, v2, format=v=>v, inverted=false) => {
                        let c1 = 'text-white', c2 = 'text-white';
                        let o1 = '', o2 = '';
                        let arrowLeft = '', arrowRight = '';
                        if(v1 !== v2) {
                            const betterLeft = inverted ? v1 < v2 : v1 > v2;
                            c1 = betterLeft ? 'text-green-400' : 'text-red-400';
                            c2 = betterLeft ? 'text-red-400' : 'text-green-400';
                            o1 = betterLeft ? '' : ' opacity-70';
                            o2 = betterLeft ? ' opacity-70' : '';
                            arrowLeft = betterLeft ? ' <span class="ml-1 font-black text-green-400">▲</span>' : '';
                            arrowRight = (!betterLeft) ? ' <span class="ml-1 font-black text-green-400">▲</span>' : '';
                        }
                        return `<div class="value ${c1}${o1} text-base text-left">${format(v1)}${arrowLeft}</div><div class="label text-center">${l} (H2H)</div><div class="value ${c2}${o2} text-base text-right">${format(v2)}${arrowRight}</div>`;
                    };
                    const card = (l, v1, v2, format=v=>v, inverted=false) => `<div class="compare-card grid grid-cols-[1fr_auto_1fr] items-center gap-2">${r(l, v1, v2, format, inverted)}</div>`;
                    const formatAvg = v => (v||0).toFixed(2);
                    const formatPct = v => `${v}%`;
                    let left = '';
                    let right = '';
                    left += card('MVP PKT (Średnia)', d1.pts/d1.m, d2.pts/d2.m, formatAvg);
                    left += card('Wygrane (Suma)', d1.w, d2.w);
                    left += card('Skuteczność %', d1.m?Math.round(d1.w/d1.m*100):0, d2.m?Math.round(d2.w/d2.m*100):0, formatPct);
                    left += card('Porażki (Suma)', d1.l, d2.l, v=>v, true);
                    left += card('Asysty (Średnia)', d1.a/d1.m, d2.a/d2.m, formatAvg);
                    right += card('Gole (Średnia)', d1.g/d1.m, d2.g/d2.m, formatAvg);
                    right += card('Gole z Pola (Śr.)', d1.bg/d1.m, d2.bg/d2.m, formatAvg);
                    right += card('Gole z Dystansu (Śr.)', d1.dg/d1.m, d2.dg/d2.m, formatAvg);
                    right += card('Rzuty Karne (Śr.)', d1.pg/d1.m, d2.pg/d2.m, formatAvg);
                    right += card('Rzuty Wolne (Śr.)', d1.fg/d1.m, d2.fg/d2.m, formatAvg);
                    const contentEl = document.getElementById('compare-content');
                    if (contentEl) { contentEl.innerHTML = `<div class="grid gap-3">${left}</div><div class="grid gap-3">${right}</div>`; contentEl.classList.remove('hidden'); }
                    // Summary: W-D-L, WR, goals team totals and personal goals for both sides
                    let w=0,d=0,l=0, gf=0, ga=0, pg1=0, pg2=0, pa1=0, pa2=0; const hist=[];
                    h2hList.forEach(m => {
                        let me, opp;
                        let personal1 = 0, personal2 = 0;
                        if (mode === 'players') {
                            const meT1 = m.team1.players.includes(n1);
                            me = meT1 ? m.team1 : m.team2;
                            opp = meT1 ? m.team2 : m.team1;
                            personal1 = (me.goals||[]).filter(g=>g.scorer===n1).length;
                            personal2 = (opp.goals||[]).filter(g=>g.scorer===n2).length;
                            pg1 += personal1; pg2 += personal2;
                            // Assists totals for each player across H2H
                            pa1 += (me.goals||[]).filter(g=>g.assist===n1).length;
                            pa2 += (opp.goals||[]).filter(g=>g.assist===n2).length;
                        } else {
                            const [aa,bb] = n1.split('&').map(s=>s.trim());
                            const [cc,dd] = n2.split('&').map(s=>s.trim());
                            const meT1 = m.team1.players.includes(aa) && m.team1.players.includes(bb);
                            me = meT1 ? m.team1 : m.team2;
                            opp = meT1 ? m.team2 : m.team1;
                            personal1 = (me.goals||[]).filter(g=>g.scorer===aa || g.scorer===bb).length;
                            personal2 = (opp.goals||[]).filter(g=>g.scorer===cc || g.scorer===dd).length;
                            pg1 += personal1; pg2 += personal2;
                            // Assists totals for each duo across H2H
                            pa1 += (me.goals||[]).filter(g=>g.assist===aa || g.assist===bb).length;
                            pa2 += (opp.goals||[]).filter(g=>g.assist===cc || g.assist===dd).length;
                        }
                        gf += me.score||0; ga += opp.score||0;
                        if (me.score>opp.score) w++; else if (me.score===opp.score) d++; else l++;
                        const dateTxt = (m.date && m.date.split) ? m.date.split(',')[0] : new Date(m.id).toLocaleDateString('pl-PL');
                        const meSquad = (me.players||[]).join(', ');
                        const oppSquad = (opp.players||[]).join(', ');
                        const goalsLine = `<span class=\"text-blue-300\">Gole ${n1}:</span> <span class=\"font-bold text-white\">${personal1}</span> <span class=\"text-gray-500\">•</span> <span class=\"text-red-300\">Gole ${n2}:</span> <span class=\"font-bold text-white\">${personal2}</span>`;
                        hist.push(`<div class=\"rounded-lg border border-gray-700 bg-gray-800/60 p-2 text-center\">`
                            + `<div class=\"text-[10px] text-gray-400\">${dateTxt}</div>`
                            + `<div class=\"text-sm font-extrabold text-white my-1\">${me.score}:${opp.score}</div>`
                            + `<div class=\"text-[11px] text-gray-300 mb-1\">${goalsLine}</div>`
                            + `<div class=\"text-[10px] text-gray-400\"><span class=\"text-blue-300\">Skład:</span> ${meSquad}</div>`
                            + `<div class=\"text-[10px] text-gray-400\"><span class=\"text-red-300\">Skład:</span> ${oppSquad}</div>`
                            + `</div>`);
                    });
                    
                                        const total = w + d + l;
                                        const wP = total ? Math.round((w / total) * 100) : 0;
                                        const dP = total ? Math.round((d / total) * 100) : 0;
                                        const lP = total ? Math.round((l / total) * 100) : 0;
                                        const h2hEl = document.getElementById('compare-h2h');
                                        if (h2hEl) {
                                                const pctMore = (hi, lo) => {
                                                        if (hi === lo) return '';
                                                        if (lo > 0) return ` <span class="ml-1 text-green-400 font-bold">+${Math.round(((hi - lo) / lo) * 100)}% więcej</span>`;
                                                        if (hi > 0) return ` <span class="ml-1 text-green-400 font-bold">+∞% więcej</span>`;
                                                        return '';
                                                };
                                                const goalsLine1 = `<div class="text-xs text-gray-300">Gole ${n1} (łącznie): <span class="font-bold text-white">${pg1}</span>${pg1 >= pg2 ? pctMore(pg1, pg2) : ''}</div>`;
                                                const goalsLine2 = `<div class="text-xs text-gray-300">Gole ${n2} (łącznie): <span class="font-bold text-white">${pg2}</span>${pg2 > pg1 ? pctMore(pg2, pg1) : ''}</div>`;
                                                const assistsLine1 = mode === 'players'
                                                    ? `<div class="text-xs text-gray-300">Asysty ${n1} (łącznie): <span class="font-bold text-white">${pa1}</span>${pa1 >= pa2 ? pctMore(pa1, pa2) : ''}</div>`
                                                    : `<div class="text-xs text-gray-300">Asysty duetu ${n1} (łącznie): <span class="font-bold text-white">${pa1}</span>${pa1 >= pa2 ? pctMore(pa1, pa2) : ''}</div>`;
                                                const assistsLine2 = mode === 'players'
                                                    ? `<div class="text-xs text-gray-300">Asysty ${n2} (łącznie): <span class="font-bold text-white">${pa2}</span>${pa2 > pa1 ? pctMore(pa2, pa1) : ''}</div>`
                                                    : `<div class="text-xs text-gray-300">Asysty duetu ${n2} (łącznie): <span class="font-bold text-white">${pa2}</span>${pa2 > pa1 ? pctMore(pa2, pa1) : ''}</div>`;
                                                h2hEl.innerHTML = `<div class="bg-gray-800/50 rounded-xl border border-gray-700 p-4">`
                                                    + `<div class="flex items-center justify-between mb-2">`
                                                    + `<div class="text-xs uppercase text-gray-400 font-bold tracking-widest">H2H (bezpośrednie mecze)</div>`
                                                    + `<div class="text-sm font-black text-white">${w}-${d}-${l} <span class="text-gray-400 font-bold ml-1">${wP}% • ${dP}% • ${lP}%</span></div>`
                                                    + `</div>`
                                                    + goalsLine1
                                                    + goalsLine2
                                                    + assistsLine1
                                                    + assistsLine2
                                                    + `</div>`;
                                                                                                h2hEl.classList.remove('hidden');
                                        }
                    
                    const histEl = document.getElementById('compare-h2h-history');
                    if (histEl) { histEl.innerHTML = hist.reverse().join(''); histEl.classList.add('hidden'); }
                    const histBtn = document.getElementById('toggle-h2h-history-btn'); if (histBtn) histBtn.classList.remove('hidden');
                    setCompareToggle('h2h');
                };
                const toggleHistBtn = document.getElementById('toggle-h2h-history-btn');
                if (toggleHistBtn) toggleHistBtn.onclick = ()=>{
                    const hist = document.getElementById('compare-h2h-history');
                    const sum = document.getElementById('compare-h2h');
                    if (!hist || !sum) return;
                    const willShow = hist.classList.contains('hidden');
                    hist.classList.toggle('hidden');
                    sum.classList.toggle('hidden');
                    if (willShow) sum.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                };
            }
        };

        const ManualSelect = {
            targetSlot: null,
            init() {
            },
            open(isIngame, slot) {
                 Sound.click();
                 this.targetSlot = slot;
                 document.getElementById('manual-select-modal').classList.remove('hidden');
                  const leagues = ['All', 'Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Rest of World', 'National'];
                  const container = document.getElementById('manual-league-list');
                  const labels = { 'All': 'Wszystkie', 'Rest of World': 'Reszta Świata', 'National': 'Reprezentacje' };
                 container.innerHTML = leagues.map(l => `<button class="px-3 py-1 bg-gray-700 rounded text-xs hover:bg-indigo-600 transition" onclick="window.ManualSelect.renderGrid('${l}', ${isIngame})">${labels[l] || l}</button>`).join('');
                 this.renderGrid('All', isIngame);
            },
            renderGrid(league, isIngame) {
                const p = window.PlayerManager.getFilteredPool(false).filter(t => {
                    if (league === 'All') return true;
                    if (league === 'Clubs') return t.league !== 'National';
                    return t.league === league;
                });
                const grid = document.getElementById('manual-team-grid');
                grid.innerHTML = p.map(t => {
                    const burnt = AppState.usedTeams.includes(t.name);
                    const flagOrImg = t.flag ? `<div class="text-xl mb-1">${t.flag}</div>` : `<img src="${getTeamLogoUrl(t)}" class="w-8 h-8 mx-auto mb-1 object-contain" onerror="handleImgError(this)" data-team="${encodeTeamDataAttr(t)}">`;
                    return `
                    <div class="bg-gray-700 p-2 rounded cursor-pointer hover:bg-gray-600 border ${burnt ? 'border-white/10 opacity-60' : 'border-gray-600'} relative overflow-hidden" onclick="window.ManualSelect.select('${t.name}', ${isIngame})">
                        ${flagOrImg}
                        <div class="text-[10px] font-bold truncate">${t.name}</div>
                        <div class="text-[9px] text-yellow-400 font-bold">${t.stars}★</div>
                        ${burnt ? '<div class="mt-1"><span class="burnt-pill">UŻYTA</span></div>' : ''}
                    </div>`;
                }).join('');
            },
            select(name, isIngame) {
                Sound.click();
                const team = window.Catalog.teams.find(t => t.name === name);
                if (AppState.usedTeams.includes(name)) { DataManager.showToast("Ta drużyna była już użyta!", 'error'); return; }
                
                document.getElementById('manual-select-modal').classList.add('hidden');
                
                if (isIngame) {
                    if (this.targetSlot === 1) AppState.finalTeam1 = team;
                    else AppState.finalTeam2 = team;
                    
                    window.PlayerManager.renderCard(`team${this.targetSlot}-panel`, team);
                    window.PlayerManager.checkBurnt(this.targetSlot, team);
                    
                    if(AppState.finalTeam1 && AppState.finalTeam2) {
                        document.getElementById('draw-teams-btn').classList.add('hidden');
                        document.getElementById('team1-actions').classList.remove('hidden');
                        document.getElementById('team2-actions').classList.remove('hidden');
                        
                        window.PlayerManager.bindActionButtons();
                    }
                    DataManager.showToast(`Wybrano: ${team.name}`);
                }
            }
        }

        window.DataManager = DataManager;
        window.Settings = Settings;
        window.MatchRecorder = MatchRecorder;
        window.PlayerManager = PlayerManager;
        window.PostMatchMenu = PostMatchMenu;
        window.Stats = Stats;
        window.ManualSelect = ManualSelect;
        window.MatchEditor = MatchEditor;
        window.AvatarEditor = AvatarEditor;

        PlayerManager.checkBurnt = function(n,t){
            const b=document.getElementById(`keep-btn-${n}`); 
            const burnt=AppState.usedTeams.includes(t.name);
            if(burnt){
                b.disabled=true;
                b.classList.add('opacity-50','cursor-not-allowed','bg-gray-600');
                b.classList.remove('bg-green-600');
                b.innerText="UŻYTA";
            } else {
                b.disabled=false;
                b.classList.remove('opacity-50','cursor-not-allowed','bg-gray-600');
                b.classList.add('bg-green-600');
                b.innerText="BIORĘ";
            }
        };

        PlayerManager.updateRerollButtonState = function(n) {
            const btn = document.getElementById(`reroll-btn-${n}`);
            if (!btn) return;
            const k = `p${n}`;
            const remaining = AppState.rerolls && typeof AppState.rerolls[k] === 'number' ? AppState.rerolls[k] : 0;
            const currentTeam = n === 1 ? AppState.finalTeam1 : AppState.finalTeam2;
            const isFreeReroll = currentTeam && AppState.usedTeams && AppState.usedTeams.includes(currentTeam.name);
            const enabled = isFreeReroll || remaining > 0;

            btn.disabled = !enabled;
            btn.classList.toggle('opacity-50', !enabled);
            btn.classList.toggle('cursor-not-allowed', !enabled);
        };
        
        PlayerManager.getFilteredPool = function(drawing=false){ 
            const all=window.Catalog.teams; 
            let p=all.filter(t=>t.stars>=AppState.minStars&&t.stars<=AppState.maxStars); 
            if(AppState.selectedLeague!=='All') {
                if(AppState.selectedLeague==='All_NoRow') {
                    p=p.filter(t=>t.league!=='Rest of World');
                } else {
                    p=p.filter(t=>t.league===AppState.selectedLeague||(AppState.selectedLeague==='Clubs'&&t.league!=='National')); 
                }
            }
            return p; 
        };
        
        PlayerManager.handleReroll = async function(n){
            const btn = document.getElementById(`reroll-btn-${n}`);
            if(btn) {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            }
            
            const otherN = n === 1 ? 2 : 1;
            const otherRerollBtn = document.getElementById(`reroll-btn-${otherN}`);
            const otherKeepBtn = document.getElementById(`keep-btn-${otherN}`);
            if(otherRerollBtn) otherRerollBtn.disabled = true;
            if(otherKeepBtn) otherKeepBtn.disabled = true;

            const panelsGrid = document.getElementById('panels-grid');
            const rerollClass = n === 1 ? 'reroll-team-1' : 'reroll-team-2';

            try {
                Sound.click(); 
                const k = `p${n}`; 
                
                const currentTeam = n === 1 ? AppState.finalTeam1 : AppState.finalTeam2;
                const isFreeReroll = currentTeam && AppState.usedTeams.includes(currentTeam.name);

                if(!isFreeReroll && AppState.rerolls[k] <= 0) {
                    // no rerolls left: keep button disabled/greyed
                    window.PlayerManager.updateRerollButtonState(n);
                    return;
                }

                AppState.rerolls[k]--; 
                document.getElementById(`rerolls-left-${n}`).innerText = AppState.rerolls[k];
                window.PlayerManager.updateRerollButtonState(n);
                
                const ex = [AppState.finalTeam1.name, AppState.finalTeam2.name]; 
                const p = window.PlayerManager.getFilteredPool(true).filter(t => !ex.includes(t.name));
                if(p.length === 0){ DataManager.showToast("Brak drużyn do losowania!", 'error'); return; }
                const pid = `team${n}-panel`; 
                
                const ft = p[Math.floor(Math.random() * p.length)];

                if (panelsGrid) {
                    panelsGrid.classList.add('is-rerolling', rerollClass);
                }

                await new Promise(r => setTimeout(r, 520)); 

                const resultTeam = await runRouletteGlobal(pid, ft, p);

                if (panelsGrid) {
                    panelsGrid.classList.remove('is-rerolling', rerollClass);
                }

                if(!resultTeam) return;

                if(AppState.usedTeams.includes(resultTeam.name)) {
                    AppState.rerolls[k]++;
                    document.getElementById(`rerolls-left-${n}`).innerText = AppState.rerolls[k];
                    DataManager.showToast("Drużyna spalona! Zwrot losu.");
                }
                window.PlayerManager.updateRerollButtonState(n);
                
                if(n === 1) AppState.finalTeam1 = ft; else AppState.finalTeam2 = ft;
                window.PlayerManager.checkBurnt(n, ft);
                window.PlayerManager.updateRerollButtonState(n);
                Sound.drawWin();
            } finally {
                if (panelsGrid) {
                    panelsGrid.classList.remove('is-rerolling', 'reroll-team-1', 'reroll-team-2');
                }
                // restore correct enabled/disabled state (depends on remaining rerolls)
                window.PlayerManager.updateRerollButtonState(n);
                window.PlayerManager.updateRerollButtonState(otherN);
                if(otherKeepBtn) {
                     const otherTeamObj = n === 1 ? AppState.finalTeam2 : AppState.finalTeam1;
                     const isBurnt = AppState.usedTeams.includes(otherTeamObj.name);
                     otherKeepBtn.disabled = isBurnt;
                }
            }
        };

        PlayerManager.renderCard = function(id,t){
            const el=document.getElementById(id); 
            el.classList.remove('overflow-hidden');
            // Ensure we don't keep a fixed height from roulette mode (can cause “shrunk” cards).
            el.style.height = '';
            el.style.minHeight = '';
            el.className = 'team-card-dynamic rounded-3xl p-4 relative transition-all duration-500 flex flex-grow flex-col items-center justify-center h-full';            
            const b=AppState.usedTeams.includes(t.name); 
            if(b)el.classList.add('team-card-burnt'); else el.classList.remove('team-card-burnt');
            // Club colors drive the card background via CSS variables (for glass layers).
            const pCol = (t && t.colors && t.colors.p) ? t.colors.p : '#1f2937';
            const sCol = (t && t.colors && t.colors.s) ? t.colors.s : '#374151';
            el.style.setProperty('--club-p', pCol);
            el.style.setProperty('--club-s', sCol);
            // Clear any old inline backgrounds from previous versions so CSS can take over.
            el.style.background = '';
            el.style.backgroundImage = '';
            
            const l=getTeamLogoUrl(t); 
            const crestInner = t.flag
                ? `<div class="vs-crest-flag">${t.flag}</div>`
                : `<img src="${l}" decoding="async" data-team="${encodeTeamDataAttr(t)}" onerror="handleImgError(this)">`;
            const img = `<div class="team-card-crest">${crestInner}</div>`;
            const ov=b?`<div class="burnt-overlay"><div class="burnt-badge">UŻYTA</div></div>`:'';
            
            // --- NEW: TEAM FACT BADGE (nad herbem, wyśrodkowana) ---
            let badgeHtml = '';
            if (!b) {
                const isTeam1 = id === 'team1-panel';
                const players = isTeam1 ? AppState.playersTeam1 : AppState.playersTeam2;
                const factObj = this.generateTeamFact(t, players);
                const badgeClass = 'badge-center';
                const toneClass = `badge-${factObj.tone || 'neutral'}`;
                badgeHtml = `<div class="team-fact-badge ${badgeClass} ${toneClass}"><div class="badge-title">${factObj.title}</div><div class="badge-subtext">${factObj.desc}</div></div>`;
            }
            // -----------------------------
            // Club name: keep a consistent font size; allow wrapping to two lines.
            const nameSizeClass = 'text-2xl md:text-3xl';

            const starSvg = (fill) => {
                // fill can be a color string or a `url(#id)`
                return `<svg class="team-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="${fill}" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
            };
            const renderStarsSvg = (stars, uidBase) => {
                const full = Math.floor(Number(stars) || 0);
                const hasHalf = ((Number(stars) || 0) % 1) >= 0.5;
                const uid = `${uidBase}-${Math.random().toString(36).slice(2, 8)}`;
                const gradId = `half-${uid}`;

                const fullFill = 'rgba(253, 230, 138, 0.98)';
                const emptyFill = 'rgba(255,255,255,0.22)';

                const defs = hasHalf ? `
                    <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
                        <defs>
                            <linearGradient id="${gradId}" x1="0" x2="1" y1="0" y2="0">
                                <stop offset="0" stop-color="rgba(253, 230, 138, 0.98)" />
                                <stop offset="0.52" stop-color="rgba(253, 230, 138, 0.98)" />
                                <stop offset="0.52" stop-color="rgba(255,255,255,0.18)" />
                                <stop offset="1" stop-color="rgba(255,255,255,0.18)" />
                            </linearGradient>
                        </defs>
                    </svg>
                ` : '';

                let out = defs;
                for (let i = 0; i < 5; i++) {
                    if (i < full) out += starSvg(fullFill);
                    else if (i === full && hasHalf) out += starSvg(`url(#${gradId})`);
                    else out += `<span class="team-star--empty">${starSvg(emptyFill)}</span>`;
                }
                return out;
            };

            el.innerHTML=`${ov}<div class="team-info-content animate-pop"><div class="team-card-layout"><div class="team-card-badge-slot">${badgeHtml}</div>${img}<div class="team-card-nameplate"><h2 class="team-card-name ${nameSizeClass} font-black text-white text-center uppercase tracking-tighter"><span class="team-card-name-text">${t.name}</span></h2></div><div class="team-card-stars" aria-label="Ocena: ${t.stars}">${renderStarsSvg(t.stars, id)}</div><div class="team-card-league">${getLeagueLogoHTML(t.league)}</div><div class="team-card-spacer"></div></div></div>`;
        };
        
        PlayerManager.showVS = async function(){
            const o=document.getElementById('vs-overlay');
            const l=document.getElementById('vs-content-left');
            const r=document.getElementById('vs-content-right');

            const renderStars = (stars) => {
                const full = Math.floor(stars);
                const half = stars % 1 ? '½' : '';
                return `${'★'.repeat(full)}${half}`;
            };

            const gl=(t)=>{
                const u=getTeamLogoUrl(t);
                const crest = t.flag
                    ? `<div class="vs-crest-flag">${t.flag}</div>`
                    : `<img src="${u}" class="vs-crest-img" data-team="${encodeTeamDataAttr(t)}" onerror="handleImgError(this)">`;
                return `
                    ${crest}
                    <div class="vs-team-name">${t.name}</div>
                    <div class="vs-stars">${renderStars(t.stars)}</div>
                `;
            };

            l.innerHTML=gl(AppState.finalTeam1);
            r.innerHTML=gl(AppState.finalTeam2);
            document.getElementById('vs-left-panel').style.setProperty('--team-color', AppState.finalTeam1.colors.p);
            document.getElementById('vs-right-panel').style.setProperty('--team-color', AppState.finalTeam2.colors.p);
            o.classList.add('active');
            Sound.clash();
            await new Promise(r=>setTimeout(r,3600));
            o.classList.remove('active');
            await new Promise(r=>setTimeout(r,600));
            document.getElementById('results-container').classList.remove('hidden');
            document.body.classList.add('has-results');
            // Temporarily allow horizontal scroll during results/analysis section
            document.documentElement.classList.add('allow-x-scroll');
            document.body.classList.add('allow-x-scroll');
            safeScrollToEl(document.getElementById('results-scroll-target'), 'smooth');
            window.PlayerManager.simulateFullMatch();
        };

        PlayerManager.simulateFullMatch = async function(){
            window.PlayerManager.renderRerollAlternatives(document.getElementById('alt-list-1'), 1); 
            window.PlayerManager.renderRerollAlternatives(document.getElementById('alt-list-2'), 2);
            
            const s1=document.getElementById('score-team-1'); 
            const s2=document.getElementById('score-team-2'); 
            const detailsEl=document.getElementById('match-details');
            const logEl=document.getElementById('match-events-log');
            
            detailsEl.innerText = "Analiza...";
            logEl.innerHTML = "";
            
            await new Promise(r => setTimeout(r, 1200)); 

            const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
            const rand = (min, max) => min + Math.random() * (max - min);

            const stats = Stats.calc();
            const matches = DataManager.getMatches();

            const playersKey = (players) => players.slice().sort().join(',');
            const team1Players = AppState.playersTeam1;
            const team2Players = AppState.playersTeam2;

            const team1Key = playersKey(team1Players);
            const team2Key = playersKey(team2Players);

            const h2h = { w: 0, d: 0, l: 0 };
            matches.forEach(m => {
                const m1 = playersKey(m.team1.players);
                const m2 = playersKey(m.team2.players);
                if (!((m1 === team1Key && m2 === team2Key) || (m1 === team2Key && m2 === team1Key))) return;
                const team1IsOrder = m1 === team1Key;
                const sTeam1 = team1IsOrder ? m.team1.score : m.team2.score;
                const sTeam2 = team1IsOrder ? m.team2.score : m.team1.score;
                if (sTeam1 > sTeam2) h2h.w++;
                else if (sTeam1 === sTeam2) h2h.d++;
                else h2h.l++;
            });
            const h2hTotal = h2h.w + h2h.d + h2h.l;
            const h2hBias = h2hTotal > 0 ? (h2h.w - h2h.l) / h2hTotal : 0;

            const getPlayer = (name) => stats.p.find(p => p.name === name) || { name, g: 0, m: 0, pts: 0, bg: 0, dg: 0, pg: 0, fg: 0 };
            const getTeam = (clubName) => stats.t.find(t => t.name === clubName) || { name: clubName, m: 0, w: 0, d: 0, l: 0, g: 0 };
            const getDuo = (players) => {
                if (players.length !== 2) return null;
                const k = players.slice().sort().join(' & ');
                return stats.d.find(d => d.name === k) || null;
            };

            const summarizeTeam = (teamPlayers, clubName, clubStars) => {
                const ps = teamPlayers.map(getPlayer);
                const pm = ps.reduce((a, p) => a + (p.m || 0), 0);
                const goalsPerMatch = ps.reduce((a, p) => a + (p.g || 0), 0) / Math.max(1, pm);
                const ptsPerMatch = ps.reduce((a, p) => a + (p.pts || 0), 0) / Math.max(1, pm);
                const duo = getDuo(teamPlayers);
                const duoPtsPerMatch = duo ? (duo.pts || 0) / Math.max(1, duo.m || 0) : 0;
                const club = getTeam(clubName);
                const clubWr = club.m ? club.w / club.m : 0;
                return { ps, goalsPerMatch, ptsPerMatch, duoPtsPerMatch, clubWr, clubStars };
            };

            const t1 = summarizeTeam(team1Players, AppState.finalTeam1.name, AppState.finalTeam1.stars);
            const t2 = summarizeTeam(team2Players, AppState.finalTeam2.name, AppState.finalTeam2.stars);

            const starDiff = t1.clubStars - t2.clubStars;
            const formDiff = (t1.goalsPerMatch - t2.goalsPerMatch);
            const clubDiff = (t1.clubWr - t2.clubWr);

            const strengthDiff = (starDiff * 0.9) + (formDiff * 0.8) + (clubDiff * 1.2) + (h2hBias * 0.9);

            const base = 4;
            const target1 = clamp(Math.round(base + strengthDiff * 1.3 + rand(-1.2, 1.2)), 0, 10);
            const target2 = clamp(Math.round(base - strengthDiff * 1.3 + rand(-1.2, 1.2)), 0, 10);

            const pickWeighted = (items, weightFn) => {
                const weights = items.map(weightFn);
                const sum = weights.reduce((a, b) => a + b, 0);
                if (!sum) return items[Math.floor(Math.random() * items.length)];
                let r = Math.random() * sum;
                for (let i = 0; i < items.length; i++) {
                    r -= weights[i];
                    if (r <= 0) return items[i];
                }
                return items[items.length - 1];
            };

            const methodPoints = (method) => {
                if (method === 'Z dystansu') return 2;
                if (method === 'Rzut Wolny') return 2;
                return 1;
            };

            const buildMethodPicker = (ps) => {
                const agg = ps.reduce((a, p) => {
                    a.bg += (p.bg || 0);
                    a.dg += (p.dg || 0);
                    a.pg += (p.pg || 0);
                    a.fg += (p.fg || 0);
                    return a;
                }, { bg: 0, dg: 0, pg: 0, fg: 0 });
                const total = agg.bg + agg.dg + agg.pg + agg.fg;
                const base = {
                    bg: 0.60,
                    dg: 0.22,
                    pg: 0.10,
                    fg: 0.08,
                };
                const w = total ? {
                    bg: (agg.bg / total) * 0.8 + base.bg * 0.2,
                    dg: (agg.dg / total) * 0.8 + base.dg * 0.2,
                    pg: (agg.pg / total) * 0.8 + base.pg * 0.2,
                    fg: (agg.fg / total) * 0.8 + base.fg * 0.2,
                } : base;
                return () => {
                    const entries = [
                        { k: 'bg', method: 'Z pola karnego' },
                        { k: 'dg', method: 'Z dystansu' },
                        { k: 'pg', method: 'Rzut Karny' },
                        { k: 'fg', method: 'Rzut Wolny' },
                    ];
                    return pickWeighted(entries, e => w[e.k]).method;
                };
            };

            const pickMethod1 = buildMethodPicker(t1.ps);
            const pickMethod2 = buildMethodPicker(t2.ps);

            const createEventsToTarget = (teamIndex, targetPoints) => {
                const ps = teamIndex === 1 ? t1.ps : t2.ps;
                const players = teamIndex === 1 ? team1Players : team2Players;
                const pickMethod = teamIndex === 1 ? pickMethod1 : pickMethod2;
                let points = 0;
                const events = [];

                const scorerPick = () => {
                    if (players.length === 1) return players[0];
                    return pickWeighted(players, (name) => {
                        const p = getPlayer(name);
                        const w = (p.g || 0) + 1;
                        return w;
                    });
                };

                while (points < targetPoints && events.length < 20) {
                    const remaining = targetPoints - points;
                    let method = pickMethod();
                    if (remaining === 1) {
                        method = 'Z pola karnego';
                    }
                    const pts = methodPoints(method);
                    if (pts > remaining) {
                        method = 'Z pola karnego';
                    }
                    const finalPts = methodPoints(method);
                    const scorer = scorerPick();
                    const minute = clamp(Math.floor(rand(3, 89)), 1, 89);
                    events.push({ minute, scorer, method, pts: finalPts });
                    points += finalPts;
                }
                return { points, events: events.sort((a, b) => a.minute - b.minute) };
            };

            const e1 = createEventsToTarget(1, target1);
            const e2 = createEventsToTarget(2, target2);

            const methodLabel = (m) => m === 'Z dystansu' ? 'Z dystansu' : (m === 'Rzut Karny' ? 'Rzut Karny' : (m === 'Rzut Wolny' ? 'Rzut Wolny' : 'Z pola karnego'));
            const combined = [
                ...e1.events.map(ev => ({ ...ev, _team: 1 })),
                ...e2.events.map(ev => ({ ...ev, _team: 2 })),
            ].sort((a, b) => a.minute - b.minute);

            const log = combined.map(ev => {
                const cl = ev._team === 1 ? 'text-blue-300' : 'text-red-300';
                // Align minutes in a fixed-width column, no emoji, show scorer and goal type only
                return `<div class="flex items-baseline gap-2"><span class="text-gray-500 tabular-nums w-8 text-right">${ev.minute}'</span><span class="${cl} font-bold">${ev.scorer}</span><span class="text-gray-400">${methodLabel(ev.method)}</span></div>`;
            });

            const score1 = e1.points;
            const score2 = e2.points;
            s1.innerText = score1;
            s2.innerText = score2;

            const team1Line = AppState.playersTeam1.join(' & ');
            const team2Line = AppState.playersTeam2.join(' & ');
            const summary = score1 > score2
                ? `WYGRANA: ${AppState.finalTeam1.name} — ${team1Line}`
                : (score2 > score1 ? `WYGRANA: ${AppState.finalTeam2.name} — ${team2Line}` : `REMIS: ${team1Line} vs ${team2Line}`);

            detailsEl.innerText = summary;
            logEl.innerHTML = log.join('');

            Sound.fanfare();
        };

        PlayerManager.renderRerollAlternatives = function(c, teamNumber){c.innerHTML=''; const maxRerolls = teamNumber === 1 ? AppState.rerollSettings : AppState.rerollSettings; let currentRerolls = teamNumber === 1 ? AppState.rerolls.p1 : AppState.rerolls.p2;const otherTeamName = teamNumber === 1 ? AppState.finalTeam2.name : AppState.finalTeam1.name;const currentDrawnTeamName = teamNumber === 1 ? AppState.finalTeam1.name : AppState.finalTeam2.name;if (currentRerolls === 0) { c.innerHTML = '<div class="text-xs text-red-400 font-bold">Brak dostępnych przelosowań.</div>'; return; }let potentialPool = window.PlayerManager.getFilteredPool(true);potentialPool = potentialPool.filter(t => t.name !== otherTeamName && t.name !== currentDrawnTeamName);if (potentialPool.length === 0) { c.innerHTML = '<div class="text-xs text-red-400 font-bold">Brak drużyn spełniających kryteria!</div>'; return; }let teamsToDisplay = [];let drawIndex = 0;let shuffledPool = shuffleInPlace([...potentialPool]);let simulatedAttempts = 0;while (simulatedAttempts < currentRerolls) {if (teamsToDisplay.length > currentRerolls * 3 || drawIndex > potentialPool.length * 5) break;let drawnTeam = shuffledPool[drawIndex % shuffledPool.length];drawIndex++;const isBurnt = AppState.usedTeams.includes(drawnTeam.name);teamsToDisplay.push({ team: drawnTeam, isBurnt: isBurnt, isReplacement: false });simulatedAttempts++; if (isBurnt) {currentRerolls++; let replacementTeam = null;let replacementAttempts = 0;while (!replacementTeam && replacementAttempts < potentialPool.length) { const nextDraw = shuffledPool[drawIndex % shuffledPool.length]; if (!AppState.usedTeams.includes(nextDraw.name)) { replacementTeam = nextDraw; } drawIndex++; replacementAttempts++;}if (replacementTeam) { teamsToDisplay.push({ team: replacementTeam, isBurnt: false, isReplacement: true }); }}}teamsToDisplay.forEach((item, i) => { const t = item.team;const u = item.isBurnt;const isRep = item.isReplacement;let cl = 'text-white'; if(t.stars>=5)cl='text-red-500 font-black'; else if(t.stars>=4.5)cl='text-yellow-400 font-bold'; else if(t.stars>=4)cl='text-green-400 font-bold';const d = document.createElement('div');d.className = `fade-in-seq text-xs md:text-sm`; d.style.animationDelay = `${i * 100}ms`;let text = `${t.name} (${t.stars.toFixed(1)}★)`;if (u) { d.innerHTML = `<span class="burnt-pill">UŻYTA</span> <span class="${cl}" style="text-decoration: line-through; opacity: 0.65;">${text}</span>`; } else if (isRep) { d.innerHTML = `<span class="font-bold text-white">↳ ZAMIANA (ZWROT LOSU):</span> <span class="${cl}">${text}</span>`; d.style.marginTop = '0px'; d.style.paddingLeft = '16px'; } else { d.innerHTML = `<span class="font-bold text-yellow-400">&#9658;</span> <span class="${cl}">${text}</span>`; }c.appendChild(d);});if (teamsToDisplay.length === 0) { c.innerHTML = '<div class="text-xs text-gray-500">Brak dostępnych nowych drużyn w puli.</div>'; }}

        async function runRouletteGlobal(panelId, winner, pool) {
            window.abortController.aborted = false; 
            const panel = document.getElementById(panelId);

            // Block "BIORĘ" while spinning on this side.
            const keepBtnId = panelId === 'team1-panel' ? 'keep-btn-1' : (panelId === 'team2-panel' ? 'keep-btn-2' : null);
            const keepBtn = keepBtnId ? document.getElementById(keepBtnId) : null;
            const keepBtnPrevDisabled = keepBtn ? keepBtn.disabled : null;
            if (keepBtn) {
                keepBtn.disabled = true;
                keepBtn.classList.add('is-locked');
            }

            // Block "PRZELOSUJ" while spinning on this side.
            const rerollBtnId = panelId === 'team1-panel' ? 'reroll-btn-1' : (panelId === 'team2-panel' ? 'reroll-btn-2' : null);
            const rerollBtn = rerollBtnId ? document.getElementById(rerollBtnId) : null;
            const rerollBtnPrevDisabled = rerollBtn ? rerollBtn.disabled : null;
            if (rerollBtn) {
                rerollBtn.disabled = true;
                rerollBtn.classList.add('is-locked');
            }

            // If the other side is already a final club card, match its height (fix: roulette too tall).
            try {
                const otherId = panelId === 'team1-panel' ? 'team2-panel' : (panelId === 'team2-panel' ? 'team1-panel' : null);
                if (otherId) {
                    const otherEl = document.getElementById(otherId);
                    if (otherEl && otherEl.classList && otherEl.classList.contains('team-card-dynamic')) {
                        // Use offsetHeight (layout height) so transforms during reroll don't skew measurements.
                        const h = Math.round(otherEl.offsetHeight || 0);
                        if (h > 0) {
                            panel.style.height = `${h}px`;
                            panel.style.minHeight = `${h}px`;
                        }
                    } else {
                        panel.style.height = '';
                        panel.style.minHeight = '';
                    }
                }
            } catch (_) { /* ignore */ }

            panel.className = 'roulette-container border-2 border-gray-700 rounded-3xl h-full flex flex-grow flex-col';
            panel.style.background = '';
            panel.innerHTML = `
                <div class="roulette-strip" id="${panelId}-strip"></div>
                <div class="roulette-indicator"></div>
            `;
            panel.classList.add('is-spinning');
            
            const strip = document.getElementById(`${panelId}-strip`);
            let cardWidth = 216; 
            // Keep enough items for speed + suspense without heavy DOM
            const winnerIndex = 40;
            const totalItems = 62;
            
            let html = '';
            for(let i=0; i<totalItems; i++) {
                const t = (i === winnerIndex) ? winner : pool[Math.floor(Math.random() * pool.length)];
                const rarity = getRarityClass(t);
                const img = getTeamLogoUrl(t);
                const flagHtml = t.flag ? `<div class="text-5xl filter drop-shadow-md mb-2">${t.flag}</div>` : `<img src="${img}" decoding="async" loading="eager" class="w-20 h-20 object-contain mb-2" onerror="handleImgError(this)" data-team="${encodeTeamDataAttr(t)}">`;
                
                html += `
                    <div class="roulette-item ${rarity}">
                        ${flagHtml}
                        <div class="text-[10px] font-bold text-center leading-tight px-1">${t.name}</div>
                        <div class="text-[9px] text-yellow-500">${t.stars}★</div>
                    </div>
                `;
            }
            strip.innerHTML = html;

            // Start should be immediate: show strip with clubs, then spin and ramp speed.
            strip.style.opacity = '1';
            strip.style.transform = 'translate3d(0px, 0, 0)';
            strip.style.willChange = 'transform';
            // Dynamic width measurement to sync with responsive CSS
            const sample = strip.querySelector('.roulette-item');
            let firstItemOffset = 0;
            if (sample) {
                const rect = sample.getBoundingClientRect();
                const cs = getComputedStyle(sample);
                const ml = parseFloat(cs.marginLeft) || 0;
                const mr = parseFloat(cs.marginRight) || 0;
                cardWidth = rect.width + ml + mr;
                firstItemOffset = ml;
            }
            
            const winnerPosition = (winnerIndex * cardWidth) + (cardWidth / 2);
            const containerCenter = panel.offsetWidth / 2;
            // Suspense: allow stopping right near the edge of the winner card ("wejdzie czy nie wejdzie"),
            // but still guarantee the winner remains under the needle.
            const jitterMax = Math.max(6, (cardWidth * 0.5) - 3);
            const jitter = (Math.random() * (jitterMax * 2)) - jitterMax;
            const offset = containerCenter - winnerPosition + jitter;

            // Rebuilt back to the original (working) roulette style:
            // - browser-driven smooth transform transition with a strong ease-out
            // - rAF only for ticking on index changes
            const rand = (min, max) => min + Math.random() * (max - min);
            // Slightly longer than before (requested), without changing the feel
            const duration = Math.round(rand(6200, 7600));

            return new Promise((resolve) => {
                let startTime = 0;
                let rafId = 0;
                let lastCardIndex = -1;
                let finished = false;

                // cubic-bezier evaluator: returns progress for time t in [0..1]
                const cubicBezier = (p1x, p1y, p2x, p2y) => {
                    const cx = 3.0 * p1x;
                    const bx = 3.0 * (p2x - p1x) - cx;
                    const ax = 1.0 - cx - bx;
                    const cy = 3.0 * p1y;
                    const by = 3.0 * (p2y - p1y) - cy;
                    const ay = 1.0 - cy - by;
                    const sampleCurveX = (t) => ((ax * t + bx) * t + cx) * t;
                    const sampleCurveY = (t) => ((ay * t + by) * t + cy) * t;
                    const sampleCurveDerivativeX = (t) => (3.0 * ax * t + 2.0 * bx) * t + cx;
                    const solveCurveX = (x) => {
                        let t2 = x;
                        for (let i = 0; i < 5; i++) {
                            const x2 = sampleCurveX(t2) - x;
                            const d2 = sampleCurveDerivativeX(t2);
                            if (Math.abs(x2) < 1e-4 || Math.abs(d2) < 1e-6) break;
                            t2 = t2 - x2 / d2;
                            if (t2 < 0) t2 = 0;
                            else if (t2 > 1) t2 = 1;
                        }
                        return t2;
                    };
                    return (x) => sampleCurveY(solveCurveX(x));
                };
                const ease = cubicBezier(0.05, 1, 0.10, 1);
                const needleX = panel.offsetWidth / 2;

                const cleanup = () => {
                    if (rafId) cancelAnimationFrame(rafId);
                    rafId = 0;
                };

                const finish = (val) => {
                    if (finished) return;
                    finished = true;
                    cleanup();
                    resolve(val);
                };

                const tickLoop = (now) => {
                    if (window.abortController.aborted) {
                        cleanup();
                        finish(null);
                        return;
                    }
                    if (!startTime) startTime = now;

                    // PERF: avoid layout reads each frame; estimate transform from time+easing.
                    const t = Math.max(0, Math.min(1, (now - startTime) / duration));
                    const tx = offset * ease(t);
                    const needleInStripX = (needleX - tx) - firstItemOffset;
                    const currentCardIndex = Math.floor(needleInStripX / cardWidth);
                    if (currentCardIndex !== lastCardIndex && currentCardIndex >= 0) {
                        Sound.rouletteTick();
                        lastCardIndex = currentCardIndex;
                    }

                    if (now - startTime < duration + 40) {
                        rafId = requestAnimationFrame(tickLoop);
                    } else {
                        // final reveal: 0.5s AFTER the movement is done
                        setTimeout(() => {
                            if (!window.abortController.aborted) {
                                // Clear fixed height from roulette mode so final card uses responsive sizing.
                                panel.style.height = '';
                                panel.style.minHeight = '';
                                window.PlayerManager.renderCard(panelId, winner);
                                panel.classList.remove('is-spinning');
                                if (keepBtn) {
                                    // Restore previous state (burnt teams keep disabled elsewhere)
                                    keepBtn.disabled = !!keepBtnPrevDisabled;
                                    keepBtn.classList.remove('is-locked');
                                }
                                if (rerollBtn) {
                                    rerollBtn.disabled = !!rerollBtnPrevDisabled;
                                    rerollBtn.classList.remove('is-locked');
                                    // Also re-apply proper reroll enable/disable rules
                                    if (panelId === 'team1-panel') window.PlayerManager.updateRerollButtonState(1);
                                    else if (panelId === 'team2-panel') window.PlayerManager.updateRerollButtonState(2);
                                }
                                finish(winner);
                            } else {
                                panel.classList.remove('is-spinning');
                                panel.style.height = '';
                                panel.style.minHeight = '';
                                if (keepBtn) {
                                    keepBtn.disabled = !!keepBtnPrevDisabled;
                                    keepBtn.classList.remove('is-locked');
                                }
                                if (rerollBtn) {
                                    rerollBtn.disabled = !!rerollBtnPrevDisabled;
                                    rerollBtn.classList.remove('is-locked');
                                    if (panelId === 'team1-panel') window.PlayerManager.updateRerollButtonState(1);
                                    else if (panelId === 'team2-panel') window.PlayerManager.updateRerollButtonState(2);
                                }
                                finish(null);
                            }
                        }, 500);
                    }
                };

                // start motion on next frame (ensure DOM painted)
                strip.style.transition = 'none';
                strip.style.transform = 'translate3d(0px, 0, 0)';
                requestAnimationFrame(() => {
                    if (window.abortController.aborted) {
                        panel.classList.remove('is-spinning');
                        if (keepBtn) {
                            keepBtn.disabled = !!keepBtnPrevDisabled;
                            keepBtn.classList.remove('is-locked');
                        }
                        if (rerollBtn) {
                            rerollBtn.disabled = !!rerollBtnPrevDisabled;
                            rerollBtn.classList.remove('is-locked');
                            if (panelId === 'team1-panel') window.PlayerManager.updateRerollButtonState(1);
                            else if (panelId === 'team2-panel') window.PlayerManager.updateRerollButtonState(2);
                        }
                        finish(null);
                        return;
                    }
                    // original proven feel
                    strip.style.transition = `transform ${duration}ms cubic-bezier(0.05, 1, 0.10, 1)`;
                    strip.style.transform = `translate3d(${offset}px, 0, 0)`;
                    rafId = requestAnimationFrame(tickLoop);
                });
            });
        }

        PlayerManager.bindActionButtons = function() {
            let r1 = false, r2 = false; 
            const chk = () => { if(r1 && r2) window.PlayerManager.showVS(); };
            
            document.getElementById('reroll-btn-1').onclick = () => window.PlayerManager.handleReroll(1); 
            document.getElementById('reroll-btn-2').onclick = () => window.PlayerManager.handleReroll(2);
            document.getElementById('keep-btn-1').onclick = () => { if(AppState.usedTeams.includes(AppState.finalTeam1.name)) return; r1 = true; document.getElementById('team1-actions').classList.add('invisible'); document.getElementById('team1-panel').classList.add('border-green-500','border-4'); Sound.keep(); chk(); }; 
            document.getElementById('keep-btn-2').onclick = () => { if(AppState.usedTeams.includes(AppState.finalTeam2.name)) return; r2 = true; document.getElementById('team2-actions').classList.add('invisible'); document.getElementById('team2-panel').classList.add('border-green-500','border-4'); Sound.keep(); chk(); };
            
            document.getElementById('rerolls-left-1').innerText = AppState.rerolls.p1; 
            document.getElementById('rerolls-left-2').innerText = AppState.rerolls.p2;
            window.PlayerManager.updateRerollButtonState(1);
            window.PlayerManager.updateRerollButtonState(2);
        };

        // --- XBOX GAMEPAD SUPPORT (2 pads + focus navigation) ---
        window.GamepadManager = {
            enabled: false,
            started: false,
            states: new Map(),
            raf: 0,
            overlayEl: null,
            hudEl: null,
            dotEl: null,
            statusTextEl: null,
            _lastFocusEl: null,
            _lastAnyInputAt: 0,
            _helpVisible: true,
            _lastHudKey: '',
            tvLayout: { mode: 'auto', enabled: false },

            init() {
                this.overlayEl = document.getElementById('gamepad-overlay');
                this.hudEl = document.getElementById('gamepad-hud');
                this.dotEl = document.getElementById('gp-dot');
                this.statusTextEl = document.getElementById('gp-status-text');

                this._injectHints();
                this._loadTvLayoutPref();
                this._applyTvLayout();
                this._updateTvToggleLabel();

                window.addEventListener('gamepadconnected', () => {
                    this.enabled = true;
                    document.body.classList.add('gamepad-mode');
                    // TV mode: auto-enable on first pad connect unless user forced it.
                    if (this.tvLayout.mode === 'auto') {
                        this.tvLayout.enabled = true;
                        this._applyTvLayout();
                        this._saveTvLayoutPref();
                    }
                    this._updateHud();
                    this._maybeShowOverlay();
                    this._startLoop();
                });
                window.addEventListener('gamepaddisconnected', () => {
                    this._updateHud();
                    if (!this._hasAnyPad()) {
                        this._hideOverlay();
                        if (this.hudEl) this.hudEl.classList.add('hidden');
                    }
                });

                // In some browsers gamepadconnected may not fire until first poll.
                this._startLoop();

                document.addEventListener('focusin', (e) => {
                    if (!this.enabled) return;
                    this._setFocusRing(e.target);
                }, true);

                // If user uses mouse/touch after gamepad, keep focus ring coherent.
                document.addEventListener('pointerdown', () => {
                    if (!this.enabled) return;
                    this._lastAnyInputAt = performance.now();
                }, true);
            },

            _loadTvLayoutPref() {
                try {
                    const raw = localStorage.getItem('fc26_tv_layout');
                    if (!raw) {
                        // Xbox-only build: default to TV layout ON (user can toggle OFF).
                        this.tvLayout = { mode: 'forced', enabled: true };
                        return;
                    }
                    const parsed = JSON.parse(raw);
                    const mode = (parsed && (parsed.mode === 'auto' || parsed.mode === 'forced')) ? parsed.mode : 'auto';
                    const enabled = !!(parsed && parsed.enabled);
                    this.tvLayout = { mode, enabled };
                } catch (_) {
                    this.tvLayout = { mode: 'forced', enabled: true };
                }
            },

            _saveTvLayoutPref() {
                try {
                    localStorage.setItem('fc26_tv_layout', JSON.stringify(this.tvLayout));
                } catch (_) { /* no-op */ }
            },

            _applyTvLayout() {
                const shouldEnable = !!this.tvLayout.enabled;
                document.body.classList.toggle('tv-layout', shouldEnable);
                try { updateTopbarCssVars(); } catch (_) { /* no-op */ }
                this._updateTvToggleLabel();
            },

            _updateTvToggleLabel() {
                const btn = document.getElementById('toggle-tv-layout-btn');
                if (!btn) return;
                const on = document.body.classList.contains('tv-layout');
                btn.innerHTML = `<span>📺</span> Tryb TV (większy interfejs) <span class="ml-auto text-xs font-black ${on ? 'text-green-400' : 'text-gray-500'}">${on ? 'ON' : 'OFF'}</span>`;
            },

            toggleTvLayout() {
                const currentlyOn = document.body.classList.contains('tv-layout');
                this.tvLayout.mode = 'forced';
                this.tvLayout.enabled = !currentlyOn;
                this._applyTvLayout();
                this._saveTvLayoutPref();
                try { window.Sound?.tick?.(); } catch (_) { /* no-op */ }
            },

            openControls() {
                const modal = document.getElementById('controls-modal');
                if (!modal) return;
                modal.classList.remove('hidden');
                try { window.Sound?.tick?.(); } catch (_) { /* no-op */ }
                // Focus the close button so A/B works immediately.
                const focusClose = () => {
                    const btn = document.getElementById('controls-close-btn') || modal.querySelector('button');
                    if (btn) {
                        try { btn.focus({ preventScroll: true }); } catch (_) { /* no-op */ }
                        this._setFocusRing(btn);
                    }
                };
                try { requestAnimationFrame(focusClose); } catch (_) { setTimeout(focusClose, 0); }
            },

            closeControls() {
                const modal = document.getElementById('controls-modal');
                if (!modal) return;
                modal.classList.add('hidden');
                try { window.Sound?.tick?.(); } catch (_) { /* no-op */ }
                try { this._ensureFocus(this._activeRoot()); } catch (_) { /* no-op */ }
            },

            _closestScrollable(startEl, stopAt) {
                let el = startEl;
                while (el && el !== document.body && el !== document.documentElement) {
                    if (stopAt && el === stopAt) {
                        // root itself might be scrollable; check it once before stopping
                        const csRoot = getComputedStyle(el);
                        const oyRoot = csRoot.overflowY;
                        if ((oyRoot === 'auto' || oyRoot === 'scroll') && el.scrollHeight > el.clientHeight + 8) return el;
                        break;
                    }
                    try {
                        const cs = getComputedStyle(el);
                        const oy = cs.overflowY;
                        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 8) return el;
                    } catch (_) { /* no-op */ }
                    el = el.parentElement;
                }
                return null;
            },

            _pageScroll(dir, root) {
                const ae = document.activeElement;
                const sc = this._closestScrollable(ae, root) || this._closestScrollable(root, root);
                if (!sc) return false;
                const amount = Math.max(220, Math.round(sc.clientHeight * 0.82)) * (dir || 1);
                try {
                    sc.scrollBy({ top: amount, left: 0, behavior: 'smooth' });
                } catch (_) {
                    try { sc.scrollTop += amount; } catch (_2) { return false; }
                }
                return true;
            },

            _nudgeScroll(dir, root) {
                const ae = document.activeElement;
                const sc = this._closestScrollable(ae, root) || this._closestScrollable(root, root);
                if (!sc) return false;
                const amount = Math.max(140, Math.round(sc.clientHeight * 0.38)) * (dir || 1);
                try {
                    sc.scrollBy({ top: amount, left: 0, behavior: 'smooth' });
                } catch (_) {
                    try { sc.scrollTop += amount; } catch (_2) { return false; }
                }
                return true;
            },

            _hudKeyFor(root) {
                if (!root) return 'none';
                const id = root.id || '';
                if (id === 'drawing-screen') return 'drawing';
                if (id === 'step2-screen') return 'step2';
                if (id === 'step1-screen') return 'step1';
                if (id === 'sidebar') return 'sidebar';
                if (id === 'universal-picker-modal') return 'picker';
                if (id === 'selection-modal') return 'selection';
                if (id === 'delete-players-modal') return 'deletePlayers';
                if (id === 'recording-modal') return 'recording';
                if (id === 'post-match-modal') return 'postmatch';
                if (id === 'stats-modal') return 'stats';
                if (id === 'compare-modal') return 'compare';
                if (id === 'controls-modal') return 'controls';
                if (id.endsWith('-modal')) return 'modal';
                return 'app';
            },

            _hudHelpHtmlForKey(key) {
                const s = (cls, text) => `<span class="gp-btn ${cls}">${text}</span>`;
                const sep = `<span class="gp-hud-sep">•</span>`;

                if (key === 'drawing') {
                    return [
                        `<span class="gp-p">P1</span>${s('gp-a','A')}<span class="gp-hud-sep">Biorę</span>${s('gp-x','X')}<span class="gp-hud-sep">Reroll</span>${s('gp-y','Y')}<span class="gp-hud-sep">Ręcznie</span>`,
                        `${sep}<span class="gp-p">P2</span>${s('gp-a','A')}<span class="gp-hud-sep">Biorę</span>${s('gp-x','X')}<span class="gp-hud-sep">Reroll</span>${s('gp-y','Y')}<span class="gp-hud-sep">Ręcznie</span>`,
                        `${sep}${s('gp-b','B')}<span class="gp-hud-sep">Wstecz</span>${s('gp-menu','MENU')}<span class="gp-hud-sep">Menu</span>`
                    ].join(' ');
                }
                if (key === 'picker') {
                    return [
                        `${s('gp-a','A')}<span class="gp-hud-sep">Wybierz</span>`,
                        `${s('gp-b','B')}<span class="gp-hud-sep">Zamknij</span>`,
                        `${s('gp-x','X')}<span class="gp-hud-sep">Tryb usuwania</span>`,
                        `${s('gp-y','Y')}<span class="gp-hud-sep">Dodaj</span>`,
                        `${s('gp-lb','LB')}/${s('gp-rb','RB')}<span class="gp-hud-sep">Przewijaj</span>`
                    ].join(' ');
                }
                if (key === 'selection' || key === 'deletePlayers') {
                    return [
                        `${s('gp-a','A')}<span class="gp-hud-sep">Zaznacz</span>`,
                        `${s('gp-x','X')}<span class="gp-hud-sep">Zaznacz wszystkich</span>`,
                        `${s('gp-b','B')}<span class="gp-hud-sep">Anuluj</span>`,
                        `${s('gp-lb','LB')}/${s('gp-rb','RB')}<span class="gp-hud-sep">Przewijaj</span>`
                    ].join(' ');
                }
                if (key === 'recording') {
                    return [
                        `${s('gp-a','A')}<span class="gp-hud-sep">Wybierz</span>`,
                        `${s('gp-x','X')}<span class="gp-hud-sep">Historia</span>`,
                        `${s('gp-y','Y')}<span class="gp-hud-sep">Cofnij</span>`,
                        `${s('gp-b','B')}<span class="gp-hud-sep">Zamknij</span>`,
                        `${s('gp-lb','LB')}/${s('gp-rb','RB')}<span class="gp-hud-sep">Przewijaj</span>`
                    ].join(' ');
                }
                if (key === 'stats') {
                    return [
                        `${s('gp-a','A')}<span class="gp-hud-sep">Wybierz</span>`,
                        `${s('gp-lb','LB')}/${s('gp-rb','RB')}<span class="gp-hud-sep">Zakładki</span>`,
                        `${s('gp-b','B')}<span class="gp-hud-sep">Zamknij</span>`,
                        `${s('gp-menu','MENU')}<span class="gp-hud-sep">Menu</span>`
                    ].join(' ');
                }
                if (key === 'controls') {
                    return [
                        `${s('gp-b','B')}<span class="gp-hud-sep">Zamknij</span>`,
                        `${s('gp-view','VIEW')}<span class="gp-hud-sep">HUD</span>`
                    ].join(' ');
                }
                // default
                return [
                    `${s('gp-a','A')}<span class="gp-hud-sep">Wybierz</span>`,
                    `${s('gp-b','B')}<span class="gp-hud-sep">Wstecz</span>`,
                    `${s('gp-menu','MENU')}<span class="gp-hud-sep">Menu</span>`,
                    `${s('gp-view','VIEW')}<span class="gp-hud-sep">HUD</span>`
                ].join(' ');
            },

            _btnClassFor(token) {
                const t = String(token || '').toUpperCase();
                if (t === 'A') return 'gp-a';
                if (t === 'B') return 'gp-b';
                if (t === 'X') return 'gp-x';
                if (t === 'Y') return 'gp-y';
                if (t === 'LB') return 'gp-lb';
                if (t === 'RB') return 'gp-rb';
                if (t === 'MENU') return 'gp-menu';
                if (t === 'VIEW') return 'gp-view';
                return 'gp-menu';
            },

            _renderHint({ player = null, buttons = [] } = {}) {
                const wrap = document.createElement('span');
                wrap.className = 'gp-hint';

                if (player) {
                    const p = document.createElement('span');
                    p.className = 'gp-p';
                    p.textContent = String(player).toUpperCase();
                    wrap.appendChild(p);
                }

                for (const b of buttons) {
                    const s = document.createElement('span');
                    s.className = `gp-btn ${this._btnClassFor(b)}`;
                    s.textContent = String(b).toUpperCase();
                    wrap.appendChild(s);
                }
                return wrap;
            },

            _ensureHint(el, hint) {
                if (!el) return;
                if (el.querySelector && el.querySelector('.gp-hint')) return;
                el.appendChild(this._renderHint(hint));
            },

            _injectHints() {
                const byId = (id) => document.getElementById(id);
                // Main flow
                this._ensureHint(byId('goto-step2-btn'), { buttons: ['A'] });
                this._ensureHint(byId('start-drawing-btn'), { buttons: ['A'] });
                this._ensureHint(byId('draw-teams-btn'), { buttons: ['A'] });
                // Drawing dual pad controls
                this._ensureHint(byId('keep-btn-1'), { player: 'P1', buttons: ['A'] });
                this._ensureHint(byId('reroll-btn-1'), { player: 'P1', buttons: ['X'] });
                this._ensureHint(byId('manual-btn-1'), { player: 'P1', buttons: ['Y'] });
                this._ensureHint(byId('keep-btn-2'), { player: 'P2', buttons: ['A'] });
                this._ensureHint(byId('reroll-btn-2'), { player: 'P2', buttons: ['X'] });
                this._ensureHint(byId('manual-btn-2'), { player: 'P2', buttons: ['Y'] });
                // Navigation helpers
                this._ensureHint(byId('sidebar-open-btn'), { buttons: ['MENU'] });
                this._ensureHint(byId('back-to-step1-btn'), { buttons: ['B'] });
                this._ensureHint(byId('abort-draw-btn'), { buttons: ['B'] });
                this._ensureHint(byId('save-match-btn'), { buttons: ['A'] });
                this._ensureHint(byId('reset-btn'), { buttons: ['B'] });
            },

            _startLoop() {
                if (this.raf) return;
                const tick = () => {
                    try {
                        this._poll();
                    } catch (_) { /* no-op */ }
                    this.raf = requestAnimationFrame(tick);
                };
                this.raf = requestAnimationFrame(tick);
            },

            _hasAnyPad() {
                const pads = (navigator && navigator.getGamepads) ? navigator.getGamepads() : [];
                for (const p of pads) if (p) return true;
                return false;
            },

            _maybeShowOverlay() {
                if (!this.overlayEl) return;
                if (this.started) return;
                // Don't block loading/auth overlays; just show when app is interactive.
                this.overlayEl.classList.remove('hidden');
            },
            _hideOverlay() {
                if (!this.overlayEl) return;
                this.overlayEl.classList.add('hidden');
            },

            _updateHud() {
                const pads = (navigator && navigator.getGamepads) ? navigator.getGamepads() : [];
                const connected = [];
                for (let i = 0; i < pads.length; i++) {
                    if (pads[i]) connected.push(i);
                }
                const has = connected.length > 0;
                if (this.hudEl) {
                    this.hudEl.classList.toggle('hidden', !has);
                }
                if (this.dotEl) {
                    this.dotEl.classList.toggle('is-on', has);
                }
                if (this.statusTextEl) {
                    if (!has) this.statusTextEl.textContent = 'Pad: —';
                    else if (connected.length === 1) this.statusTextEl.textContent = `Pad: P${connected[0] + 1}`;
                    else this.statusTextEl.textContent = `Pad: P${connected[0] + 1}+P${connected[1] + 1}`;
                }
                const help = document.getElementById('gp-help-pill');
                if (help) {
                    help.style.display = this._helpVisible ? '' : 'none';
                    if (this._helpVisible) {
                        const root = this._activeRoot();
                        const key = this._hudKeyFor(root);
                        if (key !== this._lastHudKey) {
                            this._lastHudKey = key;
                            help.innerHTML = this._hudHelpHtmlForKey(key);
                        }
                    }
                }
            },

            _poll() {
                const pads = (navigator && navigator.getGamepads) ? navigator.getGamepads() : [];
                let any = false;
                for (let i = 0; i < pads.length; i++) {
                    const pad = pads[i];
                    if (!pad) continue;
                    any = true;
                    this._handlePad(i, pad);
                }
                if (any && (this.hudEl && this.hudEl.classList.contains('hidden'))) {
                    this.enabled = true;
                    document.body.classList.add('gamepad-mode');
                    this._updateHud();
                    this._maybeShowOverlay();
                }
                if (!any) return;
            },

            _getState(index) {
                if (!this.states.has(index)) {
                    this.states.set(index, {
                        buttons: Array(20).fill(false),
                        nextRepeatAt: 0,
                        heldDir: null,
                        lastDirAt: 0,
                    });
                }
                return this.states.get(index);
            },

            _buttonEdge(state, pad, btnIndex) {
                const down = !!pad.buttons?.[btnIndex]?.pressed;
                const prev = !!state.buttons[btnIndex];
                state.buttons[btnIndex] = down;
                return down && !prev;
            },

            _axisDir(pad) {
                const ax0 = pad.axes?.[0] ?? 0;
                const ax1 = pad.axes?.[1] ?? 0;
                const dead = 0.55;
                if (ax0 <= -dead) return 'left';
                if (ax0 >= dead) return 'right';
                if (ax1 <= -dead) return 'up';
                if (ax1 >= dead) return 'down';
                return null;
            },

            _isVisible(el) {
                if (!el) return false;
                if (el.classList && el.classList.contains('hidden')) return false;
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
                const r = el.getBoundingClientRect();
                return (r.width > 0 && r.height > 0);
            },

            _activeRoot() {
                const auth = document.getElementById('auth-screen');
                if (this._isVisible(auth)) return auth;
                const loading = document.getElementById('loading-screen');
                if (this._isVisible(loading)) return loading;

                const sidebar = document.getElementById('sidebar');
                if (sidebar && !sidebar.classList.contains('-translate-x-full')) return sidebar;

                // Prefer visible fixed overlays/modals
                const candidates = Array.from(document.querySelectorAll('[id$="-modal"], #universal-picker-modal, #delete-confirm-modal, #selection-modal, #format-modal, #manual-select-modal, #avatar-modal, #edit-match-modal'));
                for (let i = candidates.length - 1; i >= 0; i--) {
                    const el = candidates[i];
                    if (this._isVisible(el)) return el;
                }

                // Otherwise use current visible main screen
                const drawing = document.getElementById('drawing-screen');
                if (this._isVisible(drawing)) return drawing;
                const step2 = document.getElementById('step2-screen');
                if (this._isVisible(step2)) return step2;
                const step1 = document.getElementById('step1-screen');
                if (this._isVisible(step1)) return step1;
                return document.body;
            },

            _focusables(root) {
                const sel = [
                    'button:not([disabled])',
                    'a[href]',
                    '[role="button"]',
                    'input:not([disabled])',
                    'select:not([disabled])',
                    'textarea:not([disabled])',
                    '[tabindex]:not([tabindex="-1"])'
                ].join(',');
                const list = Array.from((root || document).querySelectorAll(sel));
                return list.filter(el => this._isVisible(el));
            },

            _centerOf(el) {
                const r = el.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            },

            _setFocusRing(el) {
                if (!el || el === document.body || el === document.documentElement) return;
                if (this._lastFocusEl && this._lastFocusEl !== el) this._lastFocusEl.classList.remove('gp-focus');
                this._lastFocusEl = el;
                el.classList.add('gp-focus');
            },

            _ensureFocus(root) {
                const focusables = this._focusables(root);
                if (!focusables.length) return;
                const ae = document.activeElement;
                if (ae && focusables.includes(ae) && this._isVisible(ae)) {
                    this._setFocusRing(ae);
                    return;
                }
                focusables[0].focus({ preventScroll: true });
                this._setFocusRing(focusables[0]);
                try {
                    focusables[0].scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
                } catch (_) { /* no-op */ }
            },

            _moveFocus(dir, opts = {}) {
                const root = this._activeRoot();
                const focusables = this._focusables(root);
                if (!focusables.length) return;

                let current = document.activeElement;
                if (!current || !focusables.includes(current)) current = focusables[0];
                const c = this._centerOf(current);

                let best = null;
                let bestScore = Infinity;
                for (const el of focusables) {
                    if (el === current) continue;
                    const p = this._centerOf(el);
                    const dx = p.x - c.x;
                    const dy = p.y - c.y;
                    const min = 8;
                    if (dir === 'left' && dx > -min) continue;
                    if (dir === 'right' && dx < min) continue;
                    if (dir === 'up' && dy > -min) continue;
                    if (dir === 'down' && dy < min) continue;

                    const primary = (dir === 'left' || dir === 'right') ? Math.abs(dx) : Math.abs(dy);
                    const secondary = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);
                    const dist = Math.hypot(dx, dy);
                    const score = primary * 1.0 + secondary * 1.9 + dist * 0.15;
                    if (score < bestScore) {
                        bestScore = score;
                        best = el;
                    }
                }

                if (best) {
                    best.focus({ preventScroll: true });
                    this._setFocusRing(best);
                    try {
                        best.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
                    } catch (_) { /* no-op */ }
                    if (window.Sound && typeof window.Sound.tick === 'function') window.Sound.tick();
                } else if (!opts.skipScroll && (dir === 'up' || dir === 'down')) {
                    // If navigation hits the edge of a long list/grid, nudge scroll and try again.
                    const sd = dir === 'down' ? 1 : -1;
                    if (this._nudgeScroll(sd, root)) {
                        try {
                            setTimeout(() => {
                                try { this._moveFocus(dir, { skipScroll: true }); } catch (_) { /* no-op */ }
                            }, 120);
                        } catch (_) { /* no-op */ }
                    }
                }
            },

            _click(el) {
                if (!el) return false;
                if (!this._isVisible(el)) return false;
                if (el.disabled) return false;
                el.click();
                return true;
            },

            _handleBack() {
                // sidebar
                const sidebar = document.getElementById('sidebar');
                if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
                    window.Sidebar?.close?.();
                    return true;
                }
                // universal picker / delete confirm
                const uni = document.getElementById('universal-picker-modal');
                if (this._isVisible(uni)) { uni.classList.add('hidden'); return true; }
                const del = document.getElementById('delete-confirm-modal');
                if (this._isVisible(del)) { del.classList.add('hidden'); return true; }

                // any visible modal with an explicit close button
                const root = this._activeRoot();
                if (root && root !== document.body) {
                    const closeBtn = root.querySelector('button[aria-label*="Zamknij"], button[aria-label*="zamknij"], button[title*="Zamknij"], button[title*="zamknij"], button[onclick*="classList.add(\'hidden\')"]');
                    if (closeBtn && this._click(closeBtn)) return true;
                }

                // abort draw
                const abort = document.getElementById('abort-draw-btn');
                if (abort && this._isVisible(abort) && !abort.classList.contains('hidden')) {
                    this._click(abort);
                    return true;
                }

                // step2 back
                const back = document.getElementById('back-to-step1-btn');
                if (back && this._isVisible(back)) {
                    this._click(back);
                    return true;
                }

                return false;
            },

            _handlePad(index, pad) {
                const state = this._getState(index);
                const now = performance.now();

                // Any button press => start gamepad mode
                for (let b = 0; b < Math.min(16, pad.buttons?.length || 0); b++) {
                    if (this._buttonEdge(state, pad, b)) {
                        this.started = true;
                        this._hideOverlay();
                        this._lastAnyInputAt = now;
                        this._updateHud();
                        break;
                    }
                }

                if (!this.enabled) return;
                const root = this._activeRoot();
                this._ensureFocus(root);

                // Map buttons (standard mapping)
                const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, VIEW = 8, MENU = 9;
                const DU = 12, DD = 13, DL = 14, DR = 15;

                // Toggle help
                if (this._buttonEdge(state, pad, VIEW)) {
                    this._helpVisible = !this._helpVisible;
                    this._updateHud();
                    if (window.Sound) window.Sound.tick();
                }

                // Sidebar
                if (this._buttonEdge(state, pad, MENU)) {
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar && sidebar.classList.contains('-translate-x-full')) window.Sidebar?.open?.();
                    else window.Sidebar?.close?.();
                }

                // Back
                if (this._buttonEdge(state, pad, B)) {
                    if (this._handleBack()) {
                        if (window.Sound) window.Sound.tick();
                        return;
                    }
                }

                // Context shortcuts: modals
                const uniPicker = document.getElementById('universal-picker-modal');
                if (this._isVisible(uniPicker)) {
                    if (this._buttonEdge(state, pad, X)) {
                        const btn = document.getElementById('picker-delete-mode-btn');
                        if (btn && this._isVisible(btn) && !btn.disabled) {
                            this._click(btn);
                            this._updateHud();
                            return;
                        }
                    }
                    if (this._buttonEdge(state, pad, Y)) {
                        const btn = document.getElementById('picker-add-btn');
                        if (btn && this._isVisible(btn) && !btn.disabled) {
                            this._click(btn);
                            // If the add row appears, focus the input.
                            try {
                                setTimeout(() => {
                                    const input = document.getElementById('picker-new-name');
                                    if (input && this._isVisible(input)) {
                                        try { input.focus({ preventScroll: true }); } catch (_) { /* no-op */ }
                                        this._setFocusRing(input);
                                    }
                                }, 60);
                            } catch (_) { /* no-op */ }
                            this._updateHud();
                            return;
                        }
                    }
                }

                const selectionModal = document.getElementById('selection-modal');
                const deletePlayersModal = document.getElementById('delete-players-modal');
                if ((this._isVisible(selectionModal) || this._isVisible(deletePlayersModal)) && this._buttonEdge(state, pad, X)) {
                    const btn = document.getElementById('select-all-btn');
                    if (btn && this._isVisible(btn) && !btn.disabled) {
                        this._click(btn);
                        this._updateHud();
                        return;
                    }
                }

                const recordingModal = document.getElementById('recording-modal');
                if (this._isVisible(recordingModal)) {
                    if (this._buttonEdge(state, pad, X)) {
                        const btn = document.getElementById('toggle-history-btn');
                        if (btn && this._isVisible(btn) && !btn.disabled) {
                            this._click(btn);
                            this._updateHud();
                            return;
                        }
                    }
                    if (this._buttonEdge(state, pad, Y)) {
                        const btn = document.getElementById('undo-last-goal-btn');
                        if (btn && this._isVisible(btn) && !btn.disabled) {
                            this._click(btn);
                            this._updateHud();
                            return;
                        }
                    }
                }

                // Context: drawing screen has dual-pad actions
                const drawing = document.getElementById('drawing-screen');
                const isDrawing = this._isVisible(drawing);
                const teamActionsVisible = (id) => {
                    const el = document.getElementById(id);
                    return el && this._isVisible(el) && !el.classList.contains('hidden');
                };

                // P1 => team1, P2 => team2 (index 0/1)
                if (isDrawing && (index === 0 || index === 1)) {
                    const slot = index === 0 ? 1 : 2;
                    if (this._buttonEdge(state, pad, A)) {
                        const keep = document.getElementById(`keep-btn-${slot}`);
                        if (teamActionsVisible(`team${slot}-actions`) && keep && !keep.disabled) {
                            this._click(keep);
                            return;
                        }
                    }
                    if (this._buttonEdge(state, pad, X)) {
                        const reroll = document.getElementById(`reroll-btn-${slot}`);
                        if (teamActionsVisible(`team${slot}-actions`) && reroll && !reroll.disabled) {
                            this._click(reroll);
                            return;
                        }
                    }
                    if (this._buttonEdge(state, pad, Y)) {
                        const manual = document.getElementById(`manual-btn-${slot}`);
                        if (manual && this._isVisible(manual) && !manual.disabled) {
                            this._click(manual);
                            return;
                        }
                    }
                }

                // A => activate focused
                if (this._buttonEdge(state, pad, A)) {
                    const ae = document.activeElement;
                    if (ae && ae !== document.body) {
                        if (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA') {
                            // For inputs, open/select
                            try { ae.click(); } catch (_) { /* no-op */ }
                        } else {
                            this._click(ae);
                        }
                    }
                    this._updateHud();
                }

                // LB/RB shortcuts
                const lbEdge = this._buttonEdge(state, pad, LB);
                const rbEdge = this._buttonEdge(state, pad, RB);

                // LB/RB: cycle stats tabs if stats modal open
                const statsModal = document.getElementById('stats-modal');
                if ((lbEdge || rbEdge) && this._isVisible(statsModal)) {
                    const tabs = Array.from(statsModal.querySelectorAll('.stats-tab'));
                    if (tabs.length) {
                        const active = tabs.findIndex(t => t.classList.contains('active'));
                        const dir = rbEdge ? 1 : -1;
                        const next = (active < 0 ? 0 : (active + dir + tabs.length) % tabs.length);
                        this._click(tabs[next]);
                        return;
                    }
                }

                // LB/RB: page scroll in the current active root (good for long lists/pickers)
                if ((lbEdge || rbEdge) && !this._isVisible(statsModal)) {
                    const dir = rbEdge ? 1 : -1;
                    if (this._pageScroll(dir, root)) {
                        if (window.Sound && typeof window.Sound.tick === 'function') window.Sound.tick();
                        return;
                    }
                }

                // Navigation (D-pad + left stick)
                const dpadDir = this._buttonEdge(state, pad, DL) ? 'left'
                    : this._buttonEdge(state, pad, DR) ? 'right'
                    : this._buttonEdge(state, pad, DU) ? 'up'
                    : this._buttonEdge(state, pad, DD) ? 'down'
                    : null;
                const stickDir = this._axisDir(pad);
                const dir = dpadDir || stickDir;
                if (dir) {
                    const isNew = state.heldDir !== dir;
                    if (isNew) {
                        state.heldDir = dir;
                        state.nextRepeatAt = now + 260;
                        state.lastDirAt = now;
                        this._moveFocus(dir);
                        this._updateHud();
                    } else if (now >= state.nextRepeatAt) {
                        state.nextRepeatAt = now + 110;
                        this._moveFocus(dir);
                        this._updateHud();
                    }
                } else {
                    state.heldDir = null;
                }
            }
        };

        document.addEventListener('DOMContentLoaded', () => {
            updateTopbarCssVars();
            window.addEventListener('resize', updateTopbarCssVars);

            // PWA: service worker (app shell cache)
            try {
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
                }
            } catch (_) { /* no-op */ }

            // Xbox/TV gamepad navigation layer
            window.GamepadManager?.init?.();

            // Accessibility: role=button elements should activate with Enter/Space
            document.addEventListener('keydown', (e) => {
                const key = e.key;
                if (key !== 'Enter' && key !== ' ') return;
                const el = document.activeElement;
                if (!el) return;
                if (el.getAttribute && el.getAttribute('role') === 'button') {
                    e.preventDefault();
                    try { el.click(); } catch (_) { /* no-op */ }
                }
            }, true);

            // Ensure WebAudio is resumed on a real user gesture (fix: missing global button sounds)
            const resumeAudio = () => {
                try {
                    if (window.Sound && typeof window.Sound.init === 'function') {
                        window.Sound.init();
                    }
                } catch (_) { /* no-op */ }
            };
            document.addEventListener('pointerdown', resumeAudio, { capture: true, once: true });
            document.addEventListener('touchstart', resumeAudio, { capture: true, once: true });
            document.addEventListener('keydown', resumeAudio, { capture: true, once: true });
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) resumeAudio();
            });

            // Global haptics + subtle tick: every click gets a light tap and a soft tick
            document.addEventListener('click', (e) => {
                resumeAudio();
                Haptics.tap();
                const target = e.target;
                if (target && (target.closest('button, a, [role="button"], .compare-btn, .stats-tab'))) {
                    Sound.tick();
                }
            }, true);
            // Select changes also produce a light feedback
            document.addEventListener('change', (e) => {
                if (e.target && (e.target.matches('select') || e.target.matches('input[type="checkbox"], input[type="radio"]'))) {
                    Sound.tick();
                    Haptics.vibrate(16);
                }
            }, true);
            let lastRangeHaptic = 0;
            document.addEventListener('input', (e) => {
                if (e.target && e.target.matches('input[type="range"]')) {
                    const t = performance.now();
                    if (t - lastRangeHaptic > 60) {
                        lastRangeHaptic = t;
                        Haptics.vibrate(18);
                    }
                }
            }, true);
            // Hero title on Step 1 vs compact top bar on other screens
            const step1 = document.getElementById('step1-screen');
            const step2 = document.getElementById('step2-screen');
            const drawing = document.getElementById('drawing-screen');

            const updateTopbarMenuOffsetForStep2 = () => {
                const btn = document.getElementById('sidebar-open-btn');
                const left = document.getElementById('topbar-left');
                const app = document.getElementById('app-container');
                if (!btn || !left || !step2) return;

                // Ensure the button stays in the left container (single instance).
                if (btn.parentElement !== left) left.insertBefore(btn, left.firstChild);

                const isStep2Visible = !step2.classList.contains('hidden');
                const isDrawingVisible = drawing && !drawing.classList.contains('hidden');

                // On match params screen: align menu button X with the panel's left inset.
                // Do not measure animating elements (animate-pop uses transforms).
                const shouldOffset = isStep2Visible && !isDrawingVisible;
                if (!shouldOffset) {
                    btn.style.marginLeft = '';
                    return;
                }

                btn.style.marginLeft = '0px';

                const leftRect = left.getBoundingClientRect();
                const appRect = app ? app.getBoundingClientRect() : leftRect;

                // Tailwind max-w-5xl = 64rem = 1024px (assuming 16px root).
                const maxPanelWidth = 1024;
                const panelWidth = Math.min(appRect.width, maxPanelWidth);
                const panelLeft = appRect.left + (appRect.width - panelWidth) / 2;

                // "Wróć" is positioned with left-4 => 16px.
                const targetLeft = panelLeft + 16;
                const desired = Math.round(targetLeft - leftRect.left);
                btn.style.marginLeft = `${desired}px`;
            };

            const updateTitleMode = () => {
                if (!step1) return;
                const isStep1Visible = !step1.classList.contains('hidden');
                const isStep2Visible = step2 && !step2.classList.contains('hidden');
                const isDrawingVisible = drawing && !drawing.classList.contains('hidden');
                document.body.classList.toggle('is-step1', isStep1Visible);
                document.body.classList.toggle('is-step2', isStep2Visible && !isDrawingVisible);
                updateTopbarMenuOffsetForStep2();
            };
            updateTitleMode();
            if (step1) {
                const observer = new MutationObserver(updateTitleMode);
                observer.observe(step1, { attributes: true, attributeFilter: ['class'] });
            }

            // Also react when Step 2 / Drawing screen visibility changes.
            if (step2) {
                const observer2 = new MutationObserver(updateTopbarMenuOffsetForStep2);
                observer2.observe(step2, { attributes: true, attributeFilter: ['class'] });
            }
            if (drawing) {
                const observer3 = new MutationObserver(updateTopbarMenuOffsetForStep2);
                observer3.observe(drawing, { attributes: true, attributeFilter: ['class'] });
            }

            window.addEventListener('resize', updateTopbarMenuOffsetForStep2);

            Settings.init();
            ManualSelect.init();
            document.getElementById('reset-btn').onclick=()=>{Sound.click();PostMatchMenu.newSquads();};
            ['min-stars','max-stars'].forEach(id=>{document.getElementById(id).addEventListener('input',(e)=>{Sound.click();const v=parseFloat(e.target.value);if(id==='min-stars'){AppState.minStars=v;document.getElementById('min-stars-value').textContent=v.toFixed(1);}else{AppState.maxStars=v;document.getElementById('max-stars-value').textContent=v.toFixed(1);}PlayerManager.saveCurrentState();});});
            const updReroll=()=>{document.getElementById('rerolls-value').textContent=AppState.rerollSettings;PlayerManager.saveCurrentState();};
            document.getElementById('reroll-minus-btn').addEventListener('click',()=>{if(AppState.rerollSettings>0)AppState.rerollSettings--;updReroll();Sound.click();});
            document.getElementById('reroll-plus-btn').addEventListener('click',()=>{if(AppState.rerollSettings<10)AppState.rerollSettings++;updReroll();Sound.click();});
            document.getElementById('league-filters').addEventListener('click',(e)=>{if(e.target.classList.contains('league-btn')){document.querySelectorAll('.league-btn').forEach(b=>b.classList.remove('active'));e.target.classList.add('active');AppState.selectedLeague=e.target.dataset.league;Sound.click();PlayerManager.saveCurrentState();}});
            document.getElementById('start-drawing-btn').onclick = () => {
                Sound.click();
                
                const n1 = AppState.playersTeam1.join(' & ');
                const n2 = AppState.playersTeam2.join(' & ');
                
                // 1. POKAZUJEMY EKRAN
                document.getElementById('step2-screen').classList.add('hidden');
                document.getElementById('drawing-screen').classList.remove('hidden');
                document.body.classList.add('is-drawing');
                document.body.classList.remove('has-results');
                // Reposition actions between panels on mobile, and below on desktop
                positionActionsRow();

                // Wymuś start panelu u góry (żeby topbar nie ucinał nagłówka)
                requestAnimationFrame(() => {
                    safeScrollToEl(document.getElementById('drawing-screen'), 'auto');
                });
                
                const p1El = document.getElementById('p1-name-display');
                const p2El = document.getElementById('p2-name-display');
                
                // 2. FUNKCJA FIT-TEXT (Zoptymalizowana)
                const fitText = (el, text, colorClass, alignClass) => {
                    el.innerText = text;
                    el.style.display = 'inline-block';
                    el.style.width = 'auto';
                    el.style.fontSize = '44px';
                    el.className = `${alignClass} ${colorClass} font-black uppercase tracking-tighter drop-shadow-md leading-tight whitespace-nowrap px-1 transition-none`;

                    // Margines 5px zamiast 20px, aby tekst był bliżej H2H
                    const maxWidth = el.parentElement.clientWidth - 5;
                    let size = 44;
                    // Zmniejszaj czcionkę, aż nazwa w pełni mieści się w 1 linii
                    while (el.offsetWidth > maxWidth && size > 8) {
                        size -= 1;
                        el.style.fontSize = size + 'px';
                    }

                    // Finalizuj: pełna szerokość bez obcinania (bez truncate)
                    el.style.display = 'block';
                    el.style.width = '100%';
                    el.classList.remove('truncate');
                };

                // NAPRAWA: Czekamy jeden cykl odświeżania (Frame), aż przeglądarka przeliczy szerokość kontenerów
                requestAnimationFrame(() => {
                    fitText(p1El, n1, 'text-blue-300', 'text-left');
                    fitText(p2El, n2, 'text-red-300', 'text-right');
                });
                
                window.PlayerManager.updateH2H();
                
                document.getElementById('alt-header-1').innerText = `Gdybyś losował dalej (${n1})`;
                document.getElementById('alt-header-2').innerText = `Gdybyś losował dalej (${n2})`;
                
                document.getElementById('abort-draw-btn').classList.remove('hidden');
                // Na ekranie losowania przyciski ręcznego wyboru mają być widoczne
                const mb1 = document.getElementById('manual-btn-1');
                const mb2 = document.getElementById('manual-btn-2');
                if (mb1) mb1.classList.remove('hidden');
                if (mb2) mb2.classList.remove('hidden');
            };

            // Keep actions row between panels on mobile without changing desktop layout
            function positionActionsRow() {
                const actions = document.getElementById('actions-row');
                const grid = document.getElementById('panels-grid');
                const w1 = document.getElementById('wrapper-t1');
                const isMobile = window.matchMedia('(max-width: 767px)').matches;
                if (!actions || !grid || !w1) return;
                if (isMobile) {
                    // Wepnij actions bezpośrednio po wrapper-t1 (gwarancja pozycji)
                    if (actions.parentElement !== grid || actions.previousElementSibling !== w1) {
                        grid.insertBefore(actions, w1.nextSibling);
                    }
                    actions.classList.add('order-2');
                } else {
                    // place actions below the grid
                    if (grid.nextElementSibling !== actions) {
                        grid.after(actions);
                    }
                    actions.classList.remove('order-2');
                }
            }
            window.addEventListener('resize', positionActionsRow);
            
            PlayerManager.bindActionButtons();

            document.getElementById('draw-teams-btn').onclick=async function(){
                this.disabled=true; this.classList.add('opacity-50','hidden'); Sound.drawStart();
                // Ukryj ręczny wybór po rozpoczęciu losowania
                const mb1 = document.getElementById('manual-btn-1');
                const mb2 = document.getElementById('manual-btn-2');
                if (mb1) mb1.classList.add('hidden');
                if (mb2) mb2.classList.add('hidden');
                ['team1-panel','team2-panel'].forEach(id=>{ const el=document.getElementById(id); el.classList.add('pulse-once'); setTimeout(()=>el.classList.remove('pulse-once'), 400); });
                window.abortController.aborted = false; 

                AppState.rerolls.p1 = AppState.rerollSettings; 
                AppState.rerolls.p2 = AppState.rerollSettings;
                
                let t1 = AppState.finalTeam1;
                let t2 = AppState.finalTeam2;
                
                const p = window.PlayerManager.getFilteredPool(true);
                if(p.length < 2){ DataManager.showToast("Za mało drużyn do wylosowania!", 'error'); this.disabled=false; this.classList.remove('opacity-50'); return; }
                
                if (!t1) {
                    const pool1 = t2 ? p.filter(x => x.name !== t2.name) : p;
                    t1 = pool1[Math.floor(Math.random() * pool1.length)];
                }
                
                if (!t2) {
                    const pool2 = p.filter(x => x.name !== t1.name);
                    t2 = pool2[Math.floor(Math.random() * pool2.length)];
                }

                AppState.finalTeam1 = t1; 
                AppState.finalTeam2 = t2;
                
                const promises = [];
                if (!document.getElementById('team1-panel').classList.contains('team-card-dynamic')) {
                    promises.push(runRouletteGlobal('team1-panel', t1, p));
                }
                
                if (!document.getElementById('team2-panel').classList.contains('team-card-dynamic')) {
                    promises.push(runRouletteGlobal('team2-panel', t2, p));
                }

                await Promise.all(promises);

                if(window.abortController.aborted) return;
                
                if(AppState.usedTeams.includes(t1.name)) { AppState.rerolls.p1++; DataManager.showToast("Drużyna 1 Spalona: Zwrot losu"); }
                if(AppState.usedTeams.includes(t2.name)) { AppState.rerolls.p2++; DataManager.showToast("Drużyna 2 Spalona: Zwrot losu"); }
                
                Sound.drawWin();
                this.classList.add('hidden'); 
                document.getElementById('manual-btn-1').classList.add('hidden');
                document.getElementById('manual-btn-2').classList.add('hidden');
                
                document.getElementById('team1-actions').classList.remove('hidden'); 
                document.getElementById('team2-actions').classList.remove('hidden');
                window.PlayerManager.checkBurnt(1, t1); 
                window.PlayerManager.checkBurnt(2, t2);
                
                window.PlayerManager.bindActionButtons();
            };
        });
    