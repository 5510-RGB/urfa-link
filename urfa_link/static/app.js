document.addEventListener('DOMContentLoaded', () => {

    // URL Tespiti: 3 ortam desteklenir
    // 1) Yerel geliştirme (localhost:8000) → göreceli URL
    // 2) Canlı web (urfa-link.onrender.com) → göreceli URL
    // 3) Mobil uygulama (Capacitor, localhost:80/443/boş port) → mutlak Render URL
    const PRODUCTION_HOST = 'urfa-link-h6c7.onrender.com';
    // Detect Capacitor correctly
    const isCapacitor = window.hasOwnProperty('Capacitor');
    const isLocalDev = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '' && window.location.port !== '80' && window.location.port !== '443';
    const isProductionWeb = window.location.hostname === PRODUCTION_HOST;
    
    // If it's Capacitor, we ALWAYS want to use the absolute URL to our production backend
    const useRelativeUrl = (isLocalDev || isProductionWeb) && !isCapacitor;
    
    const API_BASE_URL = useRelativeUrl ? '' : 'https://' + PRODUCTION_HOST;
    const WS_BASE_URL = useRelativeUrl
        ? ((window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host)
        : 'wss://' + PRODUCTION_HOST;

    console.log("Environment Detection:", { isCapacitor, isLocalDev, isProductionWeb, useRelativeUrl, API_BASE_URL });

    const originalFetch = window.fetch;
    window.fetch = function() {
        let args = Array.prototype.slice.call(arguments);
        if (typeof args[0] === 'string' && args[0].startsWith('/')) {
            args[0] = API_BASE_URL + args[0];
        }
        return originalFetch.apply(this, args);
    };

    let authToken = null; // Basic token simulation
    let currentUserId = null;
    let ws = null; // WebSocket Connection
    let currentChatPeerId = null;
    let map = null; // Leaflet map instance
    let markers = []; // Array to store map markers

    // Register Elements
    const registerForm = document.getElementById('registerForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btn-text');
    const spinner = document.getElementById('spinner');
    const errorMsg = document.getElementById('error-msg');

    // Login Elements
    const loginForm = document.getElementById('loginForm');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const loginBtnText = document.getElementById('login-btn-text');
    const loginSpinner = document.getElementById('login-spinner');
    const loginErrorMsg = document.getElementById('login-error-msg');

    // Views
    const registerView = document.getElementById('register-view');
    const loginView = document.getElementById('login-view');
    const forgotView = document.getElementById('forgot-view');
    const matchesView = document.getElementById('matches-view');
    const matchesContainer = document.getElementById('matches-container');
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('main-app-container');

    // Navigation Buttons
    const showLoginBtn = document.getElementById('showLoginBtn');
    const showRegisterBtn = document.getElementById('showRegisterBtn');
    const showForgotBtn = document.getElementById('showForgotBtn');
    const backToLoginBtn = document.getElementById('backToLoginBtn');

    // Bottom Nav Elements
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    // Profile Elements
    const profileName = document.getElementById('profile-name');
    const profileBio = document.getElementById('profile-bio');
    const logoutBtn = document.getElementById('logoutBtn');
    const locateMeBtn = document.getElementById('locateMeBtn');
    const avatarUploadContainer = document.getElementById('avatarUploadContainer');
    const avatarUpload = document.getElementById('avatarUpload');
    const profileAvatarImg = document.getElementById('profile-avatar-img');
    const editProfileBtn = document.getElementById('editProfileBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const locateMeBtnSettings = document.getElementById('locateMeBtnSettings');
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');

    // Edit Profile Modal Elements
    const editProfileOverlay = document.getElementById('edit-profile-overlay');
    const closeEditProfileBtn = document.getElementById('closeEditProfileBtn');
    const editProfileForm = document.getElementById('editProfileForm');
    const saveProfileSpinner = document.getElementById('save-profile-spinner');
    const saveProfileText = document.getElementById('save-profile-text');
    const saveProfileBtn = document.getElementById('saveProfileBtn');

    // Chat Overlay Elements
    const chatOverlay = document.getElementById('chat-overlay');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const chatPeerName = document.getElementById('chat-peer-name');
    const chatMessagesContainer = document.getElementById('chat-messages-container');
    const chatInput = document.getElementById('chat-input');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const attachImageBtn = document.getElementById('attachImageBtn');
    const chatImageUpload = document.getElementById('chatImageUpload');

    // Messages Tab Elements
    const messagesTabContainer = document.getElementById('tab-messages');

    // === CRITICAL: AUTH VIEW SWITCHING (Must be first and guarded) ===
    const switchAuthView = (hideView, showView) => {
        if (!hideView || !showView) return;
        hideView.classList.remove('active');
        setTimeout(() => {
            hideView.classList.add('hidden');
            showView.classList.remove('hidden');
            setTimeout(() => showView.classList.add('active'), 50);
        }, 300);
    };

    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchAuthView(registerView, loginView);
        });
    }

    if (showRegisterBtn) {
        showRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchAuthView(loginView, registerView);
        });
    }

    if (showForgotBtn) {
        showForgotBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof showForgotPasswordView === 'function') showForgotPasswordView();
        });
    }

    const reset1 = document.getElementById('backToLoginFromReset1');
    if (reset1) reset1.addEventListener('click', (e) => { e.preventDefault(); switchAuthView(forgotView, loginView); });

    const reset2 = document.getElementById('backToLoginFromReset2');
    if (reset2) reset2.addEventListener('click', (e) => { e.preventDefault(); switchAuthView(forgotView, loginView); });


    // Helper: Enter App
    function enterApp(userId, userData, matchData) {
        currentUserId = userId;
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');

        // Setup Profile Tab
        if (userData && userData.name) profileName.textContent = userData.name;
        if (userData && userData.bio) profileBio.textContent = userData.bio;
        
        // Sync status
        if (userData && userData.daily_status !== undefined) {
             updateStatusUI(userData.daily_status);
        }
        
        if (userData && userData.story_image) {
            window.currentUserStory = userData.story_image;
        }

        // Auto-Location Start
        setTimeout(() => {
            updateMyLocation(); // One manual run to set view
            startAutoGps();     // Then watch in background
        }, 1000);

        // Handle Profile Image if returned on login/register
        if (userData && userData.profile_image) {
            profileAvatarImg.src = userData.profile_image;
            window.currentUserAvatar = userData.profile_image;
        } else {
            profileAvatarImg.src = `https://i.pravatar.cc/150?u=${userId}`;
            window.currentUserAvatar = `https://i.pravatar.cc/150?u=${userId}`;
        }

        renderMatches(matchData);
        loadActiveChats(); // Load Chats for the Message tab
        initWebSocket();
        loadUserStats(); // Fetch follower stats
        initMap(matchData);

        // Phase 14: Request Push Notification Permissions
        if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    console.log("Bildirim izni verildi.");
                }
            });
        }

        // Phase 15: Handle Admin Nav
        const adminBtn = document.getElementById('nav-admin-btn');
        if (adminBtn) {
            if (userData && userData.is_admin) {
                adminBtn.classList.remove('hidden');
            } else {
                adminBtn.classList.add('hidden');
            }
        }
    }

    // Load Profile Stats (Followers, Following, Mutual)
    async function loadUserStats() {
        if (!currentUserId) return;
        try {
            const req = await fetch(`/users/${currentUserId}/stats`);
            if (req.ok) {
                const stats = await req.json();
                const followersEl = document.getElementById('stat-followers');
                const followingEl = document.getElementById('stat-following');
                const mutualEl = document.getElementById('stat-mutual');

                if (followersEl) followersEl.textContent = stats.followers_count;
                if (followingEl) followingEl.textContent = stats.following_count;
                if (mutualEl) mutualEl.textContent = stats.mutual_count;
            }
        } catch (err) {
            console.error("İstatistikler yüklenemedi:", err);
        }
    }

    // Helper: Init Leaflet Map
    function initMap(matchData) {
        if (!map) {
            // Initialize map targeting the 'map' div, default to Urfa coordinates
            map = L.map('map').setView([37.1611, 38.7969], 10);

            // Set up the OSM layer
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap'
            }).addTo(map);

            // Invalidate size when tab becomes visible
            const mapTab = document.querySelector('[data-tab="tab-map"]');
            if (mapTab) {
                mapTab.addEventListener('click', () => {
                    setTimeout(() => { map.invalidateSize(); }, 200);
                });
            }

            const locBtn = document.getElementById('locateMeBtnSettings');
            if (locBtn) locBtn.addEventListener('click', updateMyLocation);
        }

        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        // Add Self Pin
        if (window.currentUserLat && window.currentUserLng) {
            const myLat = window.currentUserLat;
            const myLng = window.currentUserLng;
            const avatarUrl = window.currentUserAvatar || `https://i.pravatar.cc/100?u=${currentUserId}`;
            
            const hasStory = !!window.currentUserStory;
            const ringClass = hasStory ? 'story-ring' : '';
            
            const selfIcon = L.divIcon({
                className: 'custom-map-marker self-marker',
                html: `
                    <div class="${ringClass}" style="width: 46px; height: 46px; display:flex; align-items:center; justify-content:center; border: 2px solid var(--primary-color); border-radius: 50%; box-shadow: 0 0 10px rgba(255, 61, 0, 0.5); background: #000;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; border: 2px solid #000;">
                            <img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;">
                        </div>
                    </div>
                `,
                iconSize: [46, 46],
                iconAnchor: [23, 23]
            });
            
            const selfMarker = L.marker([myLat, myLng], { icon: selfIcon }).addTo(map);
            selfMarker.bindPopup(`
                <div style="text-align:center; min-width:120px; padding: 10px 5px; font-family: 'Outfit', sans-serif;">
                    <div style="font-size: 1.1rem; font-weight: 700; color: #fff; margin-bottom: 5px; letter-spacing: 0.5px;">Ben</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">Şu anki konumunuz</div>
                </div>
            `, { className: 'custom-leaflet-popup' });
            markers.push(selfMarker);
        }

        // Add pins for matches
        if (matchData && matchData.length > 0) {
            // For simulation: Generate slight random offset for matches since we don't return their exact lat/lng in MatchResult yet
            // If the backend returns actual coordinates, use them instead. 
            const baseLat = 37.1611;
            const baseLng = 38.7969;

            matchData.forEach(match => {
                // Simulate coordinates within 20km for demo purposes
                const lat = baseLat + (Math.random() - 0.5) * 0.2;
                const lng = baseLng + (Math.random() - 0.5) * 0.2;

                const avatarUrl = match.profile_image ? match.profile_image : `https://i.pravatar.cc/100?u=${match.matched_user_id}`;

                // Custom Icon with Profile Picture + Story Ring if exists
                const hasStory = !!match.story_image;
                const ringClass = hasStory ? 'story-ring' : '';
                
                const customIcon = L.divIcon({
                    className: 'custom-map-marker',
                    html: `
                        <div class="${ringClass}" style="width: 46px; height: 46px; display:flex; align-items:center; justify-content:center;">
                            <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; border: 2px solid #000;">
                                <img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;">
                            </div>
                        </div>
                    `,
                    iconSize: [46, 46],
                    iconAnchor: [23, 23]
                });

                const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
                const statusBubble = match.daily_status ? `<div style="background:var(--accent-glow);color:#000;font-size:0.7rem;padding:3px 8px;border-radius:10px;margin:5px 0;">💬 ${match.daily_status}</div>` : '';
                
                const watchStoryBtn = hasStory ? `<button onclick="window.viewStory('${match.story_image}', '${match.matched_user_name}', '${avatarUrl}')" style="margin-top: 5px; background: linear-gradient(45deg, #f09433, #bc1888); color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; width:100%;">📸 Hikayeyi İzle</button>` : '';

                marker.bindPopup(`
                    <div style="text-align:center; min-width:160px; padding: 10px 5px; font-family: 'Outfit', sans-serif;">
                        <div style="font-size: 1.1rem; font-weight: 700; color: #fff; margin-bottom: 8px; letter-spacing: 0.5px;">${match.matched_user_name}</div>
                        ${statusBubble ? `<div style="background: rgba(57, 211, 83, 0.15); color: #39d353; font-size: 0.8rem; padding: 6px 12px; border-radius: 20px; margin-bottom: 12px; border: 1px solid rgba(57, 211, 83, 0.3); display: inline-block;">${statusBubble}</div>` : ''}
                        <div style="margin-bottom: 12px;">
                            ${watchStoryBtn}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 10px; display: flex; align-items: center; justify-content: center; gap: 5px;">
                             <span>📍</span> ${(match.distance_km).toFixed(1)} km uzakta • %${(match.similarity_score * 100).toFixed(0)} Uyum
                        </div>
                        <button onclick="window.openChat('${match.matched_user_id}', '${match.matched_user_name}')" 
                                style="width: 100%; background: var(--primary-color); color: white; border: none; padding: 10px; border-radius: 12px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 15px rgba(255, 61, 0, 0.3); transition: all 0.3s ease;">
                            Mesaj Gönder
                        </button>
                    </div>
                `, { className: 'custom-leaflet-popup' });
                markers.push(marker);
            });
        }
    }

    // Geolocation API
    async function updateMyLocation(silent = false) {
        if (!navigator.geolocation || !currentUserId) return;

        const btn = document.getElementById('locateMeBtnSettings');
        const originalText = btn ? btn.innerText : '';
        if (btn && !silent) {
            btn.innerText = 'Konum Bulunuyor...';
            btn.disabled = true;
        }

        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            window.currentUserLat = lat;
            window.currentUserLng = lng;
            
            try {
                await fetch('/users/update-location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: currentUserId,
                        latitude: lat,
                        longitude: lng
                    })
                });
                if (window.showToast && !silent) window.showToast('Konum güncellendi');
            } catch (e) {
                console.error('Konum güncellenemedi:', e);
            }

            if (map) {
                map.setView([lat, lng], 13);
                loadMatches();
            }
            
            if (btn && !silent) {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        }, (error) => {
            console.error('Konum hatası:', error);
            if (btn && !silent) {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    }

    // === Background Auto-GPS Logic ===
    let gpsWatcher = null;
    function startAutoGps() {
        if (!navigator.geolocation || !currentUserId) return;
        
        console.log("Auto-GPS Başlatıldı.");
        if (gpsWatcher) navigator.geolocation.clearWatch(gpsWatcher);
        
        gpsWatcher = navigator.geolocation.watchPosition(async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            
            window.currentUserLat = lat;
            window.currentUserLng = lng;
            
            try {
                await fetch('/users/update-location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: currentUserId,
                        latitude: lat,
                        longitude: lng
                    })
                });
                console.log("Auto-GPS: Konum güncellendi.");
                if (map) loadMatches();
            } catch (err) { console.error("Auto-GPS update failed", err); }
        }, (err) => console.error("GPS Watch Error:", err), {
            enableHighAccuracy: true,
            maximumAge: 60000,
            timeout: 27000
        });
    }

    // Helper: Logout
    function logout() {
        if (ws) ws.close();
        currentUserId = null;

        appContainer.classList.add('hidden');
        authContainer.classList.remove('hidden');
        
        // Reset to initial auth view
        if (typeof switchAuthView === 'function') {
            switchAuthView(registerView, loginView);
        } else {
            registerView.classList.add('hidden');
            loginView.classList.remove('hidden');
            loginView.classList.add('active');
        }

        if (registerForm) registerForm.reset();
        if (loginForm) loginForm.reset();

        // Reset tabs to default home
        navItems.forEach(nb => nb.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.add('hidden'));
        
        const homeTab = document.querySelector('[data-tab="tab-home"]');
        if (homeTab) homeTab.classList.add('active');
        const homeView = document.getElementById('tab-home');
        if (homeView) homeView.classList.remove('hidden');
    }

    // Tab Navigation Logic
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class from all buttons and content
            navItems.forEach(nb => nb.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.add('hidden'));

            // Activate clicked tab
            item.classList.add('active');
            const targetId = item.getAttribute('data-tab');
            document.getElementById(targetId).classList.remove('hidden');

            if (targetId === 'tab-admin') {
                loadAdminDashboard();
            }
        });
    });

    // Admin Dashboard Logic
    async function loadAdminDashboard() {
        if (!currentUserId) return;

        try {
            // Load Stats
            const statsReq = await fetch(`/admin/stats/${currentUserId}`);
            if (statsReq.ok) {
                const stats = await statsReq.json();
                const statsGrid = document.getElementById('admin-stats-grid');
                if (statsGrid) {
                    statsGrid.innerHTML = `
                        <div class="admin-stat-card"><h3>${stats.total_users}</h3><p>Kullanıcı</p></div>
                        <div class="admin-stat-card"><h3>${stats.total_matches}</h3><p>Eşleşme</p></div>
                        <div class="admin-stat-card"><h3>${stats.total_messages}</h3><p>Mesaj</p></div>
                    `;
                }
            }

            // Load Users
            const usersReq = await fetch(`/admin/users/${currentUserId}`);
            if (usersReq.ok) {
                const users = await usersReq.json();
                const usersContainer = document.getElementById('admin-users-container');
                if (usersContainer) {
                    usersContainer.innerHTML = '';
                    users.forEach(u => {
                        usersContainer.innerHTML += `
                            <div class="admin-user-row">
                                <div class="admin-user-info">
                                    <h4>${u.name} ${u.is_admin ? '<span style="color:var(--primary-color)">(Admin)</span>' : ''}</h4>
                                    <p>ID: ${u.id.substring(0, 8)}... | Tel: ${u.phone}</p>
                                </div>
                                ${!u.is_admin ? `<button class="btn-danger" onclick="window.deleteUser('${u.id}')">Sil</button>` : ''}
                            </div>
                        `;
                    });
                }
            }
        } catch (error) {
            console.error("Admin paneli yüklenemedi:", error);
        }
    }

    window.deleteUser = async function (targetId) {
        if (!confirm("Bu kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;

        try {
            const req = await fetch(`/admin/user/${currentUserId}/${targetId}`, {
                method: 'DELETE'
            });
            if (req.ok) {
                alert("Kullanıcı başarıyla silindi.");
                loadAdminDashboard(); // refresh list
            } else {
                const res = await req.json();
                alert(res.detail || "Silme başarısız.");
            }
        } catch (err) {
            console.error(err);
            alert("Silme işlemi sırasında hata oluştu.");
        }
    };

    // Profile Avatar Upload Logic
    if (avatarUploadContainer && avatarUpload) {
        avatarUploadContainer.addEventListener('click', () => {
            avatarUpload.click();
        });

        avatarUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !currentUserId) return;

            const formData = new FormData();
            formData.append('file', file);

            // Add loading feedback (simple overlay text update)
            const overlaySpan = avatarUploadContainer.querySelector('.avatar-overlay span');
            const origText = overlaySpan.innerText;
            overlaySpan.innerText = "⏳ Yükleniyor...";
            avatarUploadContainer.style.opacity = '0.7';

            try {
                const req = await fetch(`/users/${currentUserId}/upload-profile-image`, {
                    method: 'POST',
                    body: formData
                });

                if (!req.ok) throw new Error("Yükleme başarısız.");
                const res = await req.json();

                // Update Image
                profileAvatarImg.src = res.profile_image;
                window.currentUserAvatar = profileAvatarImg.src;
                alert("Profil fotoğrafınız başarıyla güncellendi!");

            } catch (err) {
                console.error(err);
                alert("Resim yüklenirken bir hata oluştu: " + err.message);
            } finally {
                overlaySpan.innerText = origText;
                avatarUploadContainer.style.opacity = '1';
                // Reset input so the same file can be chosen again if needed
                avatarUpload.value = "";
            }
        });
    }

    // Story Upload Logic
    const addStoryBtn = document.getElementById('addStoryBtn');
    const storyUpload = document.getElementById('storyUpload');

    if (addStoryBtn && storyUpload) {
        addStoryBtn.addEventListener('click', () => {
            storyUpload.click();
        });

        storyUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !currentUserId) return;

            const formData = new FormData();
            formData.append('file', file);

            addStoryBtn.innerText = "⏳ Yükleniyor...";
            addStoryBtn.disabled = true;

            try {
                const req = await fetch(`/users/${currentUserId}/upload-story`, {
                    method: 'POST',
                    body: formData
                });

                if (!req.ok) throw new Error("Yükleme başarısız.");
                const res = await req.json();

                window.currentUserStory = res.story_image; // Cache for self-marker
                alert("Hikayeniz başarıyla paylaşıldı! Haritada renkli halka ile görünecek.");
                loadMatches(); // Refresh map to show story ring

            } catch (err) {
                console.error(err);
                alert("Hikaye yüklenirken bir hata oluştu: " + err.message);
            } finally {
                addStoryBtn.innerText = "📸 Hikaye";
                addStoryBtn.disabled = false;
                storyUpload.value = "";
            }
        });
    }

    // === Settings Modal Logic ===
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsOverlay.classList.remove('hidden');
        });
    }

    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsOverlay.classList.add('hidden');
        });
    }

    if (locateMeBtnSettings) {
        locateMeBtnSettings.addEventListener('click', () => {
            updateMyLocation();
            settingsOverlay.classList.add('hidden');
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm("Çıkış yapmak istediğinize emin misiniz?")) {
                logout();
                settingsOverlay.classList.add('hidden');
            }
        });
    }

    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async () => {
            if (!confirm("HESAP SİLME: Tüm verileriniz, mesajlarınız ve fotoğraflarınız KALICI olarak silinecek. Emin misiniz?")) return;
            const secondConfirm = confirm("Son bir kez soruyoruz, bu işlemin geri dönüşü yok. Devam edilsin mi?");
            if (!secondConfirm) return;

            try {
                const req = await fetch(`/users/${currentUserId}`, { method: 'DELETE' });
                if (req.ok) {
                    alert("Hesabınız silindi. Sizi özleyeceğiz...");
                    logout();
                }
            } catch (err) {
                console.error("Account deletion failed", err);
            }
        });
    }

    // Edit Profile Form Logic
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            // Populate inputs with current UI data
            document.getElementById('edit_name').value = profileName.textContent || "";
            const bioText = profileBio.textContent;
            document.getElementById('edit_bio').value = bioText === "Biyografi yükleniyor..." ? "" : bioText;
            
            // Populate Daily Status
            const statusText = document.getElementById('profile-status-text').textContent;
            document.getElementById('edit_status').value = statusText;

            editProfileOverlay.classList.remove('hidden');
        });

        closeEditProfileBtn.addEventListener('click', () => {
            editProfileOverlay.classList.add('hidden');
        });

        editProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUserId) return;

            saveProfileText.classList.add('hidden');
            saveProfileSpinner.classList.remove('hidden');
            saveProfileBtn.disabled = true;

            const payload = {
                name: document.getElementById('edit_name').value,
                district: document.getElementById('edit_district').value,
                education: document.getElementById('edit_education').value,
                bio: document.getElementById('edit_bio').value,
                daily_status: document.getElementById('edit_status').value
            };

            try {
                const req = await fetch(`/users/${currentUserId}/profile`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!req.ok) {
                    const resError = await req.json();
                    throw new Error(resError.detail || "Profil güncellenemedi.");
                }

                const res = await req.json();

                // Update UI visually
                profileName.textContent = res.name;
                profileBio.textContent = res.bio;
                updateStatusUI(res.daily_status);

                alert("Profiliniz başarıyla güncellendi!");
                editProfileOverlay.classList.add('hidden');

            } catch (err) {
                console.error(err);
                alert("Hata: " + err.message);
            } finally {
                saveProfileText.classList.remove('hidden');
                saveProfileSpinner.classList.add('hidden');
                saveProfileBtn.disabled = false;
            }
        });
    }

    // === Forgot Password Elements & View (Restored) ===
    const forgotFormStep1 = document.getElementById('forgotPasswordFormStep1');
    const forgotFormStep2 = document.getElementById('forgotPasswordFormStep2');
    const resetSubtitle = document.getElementById('resetSubtitle');
    const resetPhoneInput = document.getElementById('reset_phone');
    const resetOtpInput = document.getElementById('reset_otp');
    const newPasswordInput = document.getElementById('new_password');
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');

    function showForgotPasswordView() {
        if (forgotFormStep1) forgotFormStep1.classList.remove('hidden');
        if (forgotFormStep2) forgotFormStep2.classList.add('hidden');
        if (resetSubtitle) resetSubtitle.textContent = "Telefon numaranızı girerek şifrenizi sıfırlayabilirsiniz.";
        if (forgotFormStep1) forgotFormStep1.reset();
        if (forgotFormStep2) forgotFormStep2.reset();
        switchAuthView(loginView, forgotView);
    }

    // Helper: Logout (Refactored)
    window.logout = logout; 

    // Step 1: Send OTP
    if (forgotFormStep1) {
        forgotFormStep1.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = resetPhoneInput.value;
            if (sendOtpBtn) sendOtpBtn.disabled = true;

            try {
                const req = await fetch('/users/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone })
                });
                const res = await req.json();
                if (!req.ok) throw new Error(res.detail || 'Bir hata oluştu.');

                // Success: Switch to Step 2
                forgotFormStep1.classList.add('hidden');
                if (forgotFormStep2) forgotFormStep2.classList.remove('hidden');
                if (resetSubtitle) resetSubtitle.textContent = `Doğrulama kodu ${phone} numarasına gönderildi. Lütfen kodu ve yeni şifrenizi girin.`;
            } catch (error) {
                alert(error.message);
            } finally {
                if (sendOtpBtn) sendOtpBtn.disabled = false;
            }
        });
    }

    // Step 2: Verify OTP and Reset
    if (forgotFormStep2) {
        forgotFormStep2.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = resetPhoneInput.value;
            const otp = resetOtpInput.value;
            const new_password = newPasswordInput.value;
            if (verifyOtpBtn) verifyOtpBtn.disabled = true;

            try {
                const req = await fetch('/users/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, otp, new_password })
                });
                const res = await req.json();
                if (!req.ok) throw new Error(res.detail || 'Geçersiz kod veya başka bir hata.');

                alert("Şifreniz başarıyla güncellendi! Giriş yapabilirsiniz.");
                switchAuthView(forgotView, loginView);
            } catch (error) {
                alert(error.message);
            } finally {
                if (verifyOtpBtn) verifyOtpBtn.disabled = false;
            }
        });
    }

    // Handle Form Submit
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Hide previous errors & show loading state
            if (errorMsg) errorMsg.classList.add('hidden');
            if (btnText) btnText.classList.add('hidden');
            if (spinner) spinner.classList.remove('hidden');
            if (submitBtn) submitBtn.disabled = true;

            const payload = {
                name: document.getElementById('name')?.value,
                phone: document.getElementById('phone')?.value,
                password: document.getElementById('password')?.value,
                email: document.getElementById('reg_email')?.value || null
            };

            try {
                // 1. Register User
                const regResponse = await fetch('/users/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const regData = await regResponse.json();

                if (!regResponse.ok) {
                    throw new Error(regData.detail || 'Kayıt sırasında bir hata oluştu.');
                }

                const userId = regData.id;

                // 2. Fetch Matches
                const matchResponse = await fetch(`/users/${userId}/matches`);
                const matchData = await matchResponse.json();

                if (!matchResponse.ok) {
                    throw new Error('Eşleşmeler alınırken hata oluştu.');
                }

                // 3. Enter App
                enterApp(userId, payload, matchData);

            } catch (error) {
                if (errorMsg) {
                    errorMsg.textContent = error.message;
                    errorMsg.classList.remove('hidden');
                }
            } finally {
                // Restore button state
                if (spinner) spinner.classList.add('hidden');
                if (btnText) btnText.classList.remove('hidden');
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // Handle Login Form Submit - 2 Step (Phase 1: credentials, Phase 2: OTP)
    let loginPhoneCache = null; // Store phone for OTP step
    let loginStep = 1;
    const loginStep1El = document.getElementById('login-step1');
    const loginStep2El = document.getElementById('login-step2');
    const otpSentMsg = document.getElementById('otp-sent-msg');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (loginErrorMsg) loginErrorMsg.classList.add('hidden');
            if (loginBtnText) loginBtnText.classList.add('hidden');
            if (loginSpinner) loginSpinner.classList.remove('hidden');
            if (loginSubmitBtn) loginSubmitBtn.disabled = true;

            try {
                if (loginStep === 1) {
                    // Phase 1: Send credentials
                    const phone = document.getElementById('login_phone')?.value;
                    const password = document.getElementById('login_password')?.value;

                    const loginReq = await fetch('/users/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone, password })
                    });
                    const loginRes = await loginReq.json();

                    if (!loginReq.ok) throw new Error(loginRes.detail || 'Giriş başarısız oldu.');

                    if (loginRes.otp_required) {
                        // Switch to OTP step
                        loginPhoneCache = phone;
                        loginStep = 2;
                        if (loginStep1El) loginStep1El.classList.add('hidden');
                        if (loginStep2El) loginStep2El.classList.remove('hidden');
                        if (otpSentMsg) otpSentMsg.textContent = loginRes.message;
                        if (loginBtnText) loginBtnText.textContent = 'Kodu Doğrula';
                    } else {
                        // Direct login (no email)
                        await _finishLogin(loginRes);
                    }

                } else {
                    // Phase 2: Verify OTP
                    const otp = document.getElementById('login_otp')?.value;
                    const verifyReq = await fetch('/users/verify-login-otp', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: loginPhoneCache, otp })
                    });
                    const verifyRes = await verifyReq.json();

                    if (!verifyReq.ok) throw new Error(verifyRes.detail || 'Geçersiz kod.');

                    await _finishLogin(verifyRes);
                }
            } catch (error) {
                if (loginErrorMsg) {
                    loginErrorMsg.textContent = error.message;
                    loginErrorMsg.classList.remove('hidden');
                }
            } finally {
                if (loginSpinner) loginSpinner.classList.add('hidden');
                if (loginBtnText) loginBtnText.classList.remove('hidden');
                if (loginSubmitBtn) loginSubmitBtn.disabled = false;
            }
        });
    }

    async function _finishLogin(loginRes) {
        const userId = loginRes.user_id;
        const matchReq = await fetch(`/users/${userId}/matches`);
        const matchData = await matchReq.json();
        if (!matchReq.ok) throw new Error('Eşleşmeler alınırken hata oluştu.');

        const userData = {
            name: loginRes.name,
            bio: loginRes.bio || 'Biyografi yükleniyor...',
            district: loginRes.district,
            education: loginRes.education,
            profile_image: loginRes.profile_image,
            is_admin: loginRes.is_admin,
            daily_status: loginRes.daily_status
        };

        // Reset login form state
        loginStep = 1;
        loginStep1El.classList.remove('hidden');
        loginStep2El.classList.add('hidden');
        loginBtnText.textContent = 'Giriş Yap';
        loginPhoneCache = null;

        enterApp(userId, userData, matchData);
    }

    // Remove Old BackBtn listener if lingering
    // Handle Back Button
    if (document.getElementById('backBtn')) {
        document.getElementById('backBtn').addEventListener('click', () => {
            registerForm.reset();
            loginForm.reset();
            switchAuthView(matchesView, loginView);
        });
    }

    // Render Match Cards
    function renderMatches(matches) {
        matchesContainer.innerHTML = '';

        if (!matches || matches.length === 0) {
            matchesContainer.innerHTML = `
                <div class="no-matches" style="text-align:center; padding: 2rem; background: var(--glass-bg); border-radius: 12px; border: 1px solid var(--panel-border);">
                    <span style="font-size: 3rem;">🏜️</span>
                    <h3 style="margin-top: 10px; color: var(--text-color);">Eşleşme Bulunamadı</h3>
                    <p style="color: var(--text-secondary); margin-top: 5px;">Şu anda çevrenizde (20km) size uygun (%75) ortak ilgi alanına sahip biri yok.</p>
                    <p style="color: var(--primary-color); margin-top: 15px; font-weight: 600; font-size: 0.95rem;">💡 İPUCU: Yapay zeka destekli eşleşme sistemimizin çalışabilmesi için Profil sekmesinden "Biyografi" ve alanını tam olarak doldurmalısın!</p>
                </div>`;
            return;
        }

        matches.forEach(match => {
            const percentage = Math.round(match.similarity_score * 100);
            const card = document.createElement('div');
            card.className = 'match-card';

            const avatarUrl = match.profile_image ? match.profile_image : `https://i.pravatar.cc/300?u=${match.matched_user_id}`;

            card.innerHTML = `
                <img src="${avatarUrl}" alt="Profile" class="match-photo">
                <div class="match-gradient"></div>
                <div class="match-content">
                    <h3>${match.matched_user_name}</h3>
                    <div class="match-stats">
                        <span class="badge">%${(match.similarity_score * 100).toFixed(0)}</span>
                        <div class="match-actions" style="display: flex; gap: 10px;">
                            <button class="action-btn-circle" style="background-color: var(--error-color);" onclick="event.stopPropagation(); handleSwipe('${match.matched_user_id}', 'pass', '${match.matched_user_name}', this)" title="Pas Geç">
                                ❌
                            </button>
                            <button class="action-btn-circle" style="background-color: var(--primary-color);" onclick="event.stopPropagation(); handleSwipe('${match.matched_user_id}', 'like', '${match.matched_user_name}', this)" title="Beğen">
                                ❤️
                            </button>
                        </div>
                    </div>
                </div>
            `;
            matchesContainer.appendChild(card);
        });
    }

    // Handle Swipe Actions (Like/Pass)
    window.handleSwipe = async function (targetId, action, targetName, btnElement) {
        if (!currentUserId) return;

        // Visual feedback (disable buttons)
        const buttons = btnElement.parentElement.querySelectorAll('button');
        buttons.forEach(btn => btn.disabled = true);

        try {
            const req = await fetch(`/users/${currentUserId}/swipe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_id: targetId, action: action })
            });

            if (req.ok) {
                const res = await req.json();

                // Animate card removal
                const card = btnElement.closest('.match-card');
                if (card) {
                    card.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
                    card.style.transform = action === 'like' ? 'translateX(100px)' : 'translateX(-100px)';
                    card.style.opacity = '0';
                    setTimeout(() => {
                        card.remove();
                        // If no more cards, maybe show a message
                        if (matchesContainer.children.length === 0) {
                            renderMatches([]);
                        }
                    }, 500);
                }

                if (res.is_mutual && action === 'like') {
                    alert(`🎉 IT'S A MATCH! Sen ve ${targetName} birbirinizi beğendiniz. Mesajlar sekmesinden sohbete başlayabilirsin!`);
                    loadActiveChats();
                }
            } else {
                console.error("Aksiyon kaydedilemedi.");
                buttons.forEach(btn => btn.disabled = false);
            }
        } catch (e) {
            console.error("Hata:", e);
            buttons.forEach(btn => btn.disabled = false);
        }
    }

    /* ========================================= */
    /* Phase 7: WebSockets & Chat Architecture   */
    /* ========================================= */

    // Load existing active chats into the Messages tab (Now based on Mutual Matches)
    async function loadActiveChats() {
        if (!currentUserId) return;
        try {
            // Updated to fetch mutual matches for Phase 12
            const req = await fetch(`/users/${currentUserId}/mutual-matches`);
            if (req.ok) {
                const chats = await req.json();
                const emptyState = messagesTabContainer.querySelector('.empty-state');

                // If there are existing elements from previous loads, clean up
                const existingList = messagesTabContainer.querySelector('.chat-list-container');
                if (existingList) existingList.remove();

                if (chats.length === 0) {
                    if (emptyState) emptyState.classList.remove('hidden');
                } else {
                    if (emptyState) emptyState.classList.add('hidden');

                    const listContainer = document.createElement('div');
                    listContainer.className = 'chat-list-container';
                    listContainer.style.display = 'flex';
                    listContainer.style.flexDirection = 'column';
                    listContainer.style.gap = '10px';

                    chats.forEach(chat => {
                        const avatarUrl = chat.profile_image ? chat.profile_image : `https://i.pravatar.cc/100?u=${chat.id}`;
                        const chatCard = document.createElement('div');
                        chatCard.className = 'match-card'; // Reusing style
                        chatCard.style.cursor = 'pointer';
                        chatCard.style.height = '80px';
                        chatCard.innerHTML = `
                            <img src="${avatarUrl}" alt="Profile" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin: 10px;">
                            <div class="match-info" style="flex: 1; padding: 10px;">
                                <h3 style="margin: 0; font-size: 1.1rem;">${chat.name}</h3>
                                <p style="font-size:0.8rem; color: var(--text-secondary); margin: 0;">Sohbeti açmak için tıkla</p>
                            </div>
                            <div class="icon" style="padding: 10px; font-size: 1.5rem;">💬</div>
                        `;
                        chatCard.addEventListener('click', () => openChat(chat.id, chat.name, avatarUrl));
                        listContainer.appendChild(chatCard);
                    });

                    messagesTabContainer.appendChild(listContainer);
                }
            }
        } catch (error) {
            console.error("Aktif sohbetler yüklenemedi:", error);
        }
    }

    function initWebSocket() {
        if (!currentUserId) return;
        const wsUrl = `${WS_BASE_URL}/messages/ws/${currentUserId}`;
        
        function connect() {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log("WebSocket Bağlantısı Kuruldu!");
                if (window.wsPingInterval) clearInterval(window.wsPingInterval);
                window.wsPingInterval = setInterval(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "ping" }));
                    }
                }, 30000);
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "pong") return;

                if (data.action === 'read_receipt') {
                    const tickEl = document.getElementById('tick-' + data.message_id);
                    if (tickEl) {
                        tickEl.style.color = '#53bdeb';
                    }
                    return;
                }

                console.log("Yeni mesaj geldi:", data);

                const isChatActive = !chatOverlay.classList.contains('hidden') && currentChatPeerId === data.sender_id;

                if (isChatActive && !document.hidden) {
                    if (data.message_id) {
                        ws.send(JSON.stringify({ 
                            action: 'seen', 
                            message_id: data.message_id, 
                            sender_id: data.sender_id 
                        }));
                    }
                    renderChatMessage(data.content, 'received', data.message_id, null, data.sender_image);
                } else {
                    const preview = data.content.startsWith('[IMAGE]:') ? '📷 Bir fotoğraf gönderdi' : data.content;

                    if ("Notification" in window && Notification.permission === "granted") {
                        const notify = new Notification("Yeni Mesaj: " + data.sender_id, {
                            body: preview,
                            icon: '/static/icons/chat-icon.png'
                        });

                        notify.onclick = function () {
                            window.focus();
                            this.close();
                        };
                    } else if (!document.hidden) {
                        alert(`${data.sender_id} size mesaj gönderdi: ${preview}`);
                    }

                    loadActiveChats();
                }
            };

            ws.onclose = () => {
                console.log("WebSocket kapandı. 3 saniye içinde yeniden bağlanılıyor...");
                if (window.wsPingInterval) clearInterval(window.wsPingInterval);
                setTimeout(connect, 3000);
            };

            ws.onerror = (err) => {
                console.error("WebSocket Hatası:", err);
                ws.close();
            };
        }

        connect();
    }

    // Open Chat Screen overlay
    window.openChat = async function (peerId, peerName, peerAvatarUrl) {
        currentChatPeerId = peerId;
        chatPeerName.textContent = peerName;
        window.currentPeerAvatar = peerAvatarUrl || `https://i.pravatar.cc/100?u=${peerId}`;
        chatMessagesContainer.innerHTML = ''; // Limpiar chat actual

        // Show Overlay
        chatOverlay.classList.remove('hidden');

        // Fetch History
        try {
            const req = await fetch(`/messages/history/${currentUserId}/${peerId}`);
            if (req.ok) {
                const history = await req.json();
                history.forEach(msg => {
                    const type = msg.sender_id === currentUserId ? 'sent' : 'received';
                    renderChatMessage(msg.content, type, msg.id, msg.timestamp);
                });
            }
        } catch (err) {
            console.error(err);
        }
        // Fetch Status
        try {
            const statusReq = await fetch(`/messages/status/${peerId}`);
            if (statusReq.ok) {
                const statusData = await statusReq.json();
                const statusEl = document.getElementById('chat-peer-status');
                if (statusEl) {
                    if (statusData.is_online) {
                        statusEl.textContent = '● Çevrimiçi';
                        statusEl.style.color = 'var(--accent-glow)';
                    } else {
                        statusEl.textContent = '● Çevrimdışı';
                        statusEl.style.color = 'var(--text-secondary)';
                    }
                }
            }
        } catch(e) {}
    };

    // Render single message bubble
    function renderChatMessage(content, type, msgId = null, timeStr = null, senderAvatar = null) {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${type}`;

        // Format time
        let timeLabel = '';
        if (timeStr) {
            // Fix UTC timezone issue from backend if string lacks 'Z'
            let parseStr = timeStr;
            if (!parseStr.endsWith('Z') && !parseStr.includes('+')) {
                parseStr += 'Z';
            }
            const dateObj = new Date(parseStr);
            timeLabel = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            const now = new Date();
            timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        let displayContent = content;
        if (content.startsWith('[IMAGE]:')) {
            const imgUrl = content.substring(8); // Remove '[IMAGE]:'
            displayContent = `<img src="${imgUrl}" class="chat-image-attachment" alt="Image attachment" onclick="window.open('${imgUrl}', '_blank')">`;
        } else if (content.startsWith('[ONETIMEIMAGE]:')) {
            const imgUrl = content.substring(15);
            displayContent = `<div class="one-time-image-container" onclick="this.innerHTML='<img src=&quot;${imgUrl}&quot; style=&quot;max-width:200px; border-radius:10px;&quot;>'; setTimeout(() => {this.innerHTML='<div style=&quot;color:var(--error-color); padding:10px;&quot;>📸 Fotoğraf silindi</div>';}, 5000);" style="cursor:pointer; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; text-align: center; border: 1px dashed var(--accent-glow);"><span style="font-size: 2rem;">🖼️</span><p style="margin-top: 5px; font-size: 0.8rem; color: var(--accent-glow);">Tek Gösterimlik Fotoğraf<br>(Açmak için tıkla)</p></div>`;
        }

        let avatarToUse = senderAvatar;
        if (!avatarToUse) {
            if (type === 'sent') {
                avatarToUse = window.currentUserAvatar || `https://i.pravatar.cc/100?u=${currentUserId}`;
            } else {
                avatarToUse = window.currentPeerAvatar || `https://i.pravatar.cc/100?u=${currentChatPeerId}`;
            }
        }

        const msgIdHtml = msgId ? `id="tick-${msgId}"` : ``;
        wrapper.innerHTML = `
            <img src="${avatarToUse}" class="chat-bubble-avatar" alt="Avatar">
            <div class="message message-${type}">
                ${type === 'sent' ? '<div style="font-size: 0.7rem; color: #8b949e; margin-bottom: 3px;">Siz</div>' : `<div style="font-size: 0.7rem; color: var(--accent-glow); margin-bottom: 3px;">${chatPeerName.textContent}</div>`}
                ${displayContent}
                <div class="msg-info">
                    <span class="msg-time">${timeLabel}</span>
                    ${type === 'sent' ? `<span ${msgIdHtml} style="font-size: 10px; font-weight: bold; color: #8b949e; margin-left: 5px;">✓✓</span>` : ''}
                </div>
            </div>
        `;
        chatMessagesContainer.appendChild(wrapper);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    // Chat Image Upload Event
    if (attachImageBtn && chatImageUpload) {
        attachImageBtn.addEventListener('click', () => {
            if (!currentUserId || !currentChatPeerId) return;
            chatImageUpload.click();
        });

        chatImageUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !currentUserId || !currentChatPeerId) return;

            const formData = new FormData();
            formData.append('file', file);

            // Visual feedback
            const originalIcon = attachImageBtn.innerText;
            attachImageBtn.innerText = "⏳";
            attachImageBtn.disabled = true;

            try {
                const req = await fetch(`/messages/${currentUserId}/${currentChatPeerId}/upload-image`, {
                    method: 'POST',
                    body: formData
                });

                if (req.ok) {
                    const res = await req.json();
                    renderChatMessage(res.content, 'sent', res.message_id);
                } else {
                    console.error("Fotoğraf yüklenemedi.");
                    alert("Fotoğraf gönderilirken bir hata oluştu.");
                }
            } catch (err) {
                console.error("Hata:", err);
            } finally {
                attachImageBtn.innerText = originalIcon;
                attachImageBtn.disabled = false;
                chatImageUpload.value = ''; // Reset
            }
        });
    }

    // Camera Image Upload Event
    const cameraImageBtn = document.getElementById('cameraImageBtn');
    const chatCameraUpload = document.getElementById('chatCameraUpload');

    if (cameraImageBtn && chatCameraUpload) {
        cameraImageBtn.addEventListener('click', () => {
            if (!currentUserId || !currentChatPeerId) return;
            chatCameraUpload.click();
        });

        chatCameraUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !currentUserId || !currentChatPeerId) return;

            const formData = new FormData();
            formData.append('file', file);

            const originalIcon = cameraImageBtn.innerText;
            cameraImageBtn.innerText = "⏳";
            cameraImageBtn.disabled = true;

            try {
                const req = await fetch(`/messages/${currentUserId}/${currentChatPeerId}/upload-image?is_one_time=true`, {
                    method: 'POST',
                    body: formData
                });

                if (req.ok) {
                    const res = await req.json();
                    renderChatMessage(res.content, 'sent', res.message_id);
                } else {
                    console.error("Fotoğraf yüklenemedi.");
                    alert("Fotoğraf gönderilirken bir hata oluştu.");
                }
            } catch (err) {
                console.error("Hata:", err);
            } finally {
                cameraImageBtn.innerText = originalIcon;
                cameraImageBtn.disabled = false;
                chatCameraUpload.value = ''; // Reset
            }
        });
    }

    // Send Message Event
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || !currentChatPeerId) return;

        chatInput.value = '';

        try {
            const req = await fetch(`/messages/${currentUserId}/${currentChatPeerId}/text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text })
            });
            if (req.ok) {
                const res = await req.json();
                renderChatMessage(text, 'sent', res.message_id);
            }
        } catch (err) {
            console.error("Message send failed:", err);
        }
    }

    sendMessageBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    closeChatBtn.addEventListener('click', () => {
        chatOverlay.classList.add('hidden');
        currentChatPeerId = null;
    });

    // Notification Bell Click Event
    const notificationBtn = document.querySelector('.app-header-icons .icon');
    if (notificationBtn) {
        notificationBtn.style.cursor = 'pointer';
        notificationBtn.addEventListener('click', () => {
            alert('Henüz yeni bildiriminiz yok. (Yakında)');
        });
    }

    // === Chat Menu & Block User Logic ===
    const chatMenuBtn = document.getElementById('chatMenuBtn');
    const chatMenuDropdown = document.getElementById('chatMenuDropdown');
    const blockUserBtn = document.getElementById('blockUserBtn');

    if (chatMenuBtn && chatMenuDropdown) {
        chatMenuBtn.addEventListener('click', () => {
            chatMenuDropdown.classList.toggle('hidden');
        });

        // Hide dropdown if clicked outside
        document.addEventListener('click', (e) => {
            if (!chatMenuBtn.contains(e.target) && !chatMenuDropdown.contains(e.target)) {
                chatMenuDropdown.classList.add('hidden');
            }
        });
    }

    if (blockUserBtn) {
        blockUserBtn.addEventListener('click', async () => {
            if (!currentUserId || !currentChatPeerId) return;
            if (!confirm("DİKKAT: Bu kişiyi engellemek istediğinize emin misiniz? Karşılıklı olarak birbirinizi bir daha asla göremeyeceksiniz ve tüm mesajlar silinecek.")) return;

            try {
                const req = await fetch(`/users/${currentUserId}/block/${currentChatPeerId}`, { method: 'POST' });
                if (req.ok) {
                    alert("Kullanıcı başarıyla engellendi.");
                    chatMenuDropdown.classList.add('hidden');
                    chatOverlay.classList.add('hidden');
                    currentChatPeerId = null;
                    // Refresh matches and chats
                    loadUserStats(); 
                    loadActiveChats();
                }
            } catch (err) {
                console.error("Block failed", err);
            }
        });
    }

    // === AI Icebreaker Logic ===
    const aiIcebreakerBtn = document.getElementById('aiIcebreakerBtn');
    if (aiIcebreakerBtn) {
        aiIcebreakerBtn.addEventListener('click', async () => {
            if (!currentUserId || !currentChatPeerId) return;
            const originalIcon = aiIcebreakerBtn.innerText;
            aiIcebreakerBtn.innerText = '⏳';
            aiIcebreakerBtn.disabled = true;

            try {
                const req = await fetch(`/users/${currentUserId}/icebreaker/${currentChatPeerId}`);
                if (req.ok) {
                    const res = await req.json();
                    chatInput.value = res.suggestion;
                }
            } catch (err) {
                console.error("Icebreaker fetch failed", err);
            } finally {
                aiIcebreakerBtn.innerText = originalIcon;
                aiIcebreakerBtn.disabled = false;
            }
        });
    }

    // === Connection Overlay Logic (Followers, Following, Mutual) ===
    const connectionsOverlay = document.getElementById('connections-overlay');
    const closeConnectionsBtn = document.getElementById('closeConnectionsBtn');
    const connectionsTitle = document.getElementById('connections-title');
    const connectionsListContainer = document.getElementById('connections-list-container');
    const connectionsSearch = document.getElementById('connectionsSearch');
    let currentConnectionType = null;

    if (closeConnectionsBtn) {
        closeConnectionsBtn.addEventListener('click', () => {
            connectionsOverlay.classList.add('hidden');
        });
    }

    if (connectionsSearch) {
        connectionsSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const items = connectionsListContainer.querySelectorAll('.match-card');
            items.forEach(item => {
                const name = item.getAttribute('data-name').toLowerCase();
                if (name.includes(term)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    async function openConnectionsList(type, title) {
        if (!currentUserId) return;
        currentConnectionType = type;
        connectionsTitle.textContent = title;
        connectionsListContainer.innerHTML = '<div style="text-align:center; padding: 20px;">Yükleniyor...</div>';
        connectionsSearch.value = '';
        connectionsOverlay.classList.remove('hidden');

        try {
            const req = await fetch(`/users/${currentUserId}/connections/${type}`);
            if (req.ok) {
                const data = await req.json();
                renderConnections(data, type);
            }
        } catch (err) {
            console.error(err);
            connectionsListContainer.innerHTML = '<div style="color:var(--error-color);">Yükleme Hatası</div>';
        }
    }

    function renderConnections(users, type) {
        connectionsListContainer.innerHTML = '';
        if (users.length === 0) {
            connectionsListContainer.innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding: 20px;">Liste boş.</div>';
            return;
        }

        users.forEach(u => {
            const avatar = u.profile_image || `https://i.pravatar.cc/100?u=${u.id}`;
            const card = document.createElement('div');
            card.className = 'match-card'; // Reuse outer borders/bg
            card.setAttribute('data-name', u.name);
            card.style.height = '80px';
            card.style.display = 'flex';
            card.style.flexDirection = 'row';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'flex-start';
            card.style.padding = '0 10px';
            card.style.marginBottom = '10px';

            let actionBtnHtml = '';
            if (type === 'following' || type === 'mutual') {
                actionBtnHtml = `<button class="btn-danger" style="padding: 5px 10px; font-size: 0.8rem; border-radius: 8px;" onclick="window.unfollowUser('${u.id}')">Takipten Çık</button>`;
            } else if (type === 'followers') {
                actionBtnHtml = `<button class="btn-secondary" style="padding: 5px 10px; font-size: 0.8rem; border-radius: 8px; border-color: var(--error-color); color: var(--error-color);" onclick="window.removeFollower('${u.id}')">Çıkar</button>`;
            }

            card.innerHTML = `
                <img src="${avatar}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 15px; border: 2px solid var(--panel-border);">
                <div style="flex: 1; display:flex; flex-direction:column; justify-content:center;">
                    <h4 style="margin: 0; font-size: 1.1rem; color: #fff;">${u.name}</h4>
                    <span style="font-size: 0.8rem; color: var(--text-secondary);">Urfa-Link Kullanıcısı</span>
                </div>
                <div style="display:flex; align-items:center; gap: 10px;">
                    ${actionBtnHtml}
                </div>
            `;
            connectionsListContainer.appendChild(card);
        });
    }

    window.unfollowUser = async function(targetId) {
        if (!confirm("Bu kişiyi takipten çıkmak istediğinize emin misiniz?")) return;
        try {
            const req = await fetch(`/users/${currentUserId}/unfollow/${targetId}`, { method: 'DELETE' });
            if (req.ok) {
                openConnectionsList(currentConnectionType, connectionsTitle.textContent);
                loadUserStats();
                loadActiveChats(); 
            }
        } catch(e) { console.error(e); }
    };

    window.removeFollower = async function(targetId) {
        if (!confirm("Bu takipçiyi kaldırmak istediğinize emin misiniz?")) return;
        try {
            const req = await fetch(`/users/${currentUserId}/remove-follower/${targetId}`, { method: 'DELETE' });
            if (req.ok) {
                openConnectionsList(currentConnectionType, connectionsTitle.textContent);
                loadUserStats();
                loadActiveChats(); 
            }
        } catch(e) { console.error(e); }
    };

    // Attach to Stats
    const statFollowersContainer = document.getElementById('stat-followers')?.parentElement;
    const statFollowingContainer = document.getElementById('stat-following')?.parentElement;
    const statMutualContainer = document.getElementById('stat-mutual')?.parentElement;

    if (statFollowersContainer) statFollowersContainer.addEventListener('click', () => openConnectionsList('followers', 'Takipçiler'));
    if (statFollowingContainer) statFollowingContainer.addEventListener('click', () => openConnectionsList('following', 'Takip Edilenler'));
    function updateStatusUI(status) {
        const container = document.getElementById('profile-status-container');
        const text = document.getElementById('profile-status-text');
        if (status && status.trim() !== "") {
            container.classList.remove('hidden');
            text.textContent = status;
        } else {
            container.classList.add('hidden');
            text.textContent = "";
        }
    }

    // Story Viewer Logic
    let storyTimer = null;
    window.viewStory = function(imgUrl, name, avatar) {
        const viewer = document.getElementById('story-viewer');
        const viewerImg = document.getElementById('story-viewer-img');
        const viewerName = document.getElementById('story-viewer-name');
        const viewerAvatar = document.getElementById('story-viewer-avatar');
        const progress = document.getElementById('story-progress');

        viewerName.textContent = name;
        viewerAvatar.src = avatar;
        viewerImg.src = imgUrl;
        viewer.classList.remove('hidden');
        
        // Start progress bar
        progress.style.transition = 'none';
        progress.style.width = '0%';
        setTimeout(() => {
            progress.style.transition = 'width 5s linear';
            progress.style.width = '100%';
        }, 10);

        // Auto close after 5s
        if (storyTimer) clearTimeout(storyTimer);
        storyTimer = setTimeout(() => {
            closeStory();
        }, 5000);
    };

    function closeStory() {
        const viewer = document.getElementById('story-viewer');
        if (viewer) viewer.classList.add('hidden');
        if (storyTimer) clearTimeout(storyTimer);
    }

    const closeStoryBtn = document.getElementById('closeStoryBtn');
    async function loadMatches() {
        if (!currentUserId) return;
        try {
            const req = await fetch(`/users/${currentUserId}/matches`);
            if (req.ok) {
                const matchData = await req.json();
                renderMatches(matchData);
                initMap(matchData);
            }
        } catch (err) {
            console.error("Match yüklenemedi:", err);
        }
    }

});
