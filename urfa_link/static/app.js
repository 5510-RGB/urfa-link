document.addEventListener('DOMContentLoaded', () => {

    // URL Tespiti: 3 ortam desteklenir
    // 1) Yerel geliştirme (localhost:8000) → göreceli URL
    // 2) Canlı web (urfa-link.onrender.com) → göreceli URL
    // 3) Mobil uygulama (Capacitor, localhost:80/443/boş port) → mutlak Render URL
    const PRODUCTION_HOST = 'urfa-link-h6c7.onrender.com';
    // Detect Capacitor correctly
    const isCapacitor = window.hasOwnProperty('Capacitor');
    const isLocalDev = window.location.hostname === 'localhost' && window.location.port !== '' && window.location.port !== '80' && window.location.port !== '443';
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

    // Helper: Switch Auth View
    function switchAuthView(hideView, showView) {
        hideView.classList.remove('active');
        setTimeout(() => {
            hideView.classList.add('hidden');
            showView.classList.remove('hidden');
            setTimeout(() => showView.classList.add('active'), 50);
        }, 300);
    }

    // Helper: Enter App
    function enterApp(userId, userData, matchData) {
        currentUserId = userId;
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');

        // Setup Profile Tab
        if (userData && userData.name) profileName.textContent = userData.name;
        if (userData && userData.bio) profileBio.textContent = userData.bio;

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
            document.querySelector('[data-tab="tab-map"]').addEventListener('click', () => {
                setTimeout(() => { map.invalidateSize(); }, 200);
            });

            document.getElementById('locateMeBtn').addEventListener('click', updateMyLocation);
        }

        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

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

                // Custom Icon with Profile Picture
                const customIcon = L.divIcon({
                    className: 'custom-map-marker',
                    html: `<div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; border: 2px solid var(--primary-color); box-shadow: 0 0 10px rgba(0,0,0,0.5);"><img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;"></div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });

                const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
                marker.bindPopup(`
                    <div style="text-align:center;">
                        <strong>${match.matched_user_name}</strong><br>
                        %${(match.similarity_score * 100).toFixed(0)} Uyum<br>
                        <button onclick="window.openChat('${match.matched_user_id}', '${match.matched_user_name}')" style="margin-top: 5px; background: var(--primary-color); color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer;">Sohbet Et</button>
                    </div>
                `);
                markers.push(marker);
            });
        }
    }

    // Geolocation API
    async function updateMyLocation() {
        if (!navigator.geolocation) {
            alert('Tarayıcınız Konum özelliğini desteklemiyor.');
            return;
        }

        const btn = document.getElementById('locateMeBtn');
        const originalText = btn.innerText;
        btn.innerText = 'Konum Bulunuyor...';
        btn.disabled = true;

        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            console.log("GPS Konumu:", lat, lng);

            // Update Map View
            if (map) {
                map.setView([lat, lng], 13);

                // Add a special marker for ME
                L.marker([lat, lng]).addTo(map).bindPopup("<b>Siz Buradasınız</b>").openPopup();
            }

            // Sync with backend
            try {
                const req = await fetch('/users/update-location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: currentUserId,
                        latitude: lat,
                        longitude: lng
                    })
                });
                if (req.ok) {
                    alert('Konumunuz başarıyla güncellendi!');
                }
            } catch (e) {
                console.error('Konum güncellenemedi:', e);
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }

        }, (error) => {
            console.error('Konum hatası:', error);
            alert('Konum alınamadı. Lütfen tarayıcı izinlerini kontrol edin.');
            btn.innerText = originalText;
            btn.disabled = false;
        });
    }

    // Helper: Logout
    function logout() {
        if (ws) ws.close();
        currentUserId = null;

        appContainer.classList.add('hidden');
        authContainer.classList.remove('hidden');
        switchAuthView(registerView, loginView);
        registerForm.reset();
        loginForm.reset();

        // Reset tabs to default home
        navItems.forEach(nb => nb.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.add('hidden'));
        document.querySelector('[data-tab="tab-home"]').classList.add('active');
        document.getElementById('tab-home').classList.remove('hidden');
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

    // Edit Profile Form Logic
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            // Populate inputs with current UI data
            document.getElementById('edit_name').value = profileName.textContent || "";
            // Check if profileBio has the placeholder text before prefilling
            const bioText = profileBio.textContent;
            document.getElementById('edit_bio').value = bioText === "Biyografi yükleniyor..." ? "" : bioText;

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
                bio: document.getElementById('edit_bio').value
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

    logoutBtn.addEventListener('click', logout);

    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async () => {
            if (!currentUserId) return;
            const confirmDelete = confirm("DİKKAT! Hesabını kalıcı olarak silmek istediğine emin misin? Bu işlem KVKK kapsamında geri alınamaz (Bütün eşleşmelerin ve mesajların silinir).");
            if (confirmDelete) {
                try {
                    const req = await fetch(`/users/${currentUserId}`, {
                        method: 'DELETE'
                    });
                    if (req.ok) {
                        alert("Hesabın ve tüm verilerin sistemlerimizden kalıcı olarak silinmiştir.");
                        logout();
                    } else {
                        const errData = await req.json();
                        throw new Error(errData.detail || "Silme işlemi başarısız.");
                    }
                } catch (e) {
                    alert("Hesap silinirken bir hata oluştu: " + e.message);
                }
            }
        });
    }

    // Navigation Event Listeners
    showLoginBtn.addEventListener('click', (e) => { e.preventDefault(); switchAuthView(registerView, loginView); });
    showRegisterBtn.addEventListener('click', (e) => { e.preventDefault(); switchAuthView(loginView, registerView); });

    // Forgot Password View Elements
    const forgotFormStep1 = document.getElementById('forgotPasswordFormStep1');
    const forgotFormStep2 = document.getElementById('forgotPasswordFormStep2');
    const resetSubtitle = document.getElementById('resetSubtitle');
    const resetPhoneInput = document.getElementById('reset_phone');
    const resetOtpInput = document.getElementById('reset_otp');
    const newPasswordInput = document.getElementById('new_password');
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');

    function showForgotPasswordView() {
        forgotFormStep1.classList.remove('hidden');
        forgotFormStep2.classList.add('hidden');
        resetSubtitle.textContent = "Telefon numaranızı girerek şifrenizi sıfırlayabilirsiniz.";
        forgotFormStep1.reset();
        forgotFormStep2.reset();
        switchAuthView(loginView, forgotView);
    }

    showForgotBtn.addEventListener('click', (e) => { e.preventDefault(); showForgotPasswordView(); });
    document.getElementById('backToLoginFromReset1').addEventListener('click', (e) => { e.preventDefault(); switchAuthView(forgotView, loginView); });
    document.getElementById('backToLoginFromReset2').addEventListener('click', (e) => { e.preventDefault(); switchAuthView(forgotView, loginView); });

    // Step 1: Send OTP
    forgotFormStep1.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = resetPhoneInput.value;
        sendOtpBtn.disabled = true;

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
            forgotFormStep2.classList.remove('hidden');
            resetSubtitle.textContent = `Doğrulama kodu ${phone} numarasına gönderildi. Lütfen kodu ve yeni şifrenizi girin.`;
        } catch (error) {
            alert(error.message);
        } finally {
            sendOtpBtn.disabled = false;
        }
    });

    // Step 2: Verify OTP and Reset
    forgotFormStep2.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = resetPhoneInput.value;
        const otp = resetOtpInput.value;
        const new_password = newPasswordInput.value;
        verifyOtpBtn.disabled = true;

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
            verifyOtpBtn.disabled = false;
        }
    });

    // Handle Form Submit
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Hide previous errors & show loading state
        errorMsg.classList.add('hidden');
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
        submitBtn.disabled = true;

        const payload = {
            name: document.getElementById('name').value,
            phone: document.getElementById('phone').value,
            password: document.getElementById('password').value
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
            errorMsg.textContent = error.message;
            errorMsg.classList.remove('hidden');
        } finally {
            // Restore button state
            spinner.classList.add('hidden');
            btnText.classList.remove('hidden');
            submitBtn.disabled = false;
        }
    });

    // Handle Login Form Submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        loginErrorMsg.classList.add('hidden');
        loginBtnText.classList.add('hidden');
        loginSpinner.classList.remove('hidden');
        loginSubmitBtn.disabled = true;

        const payload = {
            phone: document.getElementById('login_phone').value,
            password: document.getElementById('login_password').value
        };

        try {
            const loginReq = await fetch('/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const loginRes = await loginReq.json();

            if (!loginReq.ok) {
                throw new Error(loginRes.detail || 'Giriş başarısız oldu.');
            }

            const userId = loginRes.user_id;

            // Fetch Matches
            const matchReq = await fetch(`/users/${userId}/matches`);
            const matchData = await matchReq.json();

            if (!matchReq.ok) throw new Error('Eşleşmeler alınırken hata oluştu.');

            const userData = {
                name: loginRes.name,
                bio: loginRes.bio || "Biyografi yükleniyor...",
                district: loginRes.district,
                education: loginRes.education,
                profile_image: loginRes.profile_image,
                is_admin: loginRes.is_admin
            };

            enterApp(userId, userData, matchData);

        } catch (error) {
            loginErrorMsg.textContent = error.message;
            loginErrorMsg.classList.remove('hidden');
        } finally {
            loginSpinner.classList.add('hidden');
            loginBtnText.classList.remove('hidden');
            loginSubmitBtn.disabled = false;
        }
    });

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

                console.log("Yeni mesaj geldi:", data);

                const isChatActive = !chatOverlay.classList.contains('hidden') && currentChatPeerId === data.sender_id;

                if (isChatActive && !document.hidden) {
                    renderChatMessage(data.content, 'received', null, data.sender_image);
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
                    renderChatMessage(msg.content, type, msg.timestamp);
                });
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Render single message bubble
    function renderChatMessage(content, type, timeStr = null, senderAvatar = null) {
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
        }

        let avatarToUse = senderAvatar;
        if (!avatarToUse) {
            if (type === 'sent') {
                avatarToUse = window.currentUserAvatar || `https://i.pravatar.cc/100?u=${currentUserId}`;
            } else {
                avatarToUse = window.currentPeerAvatar || `https://i.pravatar.cc/100?u=${currentChatPeerId}`;
            }
        }

        wrapper.innerHTML = `
            <img src="${avatarToUse}" class="chat-bubble-avatar" alt="Avatar">
            <div class="message message-${type}">
                ${displayContent}
                <div class="msg-info">
                    <span class="msg-time">${timeLabel}</span>
                    ${type === 'sent' ? '<span style="font-size: 10px; font-weight: bold; color: #53bdeb; margin-left: 2px;">✓✓</span>' : ''}
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
                    // We render it immediately for the sender
                    renderChatMessage(res.content, 'sent');
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

    // Send Message Event
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || !currentChatPeerId) return;

        // Sent visually immediately
        renderChatMessage(text, 'sent');
        chatInput.value = '';

        // Send via HTTP POST
        try {
            await fetch(`/messages/${currentUserId}/${currentChatPeerId}/text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text })
            });
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

});
